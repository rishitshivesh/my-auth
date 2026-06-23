import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityTarget, IsNull } from 'typeorm';
import { OAuthRefreshToken } from '@repo/database';
import { TenantAwareRepository } from '../../../core/database/tenant-aware.repository';
import { TenantContextService } from '../../../core/database/tenant-context.service';

export interface CreateRefreshTokenData {
  tenantId: string;
  userId: string;
  sessionId: string;
  clientId?: string;
  scope?: string;
  tokenHash: string;
  familyId: string;
  parentTokenId?: string;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
  deviceId?: string;
}

@Injectable()
export class RefreshTokenRepository extends TenantAwareRepository<OAuthRefreshToken> {
  protected get entityTarget(): EntityTarget<OAuthRefreshToken> {
    return OAuthRefreshToken;
  }

  constructor(
    @InjectDataSource() dataSource: DataSource,
    tenantContext: TenantContextService,
  ) {
    super(dataSource, tenantContext);
  }

  findByToken(tokenHash: string, tenantId: string): Promise<OAuthRefreshToken | null> {
    // Defense-in-depth: tenant_id filter retained alongside schema-level isolation
    return this.findOne({ where: { tokenHash, tenantId } as Parameters<typeof this.findOne>[0]['where'] });
  }

  findFamily(familyId: string, tenantId: string): Promise<OAuthRefreshToken[]> {
    // Defense-in-depth: tenant_id filter retained alongside schema-level isolation
    return this.find({
      where: { familyId, tenantId } as NonNullable<Parameters<typeof this.find>[0]>['where'],
      order: { createdAt: 'DESC' },
    });
  }

  async revokeFamily(familyId: string, tenantId: string, reason = 'family_revoked_reuse_detection'): Promise<void> {
    // Defense-in-depth: tenant_id filter retained alongside schema-level isolation
    await this.update(
      { familyId, tenantId } as Parameters<typeof this.update>[0],
      { revokedAt: new Date(), revokedReason: reason } as Parameters<typeof this.update>[1],
    );
  }

  async markUsed(tokenId: string, tenantId: string): Promise<void> {
    // Defense-in-depth: tenant_id filter retained alongside schema-level isolation
    await this.update(
      { id: tokenId, tenantId } as Parameters<typeof this.update>[0],
      { usedAt: new Date() } as Parameters<typeof this.update>[1],
    );
  }

  async revokeByHash(tokenHash: string, tenantId: string, reason = 'manual_revocation'): Promise<void> {
    // Defense-in-depth: tenant_id filter retained alongside schema-level isolation
    await this.update(
      { tokenHash, tenantId } as Parameters<typeof this.update>[0],
      { revokedAt: new Date(), revokedReason: reason } as Parameters<typeof this.update>[1],
    );
  }

  async revokeAllForUser(userId: string, tenantId: string, reason = 'user_logout_all'): Promise<void> {
    // Defense-in-depth: tenant_id filter retained alongside schema-level isolation
    await this.update(
      { userId, tenantId, revokedAt: IsNull() } as Parameters<typeof this.update>[0],
      { revokedAt: new Date(), revokedReason: reason } as Parameters<typeof this.update>[1],
    );
  }

  async revokeAllForSession(sessionId: string, tenantId: string, reason = 'session_logout'): Promise<void> {
    // Defense-in-depth: tenant_id filter retained alongside schema-level isolation
    await this.update(
      { sessionId, tenantId, revokedAt: IsNull() } as Parameters<typeof this.update>[0],
      { revokedAt: new Date(), revokedReason: reason } as Parameters<typeof this.update>[1],
    );
  }

  findActiveForSession(sessionId: string, tenantId: string): Promise<OAuthRefreshToken[]> {
    // Defense-in-depth: tenant_id filter retained alongside schema-level isolation
    return this.find({
      where: { sessionId, tenantId, revokedAt: IsNull() } as NonNullable<Parameters<typeof this.find>[0]>['where'],
      order: { createdAt: 'DESC' },
    });
  }

  findActiveForUser(userId: string, tenantId: string): Promise<OAuthRefreshToken[]> {
    // Defense-in-depth: tenant_id filter retained alongside schema-level isolation
    return this.find({
      where: { userId, tenantId, revokedAt: IsNull() } as NonNullable<Parameters<typeof this.find>[0]>['where'],
      order: { createdAt: 'DESC' },
    });
  }

  async createToken(data: CreateRefreshTokenData): Promise<OAuthRefreshToken> {
    const entity = this.manager.create(OAuthRefreshToken, data);
    return this.save(entity);
  }
}
