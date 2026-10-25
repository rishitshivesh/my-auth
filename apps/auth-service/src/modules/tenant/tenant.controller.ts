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
} from "@nestjs/common";
import { IsArray, IsOptional, IsString, Matches, MaxLength } from "class-validator";
import { type Request } from "express";
import { TenantService } from "./tenant.service";
import { JwtAuthGuard } from "@/common/guards";
import { TenantBindingGuard } from "@/common/guards/tenant-binding.guard";
import { SessionGuard } from "@/common/guards/session.guard";
import { PermissionsGuard } from "@/modules/rbac/guards/permissions.guard";
import { RequirePermissions } from "@/modules/rbac/decorators/rbac.decorator";
import { Permissions } from "@/modules/rbac/constants/permissions.catalog";
import { ApiException } from "@/common/http";

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{2,62}$/;
const HOSTNAME_PATTERN = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

interface TenantRequest extends Request {
  user?: { sub: string; isSuperAdmin?: boolean };
}

function assertSuperAdmin(req: TenantRequest): void {
  if (!req.user?.isSuperAdmin) {
    throw new ApiException("ACCESS_FORBIDDEN", { detail: "Platform administrators only." });
  }
}

// DTO for creating tenant
export class CreateTenantDto {
  @IsString()
  @Matches(SLUG_PATTERN)
  slug!: string;

  @IsString()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
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

export class SetCustomDomainDto {
  @IsString()
  @Matches(HOSTNAME_PATTERN)
  domain!: string;
}

@Controller("tenants")
@UseGuards(JwtAuthGuard, TenantBindingGuard, SessionGuard, PermissionsGuard)
export class TenantController {
  constructor(private tenantService: TenantService) {}

  /**
   * Get current tenant info
   */
  @Get("current")
  async getCurrent(@Req() req: Request) {
    return req.tenant;
  }

  /**
   * Create new tenant (platform admin only - add RBAC later)
   */
  @Post()
  async create(@Req() req: Request, @Body() dto: CreateTenantDto) {
    assertSuperAdmin(req);
    return this.tenantService.create(dto);
  }

  /**
   * Set custom domain for tenant
   */
  @Patch(":id/custom-domain")
  async setCustomDomain(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() dto: SetCustomDomainDto,
  ) {
    assertSuperAdmin(req);
    return this.tenantService.setCustomDomain(id, dto.domain);
  }

  /**
   * Verify custom domain (would be called after DNS verification)
   */
  @Post(":id/verify-domain")
  async verifyDomain(@Req() req: Request, @Param("id") id: string) {
    assertSuperAdmin(req);
    return this.tenantService.verifyCustomDomain(id);
  }
}
