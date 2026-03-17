/**
 * TenantBrandingService
 *
 * Manages the tenant_branding table (one row per tenant).
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantBranding } from '@repo/database';
import { BrandingResponse, TenantBrandingDto } from './dto/tenant-branding.dto';
import { FileStorageService } from './file-storage.service';

const DEFAULTS: Omit<BrandingResponse, 'logoUrl'> = {
  primaryColor: '#6366f1',
  fontFamily: 'Inter',
  headerWeight: 'bold',
  backgroundStyle: 'solid',
};

@Injectable()
export class TenantBrandingService {
  constructor(
    @InjectRepository(TenantBranding)
    private readonly repo: Repository<TenantBranding>,

    private readonly fileStorage: FileStorageService,
  ) {}

  /** Return the tenant's branding or sensible defaults if no row exists. */
  async getBranding(tenantId: string): Promise<BrandingResponse> {
    const row = await this.repo.findOne({ where: { tenantId } });
    return this.toResponse(row);
  }

  /**
   * Upsert a branding row.
   * Creates a new row if one does not yet exist, merges otherwise.
   */
  async upsertBranding(
    tenantId: string,
    dto: TenantBrandingDto,
  ): Promise<BrandingResponse> {
    let row = await this.repo.findOne({ where: { tenantId } });

    if (!row) {
      row = this.repo.create({
        tenantId,
        primaryColor: DEFAULTS.primaryColor,
        fontFamily: DEFAULTS.fontFamily,
        headerWeight: DEFAULTS.headerWeight,
        backgroundStyle: DEFAULTS.backgroundStyle,
      });
    }

    if (dto.primaryColor !== undefined) row.primaryColor = dto.primaryColor;
    if (dto.logoUrl !== undefined) row.logoUrl = dto.logoUrl;
    if (dto.fontFamily !== undefined) row.fontFamily = dto.fontFamily;
    if (dto.headerWeight !== undefined) row.headerWeight = dto.headerWeight;
    if (dto.backgroundStyle !== undefined) row.backgroundStyle = dto.backgroundStyle;

    await this.repo.save(row);
    return this.toResponse(row);
  }

  /**
   * Store an uploaded logo and update logoUrl in the branding row.
   * Returns the public URL.
   */
  async storeLogo(
    tenantId: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<string> {
    const logoUrl = await this.fileStorage.store(buffer, mimeType, `logo-${tenantId}`);

    // Ensure branding row exists
    let row = await this.repo.findOne({ where: { tenantId } });
    if (!row) {
      row = this.repo.create({
        tenantId,
        primaryColor: DEFAULTS.primaryColor,
        fontFamily: DEFAULTS.fontFamily,
        headerWeight: DEFAULTS.headerWeight,
        backgroundStyle: DEFAULTS.backgroundStyle,
      });
    }

    row.logoUrl = logoUrl;
    await this.repo.save(row);
    return logoUrl;
  }

  /** Fetch branding by tenant slug (public – for hosted login page). */
  async getBrandingBySlug(slug: string): Promise<BrandingResponse> {
    const row = await this.repo
      .createQueryBuilder('b')
      .innerJoin('b.tenant', 't')
      .where('t.slug = :slug', { slug })
      .getOne();

    return this.toResponse(row ?? null);
  }

  private toResponse(row: TenantBranding | null): BrandingResponse {
    if (!row) return { ...DEFAULTS };
    return {
      primaryColor: row.primaryColor,
      logoUrl: row.logoUrl,
      fontFamily: row.fontFamily,
      headerWeight: row.headerWeight,
      backgroundStyle: row.backgroundStyle,
    };
  }
}
