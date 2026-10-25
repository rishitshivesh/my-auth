import { randomBytes } from "crypto";
import { Injectable } from "@nestjs/common";
import { ApiException } from "@/common/http";
import { hashToken } from "@/common/security/token-hash";
import { RedisService } from "./redis.service";

/** How long a spent or expired link is remembered so the UI can say which it was. */
const RETAIN_SECONDS = 7 * 24 * 60 * 60;
const RECORD_RESOURCE = "link";
const USED_RESOURCE = "link-used";
const ACTIVE_RESOURCE = "link-active";
const META_RESOURCE = "link-meta";

export type LinkState = "valid" | "expired" | "used" | "invalid";

export interface LinkRecord<M = Record<string, unknown>> {
  subjectId: string;
  expiresAt: number;
  meta?: M;
}

export interface LinkInspection<M = Record<string, unknown>> {
  state: LinkState;
  record?: LinkRecord<M>;
}

/**
 * Purpose-bound, single-use, short-lived bearer links held in Redis.
 *
 * - The raw token (256 bits) exists only in the email; Redis holds its SHA-256.
 * - Keys are scoped by tenant AND purpose, so a reset token never works as a magic link and a
 *   token from tenant A never resolves in tenant B.
 * - `inspect` never consumes: safe for email scanners and GET validation endpoints.
 * - `consume` claims the link with an atomic SET NX, so exactly one caller wins.
 * - Spent and expired links are remembered for 7 days so callers can return LINK_ALREADY_USED
 *   or LINK_EXPIRED instead of a generic failure. The token is the secret, so this reveals
 *   nothing about whether an account exists.
 */
@Injectable()
export class LinkTokenService {
  constructor(private readonly redis: RedisService) {}

  private slot(purpose: string, resource: string): string {
    return `${resource}:${purpose}`;
  }

  /** Creates a link token and returns the raw value to put in the email. */
  async issue<M extends object = Record<string, unknown>>(
    tenantId: string,
    purpose: string,
    subjectId: string,
    ttlSeconds: number,
    meta?: M,
    supersedePrevious = false,
  ): Promise<string> {
    if (supersedePrevious) await this.supersede(tenantId, purpose, subjectId);
    const raw = randomBytes(32).toString("hex");
    const record: LinkRecord<M> = { subjectId, expiresAt: Date.now() + ttlSeconds * 1000, ...(meta ? { meta } : {}) };
    const hashed = hashToken(raw);
    await this.redis.set(tenantId, this.slot(purpose, RECORD_RESOURCE), hashed, record, ttlSeconds + RETAIN_SECONDS);
    await this.redis.set(tenantId, this.slot(purpose, ACTIVE_RESOURCE), subjectId, hashed, ttlSeconds + RETAIN_SECONDS);
    return raw;
  }

  /** Marks the subject's latest outstanding link as spent (a newer link, or the action it was for, happened). */
  async supersede(tenantId: string, purpose: string, subjectId: string): Promise<void> {
    const previous = await this.redis.get<string>(tenantId, this.slot(purpose, ACTIVE_RESOURCE), subjectId);
    if (!previous) return;
    await this.redis.setIfAbsent(tenantId, this.slot(purpose, USED_RESOURCE), previous, 1, RETAIN_SECONDS);
    await this.redis.delete(tenantId, this.slot(purpose, ACTIVE_RESOURCE), subjectId);
  }

  async inspect<M = Record<string, unknown>>(tenantId: string, purpose: string, raw: string): Promise<LinkInspection<M>> {
    if (!raw || raw.length > 256) return { state: "invalid" };
    const id = hashToken(raw);
    const record = await this.redis.get<LinkRecord<M>>(tenantId, this.slot(purpose, RECORD_RESOURCE), id);
    if (!record) return { state: await this.wasUsed(tenantId, purpose, id) ? "used" : "invalid" };
    if (await this.wasUsed(tenantId, purpose, id)) return { state: "used", record };
    if (record.expiresAt <= Date.now()) return { state: "expired", record };
    return { state: "valid", record };
  }

  /** Atomically spends a valid link; throws LINK_* / AUTH_TOKEN_INVALID otherwise. */
  async consume<M = Record<string, unknown>>(tenantId: string, purpose: string, raw: string): Promise<LinkRecord<M>> {
    const found = await this.inspect<M>(tenantId, purpose, raw);
    if (found.state !== "valid" || !found.record) throw LinkTokenService.failure(found.state);
    const claimed = await this.redis.setIfAbsent(tenantId, this.slot(purpose, USED_RESOURCE), hashToken(raw), 1, RETAIN_SECONDS);
    if (!claimed) throw LinkTokenService.failure("used");
    return found.record;
  }

  /** Side data for a DB-backed token (e.g. redirectUri), keyed by the token's hash, expiring with it. */
  async setMeta(tenantId: string, purpose: string, raw: string, meta: Record<string, unknown>, ttlSeconds: number): Promise<void> {
    await this.redis.set(tenantId, this.slot(purpose, META_RESOURCE), hashToken(raw), meta, ttlSeconds + RETAIN_SECONDS);
  }

  async getMeta<M = Record<string, unknown>>(tenantId: string, purpose: string, raw: string): Promise<M | null> {
    return this.redis.get<M>(tenantId, this.slot(purpose, META_RESOURCE), hashToken(raw));
  }

  /** For DB-backed tokens (verify-email, magic link, invite): remember that this one was spent. */
  async noteSpent(tenantId: string, purpose: string, raw: string): Promise<void> {
    await this.redis.set(tenantId, this.slot(purpose, USED_RESOURCE), hashToken(raw), 1, RETAIN_SECONDS);
  }

  async wasUsed(tenantId: string, purpose: string, hashed: string): Promise<boolean> {
    return (await this.redis.get(tenantId, this.slot(purpose, USED_RESOURCE), hashed)) !== null;
  }

  /** Classifies a failed DB lookup: was it spent earlier, or genuinely unknown? */
  async failureFor(tenantId: string, purpose: string, raw: string, expired: boolean): Promise<ApiException> {
    if (expired) return LinkTokenService.failure("expired");
    return LinkTokenService.failure((await this.wasUsed(tenantId, purpose, hashToken(raw))) ? "used" : "invalid");
  }

  static failure(state: LinkState | "wrong_account"): ApiException {
    if (state === "expired") return new ApiException("LINK_EXPIRED");
    if (state === "used") return new ApiException("LINK_ALREADY_USED");
    if (state === "wrong_account") return new ApiException("LINK_WRONG_ACCOUNT");
    return new ApiException("AUTH_TOKEN_INVALID");
  }
}
