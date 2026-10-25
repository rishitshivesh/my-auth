import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantMfaPolicy } from '@repo/database';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { ApiException } from '@/common/http';

@Injectable()
export class MfaPolicyService {
  private readonly logger = new Logger(MfaPolicyService.name);

  constructor(
    @InjectRepository(TenantMfaPolicy)
    private readonly policyRepo: Repository<TenantMfaPolicy>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async getForTenant(tenantId: string): Promise<TenantMfaPolicy> {
    try {
      let policy = await this.policyRepo.findOne({ where: { tenantId } });
      if (!policy) {
        policy = this.policyRepo.create({ tenantId });
        await this.policyRepo.save(policy);
      }
      return policy;
    } catch (err: unknown) {
      // Only swallow undefined_table (42P01) — migration not yet run.
      // Any other error (connection failure, timeout, etc.) must rethrow so
      // the caller does NOT silently bypass MFA enforcement.
      // TypeORM copies driverError properties onto QueryFailedError via Object.assign,
      // but also keeps them on .driverError — check both to be safe across versions.
      const asAny = err as Record<string, unknown>;
      const pgCode = (asAny?.code as string) ?? (asAny?.driverError as Record<string, unknown>)?.code as string;
      if (pgCode !== '42P01') throw err;

      this.logger.warn(
        { tenantId },
        'tenant_mfa_policy table missing (migration pending) — returning permissive default',
      );
      return Object.assign(new TenantMfaPolicy(), {
        tenantId,
        enforceForAllUsers: false,
        enforceForAdmins: false,
        gracePeriodDays: 0,
        exemptRoleSlugs: [],
      });
    }
  }

  async updateForTenant(tenantId: string, data: Partial<TenantMfaPolicy>): Promise<TenantMfaPolicy> {
    let policy = await this.policyRepo.findOne({ where: { tenantId } });
    if (!policy) {
      policy = this.policyRepo.create({ tenantId, ...data });
    } else {
      Object.assign(policy, data);
    }
    return this.policyRepo.save(policy);
  }

  /**
   * Short-lived, purpose-bound token that lets a user whose first factor already succeeded
   * enroll a second factor before any session exists. `fa` records that first factor so the
   * eventual session carries a truthful `amr`. `jti` makes it single-use.
   */
  async issueEnrollmentToken(
    userId: string,
    tenantId: string,
    firstFactor: EnrollmentFirstFactor = 'pwd',
  ): Promise<string> {
    const secret = this.configService.get<string>('JWT_SECRET');
    return this.jwtService.signAsync(
      { sub: userId, tid: tenantId, purpose: 'mfa_enrollment', fa: firstFactor, jti: randomUUID() },
      { expiresIn: '15m', secret },
    );
  }

  async verifyEnrollmentToken(token: string): Promise<EnrollmentClaims> {
    const secret = this.configService.get<string>('JWT_SECRET');
    let payload: Record<string, unknown>;
    try {
      payload = await this.jwtService.verifyAsync(token, { secret, algorithms: ['HS256'] });
    } catch (err: unknown) {
      throw new ApiException(
        err instanceof Error && err.name === 'TokenExpiredError' ? 'AUTH_TOKEN_EXPIRED' : 'AUTH_TOKEN_INVALID',
      );
    }
    const { sub, tid, purpose, fa, jti } = payload;
    if (purpose !== 'mfa_enrollment' || typeof sub !== 'string' || typeof tid !== 'string' || typeof jti !== 'string') {
      throw new ApiException('AUTH_TOKEN_INVALID');
    }
    const firstFactor: EnrollmentFirstFactor =
      fa === 'magic_link' || fa === 'passkey' || fa === 'social' ? fa : 'pwd';
    return { userId: sub, tenantId: tid, jti, firstFactor };
  }
}

export type EnrollmentFirstFactor = 'pwd' | 'magic_link' | 'passkey' | 'social';

export interface EnrollmentClaims {
  userId: string;
  tenantId: string;
  jti: string;
  firstFactor: EnrollmentFirstFactor;
}
