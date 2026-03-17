/**
 * Tenant Branding DTOs
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUrl,
  IsEmail,
  IsIn,
  Matches,
  MaxLength,
} from 'class-validator';
import { FONT_FAMILY_ALLOWLIST } from '@repo/database';

export class TenantBrandingDto {
  @ApiPropertyOptional({
    description: 'Primary brand color in hex format',
    example: '#6366f1',
    pattern: '^#[0-9A-Fa-f]{6}$',
  })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'primaryColor must be a valid 6-digit hex color (e.g., #6366f1)',
  })
  primaryColor?: string;

  @ApiPropertyOptional({
    description: 'URL to the company logo image',
    example: 'https://cdn.example.com/logo.png',
  })
  @IsOptional()
  @IsUrl({}, { message: 'logoUrl must be a valid URL' })
  @MaxLength(500)
  logoUrl?: string;

  @ApiPropertyOptional({
    description: 'Font family (must be from the approved list)',
    example: 'Inter',
    enum: FONT_FAMILY_ALLOWLIST,
  })
  @IsOptional()
  @IsString()
  @IsIn([...FONT_FAMILY_ALLOWLIST], {
    message: `fontFamily must be one of: ${FONT_FAMILY_ALLOWLIST.join(', ')}`,
  })
  fontFamily?: string;

  @ApiPropertyOptional({
    description: 'Header font weight',
    enum: ['regular', 'bold'],
    example: 'bold',
  })
  @IsOptional()
  @IsIn(['regular', 'bold'], {
    message: 'headerWeight must be "regular" or "bold"',
  })
  headerWeight?: 'regular' | 'bold';

  @ApiPropertyOptional({
    description: 'Background style for the login page',
    enum: ['solid', 'gradient'],
    example: 'solid',
  })
  @IsOptional()
  @IsIn(['solid', 'gradient'], {
    message: 'backgroundStyle must be "solid" or "gradient"',
  })
  backgroundStyle?: 'solid' | 'gradient';
}

export class BrandingResponse {
  @ApiProperty({ description: 'Primary brand color', example: '#6366f1' })
  primaryColor!: string;

  @ApiPropertyOptional({ description: 'Logo URL', example: 'https://cdn.example.com/logo.png' })
  logoUrl?: string;

  @ApiProperty({ description: 'Font family', example: 'Inter' })
  fontFamily!: string;

  @ApiProperty({ description: 'Header weight', example: 'bold', enum: ['regular', 'bold'] })
  headerWeight!: 'regular' | 'bold';

  @ApiProperty({ description: 'Background style', example: 'solid', enum: ['solid', 'gradient'] })
  backgroundStyle!: 'solid' | 'gradient';
}

export class LogoUploadResponse {
  @ApiProperty({ description: 'Public URL of the uploaded logo' })
  logoUrl!: string;
}
