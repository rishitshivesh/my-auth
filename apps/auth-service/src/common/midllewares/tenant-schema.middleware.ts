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

    const cleanup = async () => {
      try {
        await qr.query('SET search_path TO public');
      } catch {
        // ignore cleanup errors
      }
      await qr.release();
    };

    res.on('finish', cleanup);
    res.on('close', cleanup);

    try {
      // Auto-heal: if schema or tables don't exist, create/heal them on-demand
      const exists = await this.tenantSchemaService.schemaExists(slug);
      let tablesExist = false;
      if (exists) {
        tablesExist = await this.tenantSchemaService.tablesExist(slug);
      }

      if (!exists || !tablesExist) {
        this.logger.warn({ slug, schemaName }, 'Tenant schema or tables missing — auto-healing');
        await this.tenantSchemaService.createSchema(slug);
      }

      await qr.query(`SET search_path TO "${schemaName}", public`);

      this.tenantContext.run({ queryRunner: qr, schemaName }, () => next());
    } catch (error) {
      this.logger.error({ slug, error }, 'Failed to set tenant search_path');
      await qr.release();
      res.removeListener('finish', cleanup);
      res.removeListener('close', cleanup);
      res.status(503).json({ statusCode: 503, message: 'Tenant schema unavailable' });
    }
  }
}
