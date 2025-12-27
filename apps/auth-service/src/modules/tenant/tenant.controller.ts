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
import { type Request } from "express";
import { TenantService } from "./tenant.service";
import { JwtAuthGuard } from "@/common/guards";

// DTO for creating tenant
export class CreateTenantDto {
  slug!: string;
  name!: string;
  environment?: string;
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
  async getCurrent(@Req() req: Request) {
    return req.tenant;
  }

  /**
   * Create new tenant (platform admin only - add RBAC later)
   */
  @Post()
  async create(@Body() dto: CreateTenantDto) {
    return this.tenantService.create(dto);
  }

  /**
   * Set custom domain for tenant
   */
  @Patch(":id/custom-domain")
  async setCustomDomain(
    @Param("id") id: string,
    @Body() dto: SetCustomDomainDto,
  ) {
    return this.tenantService.setCustomDomain(id, dto.domain);
  }

  /**
   * Verify custom domain (would be called after DNS verification)
   */
  @Post(":id/verify-domain")
  async verifyDomain(@Param("id") id: string) {
    return this.tenantService.verifyCustomDomain(id);
  }
}
