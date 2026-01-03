
/**
 * Tenant Branding Controller
 * 
 * Manage tenant branding settings
 */

import {
  Controller,
  Get,
  Patch,
  Body,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { TenantService } from './tenant.service';
import { Protected } from '@/common/decorators/protected.decorator';
import { BrandingResponse, TenantBrandingDto } from './dto/tenant-branding.dto';

@Controller('tenants/current/branding')
@Protected()
export class TenantBrandingController {
  constructor(private readonly tenantService: TenantService) {}

  /**
   * Get current tenant's branding
   * GET /tenants/current/branding
   */
  @Get()
  async getBranding(@Req() req: any): Promise<BrandingResponse> {
    const tenantId = req.tenantId!;

    console.log('📋 Get branding:', { tenantId });

    const tenant = await this.tenantService.getTenantById(tenantId);

    if (!tenant) {
      throw new BadRequestException('Tenant not found');
    }

    return tenant.branding as BrandingResponse || this.getDefaultBranding();
  }

  /**
   * Update current tenant's branding
   * PATCH /tenants/current/branding
   */
  @Patch()
  async updateBranding(
    @Req() req: any,
    @Body() dto: TenantBrandingDto,
  ): Promise<BrandingResponse> {
    const tenantId = req.tenantId!;
    const userId = req.user.sub; // From JWT

    console.log('🎨 Update branding:', { tenantId, userId, updates: dto });

    // Validate color formats
    this.validateBranding(dto);

    // Update branding
    const updatedTenant = await this.tenantService.updateBranding(
      tenantId,
      dto,
    );

    console.log('✅ Branding updated');

    return updatedTenant.branding as BrandingResponse || this.getDefaultBranding();
  }

  /**
   * Reset branding to defaults
   * DELETE /tenants/current/branding
   */
  @Patch('reset')
  async resetBranding(@Req() req: any): Promise<BrandingResponse> {
    const tenantId = req.tenantId!;

    console.log('🔄 Reset branding:', { tenantId });

    const defaultBranding = this.getDefaultBranding();

    const updatedTenant = await this.tenantService.updateBranding(
      tenantId,
      defaultBranding,
    );

    console.log('✅ Branding reset to defaults');

    return updatedTenant.branding as BrandingResponse || defaultBranding;
  }

  /**
   * Validate branding data
   */
  private validateBranding(dto: TenantBrandingDto): void {
    // Validate color formats (hex)
    const colorFields = [
      'primaryColor',
      'backgroundColor',
      'textColor',
      'buttonColor',
      'buttonTextColor',
    ];

    for (const field of colorFields) {
      const value = dto[field as keyof TenantBrandingDto];
      if (value && typeof value === 'string') {
        if (!/^#[0-9A-Fa-f]{6}$/.test(value)) {
          throw new BadRequestException(
            `${field} must be a valid hex color (e.g., #0066FF)`,
          );
        }
      }
    }

    // Validate URLs
    const urlFields = ['logoUrl', 'faviconUrl', 'privacyPolicyUrl', 'termsOfServiceUrl'];

    for (const field of urlFields) {
      const value = dto[field as keyof TenantBrandingDto];
      if (value && typeof value === 'string') {
        try {
          new URL(value);
        } catch {
          throw new BadRequestException(`${field} must be a valid URL`);
        }
      }
    }

    // Validate email
    if (dto.supportEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(dto.supportEmail)) {
        throw new BadRequestException('supportEmail must be a valid email');
      }
    }
  }

  /**
   * Get default branding
   */
  private getDefaultBranding(): BrandingResponse {
    return {
      logoUrl: undefined,
      faviconUrl: undefined,
      primaryColor: '#0066FF',
      backgroundColor: '#FFFFFF',
      textColor: '#000000',
      buttonColor: '#0066FF',
      buttonTextColor: '#FFFFFF',
      companyName: undefined,
      supportEmail: undefined,
      privacyPolicyUrl: undefined,
      termsOfServiceUrl: undefined,
    };
  }
}