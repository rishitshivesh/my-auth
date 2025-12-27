import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateTenantForMultiTenant1735300000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ============================================
    // Step 1: Add new columns (including slug!)
    // ============================================
    await queryRunner.query(`
      ALTER TABLE tenants 
      ADD COLUMN IF NOT EXISTS slug VARCHAR(100),
      ADD COLUMN IF NOT EXISTS custom_domain VARCHAR(255),
      ADD COLUMN IF NOT EXISTS custom_domain_verified BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS environment VARCHAR(100) DEFAULT 'production',
      ADD COLUMN IF NOT EXISTS feature_flags JSONB,
      ADD COLUMN IF NOT EXISTS settings JSONB,
      ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;
    `);

    // ============================================
    // Step 2: Populate slug from existing data
    // ============================================

    // If tenants have a 'subdomain' column, copy it to 'slug'
    await queryRunner.query(`
      UPDATE tenants 
      SET slug = COALESCE(subdomain, name, 'tenant-' || id)
      WHERE slug IS NULL;
    `);

    // If no subdomain column exists, generate from name or id
    await queryRunner.query(`
      UPDATE tenants 
      SET slug = LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9]', '-', 'g'))
      WHERE slug IS NULL;
    `);

    // Ensure all slugs are unique by appending numbers if needed
    await queryRunner.query(`
      WITH duplicates AS (
        SELECT id, slug, 
               ROW_NUMBER() OVER (PARTITION BY slug ORDER BY created_at) as rn
        FROM tenants
      )
      UPDATE tenants t
      SET slug = d.slug || '-' || d.rn
      FROM duplicates d
      WHERE t.id = d.id AND d.rn > 1;
    `);

    // ============================================
    // Step 3: Make slug NOT NULL after population
    // ============================================
    await queryRunner.query(`
      ALTER TABLE tenants 
      ALTER COLUMN slug SET NOT NULL;
    `);

    // ============================================
    // Step 4: Create indexes (NOW slug exists!)
    // ============================================

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_slug 
      ON tenants(slug);
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_custom_domain 
      ON tenants(custom_domain) 
      WHERE custom_domain IS NOT NULL;
    `);

    // ============================================
    // Step 5: Set default environment for existing tenants
    // ============================================
    await queryRunner.query(`
      UPDATE tenants 
      SET environment = 'production',
          active = TRUE
      WHERE environment IS NULL OR active IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_tenants_custom_domain;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_tenants_slug;`);

    await queryRunner.query(`
      ALTER TABLE tenants 
      DROP COLUMN IF EXISTS slug,
      DROP COLUMN IF EXISTS custom_domain,
      DROP COLUMN IF EXISTS custom_domain_verified,
      DROP COLUMN IF EXISTS environment,
      DROP COLUMN IF EXISTS feature_flags,
      DROP COLUMN IF EXISTS settings,
      DROP COLUMN IF EXISTS active;
    `);
  }
}
