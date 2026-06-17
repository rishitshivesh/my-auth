import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { logger } from 'src/common/logger';

interface OriginRow {
  o: string;
}

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
      const rows = await this.dataSource.query<OriginRow[]>(`
        SELECT unnest(string_to_array(allowed_origins, ',')) AS o
        FROM tenants
        WHERE allowed_origins IS NOT NULL AND allowed_origins != ''
        UNION
        SELECT unnest(string_to_array(allowed_origins, ',')) AS o
        FROM oauth_clients
        WHERE allowed_origins IS NOT NULL AND allowed_origins != ''
      `);
      for (const row of rows) {
        if (this.isValidOrigin(row.o)) {
          this.origins.add(row.o.trim());
        } else if (row.o?.trim()) {
          this.logger.warn(`Skipping invalid CORS origin: ${row.o}`);
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
