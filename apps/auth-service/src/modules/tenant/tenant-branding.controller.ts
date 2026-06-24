/**
 * Tenant Branding Controller
 *
 * GET  /tenants/current/branding        – return branding (or defaults)
 * PUT  /tenants/current/branding        – upsert branding, write audit event
 * POST /tenants/current/branding/logo   – upload logo (multipart/form-data)
 */

import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  Param,
  Req,
  BadRequestException,
  UnsupportedMediaTypeException,
  PayloadTooLargeException,
  UseInterceptors,
  UploadedFile,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TenantBrandingService } from './tenant-branding.service';
import { Protected } from '@/common/decorators/protected.decorator';
import {
  BrandingResponse,
  LogoUploadResponse,
  TenantBrandingDto,
} from './dto/tenant-branding.dto';
import { SecurityEventService } from '@/common/service/security-event.service';
import { SecurityEventType } from '@repo/database';
import { PermissionsGuard } from '@/modules/rbac/guards/permissions.guard';
import { RequirePermissions } from '@/modules/rbac/decorators/rbac.decorator';
import { Permissions } from '@/modules/rbac/constants/permissions.catalog';

interface AuthenticatedRequest {
  tenantId: string;
  user: { sub: string; email?: string; mfaVerified?: boolean };
  ip?: string;
  route?: { path: string };
  params?: Record<string, string>;
  headers?: Record<string, string>;
}

const LOGO_MAX_BYTES = 500 * 1024; // 500 KB
const ALLOWED_MIME = new Set(['image/png', 'image/svg+xml', 'image/jpeg']);

@Controller('tenants/current/branding')
@Protected()
export class TenantBrandingController {
  constructor(
    private readonly brandingService: TenantBrandingService,
    private readonly securityEvents: SecurityEventService,
  ) {}

  /** GET /tenants/current/branding */
  @Get()
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.TENANT_READ)
  async getBranding(@Req() req: AuthenticatedRequest): Promise<BrandingResponse> {
    const tenantId: string = req.tenantId!;
    return this.brandingService.getBranding(tenantId);
  }

  /** PUT /tenants/current/branding */
  @Put()
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.TENANT_WRITE)
  async updateBranding(
    @Req() req: AuthenticatedRequest,
    @Body() dto: TenantBrandingDto,
  ): Promise<BrandingResponse> {
    const tenantId: string = req.tenantId!;
    const userId: string = req.user?.sub;

    const result = await this.brandingService.upsertBranding(tenantId, dto);

    this.securityEvents.log({
      tenantId,
      userId,
      eventType: SecurityEventType.BRANDING_UPDATED,
      severity: 'info',
      ipAddress: req.ip ?? '0.0.0.0',
      userAgent: req.headers?.['user-agent'] ?? 'unknown',
      actorEmail: req.user?.email,
      resourceId: tenantId,
      resourceType: 'tenant_branding',
      metadata: {
        primaryColor: dto.primaryColor,
        fontFamily: dto.fontFamily,
        headerWeight: dto.headerWeight,
        backgroundStyle: dto.backgroundStyle,
      },
    });

    return result;
  }

  /** POST /tenants/current/branding/logo */
  @Post('logo')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.TENANT_WRITE)
  @UseInterceptors(
    FileInterceptor('logo', {
      limits: { fileSize: LOGO_MAX_BYTES },
      fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME.has(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new UnsupportedMediaTypeException(
              'Logo must be image/png, image/jpeg, or image/svg+xml',
            ),
            false,
          );
        }
      },
    }),
  )
  async uploadLogo(
    @Req() req: AuthenticatedRequest,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<LogoUploadResponse> {
    if (!file) {
      throw new BadRequestException('No file uploaded. Use field name "logo".');
    }

    if (file.size > LOGO_MAX_BYTES) {
      throw new PayloadTooLargeException('Logo must be 500 KB or smaller');
    }

    const tenantId: string = req.tenantId!;
    const logoUrl = await this.brandingService.storeLogo(
      tenantId,
      file.buffer,
      file.mimetype,
    );

    this.securityEvents.log({
      tenantId,
      userId: req.user?.sub,
      eventType: SecurityEventType.BRANDING_UPDATED,
      severity: 'info',
      ipAddress: req.ip ?? '0.0.0.0',
      userAgent: req.headers?.['user-agent'] ?? 'unknown',
      actorEmail: req.user?.email,
      resourceId: tenantId,
      resourceType: 'tenant_branding',
      metadata: { logoUploaded: true, mimeType: file.mimetype, sizeBytes: file.size },
    });

    return { logoUrl };
  }
}

/**
 * Public branding endpoint — no authentication required.
 * Used by the hosted login page to fetch branding by tenant slug.
 *
 * GET /tenants/:slug/branding/public
 */
@Controller('tenants')
export class PublicBrandingController {
  constructor(private readonly brandingService: TenantBrandingService) {}

  @Get(':slug/branding/public')
  getBrandingPublic(@Param('slug') slug: string): Promise<BrandingResponse> {
    return this.brandingService.getBrandingBySlug(slug);
  }
}
