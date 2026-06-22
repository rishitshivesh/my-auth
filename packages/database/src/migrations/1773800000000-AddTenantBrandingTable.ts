import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Migration: AddTenantBrandingTable
 *
 * Creates a dedicated `tenant_branding` table (one row per tenant).
 * Fields: tenantId (FK unique), primaryColor, logoUrl, fontFamily,
 *         headerWeight, backgroundStyle, plus base timestamps.
 */
export class AddTenantBrandingTable1773800000000 implements MigrationInterface {
  name = "AddTenantBrandingTable1773800000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS template; SET search_path TO template, public, extensions;`);
    await queryRunner.query(`
      CREATE TABLE "tenant_branding" (
        "id"               UUID          NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"        UUID          NOT NULL,
        "primary_color"    VARCHAR(7)    NOT NULL DEFAULT '#6366f1',
        "logo_url"         VARCHAR(500),
        "font_family"      VARCHAR(100)  NOT NULL DEFAULT 'Inter',
        "header_weight"    VARCHAR(10)   NOT NULL DEFAULT 'bold',
        "background_style" VARCHAR(10)   NOT NULL DEFAULT 'solid',
        "created_at"       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        "updated_at"       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        "deleted_at"       TIMESTAMPTZ,
        CONSTRAINT "PK_tenant_branding" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_tenant_branding_tenant_id" UNIQUE ("tenant_id"),
        CONSTRAINT "FK_tenant_branding_tenant"
          FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
      );
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_tenant_branding_tenant_id"
        ON "tenant_branding" ("tenant_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET search_path TO template, public, extensions;`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_tenant_branding_tenant_id";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tenant_branding";`);
  }
}
