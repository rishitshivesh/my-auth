import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { OAuthClient } from "@repo/database";
import { ApiException } from "@/common/http";

const MAX_REDIRECT_URI_LENGTH = 2048;

/**
 * Validates the optional `redirectUri` carried by email links (magic link, reset, verification).
 * Accepted: an exact redirect URI of one of THIS tenant's OAuth clients, or a URL on the portal /
 * frontend origin. Credentials in the URL, non-http(s) schemes and everything else are refused,
 * so a link can never be turned into an open redirect.
 */
@Injectable()
export class RedirectUriService {
  constructor(
    @InjectRepository(OAuthClient) private readonly clients: Repository<OAuthClient>,
    private readonly config: ConfigService,
  ) {}

  private portalOrigins(): Set<string> {
    const origins = new Set<string>();
    for (const key of ["PORTAL_URL", "FRONTEND_URL", "ADMIN_PORTAL_ORIGIN"]) {
      const raw = this.config.get<string>(key);
      if (!raw) continue;
      try {
        origins.add(new URL(raw).origin);
      } catch {
        /* env.validation guards the format */
      }
    }
    return origins;
  }

  /** Returns the canonical URI, or throws VALIDATION_FAILED. `undefined`/empty means none. */
  async validate(tenantId: string, raw: string | undefined): Promise<string | undefined> {
    if (raw === undefined || raw === "") return undefined;
    const fail = () =>
      new ApiException("VALIDATION_FAILED", {
        errors: [{ field: "redirectUri", message: "redirectUri is not an allowed destination for this workspace" }],
      });
    if (raw.length > MAX_REDIRECT_URI_LENGTH) throw fail();
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw fail();
    }
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) throw fail();
    if (this.portalOrigins().has(url.origin)) return url.toString();

    const clients = await this.clients.find({ where: { tenantId }, select: { id: true, redirectUris: true } });
    if (clients.some((c) => (c.redirectUris ?? []).includes(raw))) return raw;
    throw fail();
  }
}
