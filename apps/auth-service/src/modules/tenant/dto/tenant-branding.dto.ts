/**
 * Tenant Branding DTOs
 * 
 * Data transfer objects with Swagger documentation
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUrl,
  IsEmail,
  Matches,
  MaxLength,
} from 'class-validator';

/**
 * Tenant Branding DTO
 */
export class TenantBrandingDto {
  @ApiPropertyOptional({
    description: 'URL to the company logo image',
    example: 'https://cdn.example.com/logo.png',
    type: String,
  })
  @IsOptional()
  @IsUrl({}, { message: 'logoUrl must be a valid URL' })
  @MaxLength(500)
  logoUrl?: string;

  @ApiPropertyOptional({
    description: 'URL to the favicon image',
    example: 'https://cdn.example.com/favicon.ico',
    type: String,
  })
  @IsOptional()
  @IsUrl({}, { message: 'faviconUrl must be a valid URL' })
  @MaxLength(500)
  faviconUrl?: string;

  @ApiPropertyOptional({
    description: 'Primary brand color in hex format',
    example: '#0066FF',
    pattern: '^#[0-9A-Fa-f]{6}$',
  })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'primaryColor must be a valid hex color (e.g., #0066FF)',
  })
  primaryColor?: string;

  @ApiPropertyOptional({
    description: 'Background color in hex format',
    example: '#FFFFFF',
    pattern: '^#[0-9A-Fa-f]{6}$',
  })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'backgroundColor must be a valid hex color',
  })
  backgroundColor?: string;

  @ApiPropertyOptional({
    description: 'Text color in hex format',
    example: '#000000',
    pattern: '^#[0-9A-Fa-f]{6}$',
  })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'textColor must be a valid hex color',
  })
  textColor?: string;

  @ApiPropertyOptional({
    description: 'Button background color in hex format',
    example: '#0066FF',
    pattern: '^#[0-9A-Fa-f]{6}$',
  })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'buttonColor must be a valid hex color',
  })
  buttonColor?: string;

  @ApiPropertyOptional({
    description: 'Button text color in hex format',
    example: '#FFFFFF',
    pattern: '^#[0-9A-Fa-f]{6}$',
  })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'buttonTextColor must be a valid hex color',
  })
  buttonTextColor?: string;

  @ApiPropertyOptional({
    description: 'Company display name',
    example: 'Acme Corporation',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  companyName?: string;

  @ApiPropertyOptional({
    description: 'Support email address',
    example: 'support@acme.com',
  })
  @IsOptional()
  @IsEmail({}, { message: 'supportEmail must be a valid email address' })
  supportEmail?: string;

  @ApiPropertyOptional({
    description: 'URL to privacy policy page',
    example: 'https://acme.com/privacy',
  })
  @IsOptional()
  @IsUrl({}, { message: 'privacyPolicyUrl must be a valid URL' })
  @MaxLength(500)
  privacyPolicyUrl?: string;

  @ApiPropertyOptional({
    description: 'URL to terms of service page',
    example: 'https://acme.com/terms',
  })
  @IsOptional()
  @IsUrl({}, { message: 'termsOfServiceUrl must be a valid URL' })
  @MaxLength(500)
  termsOfServiceUrl?: string;
}

/**
 * Branding Response
 */
export class BrandingResponse {
  @ApiPropertyOptional({
    description: 'URL to the company logo image',
    example: 'https://cdn.example.com/logo.png',
  })
  logoUrl?: string;

  @ApiPropertyOptional({
    description: 'URL to the favicon image',
    example: 'https://cdn.example.com/favicon.ico',
  })
  faviconUrl?: string;

  @ApiProperty({
    description: 'Primary brand color in hex format',
    example: '#0066FF',
  })
  primaryColor: string;

  @ApiProperty({
    description: 'Background color in hex format',
    example: '#FFFFFF',
  })
  backgroundColor: string;

  @ApiProperty({
    description: 'Text color in hex format',
    example: '#000000',
  })
  textColor: string;

  @ApiProperty({
    description: 'Button background color in hex format',
    example: '#0066FF',
  })
  buttonColor: string;

  @ApiProperty({
    description: 'Button text color in hex format',
    example: '#FFFFFF',
  })
  buttonTextColor: string;

  @ApiPropertyOptional({
    description: 'Company display name',
    example: 'Acme Corporation',
  })
  companyName?: string;

  @ApiPropertyOptional({
    description: 'Support email address',
    example: 'support@acme.com',
  })
  supportEmail?: string;

  @ApiPropertyOptional({
    description: 'URL to privacy policy page',
    example: 'https://acme.com/privacy',
  })
  privacyPolicyUrl?: string;

  @ApiPropertyOptional({
    description: 'URL to terms of service page',
    example: 'https://acme.com/terms',
  })
  termsOfServiceUrl?: string;
}