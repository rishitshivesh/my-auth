import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import { ACCESS_TOKEN_COOKIE } from "@/common/http/auth-cookies";
import { SessionService } from "@/common/service/session.service";
import { JwksService } from "./jwks.service";

/** The authenticated browser session behind an /oauth/authorize request. */
export interface BrowserSession {
  userId: string;
  sessionId: string;
  /** Epoch seconds of the login this session started with. */
  authTime: number;
  amr: string[];
}

const DEFAULT_AMR = ["pwd"];

function isSessionAccessToken(payload: Record<string, unknown>): boolean {
  return (
    payload["type"] === undefined &&
    payload["mode"] === undefined &&
    payload["purpose"] === undefined &&
    typeof payload["sub"] === "string" &&
    typeof payload["sessionId"] === "string"
  );
}

/**
 * Resolves the user behind a browser request from the access-token cookie.
 *
 * Mirrors the JWT/Session guards (RS256 via JWKS, purpose-bound tokens refused,
 * tenant binding, live session) but returns null instead of throwing, because
 * an anonymous /oauth/authorize request is a normal condition that redirects
 * to login rather than an error.
 */
@Injectable()
export class OAuthBrowserSessionService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly jwksService: JwksService,
    private readonly sessionService: SessionService,
  ) {}

  async resolve(req: Request, tenantId: string): Promise<BrowserSession | null> {
    const token = (req.cookies as Record<string, string> | undefined)?.[ACCESS_TOKEN_COOKIE];
    if (!token) return null;

    let payload: Record<string, unknown>;
    try {
      const publicKey = await this.jwksService.getPublicKeyForToken(token);
      payload = this.jwtService.verify(token, {
        publicKey: publicKey.export({ type: "spki", format: "pem" }) as string,
        algorithms: ["RS256"],
      }) as Record<string, unknown>;
    } catch {
      return null;
    }
    if (!isSessionAccessToken(payload)) return null;

    const tokenTenant = payload["tenantId"] ?? payload["tenant_id"];
    if (tokenTenant !== tenantId) return null;

    const sessionId = payload["sessionId"] as string;
    const userId = payload["sub"] as string;
    const session = await this.sessionService.validateSession(tenantId, sessionId);
    if (!session || session.userId !== userId || session.tenantId !== tenantId) return null;

    const authTime =
      typeof payload["authTime"] === "number"
        ? payload["authTime"]
        : typeof payload["iat"] === "number"
          ? payload["iat"]
          : 0;
    // The session row is authoritative (survives refresh); the token claim covers older sessions.
    const tokenAmr = Array.isArray(payload["amr"])
      ? (payload["amr"] as unknown[]).filter((m): m is string => typeof m === "string")
      : [];
    const amr = session.amr && session.amr.length > 0 ? session.amr : tokenAmr;

    return { userId, sessionId, authTime, amr: amr.length > 0 ? amr : DEFAULT_AMR };
  }
}
