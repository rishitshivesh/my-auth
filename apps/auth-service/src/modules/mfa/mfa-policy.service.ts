import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantMfaPolicy } from '@repo/database';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

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
      // Table may not exist yet (pending migration). Return permissive default
      // so login is never hard-blocked by this service.
      this.logger.warn(
        { tenantId, error: err instanceof Error ? err.message : String(err) },
        'tenant_mfa_policy unavailable — returning permissive default',
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

  async issueEnrollmentToken(userId: string, tenantId: string): Promise<string> {
    const secret = this.configService.get<string>('JWT_SECRET');
    return this.jwtService.signAsync(
      { sub: userId, tid: tenantId, purpose: 'mfa_enrollment' },
      { expiresIn: '15m', secret },
    );
  }
}
