import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource } from "typeorm";
import { MfaSettings, User, WebAuthnCredential, SecurityEventType } from "@repo/database";
import { SecurityEventService } from "@/common/service/security-event.service";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  VerifiedRegistrationResponse,
  VerifiedAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from "@simplewebauthn/server";
import { ConfigService } from "@nestjs/config";
import { type AuthenticatorTransportFuture } from "@simplewebauthn/server";
import { RedisService } from "@/common/service/redis.service";
import * as crypto from "crypto";
import { logger } from "@/common/logger";

const CHALLENGE_TTL_SECONDS = 300; // 5 minutes
// Redis resource namespaces
const REG_CHALLENGE_RESOURCE = "passkey:challenge:reg";
const AUTH_CHALLENGE_RESOURCE = "passkey:challenge:auth";

@Injectable()
export class WebAuthnService {
  private readonly rpName = "Fort Knox";
  private readonly rpID: string;
  private readonly origin: string;

  constructor(
    @InjectRepository(MfaSettings)
    private mfaRepository: Repository<MfaSettings>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(WebAuthnCredential)
    private credentialRepository: Repository<WebAuthnCredential>,
    private configService: ConfigService,
    private redisService: RedisService,
    private dataSource: DataSource,
    private readonly securityEventService: SecurityEventService,
  ) {
    this.rpID = this.configService.get("WEBAUTHN_RP_ID") || "localhost";
    this.origin =
      this.configService.get("WEBAUTHN_ORIGIN") || "http://localhost:3000";
  }

  // ── Challenge helpers ──────────────────────────────────────────────────────

  /**
   * Store registration challenge keyed by userId.
   * Key pattern (via RedisService): passkey:challenge:reg:{userId}
   */
  private async storeRegistrationChallenge(
    tenantId: string,
    userId: string,
    challenge: string,
  ): Promise<void> {
    await this.redisService.set(
      tenantId,
      REG_CHALLENGE_RESOURCE,
      userId,
      challenge,
      CHALLENGE_TTL_SECONDS,
    );
  }

  /**
   * Retrieve and immediately delete the registration challenge (single-use).
   */
  private async consumeRegistrationChallenge(
    tenantId: string,
    userId: string,
  ): Promise<string | null> {
    const challenge = await this.redisService.get<string>(
      tenantId,
      REG_CHALLENGE_RESOURCE,
      userId,
    );
    // Always delete — even when null (no-op), guarantees single-use
    await this.redisService.delete(tenantId, REG_CHALLENGE_RESOURCE, userId);
    return challenge;
  }

  /**
   * Store authentication challenge keyed by an opaque sessionNonce.
   * Key pattern: passkey:challenge:auth:{sessionNonce}
   * Using a nonce rather than userId prevents user enumeration and supports
   * concurrent auth attempts from the same user.
   */
  private async storeAuthChallenge(
    tenantId: string,
    sessionNonce: string,
    challenge: string,
  ): Promise<void> {
    await this.redisService.set(
      tenantId,
      AUTH_CHALLENGE_RESOURCE,
      sessionNonce,
      challenge,
      CHALLENGE_TTL_SECONDS,
    );
  }

  /**
   * Retrieve and immediately delete the authentication challenge (single-use).
   */
  private async consumeAuthChallenge(
    tenantId: string,
    sessionNonce: string,
  ): Promise<string | null> {
    const challenge = await this.redisService.get<string>(
      tenantId,
      AUTH_CHALLENGE_RESOURCE,
      sessionNonce,
    );
    // Always delete — ensures single-use even on failure
    await this.redisService.delete(tenantId, AUTH_CHALLENGE_RESOURCE, sessionNonce);
    return challenge;
  }

  // ── Registration ───────────────────────────────────────────────────────────

  /**
   * Start WebAuthn registration (generate options)
   */
  async startRegistration(userId: string, tenantId: string): Promise<any> {
    const user = await this.userRepository.findOne({
      where: { id: userId, tenantId },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    // Ensure mfa_settings row exists
    let mfaSettings = await this.mfaRepository.findOne({
      where: { userId, tenantId },
    });

    if (!mfaSettings) {
      mfaSettings = this.mfaRepository.create({ userId, tenantId });
      await this.mfaRepository.save(mfaSettings);
    }

    // Fetch existing credentials to exclude from registration
    const existingCredentials = await this.credentialRepository.find({
      where: { userId, tenantId },
      select: ["credentialId"],
    });

    const options = await generateRegistrationOptions({
      rpName: this.rpName,
      rpID: this.rpID,
      userID: Buffer.from(userId),
      userName: user.email,
      userDisplayName: `${user.firstName} ${user.lastName}`,
      attestationType: "none",
      excludeCredentials: existingCredentials.map((c) => ({
        id: c.credentialId,
        type: "public-key" as const,
      })),
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
        authenticatorAttachment: "platform",
      },
    });

    await this.storeRegistrationChallenge(tenantId, userId, options.challenge);

    logger.info({ email: user.email }, "WebAuthn registration started");

    return options;
  }

  /**
   * Finish WebAuthn registration (verify response)
   */
  async finishRegistration(
    userId: string,
    tenantId: string,
    response: RegistrationResponseJSON,
    deviceName?: string,
  ): Promise<{ credentialId: string }> {
    const challenge = await this.consumeRegistrationChallenge(tenantId, userId);

    if (!challenge) {
      throw new BadRequestException({
        message: "Registration challenge expired or not found",
        error: "WEBAUTHN_CHALLENGE_EXPIRED",
      });
    }

    let verification: VerifiedRegistrationResponse;

    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: this.origin,
        expectedRPID: this.rpID,
      });
    } catch (error) {
      logger.error({ err: error }, "WebAuthn registration verification failed");
      throw new BadRequestException("Registration verification failed");
    }

    if (!verification.verified || !verification.registrationInfo) {
      throw new BadRequestException("Registration verification failed");
    }

    const { credential } = verification.registrationInfo;
    const { publicKey, id: credentialID, counter } = credential;

    const newCredential = this.credentialRepository.create({
      userId,
      tenantId,
      credentialId: credentialID,
      publicKey: Buffer.from(publicKey),
      counter,
      deviceName: deviceName || "Unnamed Device",
      transports: (response.response.transports as string[]) || [],
      lastUsedAt: new Date(),
    });

    await this.credentialRepository.save(newCredential);

    // Mark webauthn as enabled on mfa_settings
    await this.mfaRepository.update({ userId, tenantId }, { webauthnEnabled: true });

    logger.info({ credentialId: credentialID }, "WebAuthn credential registered");

    this.securityEventService.log({
      userId,
      tenantId,
      eventType: SecurityEventType.PASSKEY_REGISTERED,
      severity: "info",
      ipAddress: "0.0.0.0",
      userAgent: "system",
      resourceId: credentialID,
      resourceType: "passkey",
      metadata: { deviceName: deviceName || "Unnamed Device" },
    });

    return { credentialId: credentialID };
  }

  // ── Authentication ─────────────────────────────────────────────────────────

  /**
   * Start WebAuthn authentication (generate options + opaque sessionNonce).
   *
   * The challenge is stored in Redis keyed by a random sessionNonce (NOT the
   * userId) so the nonce can be returned to the client without exposing the
   * user's identity, and concurrent auth attempts from the same user do not
   * collide.
   *
   * Returns: { options, sessionNonce }
   */
  async startAuthentication(
    userId: string,
    tenantId: string,
  ): Promise<{ options: any; sessionNonce: string }> {
    const credentials = await this.credentialRepository.find({
      where: { userId, tenantId },
    });

    if (credentials.length === 0) {
      throw new BadRequestException("WebAuthn not enabled for this user");
    }

    const allowCredentials = credentials.map((cred) => ({
      id: cred.credentialId,
      type: "public-key" as const,
      transports: cred.transports as AuthenticatorTransportFuture[] | undefined,
    }));

    const options = await generateAuthenticationOptions({
      rpID: this.rpID,
      allowCredentials,
      userVerification: "preferred",
    });

    // Generate an opaque nonce — this is what the client will echo back in /verify
    const sessionNonce = crypto.randomBytes(16).toString("hex");

    await this.storeAuthChallenge(tenantId, sessionNonce, options.challenge);

    logger.info({ userId }, "WebAuthn authentication started");

    return { options, sessionNonce };
  }

  /**
   * Finish WebAuthn authentication (verify response).
   *
   * @param sessionNonce - Opaque nonce returned by startAuthentication(); used
   *                       to look up the single-use challenge in Redis.
   */
  async finishAuthentication(
    userId: string,
    tenantId: string,
    response: AuthenticationResponseJSON,
    sessionNonce: string,
  ): Promise<boolean> {
    // Consume challenge by nonce — deleted from Redis regardless of outcome
    const challenge = await this.consumeAuthChallenge(tenantId, sessionNonce);

    if (!challenge) {
      throw new BadRequestException({
        message: "Authentication challenge expired or not found",
        error: "WEBAUTHN_CHALLENGE_EXPIRED",
      });
    }

    const credentialId = response.rawId ?? response.id;

    const credential = await this.credentialRepository.findOne({
      where: { userId, tenantId, credentialId },
    });

    if (!credential) {
      throw new BadRequestException("Credential not found");
    }

    let verification: VerifiedAuthenticationResponse;

    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: this.origin,
        expectedRPID: this.rpID,
        credential: {
          id: credential.credentialId,
          publicKey: new Uint8Array(credential.publicKey),
          counter: credential.counter,
        },
      });
    } catch (error) {
      logger.error({ err: error }, "WebAuthn authentication verification failed");
      throw new BadRequestException("Authentication verification failed");
    }

    if (!verification.verified) {
      throw new BadRequestException("Authentication verification failed");
    }

    const newCounter = verification.authenticationInfo.newCounter;
    const oldCounter = credential.counter;

    // Atomic counter update — prevents replay attacks
    const result = await this.dataSource
      .createQueryBuilder()
      .update(WebAuthnCredential)
      .set({ counter: newCounter, lastUsedAt: new Date() })
      .where("id = :id AND counter = :oldCounter", {
        id: credential.id,
        oldCounter,
      })
      .execute();

    if (!result.affected || result.affected === 0) {
      logger.error({ credentialId: credential.credentialId }, "WebAuthn counter rollback detected for credential");
      throw new BadRequestException({
        message: "Counter rollback detected — possible replay attack",
        error: "WEBAUTHN_REPLAY_DETECTED",
      });
    }

    logger.info({ credentialId: credential.credentialId }, "WebAuthn authentication verified");

    return true;
  }

  // ── Credential Management ─────────────────────────────────────────────────

  /**
   * List user's WebAuthn credentials
   */
  async listCredentials(
    userId: string,
    tenantId: string,
  ): Promise<
    Array<{
      id: string;
      deviceName: string;
      createdAt: Date;
      lastUsedAt?: Date;
      transports: string[];
    }>
  > {
    const credentials = await this.credentialRepository.find({
      where: { userId, tenantId },
      order: { createdAt: "ASC" },
    });

    return credentials.map((cred) => ({
      id: cred.credentialId,
      deviceName: cred.deviceName || "Unnamed Device",
      createdAt: cred.createdAt,
      lastUsedAt: cred.lastUsedAt,
      transports: cred.transports || [],
    }));
  }

  /**
   * Delete a WebAuthn credential
   */
  async deleteCredential(
    userId: string,
    tenantId: string,
    credentialId: string,
  ): Promise<void> {
    const credential = await this.credentialRepository.findOne({
      where: { userId, tenantId, credentialId },
    });

    if (!credential) {
      throw new NotFoundException("Credential not found");
    }

    await this.credentialRepository.remove(credential);

    // Disable webauthn flag if no credentials remain
    const remaining = await this.credentialRepository.count({
      where: { userId, tenantId },
    });

    if (remaining === 0) {
      await this.mfaRepository.update(
        { userId, tenantId },
        { webauthnEnabled: false },
      );
    }

    logger.info({ credentialId }, "WebAuthn credential deleted");

    this.securityEventService.log({
      userId,
      tenantId,
      eventType: SecurityEventType.PASSKEY_REMOVED,
      severity: "warning",
      ipAddress: "0.0.0.0",
      userAgent: "system",
      resourceId: credentialId,
      resourceType: "passkey",
    });
  }
}
