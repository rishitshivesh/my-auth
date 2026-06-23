import { MigrationInterface, QueryRunner } from "typeorm";

export class AddIAMPolicyTables1781500000000 implements MigrationInterface {
  name = "AddIAMPolicyTables1781500000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS template; SET search_path TO template, public, extensions;`);
    // Policies table
    await queryRunner.query(`
      CREATE TABLE "policies" (
        "id"          UUID          NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"   UUID          NOT NULL,
        "name"        VARCHAR(200)  NOT NULL,
        "description" TEXT,
        "document"    JSONB         NOT NULL,
        "is_system"   BOOLEAN       NOT NULL DEFAULT false,
        "type"        VARCHAR(20)   NOT NULL DEFAULT 'inline',
        "created_at"  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        "updated_at"  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_policies" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`CREATE INDEX "IDX_policies_tenant" ON "policies" ("tenant_id");`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_policies_tenant_name" ON "policies" ("tenant_id", "name");`);
    await queryRunner.query(`CREATE INDEX "IDX_policies_type" ON "policies" ("type");`);

    // Groups table
    await queryRunner.query(`
      CREATE TABLE "groups" (
        "id"              UUID          NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"       UUID          NOT NULL,
        "name"            VARCHAR(200)  NOT NULL,
        "description"     TEXT,
        "parent_group_id" UUID,
        "path"            VARCHAR(1000) NOT NULL DEFAULT '/',
        "is_system"       BOOLEAN       NOT NULL DEFAULT false,
        "created_at"      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_groups" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`CREATE INDEX "IDX_groups_tenant" ON "groups" ("tenant_id");`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_groups_tenant_name" ON "groups" ("tenant_id", "name");`);
    await queryRunner.query(`CREATE INDEX "IDX_groups_parent" ON "groups" ("parent_group_id");`);
    await queryRunner.query(`CREATE INDEX "IDX_groups_path" ON "groups" ("path");`);

    // User-group join table
    await queryRunner.query(`
      CREATE TABLE "user_groups" (
        "id"          UUID        NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"   UUID        NOT NULL,
        "user_id"     UUID        NOT NULL,
        "group_id"    UUID        NOT NULL,
        "added_by"    UUID,
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_user_groups" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_user_groups_user_group" UNIQUE ("user_id", "group_id"),
        CONSTRAINT "FK_user_groups_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_user_groups_group" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(`CREATE INDEX "IDX_user_groups_user" ON "user_groups" ("user_id");`);
    await queryRunner.query(`CREATE INDEX "IDX_user_groups_group" ON "user_groups" ("group_id");`);
    await queryRunner.query(`CREATE INDEX "IDX_user_groups_tenant" ON "user_groups" ("tenant_id");`);

    // Group-policy join table
    await queryRunner.query(`
      CREATE TABLE "group_policies" (
        "id"          UUID        NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"   UUID        NOT NULL,
        "group_id"    UUID        NOT NULL,
        "policy_id"   UUID        NOT NULL,
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_group_policies" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_group_policies_group_policy" UNIQUE ("group_id", "policy_id"),
        CONSTRAINT "FK_group_policies_group" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_group_policies_policy" FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(`CREATE INDEX "IDX_group_policies_group" ON "group_policies" ("group_id");`);
    await queryRunner.query(`CREATE INDEX "IDX_group_policies_policy" ON "group_policies" ("policy_id");`);
    await queryRunner.query(`CREATE INDEX "IDX_group_policies_tenant" ON "group_policies" ("tenant_id");`);

    // User-policy join table
    await queryRunner.query(`
      CREATE TABLE "user_policies" (
        "id"          UUID        NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"   UUID        NOT NULL,
        "user_id"     UUID        NOT NULL,
        "policy_id"   UUID        NOT NULL,
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_user_policies" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_user_policies_user_policy" UNIQUE ("user_id", "policy_id"),
        CONSTRAINT "FK_user_policies_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_user_policies_policy" FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(`CREATE INDEX "IDX_user_policies_user" ON "user_policies" ("user_id");`);
    await queryRunner.query(`CREATE INDEX "IDX_user_policies_policy" ON "user_policies" ("policy_id");`);
    await queryRunner.query(`CREATE INDEX "IDX_user_policies_tenant" ON "user_policies" ("tenant_id");`);

    // Role-policy join table
    await queryRunner.query(`
      CREATE TABLE "role_policies" (
        "id"          UUID        NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"   UUID        NOT NULL,
        "role_id"     UUID        NOT NULL,
        "policy_id"   UUID        NOT NULL,
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_role_policies" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_role_policies_role_policy" UNIQUE ("role_id", "policy_id"),
        CONSTRAINT "FK_role_policies_role" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_role_policies_policy" FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(`CREATE INDEX "IDX_role_policies_role" ON "role_policies" ("role_id");`);
    await queryRunner.query(`CREATE INDEX "IDX_role_policies_policy" ON "role_policies" ("policy_id");`);
    await queryRunner.query(`CREATE INDEX "IDX_role_policies_tenant" ON "role_policies" ("tenant_id");`);

    // Add permission_boundary_policy_id to roles
    await queryRunner.query(`
      ALTER TABLE "roles"
      ADD COLUMN "permission_boundary_policy_id" UUID;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET search_path TO template, public, extensions;`);
    await queryRunner.query(`ALTER TABLE "roles" DROP COLUMN IF EXISTS "permission_boundary_policy_id";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "role_policies";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_policies";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "group_policies";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_groups";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "groups";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "policies";`);
  }
}
