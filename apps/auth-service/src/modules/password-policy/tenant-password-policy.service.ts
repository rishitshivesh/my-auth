import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { TenantPasswordPolicy } from "@repo/database";
import {
  assertPasswordPolicy,
  PASSWORD_MIN_LENGTH,
  type PasswordPolicyContext,
} from "@/modules/auth/password-policy";
import { UpdatePasswordPolicyDto } from "./dto/update-password-policy.dto";

export interface EffectivePasswordPolicy {
  minLength: number;
  requireCommonPasswordCheck: boolean;
  historyCount: number;
  maxAgeDays: number;
  lockoutThreshold: number;
  lockoutDurationMinutes: number;
}

/** What applies to a tenant that never configured anything. */
export const PLATFORM_PASSWORD_POLICY: Readonly<EffectivePasswordPolicy> = Object.freeze({
  minLength: PASSWORD_MIN_LENGTH,
  requireCommonPasswordCheck: true,
  historyCount: 5,
  maxAgeDays: 0,
  lockoutThreshold: 5,
  lockoutDurationMinutes: 15,
});

@Injectable()
export class TenantPasswordPolicyService {
  constructor(
    @InjectRepository(TenantPasswordPolicy)
    private readonly repo: Repository<TenantPasswordPolicy>,
  ) {}

  /** Effective policy for a tenant: stored row, floored at the platform minimum length. */
  async get(tenantId: string): Promise<EffectivePasswordPolicy> {
    const row = await this.repo.findOne({ where: { tenantId } });
    if (!row) return { ...PLATFORM_PASSWORD_POLICY };
    return {
      minLength: Math.max(PASSWORD_MIN_LENGTH, row.minLength),
      requireCommonPasswordCheck: row.requireCommonPasswordCheck,
      historyCount: row.historyCount,
      maxAgeDays: row.maxAgeDays,
      lockoutThreshold: row.lockoutThreshold,
      lockoutDurationMinutes: row.lockoutDurationMinutes,
    };
  }

  /** Merge the supplied fields over the current policy and persist (one row per tenant). */
  async update(tenantId: string, dto: UpdatePasswordPolicyDto): Promise<EffectivePasswordPolicy> {
    const current = await this.get(tenantId);
    const next: EffectivePasswordPolicy = {
      minLength: dto.minLength ?? current.minLength,
      requireCommonPasswordCheck: dto.requireCommonPasswordCheck ?? current.requireCommonPasswordCheck,
      historyCount: dto.historyCount ?? current.historyCount,
      maxAgeDays: dto.maxAgeDays ?? current.maxAgeDays,
      lockoutThreshold: dto.lockoutThreshold ?? current.lockoutThreshold,
      lockoutDurationMinutes: dto.lockoutDurationMinutes ?? current.lockoutDurationMinutes,
    };
    const existing = await this.repo.findOne({ where: { tenantId } });
    await this.repo.save({ ...(existing ?? {}), tenantId, ...next });
    return next;
  }

  /** Throws PASSWORD_POLICY when the password violates this tenant's policy. */
  async assert(tenantId: string, password: string, context: PasswordPolicyContext = {}): Promise<void> {
    const policy = await this.get(tenantId);
    assertPasswordPolicy(password, context, {
      minLength: policy.minLength,
      commonPasswordCheck: policy.requireCommonPasswordCheck,
    });
  }
}

/** Callers that may run without the service wired (unit tests, bootstrap) fall back to platform rules. */
export async function assertTenantPasswordPolicy(
  service: TenantPasswordPolicyService | undefined,
  tenantId: string,
  password: string,
  context: PasswordPolicyContext = {},
): Promise<void> {
  if (!service) return assertPasswordPolicy(password, context);
  await service.assert(tenantId, password, context);
}

export function passwordExpired(
  policy: Pick<EffectivePasswordPolicy, "maxAgeDays">,
  changedAt: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (policy.maxAgeDays <= 0 || !changedAt) return false;
  return now.getTime() - new Date(changedAt).getTime() > policy.maxAgeDays * 86_400_000;
}
