// apps/auth-service/src/modules/oauth/services/oauth-consent.service.ts

import { Injectable, NotFoundException } from "@nestjs/common";
import { logger } from "@/common/logger";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, IsNull } from "typeorm";
import { OAuthConsent, OAuthClient, User } from "@repo/database";

export interface GrantConsentDto {
  tenantId: string;
  clientId: string;
  userId: string;
  grantedScopes: string[];
  rememberConsent?: boolean;
  expiresInDays?: number;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class OAuthConsentService {
  constructor(
    @InjectRepository(OAuthConsent)
    private consentRepository: Repository<OAuthConsent>,
    @InjectRepository(OAuthClient)
    private clientRepository: Repository<OAuthClient>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  /**
   * Check if user has granted consent to client for requested scopes
   */
  async hasConsent(
    tenantId: string,
    userId: string,
    clientId: string,
    requestedScopes: string[],
  ): Promise<boolean> {
    const consent = await this.getConsent(tenantId, userId, clientId);

    if (!consent) {
      return false;
    }

    // Check if consent has all requested scopes
    return consent.hasAllScopes(requestedScopes);
  }

  /**
   * Get active consent for user-client pair
   */
  async getConsent(
    tenantId: string,
    userId: string,
    clientId: string,
  ): Promise<OAuthConsent | null> {
    const consent = await this.consentRepository.findOne({
      where: {
        tenantId,
        userId,
        clientId,
        revokedAt: IsNull(),
      },
      relations: ["client", "user"],
    });

    if (!consent) {
      return null;
    }

    // Check if expired
    if (consent.isExpired) {
      return null;
    }

    return consent;
  }

  /**
   * Grant consent
   */
  async grantConsent(data: GrantConsentDto): Promise<OAuthConsent> {
    // Validate client exists
    const client = await this.clientRepository.findOne({
      where: { id: data.clientId },
    });

    if (!client) {
      throw new NotFoundException("Client not found");
    }

    // Validate user exists
    const user = await this.userRepository.findOne({
      where: { id: data.userId },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    // Calculate expiry
    let expiresAt: Date | undefined;
    if (data.expiresInDays && !data.rememberConsent) {
      expiresAt = new Date(
        Date.now() + data.expiresInDays * 24 * 60 * 60 * 1000,
      );
    }
    // If rememberConsent = true, expiresAt = null (permanent)

    // Check if consent already exists
    const existingConsent = await this.consentRepository.findOne({
      where: {
        tenantId: data.tenantId,
        userId: data.userId,
        clientId: data.clientId,
      },
    });

    if (existingConsent) {
      // Update existing consent
      existingConsent.grantedScopes = data.grantedScopes;
      existingConsent.rememberConsent = data.rememberConsent || false;
      existingConsent.expiresAt = expiresAt;
      existingConsent.revokedAt = undefined; // Un-revoke if previously revoked
      existingConsent.revokedReason = undefined;
      existingConsent.ipAddress = data.ipAddress;
      existingConsent.userAgent = data.userAgent;

      await this.consentRepository.save(existingConsent);

      logger.info({ userId: data.userId, clientId: client.clientId }, "Updated consent");

      return existingConsent;
    }

    // Create new consent
    const consent = await this.consentRepository.save({
      tenantId: data.tenantId,
      clientId: data.clientId,
      userId: data.userId,
      grantedScopes: data.grantedScopes,
      rememberConsent: data.rememberConsent || false,
      expiresAt,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
    });

    logger.info({ userId: data.userId, clientId: client.clientId }, "Granted consent");

    return consent;
  }

  /**
   * Revoke consent
   */
  async revokeConsent(
    tenantId: string,
    userId: string,
    clientId: string,
    reason: string = "user_revoked",
  ): Promise<void> {
    const consent = await this.consentRepository.findOne({
      where: {
        tenantId,
        userId,
        clientId,
      },
    });

    if (!consent) {
      return; // Already doesn't exist
    }

    consent.revokedAt = new Date();
    consent.revokedReason = reason;

    await this.consentRepository.save(consent);

    logger.info({ userId, clientId }, "Revoked consent");
  }

  /**
   * Revoke all consents for user
   */
  async revokeAllUserConsents(
    tenantId: string,
    userId: string,
    reason: string = "user_revoked_all",
  ): Promise<void> {
    await this.consentRepository.update(
      {
        tenantId,
        userId,
        revokedAt: IsNull(),
      },
      {
        revokedAt: new Date(),
        revokedReason: reason,
      },
    );

    logger.info({ userId, reason }, "Revoked all consents for user");
  }

  /**
   * Revoke all consents for client
   */
  async revokeAllClientConsents(
    tenantId: string,
    clientId: string,
    reason: string = "client_deactivated",
  ): Promise<void> {
    await this.consentRepository.update(
      {
        tenantId,
        clientId,
        revokedAt: IsNull(),
      },
      {
        revokedAt: new Date(),
        revokedReason: reason,
      },
    );

    logger.info({ clientId, reason }, "Revoked all consents for client");
  }

  /**
   * List user consents
   */
  async listUserConsents(
    tenantId: string,
    userId: string,
    includeRevoked: boolean = false,
  ): Promise<OAuthConsent[]> {
    const query = this.consentRepository
      .createQueryBuilder("consent")
      .leftJoinAndSelect("consent.client", "client")
      .where("consent.tenantId = :tenantId", { tenantId })
      .andWhere("consent.userId = :userId", { userId });

    if (!includeRevoked) {
      query.andWhere("consent.revokedAt IS NULL");
    }

    query.orderBy("consent.createdAt", "DESC");

    return query.getMany();
  }

  /**
   * List client consents
   */
  async listClientConsents(
    tenantId: string,
    clientId: string,
    includeRevoked: boolean = false,
  ): Promise<OAuthConsent[]> {
    const query = this.consentRepository
      .createQueryBuilder("consent")
      .leftJoinAndSelect("consent.user", "user")
      .where("consent.tenantId = :tenantId", { tenantId })
      .andWhere("consent.clientId = :clientId", { clientId });

    if (!includeRevoked) {
      query.andWhere("consent.revokedAt IS NULL");
    }

    query.orderBy("consent.createdAt", "DESC");

    return query.getMany();
  }

  /**
   * Get consent statistics for client
   */
  async getClientConsentStats(
    tenantId: string,
    clientId: string,
  ): Promise<{
    total: number;
    active: number;
    revoked: number;
    expired: number;
  }> {
    const allConsents = await this.consentRepository.find({
      where: {
        tenantId,
        clientId,
      },
    });

    const stats = {
      total: allConsents.length,
      active: 0,
      revoked: 0,
      expired: 0,
    };

    for (const consent of allConsents) {
      if (consent.revokedAt) {
        stats.revoked++;
      } else if (consent.isExpired) {
        stats.expired++;
      } else {
        stats.active++;
      }
    }

    return stats;
  }

  /**
   * Clean up expired consents
   */
  async cleanupExpiredConsents(): Promise<number> {
    const now = new Date();

    // Soft-delete expired consents (mark as revoked)
    const result = await this.consentRepository
      .createQueryBuilder()
      .update(OAuthConsent)
      .set({
        revokedAt: now,
        revokedReason: "expired",
      })
      .where("expiresAt IS NOT NULL")
      .andWhere("expiresAt < :now", { now })
      .andWhere("revokedAt IS NULL")
      .execute();

    const count = result.affected || 0;

    if (count > 0) {
      logger.info({ count }, "Cleaned up expired consents");
    }

    return count;
  }

  /**
   * Check if consent is required for client
   */
  async isConsentRequired(
    client: OAuthClient,
    existingConsent?: OAuthConsent,
  ): Promise<boolean> {
    // First-party clients don't need consent
    if (client.isFirstParty) {
      return false;
    }

    // If client doesn't require consent
    if (!client.requireConsent) {
      return false;
    }

    // If user already has valid consent
    if (existingConsent && existingConsent.isValid) {
      return false;
    }

    // Otherwise, consent is required
    return true;
  }
}
