// apps/auth-service/src/modules/tenant/tenant.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  Req,
  ForbiddenException,
} from "@nestjs/common";
import { IsArray, IsOptional, IsString } from "class-validator";
import { type Request } from "express";
import { TenantService } from "./tenant.service";
import { JwtAuthGuard } from "@/common/guards";
import { PermissionsGuard } from "@/modules/rbac/guards/permissions.guard";
import { RequirePermissions } from "@/modules/rbac/decorators/rbac.decorator";
import { Permissions } from "@/modules/rbac/constants/permissions.catalog";

// DTO for creating tenant
export class CreateTenantDto {
  slug!: string;
  name!: string;
  environment?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedOrigins?: string[];
}

export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  environment?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedOrigins?: string[];
}

export class UpdateTenantNameDto {
  @IsString()
  name!: string;
}

export class SetCustomDomainDto {
  domain!: string;
}

@Controller("tenants")
@UseGuards(JwtAuthGuard) // Only authenticated users
export class TenantController {
  constructor(private tenantService: TenantService) {}

  /**
   * Get current tenant info
   */
  @Get("current")
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.TENANT_READ)
  async getCurrent(@Req() req: Request) {
    return req.tenant;
  }

  /**
   * Update current tenant display name
   * PATCH /tenants/current/name
   */
  @Patch("current/name")
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.TENANT_WRITE)
  async updateCurrentName(
    @Req() req: Request,
    @Body() dto: UpdateTenantNameDto,
  ) {
    const tenantId = req.tenantId;
    if (!tenantId) throw new ForbiddenException("No tenant context");
    const trimmed = dto.name?.trim();
    if (!trimmed || trimmed.length < 1) {
      throw new ForbiddenException("Name cannot be empty");
    }
    return this.tenantService.updateName(tenantId, trimmed);
  }

  /**
   * Create new tenant (platform admin only)
   */
  @Post()
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.TENANT_WRITE)
  async create(@Body() dto: CreateTenantDto) {
    return this.tenantService.create(dto);
  }

  /**
   * Set custom domain for tenant
   */
  @Patch(":id/custom-domain")
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.TENANT_WRITE)
  async setCustomDomain(
    @Param("id") id: string,
    @Body() dto: SetCustomDomainDto,
  ) {
    return this.tenantService.setCustomDomain(id, dto.domain);
  }

  /**
   * Verify custom domain (called after DNS verification)
   */
  @Post(":id/verify-domain")
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.TENANT_WRITE)
  async verifyDomain(@Param("id") id: string) {
    return this.tenantService.verifyCustomDomain(id);
  }
}
