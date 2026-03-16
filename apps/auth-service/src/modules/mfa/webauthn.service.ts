import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource } from "typeorm";
import { MfaSettings, User, WebAuthnCredential } from "@repo/database";
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

const CHALLENGE_TTL_SECONDS = 300; // 5 minutes
const CHALLENGE_RESOURCE = "webauthn_challenge";

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
  ) {
    this.rpID = this.configService.get("WEBAUTHN_RP_ID") || "localhost";
    this.origin =
      this.configService.get("WEBAUTHN_ORIGIN") || "http://localhost:3000";
  }

  // ── Challenge helpers ──────────────────────────────────────────────────────

  private challengeIdentifier(userId: string, type: "register" | "authenticate"): string {
    return `${userId}:${type}`;
  }

  private async storeChallenge(
    tenantId: string,
    userId: string,
    type: "register" | "authenticate",
    challenge: string,
  ): Promise<void> {
    await this.redisService.set(
      tenantId,
      CHALLENGE_RESOURCE,
      this.challengeIdentifier(userId, type),
      challenge,
      CHALLENGE_TTL_SECONDS,
    );
  }

  /**
   * Retrieve and immediately delete the challenge (single-use guarantee).
   * Returns null if not found (expired or never set).
   */
  private async consumeChallenge(
    tenantId: string,
    userId: string,
    type: "register" | "authenticate",
  ): Promise<string | null> {
    const identifier = this.challengeIdentifier(userId, type);
    const challenge = await this.redisService.get<string>(
      tenantId,
      CHALLENGE_RESOURCE,
      identifier,
    );
    // Always delete — even when null, this is a no-op in Redis
    await this.redisService.delete(tenantId, CHALLENGE_RESOURCE, identifier);
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

    await this.storeChallenge(tenantId, userId, "register", options.challenge);

    console.log("🔐 WebAuthn registration started for", user.email);

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
    const challenge = await this.consumeChallenge(tenantId, userId, "register");

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
      console.error("❌ WebAuthn registration verification failed:", error);
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

    console.log("✅ WebAuthn credential registered:", credentialID);

    return { credentialId: credentialID };
  }

  // ── Authentication ─────────────────────────────────────────────────────────

  /**
   * Start WebAuthn authentication (generate options)
   */
  async startAuthentication(userId: string, tenantId: string): Promise<any> {
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

    await this.storeChallenge(tenantId, userId, "authenticate", options.challenge);

    console.log("🔐 WebAuthn authentication started for user:", userId);

    return options;
  }

  /**
   * Finish WebAuthn authentication (verify response)
   */
  async finishAuthentication(
    userId: string,
    tenantId: string,
    response: AuthenticationResponseJSON,
  ): Promise<boolean> {
    const challenge = await this.consumeChallenge(tenantId, userId, "authenticate");

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
          publicKey: credential.publicKey,
          counter: credential.counter,
        },
      });
    } catch (error) {
      console.error("❌ WebAuthn authentication verification failed:", error);
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
      console.error(
        "❌ WebAuthn counter rollback detected for credential:",
        credential.credentialId,
      );
      throw new BadRequestException({
        message: "Counter rollback detected — possible replay attack",
        error: "WEBAUTHN_REPLAY_DETECTED",
      });
    }

    console.log("✅ WebAuthn authentication verified:", credential.credentialId);

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

    console.log("🗑️ WebAuthn credential deleted:", credentialId);
  }
}
