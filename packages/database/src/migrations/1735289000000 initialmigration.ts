import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Initial Migration - Fort Knox Database Schema
 *
 * Creates all core tables for the authentication system:
 * - Tenants (multi-tenancy)
 * - Users (with comprehensive security features)
 * - Sessions (device tracking)
 * - MFA Settings
 * - Security Events
 * - Roles & Permissions (RBAC)
 *
 * Generated: 2025-12-27
 */
export class InitialMigration1735289000000 implements MigrationInterface {
  name = "InitialMigration1735289000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable UUID extension
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // =======================================================================
    // TENANTS TABLE
    // =======================================================================
    await queryRunner.query(`
      CREATE TABLE "tenants" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "name" character varying(255) NOT NULL,
        "subdomain" character varying(100) NOT NULL,
        "custom_domain" character varying(255),
        "status" character varying CHECK("status" IN ('active', 'trial', 'suspended', 'cancelled')) NOT NULL DEFAULT 'trial',
        "plan" character varying CHECK("plan" IN ('free', 'starter', 'professional', 'enterprise')) NOT NULL DEFAULT 'free',
        "settings" jsonb NOT NULL DEFAULT '{}',
        "branding" jsonb DEFAULT '{}',
        "is_active" boolean NOT NULL DEFAULT true,
        "trial_ends_at" TIMESTAMP WITH TIME ZONE,
        "user_limit" integer NOT NULL DEFAULT '0',
        "user_count" integer NOT NULL DEFAULT '0',
        "feature_flags" jsonb NOT NULL DEFAULT '{}',
        "contact_email" character varying(255),
        "contact_phone" character varying(50),
        CONSTRAINT "PK_tenants" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_tenants_subdomain" UNIQUE ("subdomain")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_tenants_custom_domain" 
      ON "tenants" ("custom_domain") 
      WHERE "custom_domain" IS NOT NULL
    `);

    await queryRunner.query(
      `COMMENT ON TABLE "tenants" IS 'Multi-tenant organizations'`,
    );

    // =======================================================================
    // USERS TABLE
    // =======================================================================
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "tenant_id" uuid NOT NULL,
        "email" character varying(255) NOT NULL,
        "email_verified" boolean NOT NULL DEFAULT false,
        "phone" character varying(50),
        "phone_verified" boolean NOT NULL DEFAULT false,
        "first_name" character varying(255),
        "last_name" character varying(255),
        "display_name" character varying(255),
        "avatar_url" character varying(500),
        "password_hash" character varying(255) NOT NULL,
        "password_changed_at" TIMESTAMP WITH TIME ZONE,
        "force_password_change" boolean NOT NULL DEFAULT false,
        "password_history" jsonb NOT NULL DEFAULT '[]',
        "status" character varying CHECK("status" IN ('active', 'inactive', 'suspended', 'deleted')) NOT NULL DEFAULT 'active',
        "last_login_at" TIMESTAMP WITH TIME ZONE,
        "last_login_ip" character varying(45),
        "failed_login_attempts" integer NOT NULL DEFAULT '0',
        "locked_until" TIMESTAMP WITH TIME ZONE,
        "email_verification_token" character varying(255),
        "email_verification_expires_at" TIMESTAMP WITH TIME ZONE,
        "password_reset_token" character varying(255),
        "password_reset_expires_at" TIMESTAMP WITH TIME ZONE,
        "metadata" jsonb DEFAULT '{}',
        "timezone" character varying(10),
        "language" character varying(10) NOT NULL DEFAULT 'en',
        CONSTRAINT "PK_users" PRIMARY KEY ("id"),
        CONSTRAINT "FK_users_tenant" FOREIGN KEY ("tenant_id") 
          REFERENCES "tenants"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_users_email_tenant" 
      ON "users" ("email", "tenant_id")
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_users_tenant_id" ON "users" ("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_users_status" ON "users" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_users_email_verified" ON "users" ("email_verified")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_users_last_login" ON "users" ("last_login_at" DESC)`,
    );

    await queryRunner.query(
      `COMMENT ON TABLE "users" IS 'User accounts with comprehensive security features'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "users"."password_history" IS 'Last 5 password hashes to prevent reuse'`,
    );

    // =======================================================================
    // MFA SETTINGS TABLE
    // =======================================================================
    await queryRunner.query(`
      CREATE TABLE "mfa_settings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "user_id" uuid NOT NULL,
        "totp_enabled" boolean NOT NULL DEFAULT false,
        "totp_secret" text,
        "totp_verified_at" TIMESTAMP WITH TIME ZONE,
        "sms_enabled" boolean NOT NULL DEFAULT false,
        "sms_phone" character varying(50),
        "sms_verified_at" TIMESTAMP WITH TIME ZONE,
        "email_enabled" boolean NOT NULL DEFAULT false,
        "email_verified_at" TIMESTAMP WITH TIME ZONE,
        "webauthn_enabled" boolean NOT NULL DEFAULT false,
        "webauthn_credentials" jsonb NOT NULL DEFAULT '[]',
        "backup_codes" jsonb NOT NULL DEFAULT '[]',
        "backup_codes_used" jsonb NOT NULL DEFAULT '[]',
        "backup_codes_generated_at" TIMESTAMP WITH TIME ZONE,
        "mfa_required" boolean NOT NULL DEFAULT false,
        "preferred_method" character varying(50),
        CONSTRAINT "PK_mfa_settings" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_mfa_settings_user" UNIQUE ("user_id"),
        CONSTRAINT "FK_mfa_settings_user" FOREIGN KEY ("user_id") 
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `COMMENT ON TABLE "mfa_settings" IS 'Multi-factor authentication settings'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "mfa_settings"."totp_secret" IS 'Encrypted TOTP secret'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "mfa_settings"."backup_codes" IS 'Hashed backup codes'`,
    );

    // =======================================================================
    // SESSIONS TABLE
    // =======================================================================
    await queryRunner.query(`
      CREATE TABLE "sessions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "user_id" uuid NOT NULL,
        "token_hash" character varying(255) NOT NULL,
        "device_info" jsonb NOT NULL,
        "ip_address" character varying(45) NOT NULL,
        "location" character varying(255),
        "user_agent" text NOT NULL,
        "last_activity" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "refresh_token_hash" character varying(255),
        "revoked_at" TIMESTAMP WITH TIME ZONE,
        "revoked_reason" character varying(255),
        CONSTRAINT "PK_sessions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_sessions_token" UNIQUE ("token_hash"),
        CONSTRAINT "FK_sessions_user" FOREIGN KEY ("user_id") 
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_sessions_user_id" ON "sessions" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_sessions_token_hash" ON "sessions" ("token_hash")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_sessions_expires_at" ON "sessions" ("expires_at")`,
    );

    await queryRunner.query(
      `COMMENT ON TABLE "sessions" IS 'Active user sessions with device tracking'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "sessions"."token_hash" IS 'Hashed session token'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "sessions"."device_info" IS 'Device information (browser, OS, etc.)'`,
    );

    // =======================================================================
    // SECURITY EVENTS TABLE
    // =======================================================================
    await queryRunner.query(`
      CREATE TABLE "security_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "user_id" uuid,
        "tenant_id" uuid,
        "event_type" character varying(100) NOT NULL,
        "severity" character varying CHECK("severity" IN ('info', 'warning', 'critical')) NOT NULL DEFAULT 'info',
        "ip_address" character varying(45) NOT NULL,
        "user_agent" text NOT NULL,
        "device_info" jsonb,
        "metadata" jsonb NOT NULL DEFAULT '{}',
        "location" character varying(255),
        "is_anomaly" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_security_events" PRIMARY KEY ("id"),
        CONSTRAINT "FK_security_events_user" FOREIGN KEY ("user_id") 
          REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_security_events_tenant" FOREIGN KEY ("tenant_id") 
          REFERENCES "tenants"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_security_events_user_id" ON "security_events" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_security_events_tenant_id" ON "security_events" ("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_security_events_type" ON "security_events" ("event_type")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_security_events_severity" ON "security_events" ("severity")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_security_events_created_at" ON "security_events" ("created_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_security_events_ip" ON "security_events" ("ip_address")`,
    );

    await queryRunner.query(
      `COMMENT ON TABLE "security_events" IS 'Security event audit log'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "security_events"."is_anomaly" IS 'Whether this event was flagged as anomalous'`,
    );

    // =======================================================================
    // PERMISSIONS TABLE
    // =======================================================================
    await queryRunner.query(`
      CREATE TABLE "permissions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "resource" character varying(100) NOT NULL,
        "action" character varying(50) NOT NULL,
        "description" text,
        CONSTRAINT "PK_permissions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_permissions_resource_action" UNIQUE ("resource", "action")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_permissions_resource" ON "permissions" ("resource")`,
    );
    await queryRunner.query(
      `COMMENT ON TABLE "permissions" IS 'System permissions for RBAC'`,
    );

    // =======================================================================
    // ROLES TABLE
    // =======================================================================
    await queryRunner.query(`
      CREATE TABLE "roles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "tenant_id" uuid NOT NULL,
        "name" character varying(100) NOT NULL,
        "description" text,
        "is_system" boolean NOT NULL DEFAULT false,
        "parent_role_id" uuid,
        CONSTRAINT "PK_roles" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_roles_tenant_name" UNIQUE ("tenant_id", "name"),
        CONSTRAINT "FK_roles_tenant" FOREIGN KEY ("tenant_id") 
          REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_roles_parent" FOREIGN KEY ("parent_role_id") 
          REFERENCES "roles"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_roles_tenant_id" ON "roles" ("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_roles_is_system" ON "roles" ("is_system")`,
    );

    await queryRunner.query(
      `COMMENT ON TABLE "roles" IS 'User roles for RBAC'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "roles"."is_system" IS 'System roles cannot be modified or deleted'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "roles"."parent_role_id" IS 'Parent role for inheritance'`,
    );

    // =======================================================================
    // ROLE_PERMISSIONS JUNCTION TABLE
    // =======================================================================
    await queryRunner.query(`
      CREATE TABLE "role_permissions" (
        "role_id" uuid NOT NULL,
        "permission_id" uuid NOT NULL,
        CONSTRAINT "PK_role_permissions" PRIMARY KEY ("role_id", "permission_id"),
        CONSTRAINT "FK_role_permissions_role" FOREIGN KEY ("role_id") 
          REFERENCES "roles"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_role_permissions_permission" FOREIGN KEY ("permission_id") 
          REFERENCES "permissions"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_role_permissions_role_id" ON "role_permissions" ("role_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_role_permissions_permission_id" ON "role_permissions" ("permission_id")`,
    );

    // =======================================================================
    // SEED DEFAULT PERMISSIONS
    // =======================================================================
    await queryRunner.query(`
      INSERT INTO "permissions" ("resource", "action", "description") VALUES
        ('user', 'create', 'Create users'),
        ('user', 'read', 'Read user information'),
        ('user', 'update', 'Update user information'),
        ('user', 'delete', 'Delete users'),
        ('user', 'impersonate', 'Impersonate users'),
        ('tenant', 'create', 'Create tenants'),
        ('tenant', 'read', 'Read tenant information'),
        ('tenant', 'update', 'Update tenant information'),
        ('tenant', 'delete', 'Delete tenants'),
        ('role', 'create', 'Create roles'),
        ('role', 'read', 'Read role information'),
        ('role', 'update', 'Update roles'),
        ('role', 'delete', 'Delete roles'),
        ('role', 'assign', 'Assign roles to users'),
        ('settings', 'read', 'Read settings'),
        ('settings', 'update', 'Update settings'),
        ('audit', 'read', 'Read audit logs')
    `);

    console.log("✅ Initial migration completed successfully");
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop tables in reverse order (respecting foreign keys)
    await queryRunner.query(`DROP TABLE IF EXISTS "role_permissions" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "roles" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "permissions" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "security_events" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sessions" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "mfa_settings" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tenants" CASCADE`);

    console.log("✅ Migration reverted successfully");
  }
}
