import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Backfills the Guest system role (lowest priority, below Member) into every existing tenant
 * schema. New tenants get it from SystemRoles at provisioning time. Idempotent: the role is
 * upserted by (tenant_id, name) and its policy is attached only when the role has none.
 * The policy document is a frozen snapshot of SystemRoles.GUEST at the time of writing.
 */
const GUEST_PRIORITY = 5;
const GUEST_DESCRIPTION = "Minimal read-only access: own profile and own sessions only.";
const GUEST_POLICY = {
  Version: "2024-01-01",
  Statement: [
    {
      Sid: "GuestOwnReadOnly",
      Effect: "Allow",
      Action: ["users:read", "sessions:read"],
      Resource: [
        "sentry:tenant:*:user:${sentry:UserId}",
        "sentry:tenant:*:session:${sentry:UserId}:*",
      ],
    },
  ],
};

export class SeedGuestSystemRole1951000000000 implements MigrationInterface {
  name = "SeedGuestSystemRole1951000000000";

  private quote(schema: string): string {
    return `"${schema.replace(/"/g, '""')}"`;
  }

  private async tenantSchemas(queryRunner: QueryRunner): Promise<string[]> {
    const rows = (await queryRunner.query(
      `SELECT s.schema_name FROM information_schema.schemata s
        WHERE s.schema_name LIKE 'fk\\_%' ESCAPE '\\'
          AND (SELECT count(*) FROM information_schema.tables t
                WHERE t.table_schema = s.schema_name
                  AND t.table_name IN ('roles','policies','role_policies','user_roles')) = 4`,
    )) as Array<{ schema_name: string }>;
    return rows.map((r) => r.schema_name);
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const schemaName of await this.tenantSchemas(queryRunner)) {
      const schema = this.quote(schemaName);
      const tenants = (await queryRunner.query(
        `SELECT DISTINCT tenant_id FROM ${schema}."roles"`,
      )) as Array<{ tenant_id: string }>;

      for (const { tenant_id: tenantId } of tenants) {
        const roleRows = (await queryRunner.query(
          `INSERT INTO ${schema}."roles"
             (id, tenant_id, name, display_name, description, is_system, priority, scope, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, 'guest', 'Guest', $2, true, $3, 'tenant', now(), now())
           ON CONFLICT (tenant_id, name) DO UPDATE SET priority = EXCLUDED.priority
           RETURNING id`,
          [tenantId, GUEST_DESCRIPTION, GUEST_PRIORITY],
        )) as Array<{ id: string }>;
        const roleId = roleRows[0]!.id;

        const attached = (await queryRunner.query(
          `SELECT 1 FROM ${schema}."role_policies" WHERE tenant_id = $1 AND role_id = $2`,
          [tenantId, roleId],
        )) as unknown[];
        if (attached.length > 0) continue;

        const policyRows = (await queryRunner.query(
          `INSERT INTO ${schema}."policies"
             (id, tenant_id, name, description, document, is_system, type, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, 'Guest Policy', 'System policy for Guest role', $2::jsonb, true, 'managed', now(), now())
           RETURNING id`,
          [tenantId, JSON.stringify(GUEST_POLICY)],
        )) as Array<{ id: string }>;
        await queryRunner.query(
          `INSERT INTO ${schema}."role_policies" (id, tenant_id, role_id, policy_id, created_at)
           VALUES (gen_random_uuid(), $1, $2, $3, now())`,
          [tenantId, roleId, policyRows[0]!.id],
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const schemaName of await this.tenantSchemas(queryRunner)) {
      const schema = this.quote(schemaName);
      // Roles still assigned to users are left alone so down never silently strips access.
      const unassigned = `NOT EXISTS (SELECT 1 FROM ${schema}."user_roles" ur WHERE ur.role_id = r.id)`;
      await queryRunner.query(
        `DELETE FROM ${schema}."role_policies" rp USING ${schema}."roles" r
          WHERE rp.role_id = r.id AND r.name = 'guest' AND r.is_system = true AND ${unassigned}`,
      );
      await queryRunner.query(
        `DELETE FROM ${schema}."policies" p
          WHERE p.name = 'Guest Policy' AND p.is_system = true
            AND NOT EXISTS (SELECT 1 FROM ${schema}."role_policies" rp WHERE rp.policy_id = p.id)`,
      );
      await queryRunner.query(
        `DELETE FROM ${schema}."roles" r WHERE r.name = 'guest' AND r.is_system = true AND ${unassigned}`,
      );
    }
  }
}
