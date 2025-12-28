import { MigrationInterface, QueryRunner } from "typeorm";

export class RbacClean1766953000000 implements MigrationInterface {
  name = "RbacClean1766953000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ============================================================
    // 1. UPDATE PERMISSIONS TABLE
    // ============================================================

    // Add new columns to permissions
    await queryRunner.query(`
      ALTER TABLE "permissions" 
      ADD COLUMN IF NOT EXISTS "name" character varying(100),
      ADD COLUMN IF NOT EXISTS "scope" character varying(50) NOT NULL DEFAULT 'tenant',
      ADD COLUMN IF NOT EXISTS "is_system" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "metadata" jsonb
    `);

    // Add comments
    await queryRunner.query(
      `COMMENT ON COLUMN "permissions"."name" IS 'Permission name (e.g., users:read)'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "permissions"."resource" IS 'Resource type (e.g., users, clients, api)'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "permissions"."action" IS 'Action (e.g., read, write, delete, manage, *)'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "permissions"."description" IS 'Human-readable description'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "permissions"."scope" IS 'Scope level: platform, tenant, user'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "permissions"."is_system" IS 'System permission (cannot be deleted)'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "permissions"."metadata" IS 'Additional metadata (conditions, constraints, etc.)'`,
    );

    // Create unique constraint and indexes
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_permissions_tenant_name" ON "permissions" ("tenant_id", "name")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_permissions_resource" ON "permissions" ("resource")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_permissions_action" ON "permissions" ("action")`,
    );

    // ============================================================
    // 2. UPDATE ROLES TABLE
    // ============================================================

    // Drop parent_role_id if it exists (hierarchical roles not in our design)
    await queryRunner.query(
      `ALTER TABLE "roles" DROP COLUMN IF EXISTS "parent_role_id"`,
    );

    // Add new columns to roles
    await queryRunner.query(`
      ALTER TABLE "roles"
      ADD COLUMN IF NOT EXISTS "display_name" character varying(255),
      ADD COLUMN IF NOT EXISTS "scope" character varying(50) NOT NULL DEFAULT 'tenant',
      ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS "is_default" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "priority" integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "metadata" jsonb,
      ADD COLUMN IF NOT EXISTS "created_by" uuid
    `);

    // Add comments
    await queryRunner.query(
      `COMMENT ON COLUMN "roles"."name" IS 'Role name (e.g., admin, developer, user)'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "roles"."display_name" IS 'Human-readable display name'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "roles"."description" IS 'Role description'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "roles"."scope" IS 'Scope level: platform, tenant, custom'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "roles"."is_system" IS 'System role (cannot be deleted or modified)'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "roles"."is_active" IS 'Whether this role is active'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "roles"."is_default" IS 'Automatically assigned to new users'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "roles"."priority" IS 'Higher priority = more powerful (for conflict resolution)'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "roles"."metadata" IS 'Additional metadata'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "roles"."created_by" IS 'User who created this role'`,
    );

    // Create unique constraint and indexes
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_roles_tenant_name" ON "roles" ("tenant_id", "name")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_roles_is_system" ON "roles" ("is_system")`,
    );

    // ============================================================
    // 3. CREATE USER_ROLES TABLE
    // ============================================================

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_roles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "tenant_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "role_id" uuid NOT NULL,
        "assigned_by" uuid,
        "assigned_at" TIMESTAMP DEFAULT now(),
        "expires_at" TIMESTAMP,
        "reason" text,
        "metadata" jsonb,
        CONSTRAINT "PK_user_roles" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_user_roles_user_role" UNIQUE ("user_id", "role_id")
      )
    `);

    // Add comments
    await queryRunner.query(
      `COMMENT ON COLUMN "user_roles"."assigned_by" IS 'User who assigned this role'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "user_roles"."assigned_at" IS 'When role was assigned'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "user_roles"."expires_at" IS 'When role assignment expires (null = permanent)'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "user_roles"."reason" IS 'Reason for assignment'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "user_roles"."metadata" IS 'Additional metadata (conditions, restrictions, etc.)'`,
    );

    // Create indexes
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_user_roles_user_id" ON "user_roles" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_user_roles_role_id" ON "user_roles" ("role_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_user_roles_tenant_id" ON "user_roles" ("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_user_roles_expires_at" ON "user_roles" ("expires_at")`,
    );

    // Add foreign keys
    await queryRunner.query(`
      ALTER TABLE "user_roles"
      ADD CONSTRAINT "FK_user_roles_user_id" 
      FOREIGN KEY ("user_id") 
      REFERENCES "users"("id") 
      ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "user_roles"
      ADD CONSTRAINT "FK_user_roles_role_id"
      FOREIGN KEY ("role_id")
      REFERENCES "roles"("id")
      ON DELETE CASCADE
    `);

    // ============================================================
    // 4. UPDATE ROLE_PERMISSIONS TABLE
    // ============================================================

    // Add new columns to role_permissions
    await queryRunner.query(`
      ALTER TABLE "role_permissions"
      ADD COLUMN IF NOT EXISTS "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS "tenant_id" uuid,
      ADD COLUMN IF NOT EXISTS "assigned_by" uuid,
      ADD COLUMN IF NOT EXISTS "assigned_at" TIMESTAMP DEFAULT now(),
      ADD COLUMN IF NOT EXISTS "constraints" jsonb
    `);

    // Add comments
    await queryRunner.query(
      `COMMENT ON COLUMN "role_permissions"."assigned_by" IS 'User who assigned this permission to the role'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "role_permissions"."assigned_at" IS 'When permission was assigned'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "role_permissions"."constraints" IS 'Additional constraints or conditions for this permission'`,
    );

    // Create indexes
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_role_permissions_tenant_id" ON "role_permissions" ("tenant_id")`,
    );

    // Create unique constraint
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_role_permissions_role_permission" ON "role_permissions" ("role_id", "permission_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop user_roles table
    await queryRunner.query(`DROP TABLE IF EXISTS "user_roles" CASCADE`);

    // Remove role_permissions additions
    await queryRunner.query(
      `ALTER TABLE "role_permissions" DROP COLUMN IF EXISTS "constraints"`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" DROP COLUMN IF EXISTS "assigned_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" DROP COLUMN IF EXISTS "assigned_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" DROP COLUMN IF EXISTS "tenant_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" DROP COLUMN IF EXISTS "deleted_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" DROP COLUMN IF EXISTS "updated_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" DROP COLUMN IF EXISTS "created_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" DROP COLUMN IF EXISTS "id"`,
    );

    // Remove roles additions
    await queryRunner.query(
      `ALTER TABLE "roles" DROP COLUMN IF EXISTS "created_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "roles" DROP COLUMN IF EXISTS "metadata"`,
    );
    await queryRunner.query(
      `ALTER TABLE "roles" DROP COLUMN IF EXISTS "priority"`,
    );
    await queryRunner.query(
      `ALTER TABLE "roles" DROP COLUMN IF EXISTS "is_default"`,
    );
    await queryRunner.query(
      `ALTER TABLE "roles" DROP COLUMN IF EXISTS "is_active"`,
    );
    await queryRunner.query(
      `ALTER TABLE "roles" DROP COLUMN IF EXISTS "scope"`,
    );
    await queryRunner.query(
      `ALTER TABLE "roles" DROP COLUMN IF EXISTS "display_name"`,
    );

    // Remove permissions additions
    await queryRunner.query(
      `ALTER TABLE "permissions" DROP COLUMN IF EXISTS "metadata"`,
    );
    await queryRunner.query(
      `ALTER TABLE "permissions" DROP COLUMN IF EXISTS "is_system"`,
    );
    await queryRunner.query(
      `ALTER TABLE "permissions" DROP COLUMN IF EXISTS "scope"`,
    );
    await queryRunner.query(
      `ALTER TABLE "permissions" DROP COLUMN IF EXISTS "name"`,
    );
  }
}
