import {
  Controller,
  Get,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Protected } from '@/common/decorators/protected.decorator';
import { PermissionsGuard } from '@/modules/rbac/guards/permissions.guard';
import { RequirePermissions } from '@/modules/rbac/decorators/rbac.decorator';
import { Permissions } from '@/modules/rbac/constants/permissions.catalog';
import { AuditService } from './audit.service';
import { AuditFiltersDto } from './dto/audit-filters.dto';

interface AuthenticatedRequest {
  tenantId: string;
  user: { sub: string; email?: string };
}

@ApiTags('Audit')
@Controller('audit')
@Protected()
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.AUDIT_READ)
  @ApiOperation({ summary: 'List audit events with server-side filters' })
  async listAuditEvents(
    @Query() filters: AuditFiltersDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.auditService.list(req.tenantId, filters);
  }

  @Get('export')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.AUDIT_EXPORT)
  @ApiOperation({ summary: 'Export audit events as CSV' })
  async exportAuditEvents(
    @Query() filters: AuditFiltersDto,
    @Request() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    const csv = await this.auditService.exportCsv(req.tenantId, filters);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="audit-${Date.now()}.csv"`,
    );
    res.send(csv);
  }
}
