import { Injectable } from "@nestjs/common";
import * as crypto from "crypto";
import { RedisService } from "@/common/service/redis.service";
import type { AuthorizeRequestDto } from "../dto";

const RESOURCE = "oauth_consent_tx";
export const CONSENT_TRANSACTION_TTL_SECONDS = 10 * 60;

/** Everything needed to finish an authorize request once the user decides. */
export interface ConsentTransaction {
  tenantId: string;
  userId: string;
  sessionId: string;
  authTime: number;
  amr: string[];
  /** DB id of the client. */
  clientDbId: string;
  request: Pick<
    AuthorizeRequestDto,
    "client_id" | "redirect_uri" | "scope" | "state" | "nonce" | "code_challenge" | "code_challenge_method"
  >;
  grantedScopes: string[];
  csrfToken: string;
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/**
 * Short-lived server-side record of a pending consent decision. The decision
 * POST must present the transaction id AND its CSRF token, and come from the
 * same authenticated session, so a forged cross-site POST cannot grant consent.
 */
@Injectable()
export class OAuthConsentTransactionService {
  constructor(private readonly redis: RedisService) {}

  async create(data: Omit<ConsentTransaction, "csrfToken">): Promise<string> {
    const id = crypto.randomBytes(24).toString("base64url");
    const tx: ConsentTransaction = {
      ...data,
      csrfToken: crypto.randomBytes(24).toString("base64url"),
    };
    await this.redis.set(data.tenantId, RESOURCE, id, tx, CONSENT_TRANSACTION_TTL_SECONDS);
    return id;
  }

  /** Read without consuming; null unless it belongs to this tenant, user and session. */
  async peek(
    tenantId: string,
    id: string,
    userId: string,
    sessionId: string,
  ): Promise<ConsentTransaction | null> {
    const tx = await this.redis.get<ConsentTransaction>(tenantId, RESOURCE, id);
    if (!tx || tx.tenantId !== tenantId || tx.userId !== userId || tx.sessionId !== sessionId) {
      return null;
    }
    return tx;
  }

  /** Atomically consume (one decision per transaction) after verifying the CSRF token. */
  async consume(
    tenantId: string,
    id: string,
    userId: string,
    sessionId: string,
    csrfToken: string,
  ): Promise<ConsentTransaction | null> {
    const tx = await this.peek(tenantId, id, userId, sessionId);
    if (!tx || !safeEqual(tx.csrfToken, csrfToken)) return null;
    const removed = await this.redis.consumeOnce(tenantId, RESOURCE, id);
    return removed ? tx : null;
  }
}
