import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { logger } from '@/common/logger';

@Injectable()
export class CorsRefreshService {
  private readonly origins = new Set<string>();
  private readonly logger = new Logger(CorsRefreshService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  private isValidOrigin(raw: string): boolean {
    const s = raw.trim();
    if (!s || s === '*' || s === 'null') return false;
    try {
      const url = new URL(s);
      if (url.protocol === 'https:') return true;
      if (
        url.protocol === 'http:' &&
        (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
      ) {
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  getOrigins(): Set<string> {
    return this.origins;
  }

  async refresh(): Promise<void> {
    try {
      this.origins.clear();

      // 1. Fetch from platform tenants in public schema
      const tenantRows = await this.dataSource.query<{ allowed_origins: string }[]>(`
        SELECT allowed_origins FROM public.tenants
        WHERE allowed_origins IS NOT NULL AND allowed_origins != ''
      `);

      for (const row of tenantRows) {
        const list = row.allowed_origins.split(',');
        for (const origin of list) {
          const trimmed = origin.trim();
          if (this.isValidOrigin(trimmed)) {
            this.origins.add(trimmed);
          } else if (trimmed) {
            this.logger.warn(`Skipping invalid CORS origin: ${trimmed}`);
          }
        }
      }

      // 2. Fetch all tenant schemas
      const schemaRows = await this.dataSource.query<{ schema_name: string }[]>(`
        SELECT schema_name FROM information_schema.schemata
        WHERE schema_name LIKE 'fk_%'
      `);

      // 3. For each tenant schema, fetch oauth_clients origins
      for (const schemaRow of schemaRows) {
        const schema = schemaRow.schema_name;
        try {
          const clientRows = await this.dataSource.query<{ allowed_origins: string }[]>(`
            SELECT allowed_origins FROM "${schema}"."oauth_clients"
            WHERE allowed_origins IS NOT NULL AND allowed_origins != ''
          `);
          for (const row of clientRows) {
            const list = row.allowed_origins.split(',');
            for (const origin of list) {
              const trimmed = origin.trim();
              if (this.isValidOrigin(trimmed)) {
                this.origins.add(trimmed);
              } else if (trimmed) {
                this.logger.warn(`Skipping invalid CORS origin (schema ${schema}): ${trimmed}`);
              }
            }
          }
        } catch (err) {
          this.logger.error(`Failed to fetch allowed_origins from schema ${schema}`, err);
        }
      }

      logger.debug({ count: this.origins.size }, 'cors_origins_refreshed');
    } catch (err) {
      logger.error({ err }, 'cors_origins_refresh_failed');
    }
  }

  startAutoRefresh(intervalMs = 60_000): void {
    setInterval(() => void this.refresh(), intervalMs);
  }
}
