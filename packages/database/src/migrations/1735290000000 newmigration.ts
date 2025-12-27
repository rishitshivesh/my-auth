import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Complete Multi-Tenant Migration (FIXED - Creates Default Tenant)
 *
 * This migration:
 * 1. Creates a default tenant if none exists
 * 2. Adds 'slug' to tenants (subdomain already exists)
 * 3. Adds tenantId to sessions, mfa_settings, permissions
 * 4. Adds missing session fields (refresh_token_family_id, device_id)
 * 5. Updates all indexes to be tenant-scoped
 * 6. Removes is_active from sessions (use revoked_at instead)
 */
export class CompleteMultiTenant1735400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    console.log("🚀 Starting Complete Multi-Tenant Migration...");

    // ============================================
    // PART 0: CREATE DEFAULT TENANT IF NONE EXISTS
    // ============================================
    console.log("📝 Step 0: Ensuring default tenant exists...");

    // Check if any tenants exist
    const existingTenants = await queryRunner.query(
      `SELECT COUNT(*) as count FROM tenants`,
    );

    if (existingTenants[0].count === 0) {
      console.log("   No tenants found - creating default tenant...");

      // Create default tenant
      await queryRunner.query(`
        INSERT INTO tenants (
          name, 
          subdomain, 
          status, 
          plan,
          settings,
          feature_flags,
          is_active
        ) VALUES (
          'Default Organization',
          'default',
          'active',
          'free',
          '{}',
          '{}',
          true
        )
      `);

      console.log("   ✅ Default tenant created");
    } else {
      console.log(`   ✅ Found ${existingTenants[0].count} existing tenant(s)`);
    }

    // ============================================
    // PART 1: TENANTS - Add slug column
    // ============================================
    console.log("📝 Step 1: Adding slug to tenants...");

    // Add slug column
    await queryRunner.query(`
      ALTER TABLE tenants 
      ADD COLUMN IF NOT EXISTS slug VARCHAR(100);
    `);

    // Add environment and active if they don't exist
    await queryRunner.query(`
      ALTER TABLE tenants 
      ADD COLUMN IF NOT EXISTS environment VARCHAR(100) DEFAULT 'production',
      ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS custom_domain_verified BOOLEAN DEFAULT FALSE;
    `);

    // Populate slug from existing subdomain
    await queryRunner.query(`
      UPDATE tenants 
      SET slug = subdomain
      WHERE slug IS NULL AND subdomain IS NOT NULL;
    `);

    // For any tenants without subdomain, generate from name
    await queryRunner.query(`
      UPDATE tenants 
      SET slug = LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9]', '-', 'g'))
      WHERE slug IS NULL;
    `);

    // Handle duplicates
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

    // Make slug NOT NULL
    await queryRunner.query(`
      ALTER TABLE tenants 
      ALTER COLUMN slug SET NOT NULL;
    `);

    // Create unique index on slug
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_slug 
      ON tenants(slug);
    `);

    // Update existing custom_domain index name
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_tenants_custom_domain";
      CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_custom_domain 
      ON tenants(custom_domain) 
      WHERE custom_domain IS NOT NULL;
    `);

    console.log("✅ Tenants updated with slug");

    // ============================================
    // PART 2: SESSIONS - Add tenant fields
    // ============================================
    console.log("📝 Step 2: Adding tenant fields to sessions...");

    // Add new columns
    await queryRunner.query(`
      ALTER TABLE sessions 
      ADD COLUMN IF NOT EXISTS tenant_id UUID,
      ADD COLUMN IF NOT EXISTS refresh_token_family_id UUID,
      ADD COLUMN IF NOT EXISTS device_id VARCHAR(100);
    `);

    // Populate tenant_id from user's tenant
    await queryRunner.query(`
      UPDATE sessions s
      SET tenant_id = u.tenant_id
      FROM users u
      WHERE s.user_id = u.id
      AND s.tenant_id IS NULL;
    `);

    // Check if we have any sessions without tenant_id (orphaned sessions)
    const orphanedSessions = await queryRunner.query(`
      SELECT COUNT(*) as count FROM sessions WHERE tenant_id IS NULL
    `);

    if (orphanedSessions[0].count > 0) {
      console.log(
        `   ⚠️  Found ${orphanedSessions[0].count} orphaned sessions - deleting...`,
      );
      await queryRunner.query(`DELETE FROM sessions WHERE tenant_id IS NULL`);
    }

    // Make tenant_id NOT NULL (after cleanup)
    await queryRunner.query(`
      ALTER TABLE sessions 
      ALTER COLUMN tenant_id SET NOT NULL;
    `);

    // Drop is_active column (use revoked_at instead)
    await queryRunner.query(`
      -- First, set revoked_at for inactive sessions
      UPDATE sessions
      SET revoked_at = updated_at
      WHERE is_active = FALSE AND revoked_at IS NULL;

      -- Then drop the column
      ALTER TABLE sessions 
      DROP COLUMN IF EXISTS is_active;
    `);

    // Add tenant-scoped indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_sessions_tenant_user 
      ON sessions(tenant_id, user_id);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_sessions_tenant_refresh 
      ON sessions(tenant_id, refresh_token_hash);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_sessions_tenant_revoked 
      ON sessions(tenant_id, revoked_at) 
      WHERE revoked_at IS NULL;
    `);

    console.log("✅ Sessions updated with tenant fields");

    // ============================================
    // PART 3: MFA_SETTINGS - Add tenant field
    // ============================================
    console.log("📝 Step 3: Adding tenant field to mfa_settings...");

    // Add tenant_id column
    await queryRunner.query(`
      ALTER TABLE mfa_settings 
      ADD COLUMN IF NOT EXISTS tenant_id UUID;
    `);

    // Populate tenant_id from user's tenant
    await queryRunner.query(`
      UPDATE mfa_settings m
      SET tenant_id = u.tenant_id
      FROM users u
      WHERE m.user_id = u.id
      AND m.tenant_id IS NULL;
    `);

    // Check for orphaned mfa_settings
    const orphanedMfa = await queryRunner.query(`
      SELECT COUNT(*) as count FROM mfa_settings WHERE tenant_id IS NULL
    `);

    if (orphanedMfa[0].count > 0) {
      console.log(
        `   ⚠️  Found ${orphanedMfa[0].count} orphaned mfa_settings - deleting...`,
      );
      await queryRunner.query(
        `DELETE FROM mfa_settings WHERE tenant_id IS NULL`,
      );
    }

    // Make tenant_id NOT NULL
    await queryRunner.query(`
      ALTER TABLE mfa_settings 
      ALTER COLUMN tenant_id SET NOT NULL;
    `);

    // Drop old unique constraint on user_id only
    await queryRunner.query(`
      ALTER TABLE mfa_settings 
      DROP CONSTRAINT IF EXISTS "UQ_mfa_settings_user";
    `);

    // Add compound unique constraint (tenant_id, user_id)
    await queryRunner.query(`
      ALTER TABLE mfa_settings 
      ADD CONSTRAINT UQ_mfa_settings_tenant_user 
      UNIQUE (tenant_id, user_id);
    `);

    // Add index
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_mfa_settings_tenant_user 
      ON mfa_settings(tenant_id, user_id);
    `);

    console.log("✅ MFA Settings updated with tenant field");

    // ============================================
    // PART 4: PERMISSIONS - Add tenant field
    // ============================================
    console.log("📝 Step 4: Adding tenant field to permissions...");

    // Add tenant_id column
    await queryRunner.query(`
      ALTER TABLE permissions 
      ADD COLUMN IF NOT EXISTS tenant_id UUID;
    `);

    // Get first tenant (we ensured one exists in Step 0)
    const tenants = await queryRunner.query(
      `SELECT id FROM tenants ORDER BY created_at LIMIT 1`,
    );

    if (tenants && tenants.length > 0) {
      const firstTenantId = tenants[0].id;
      console.log(
        `   Assigning ${await queryRunner.query(`SELECT COUNT(*) as count FROM permissions WHERE tenant_id IS NULL`).then((r) => r[0].count)} permissions to tenant ${firstTenantId}...`,
      );

      // Update all NULL tenant_ids with first tenant
      await queryRunner.query(
        `
        UPDATE permissions 
        SET tenant_id = $1
        WHERE tenant_id IS NULL
      `,
        [firstTenantId],
      );

      console.log("   ✅ Permissions assigned to default tenant");
    }

    // Verify all permissions have tenant_id before making NOT NULL
    const nullCount = await queryRunner.query(`
      SELECT COUNT(*) as count FROM permissions WHERE tenant_id IS NULL
    `);

    if (nullCount[0].count > 0) {
      throw new Error(
        `Found ${nullCount[0].count} permissions with NULL tenant_id. Migration aborted.`,
      );
    }

    // Make tenant_id NOT NULL (after population)
    await queryRunner.query(`
      ALTER TABLE permissions 
      ALTER COLUMN tenant_id SET NOT NULL;
    `);

    // Drop old unique constraint
    await queryRunner.query(`
      ALTER TABLE permissions 
      DROP CONSTRAINT IF EXISTS "UQ_permissions_resource_action";
    `);

    // Add compound unique constraint (tenant_id, resource, action)
    await queryRunner.query(`
      ALTER TABLE permissions 
      ADD CONSTRAINT UQ_permissions_tenant_resource_action 
      UNIQUE (tenant_id, resource, action);
    `);

    // Add indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_permissions_tenant 
      ON permissions(tenant_id);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_permissions_tenant_resource 
      ON permissions(tenant_id, resource);
    `);

    console.log("✅ Permissions updated with tenant field");

    // ============================================
    // PART 5: USERS - Ensure compound unique exists
    // ============================================
    console.log("📝 Step 5: Updating users indexes...");

    // The initial migration already has this, but let's ensure it exists
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_users_email_tenant" 
      ON users(email, tenant_id);
    `);

    console.log("✅ Users indexes verified");

    // ============================================
    // PART 6: SECURITY_EVENTS - Add tenant indexes
    // ============================================
    console.log(
      "📝 Step 6: Adding tenant-scoped indexes to security_events...",
    );

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_security_events_tenant_type 
      ON security_events(tenant_id, event_type);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_security_events_tenant_user_date 
      ON security_events(tenant_id, user_id, created_at DESC);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_security_events_tenant_severity 
      ON security_events(tenant_id, severity);
    `);

    console.log("✅ Security events indexes added");

    // ============================================
    // PART 7: ROLES - Add tenant-scoped indexes
    // ============================================
    console.log("📝 Step 7: Verifying roles indexes...");

    // Already has compound unique, just verify indexes exist
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_roles_tenant_name 
      ON roles(tenant_id, name);
    `);

    console.log("✅ Roles indexes verified");

    console.log("🎉 Complete Multi-Tenant Migration finished successfully!");
    console.log("");
    console.log("📊 Summary:");
    const finalTenantCount = await queryRunner.query(
      `SELECT COUNT(*) as count FROM tenants`,
    );
    const finalPermCount = await queryRunner.query(
      `SELECT COUNT(*) as count FROM permissions`,
    );
    console.log(`   - Tenants: ${finalTenantCount[0].count}`);
    console.log(
      `   - Permissions: ${finalPermCount[0].count} (all tenant-scoped)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    console.log("⏪ Reverting Complete Multi-Tenant Migration...");

    // Revert in reverse order

    // Roles
    await queryRunner.query(`DROP INDEX IF EXISTS idx_roles_tenant_name;`);

    // Security Events
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_security_events_tenant_type;`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_security_events_tenant_user_date;`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_security_events_tenant_severity;`,
    );

    // Users - keep as is (initial migration handles it)

    // Permissions
    await queryRunner.query(`DROP INDEX IF EXISTS idx_permissions_tenant;`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_permissions_tenant_resource;`,
    );
    await queryRunner.query(`
      ALTER TABLE permissions
      DROP CONSTRAINT IF EXISTS UQ_permissions_tenant_resource_action;
    `);
    await queryRunner.query(`
      ALTER TABLE permissions
        ADD CONSTRAINT UQ_permissions_resource_action
          UNIQUE (resource, action);
    `);
    await queryRunner.query(
      `ALTER TABLE permissions DROP COLUMN IF EXISTS tenant_id;`,
    );

    // MFA Settings
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_mfa_settings_tenant_user;`,
    );
    await queryRunner.query(`
      ALTER TABLE mfa_settings
      DROP CONSTRAINT IF EXISTS UQ_mfa_settings_tenant_user;
    `);
    await queryRunner.query(`
      ALTER TABLE mfa_settings
        ADD CONSTRAINT UQ_mfa_settings_user
          UNIQUE (user_id);
    `);
    await queryRunner.query(
      `ALTER TABLE mfa_settings DROP COLUMN IF EXISTS tenant_id;`,
    );

    // Sessions
    await queryRunner.query(`DROP INDEX IF EXISTS idx_sessions_tenant_user;`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_sessions_tenant_refresh;`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_sessions_tenant_revoked;`,
    );
    await queryRunner.query(`
      ALTER TABLE sessions
        ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
    `);
    await queryRunner.query(`
      UPDATE sessions
      SET is_active = (revoked_at IS NULL);
    `);
    await queryRunner.query(`
      ALTER TABLE sessions
      DROP COLUMN IF EXISTS tenant_id,
      DROP COLUMN IF EXISTS refresh_token_family_id,
      DROP COLUMN IF EXISTS device_id;
    `);

    // Tenants
    await queryRunner.query(`DROP INDEX IF EXISTS idx_tenants_slug;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_tenants_custom_domain;`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_tenants_custom_domain"
        ON tenants(custom_domain)
        WHERE custom_domain IS NOT NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE tenants
      DROP COLUMN IF EXISTS slug,
      DROP COLUMN IF EXISTS environment,
      DROP COLUMN IF EXISTS active,
      DROP COLUMN IF EXISTS custom_domain_verified;
    `);

    // Note: We don't delete the default tenant in down() as there might be users/data associated with it

    console.log("✅ Migration reverted successfully");
  }
}
