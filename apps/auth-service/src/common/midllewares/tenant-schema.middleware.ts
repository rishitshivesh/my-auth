import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantContextService } from '@/core/database/tenant-context.service';
import { TenantSchemaService } from '@/core/tenant/tenant-schema.service';

@Injectable()
export class TenantSchemaMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantSchemaMiddleware.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly tenantContext: TenantContextService,
    private readonly tenantSchemaService: TenantSchemaService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    // Pass through: no tenant resolved (platform routes, health, etc.)
    if (!req.tenant?.slug) {
      return next();
    }

    const slug = req.tenant.slug;
    const schemaName = this.tenantSchemaService.getSchemaName(slug);
    const qr = this.dataSource.createQueryRunner();

    let cleanedUp = false;
    const cleanup = async () => {
      if (cleanedUp) return;
      cleanedUp = true;
      res.removeListener('finish', cleanup);
      res.removeListener('close', cleanup);
      try {
        await qr.query('ROLLBACK');
      } catch {
        // ignore rollback errors
      }
      try {
        await qr.query('SET search_path TO public');
      } catch {
        // ignore cleanup errors
      }
      try {
        await qr.release();
      } catch {
        // ignore release errors
      }
    };

    res.on('finish', cleanup);
    res.on('close', cleanup);

    try {
      // Single DB query on first access; in-process cache hit (0 queries) on every subsequent request.
      const ready = await this.tenantSchemaService.isVerifiedAndReady(slug);
      if (!ready) {
        this.logger.warn({ slug, schemaName }, 'Tenant schema or tables missing — auto-healing');
        await this.tenantSchemaService.createSchema(slug);
        this.tenantSchemaService.markVerified(slug);
      }

      await qr.query(`SET search_path TO "${schemaName}", public`);

      this.tenantContext.run({ queryRunner: qr, schemaName }, () => next());
    } catch (error) {
      this.logger.error({ slug, error }, 'Failed to set tenant search_path');
      await cleanup();
      res.status(503).json({ statusCode: 503, message: 'Tenant schema unavailable' });
    }
  }
}
