import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { logger } from '@/common/logger';
import { checkOrigin } from '@/common/security/cors-origin';
import { extractTenantSlugFromHost } from '@/common/tenant/tenant-host';
import { tenantSchemaName } from '@/core/tenant/tenant-schema-name';

/** The request facts the CORS decision needs (no Express types so it is trivially testable). */
export interface CorsRequestContext {
  hostname: string;
  /** Lower-cased header map. */
  headers: Record<string, string | string[] | undefined>;
  method: string;
}

interface TenantRow {
  id: string;
  slug: string;
  custom_domain: string | null;
  allowed_origins: string | null;
}

/**
 * In-memory, per-tenant CORS allow-lists (ADR-0006).
 *
 * A request's Origin is allowed only when it is in the platform fallback (CORS_ORIGINS) or in the
 * allow-list of the tenant THE REQUEST resolves to. Tenant origins are never pooled across tenants.
 * Sources per tenant: `public.tenants.allowed_origins` (managed at /tenants/current/allowed-origins)
 * and the `allowed_origins` of that tenant's OAuth clients.
 */
@Injectable()
export class CorsRefreshService {
  private originsBySlug = new Map<string, Set<string>>();
  private slugById = new Map<string, string>();
  private slugByDomain = new Map<string, string>();
  private readonly logger = new Logger(CorsRefreshService.name);
  private readonly platformDomain: string | null = process.env['SENTRY_PLATFORM_DOMAIN'] ?? null;

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Origins configured for one tenant slug (empty when unknown). */
  getTenantOrigins(slug: string): ReadonlySet<string> {
    return this.originsBySlug.get(slug) ?? new Set<string>();
  }

  /** Union of every tenant's origins. Only used to answer preflights whose tenant cannot be known. */
  private anyTenantHas(origin: string): boolean {
    for (const set of this.originsBySlug.values()) if (set.has(origin)) return true;
    return false;
  }

  private header(ctx: CorsRequestContext, name: string): string | undefined {
    const v = ctx.headers[name];
    return Array.isArray(v) ? v[0] : v;
  }

  /**
   * Mirrors TenantResolverMiddleware priority: custom domain, subdomain, x-tenant-slug,
   * x-tenant-id (when permitted). Returns undefined for platform/unknown-tenant requests.
   */
  resolveTenantSlug(ctx: CorsRequestContext): string | undefined {
    const host = ctx.hostname.toLowerCase();
    const byDomain = this.slugByDomain.get(host);
    if (byDomain) return byDomain;

    const hostSlug = extractTenantSlugFromHost(host, this.platformDomain);
    if (hostSlug && this.originsBySlug.has(hostSlug)) return hostSlug;

    const slugHeader = this.header(ctx, 'x-tenant-slug');
    if (slugHeader && this.originsBySlug.has(slugHeader)) return slugHeader;

    const allowIdHeader =
      process.env['NODE_ENV'] !== 'production' || process.env['ALLOW_TENANT_ID_HEADER'] === 'true';
    const idHeader = allowIdHeader ? this.header(ctx, 'x-tenant-id') : undefined;
    if (idHeader) return this.slugById.get(idHeader) ?? (this.originsBySlug.has(idHeader) ? idHeader : undefined);
    return undefined;
  }

  /**
   * Decides whether `origin` may be served for this request.
   * `platformOrigins` is the static fallback (CORS_ORIGINS plus bootstrap origins).
   *
   * Browsers do not send custom headers (x-tenant-slug) on a preflight, so a preflight whose host
   * does not identify a tenant is answered from the union of all lists. That only lets the browser
   * proceed: the actual request is re-checked against its own tenant, which is the enforcement point.
   */
  isOriginAllowed(origin: string, ctx: CorsRequestContext, platformOrigins: ReadonlySet<string>): boolean {
    if (platformOrigins.has(origin)) return true;
    const slug = this.resolveTenantSlug(ctx);
    if (slug) return this.getTenantOrigins(slug).has(origin);
    const isPreflight = ctx.method === 'OPTIONS' && !!this.header(ctx, 'access-control-request-method');
    return isPreflight && this.anyTenantHas(origin);
  }

  private parseList(raw: string | null | undefined, where: string): string[] {
    const out: string[] = [];
    for (const entry of (raw ?? '').split(',')) {
      const trimmed = entry.trim();
      if (!trimmed) continue;
      const checked = checkOrigin(trimmed);
      if ('origin' in checked) out.push(checked.origin);
      else this.logger.warn(`Skipping invalid CORS origin (${where}): ${trimmed}`);
    }
    return out;
  }

  private async clientOrigins(slug: string): Promise<string[]> {
    const schema = tenantSchemaName(slug);
    try {
      const rows = await this.dataSource.query<{ allowed_origins: string }[]>(`
        SELECT allowed_origins FROM "${schema}"."oauth_clients"
        WHERE allowed_origins IS NOT NULL AND allowed_origins != ''
      `);
      return rows.flatMap((r) => this.parseList(r.allowed_origins, `schema ${schema}`));
    } catch (err) {
      this.logger.error(`Failed to fetch allowed_origins from schema ${schema}`, err);
      return [];
    }
  }

  private async loadTenant(row: TenantRow): Promise<Set<string>> {
    const set = new Set(this.parseList(row.allowed_origins, `tenant ${row.slug}`));
    for (const o of await this.clientOrigins(row.slug)) set.add(o);
    return set;
  }

  private static readonly TENANT_SQL = `
    SELECT id, slug, allowed_origins,
           CASE WHEN custom_domain_verified THEN custom_domain END AS custom_domain
    FROM public.tenants WHERE active = true`;

  async refresh(): Promise<void> {
    try {
      const rows = await this.dataSource.query<TenantRow[]>(CorsRefreshService.TENANT_SQL);
      const originsBySlug = new Map<string, Set<string>>();
      const slugById = new Map<string, string>();
      const slugByDomain = new Map<string, string>();
      for (const row of rows) {
        originsBySlug.set(row.slug, await this.loadTenant(row));
        slugById.set(row.id, row.slug);
        if (row.custom_domain) slugByDomain.set(row.custom_domain.toLowerCase(), row.slug);
      }
      this.originsBySlug = originsBySlug;
      this.slugById = slugById;
      this.slugByDomain = slugByDomain;
      logger.debug({ tenants: rows.length }, 'cors_origins_refreshed');
    } catch (err) {
      logger.error({ err }, 'cors_origins_refresh_failed');
    }
  }

  /** Re-reads a single tenant so an allow-list edit takes effect on this instance immediately. */
  async refreshTenant(tenantId: string): Promise<void> {
    try {
      const rows = await this.dataSource.query<TenantRow[]>(
        `${CorsRefreshService.TENANT_SQL} AND id = $1`,
        [tenantId],
      );
      const row = rows[0];
      if (!row) {
        const slug = this.slugById.get(tenantId);
        if (slug) this.originsBySlug.delete(slug);
        this.slugById.delete(tenantId);
        return;
      }
      this.originsBySlug.set(row.slug, await this.loadTenant(row));
      this.slugById.set(row.id, row.slug);
      if (row.custom_domain) this.slugByDomain.set(row.custom_domain.toLowerCase(), row.slug);
    } catch (err) {
      logger.error({ err, tenantId }, 'cors_origins_tenant_refresh_failed');
    }
  }

  startAutoRefresh(intervalMs = 60_000): void {
    setInterval(() => void this.refresh(), intervalMs).unref();
  }
}
