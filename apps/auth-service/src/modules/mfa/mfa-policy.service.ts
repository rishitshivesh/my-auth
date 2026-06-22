import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantMfaPolicy } from '@repo/database';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MfaPolicyService {
  constructor(
    @InjectRepository(TenantMfaPolicy)
    private readonly policyRepo: Repository<TenantMfaPolicy>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async getForTenant(tenantId: string): Promise<TenantMfaPolicy> {
    let policy = await this.policyRepo.findOne({ where: { tenantId } });
    if (!policy) {
      policy = this.policyRepo.create({ tenantId });
      await this.policyRepo.save(policy);
    }
    return policy;
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
