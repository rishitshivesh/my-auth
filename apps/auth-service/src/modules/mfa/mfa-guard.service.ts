import { Injectable } from "@nestjs/common";
import { ApiException } from "@/common/http";
import { RedisService } from "@/common/service/redis.service";

/** Wrong codes allowed on one MFA login challenge before it is void. */
export const CHALLENGE_MAX_ATTEMPTS = 5;
/** Matches the lifetime of the mfa_pending token. */
export const CHALLENGE_TTL_SECONDS = 5 * 60;
/** A TOTP code is valid for 3 steps (drift of one); keep the marker longer than that. */
export const TOTP_STEP_SECONDS = 30;
const TOTP_USED_TTL_SECONDS = TOTP_STEP_SECONDS * 4;
const RECOVERY_CLAIM_TTL_SECONDS = 60;

const ATTEMPTS_RESOURCE = "mfa:challenge:attempts";
const TOTP_USED_RESOURCE = "mfa:totp:used";
const RECOVERY_CLAIM_RESOURCE = "mfa:recovery:claim";

/**
 * Redis-backed one-shot guards for the MFA step: TOTP time-step reuse,
 * per-challenge attempt limit, and single-use recovery codes under concurrency.
 */
@Injectable()
export class MfaGuardService {
  constructor(private readonly redis: RedisService) {}

  /**
   * Claims a TOTP time step for a user. False when that step was already
   * spent, so a code that was observed (shoulder surfing, phishing proxy)
   * cannot be replayed inside its validity window.
   */
  async claimTotpStep(
    tenantId: string,
    userId: string,
    step: number,
  ): Promise<boolean> {
    return this.claim(
      tenantId,
      TOTP_USED_RESOURCE,
      `${userId}:${step}`,
      TOTP_USED_TTL_SECONDS,
    );
  }

  /** Claims one stored recovery code (identified by a hash of the stored value). */
  async claimRecoveryCode(
    tenantId: string,
    userId: string,
    storedCodeId: string,
  ): Promise<boolean> {
    return this.claim(
      tenantId,
      RECOVERY_CLAIM_RESOURCE,
      `${userId}:${storedCodeId}`,
      RECOVERY_CLAIM_TTL_SECONDS,
    );
  }

  /** Throws AUTH_TOKEN_EXPIRED once a challenge has used up its attempts. */
  async assertChallengeActive(
    tenantId: string,
    challengeId: string,
  ): Promise<void> {
    const failures = await this.redis.get<number>(
      tenantId,
      ATTEMPTS_RESOURCE,
      challengeId,
    );
    if ((failures ?? 0) >= CHALLENGE_MAX_ATTEMPTS) {
      throw new ApiException("AUTH_TOKEN_EXPIRED");
    }
  }

  /**
   * Counts a wrong code. Always throws: AUTH_MFA_INVALID, and the challenge is
   * void from the fifth wrong code on (the next call sees AUTH_TOKEN_EXPIRED).
   */
  async rejectWrongCode(tenantId: string, challengeId: string): Promise<never> {
    const count = await this.redis.incr(tenantId, ATTEMPTS_RESOURCE, challengeId);
    if (count === 1) {
      await this.redis.extendTTL(
        tenantId,
        ATTEMPTS_RESOURCE,
        challengeId,
        CHALLENGE_TTL_SECONDS,
      );
    }
    throw new ApiException("AUTH_MFA_INVALID");
  }

  private async claim(
    tenantId: string,
    resource: string,
    identifier: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    // incr is atomic: only the first caller sees 1.
    const count = await this.redis.incr(tenantId, resource, identifier);
    if (count === 1) {
      await this.redis.extendTTL(tenantId, resource, identifier, ttlSeconds);
      return true;
    }
    return false;
  }
}
