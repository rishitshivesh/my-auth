import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { MfaSettings, User } from "@repo/database";
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

// Store challenges temporarily (use Redis in production!)
interface ChallengeEntry {
  challenge: string;
  expiresAt: Date;
}

const encoder = new TextEncoder();

@Injectable()
export class WebAuthnService {
  // In-memory store for challenges (replace with Redis!)
  private challenges = new Map<string, ChallengeEntry>();

  // WebAuthn configuration
  private readonly rpName = "Fort Knox";
  private readonly rpID: string;
  private readonly origin: string;

  constructor(
    @InjectRepository(MfaSettings)
    private mfaRepository: Repository<MfaSettings>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private configService: ConfigService,
  ) {
    // Get from environment
    this.rpID = this.configService.get("WEBAUTHN_RP_ID") || "localhost";
    this.origin =
      this.configService.get("WEBAUTHN_ORIGIN") || "http://localhost:3000";

    // Cleanup expired challenges every 5 minutes
    setInterval(() => this.cleanupExpiredChallenges(), 5 * 60 * 1000);
  }

  /**
   * Start WebAuthn registration (generate options)
   */
  async startRegistration(userId: string, tenantId: string): Promise<any> {
    // Get user
    const user = await this.userRepository.findOne({
      where: { id: userId, tenantId },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    // Get or create MFA settings
    let mfaSettings = await this.mfaRepository.findOne({
      where: { userId, tenantId },
    });

    if (!mfaSettings) {
      mfaSettings = this.mfaRepository.create({
        userId,
        tenantId,
        webauthnCredentials: [],
      });
      await this.mfaRepository.save(mfaSettings);
    }

    // Get existing credentials (to exclude them)
    const existingCredentials = mfaSettings.webauthnCredentials.map((cred) => ({
      id: cred.id,
      type: "public-key" as const,
    }));

    // Generate registration options
    const options = await generateRegistrationOptions({
      rpName: this.rpName,
      rpID: this.rpID,
      userID: encoder.encode(userId),
      userName: user.email,
      userDisplayName: `${user.firstName} ${user.lastName}`,

      // Don't prompt for password
      attestationType: "none",

      // Exclude existing credentials
      excludeCredentials: existingCredentials,

      // Authenticator selection
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
        authenticatorAttachment: "platform", // Prefer platform authenticators (Face ID, Touch ID)
      },
    });

    // Store challenge (expires in 5 minutes)
    const key = `${userId}:${tenantId}:register`;
    this.challenges.set(key, {
      challenge: options.challenge,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });

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
    // Get stored challenge
    const key = `${userId}:${tenantId}:register`;
    const challengeEntry = this.challenges.get(key);

    if (!challengeEntry) {
      throw new BadRequestException("No registration in progress");
    }

    if (challengeEntry.expiresAt < new Date()) {
      this.challenges.delete(key);
      throw new BadRequestException("Registration challenge expired");
    }

    // Verify registration response
    let verification: VerifiedRegistrationResponse;

    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: challengeEntry.challenge,
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

    // Delete used challenge
    this.challenges.delete(key);

    // Get MFA settings
    const mfaSettings = await this.mfaRepository.findOne({
      where: { userId, tenantId },
    });

    if (!mfaSettings) {
      throw new NotFoundException("MFA settings not found");
    }

    // Store credential
    const { credential } = verification.registrationInfo;

    const {
      publicKey: credentialPublicKey,
      id: credentialID,
      counter,
    } = credential;

    const newCredential = {
      id: Buffer.from(credentialID).toString("base64url"),
      publicKey: Buffer.from(credentialPublicKey).toString("base64url"),
      counter,
      deviceName: deviceName || "Unnamed Device",
      createdAt: new Date(),
      lastUsedAt: new Date(),
      transports: response.response.transports || [],
    };

    mfaSettings.webauthnCredentials.push(newCredential);
    mfaSettings.webauthnEnabled = true;

    await this.mfaRepository.save(mfaSettings);

    console.log("✅ WebAuthn credential registered:", newCredential.id);

    return { credentialId: newCredential.id };
  }

  /**
   * Start WebAuthn authentication (generate options)
   */
  async startAuthentication(userId: string, tenantId: string): Promise<any> {
    // Get MFA settings
    const mfaSettings = await this.mfaRepository.findOne({
      where: { userId, tenantId, webauthnEnabled: true },
    });

    if (!mfaSettings || mfaSettings.webauthnCredentials.length === 0) {
      throw new BadRequestException("WebAuthn not enabled for this user");
    }

    // Get user's credentials
    const allowCredentials = mfaSettings.webauthnCredentials.map((cred) => ({
      id: cred.id,
      type: "public-key" as const,
      transports: cred.transports as AuthenticatorTransportFuture[] | undefined,
    }));

    // Generate authentication options
    const options = await generateAuthenticationOptions({
      rpID: this.rpID,
      allowCredentials,
      userVerification: "preferred",
    });

    // Store challenge (expires in 5 minutes)
    const key = `${userId}:${tenantId}:authenticate`;
    this.challenges.set(key, {
      challenge: options.challenge,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });

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
    // Get stored challenge
    const key = `${userId}:${tenantId}:authenticate`;
    const challengeEntry = this.challenges.get(key);

    if (!challengeEntry) {
      throw new BadRequestException("No authentication in progress");
    }

    if (challengeEntry.expiresAt < new Date()) {
      this.challenges.delete(key);
      throw new BadRequestException("Authentication challenge expired");
    }

    // Get MFA settings
    const mfaSettings = await this.mfaRepository.findOne({
      where: { userId, tenantId, webauthnEnabled: true },
    });

    if (!mfaSettings) {
      throw new BadRequestException("WebAuthn not enabled");
    }

    // Find the credential
    const credentialId = Buffer.from(response.rawId, "base64url").toString(
      "base64url",
    );
    const credential = mfaSettings.webauthnCredentials.find(
      (cred) => cred.id === credentialId,
    );

    if (!credential) {
      throw new BadRequestException("Credential not found");
    }

    // Verify authentication response
    let verification: VerifiedAuthenticationResponse;

    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challengeEntry.challenge,
        expectedOrigin: this.origin,
        expectedRPID: this.rpID,
        credential: {
          id: credential.id,
          publicKey: Buffer.from(credential.publicKey, "base64url"),
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

    // Delete used challenge
    this.challenges.delete(key);

    // Update credential counter and last used
    credential.counter = verification.authenticationInfo.newCounter;
    credential.lastUsedAt = new Date();

    await this.mfaRepository.save(mfaSettings);

    console.log("✅ WebAuthn authentication verified:", credential.id);

    return true;
  }

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
    const mfaSettings = await this.mfaRepository.findOne({
      where: { userId, tenantId },
    });

    if (!mfaSettings) {
      return [];
    }

    return mfaSettings.webauthnCredentials.map((cred) => ({
      id: cred.id,
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
    const mfaSettings = await this.mfaRepository.findOne({
      where: { userId, tenantId },
    });

    if (!mfaSettings) {
      throw new NotFoundException("MFA settings not found");
    }

    // Remove credential
    mfaSettings.webauthnCredentials = mfaSettings.webauthnCredentials.filter(
      (cred) => cred.id !== credentialId,
    );

    // Disable WebAuthn if no credentials left
    if (mfaSettings.webauthnCredentials.length === 0) {
      mfaSettings.webauthnEnabled = false;
    }

    await this.mfaRepository.save(mfaSettings);

    console.log("🗑️ WebAuthn credential deleted:", credentialId);
  }

  /**
   * Cleanup expired challenges
   */
  private cleanupExpiredChallenges(): void {
    const now = new Date();
    let cleaned = 0;

    for (const [key, entry] of this.challenges.entries()) {
      if (entry.expiresAt < now) {
        this.challenges.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 Cleaned up ${cleaned} expired WebAuthn challenges`);
    }
  }
}
