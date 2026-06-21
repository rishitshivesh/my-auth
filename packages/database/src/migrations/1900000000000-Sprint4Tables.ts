import { MigrationInterface, QueryRunner } from "typeorm";

export class Sprint4Tables1900000000000 implements MigrationInterface {
  name = "Sprint4Tables1900000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Webhook endpoints ─────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "webhook_endpoints" (
        "id"              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        "created_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "deleted_at"      TIMESTAMPTZ,
        "tenant_id"       UUID NOT NULL,
        "url"             VARCHAR(512) NOT NULL,
        "secret"          VARCHAR(128) NOT NULL,
        "events"          JSONB NOT NULL DEFAULT '[]',
        "active"          BOOLEAN NOT NULL DEFAULT TRUE,
        "failed_count"    INTEGER NOT NULL DEFAULT 0,
        "last_delivery_at" TIMESTAMPTZ,
        "description"     VARCHAR(255)
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_webhook_endpoints_tenant" ON "webhook_endpoints" ("tenant_id")`);

    // ── Webhook deliveries ────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "webhook_deliveries" (
        "id"              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        "created_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "deleted_at"      TIMESTAMPTZ,
        "endpoint_id"     UUID NOT NULL,
        "event_type"      VARCHAR(128) NOT NULL,
        "payload"         JSONB NOT NULL,
        "status"          VARCHAR(20) NOT NULL DEFAULT 'pending',
        "attempts"        INTEGER NOT NULL DEFAULT 0,
        "next_retry_at"   TIMESTAMPTZ,
        "response_status" INTEGER,
        "response_body"   TEXT,
        "error_message"   TEXT,
        "duration_ms"     INTEGER
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_webhook_deliveries_endpoint" ON "webhook_deliveries" ("endpoint_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_webhook_deliveries_status" ON "webhook_deliveries" ("status")`);

    // ── SAML service providers ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "saml_service_providers" (
        "id"                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        "created_at"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "deleted_at"          TIMESTAMPTZ,
        "tenant_id"           UUID NOT NULL,
        "name"                VARCHAR(255) NOT NULL,
        "entity_id"           TEXT NOT NULL,
        "acs_url"             TEXT NOT NULL,
        "slo_url"             TEXT,
        "certificate"         TEXT,
        "name_id_format"      VARCHAR(128) NOT NULL DEFAULT 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
        "attribute_mapping"   JSONB NOT NULL DEFAULT '{}',
        "active"              BOOLEAN NOT NULL DEFAULT TRUE,
        "metadata_url"        TEXT,
        "sign_assertions"     BOOLEAN NOT NULL DEFAULT TRUE,
        "encrypt_assertions"  BOOLEAN NOT NULL DEFAULT FALSE
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_saml_sps_tenant" ON "saml_service_providers" ("tenant_id")`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_saml_sp_entity_tenant" ON "saml_service_providers" ("entity_id", "tenant_id") WHERE "deleted_at" IS NULL`);

    // ── SCIM tokens ───────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "scim_tokens" (
        "id"          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "deleted_at"  TIMESTAMPTZ,
        "tenant_id"   UUID NOT NULL,
        "name"        VARCHAR(255) NOT NULL,
        "token_hash"  VARCHAR(128) NOT NULL UNIQUE,
        "active"      BOOLEAN NOT NULL DEFAULT TRUE,
        "last_used_at" TIMESTAMPTZ,
        "expires_at"  TIMESTAMPTZ
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_scim_tokens_tenant" ON "scim_tokens" ("tenant_id")`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_scim_token_hash" ON "scim_tokens" ("token_hash")`);

    // ── LDAP connections ──────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ldap_connections" (
        "id"                        UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        "created_at"                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "deleted_at"                TIMESTAMPTZ,
        "tenant_id"                 UUID NOT NULL,
        "name"                      VARCHAR(255) NOT NULL,
        "host"                      VARCHAR(512) NOT NULL,
        "port"                      INTEGER NOT NULL DEFAULT 389,
        "bind_dn"                   VARCHAR(512) NOT NULL,
        "bind_password_encrypted"   TEXT NOT NULL,
        "base_dn"                   VARCHAR(512) NOT NULL,
        "user_filter"               VARCHAR(512) NOT NULL DEFAULT '(objectClass=inetOrgPerson)',
        "group_filter"              VARCHAR(512) NOT NULL DEFAULT '(objectClass=groupOfNames)',
        "email_attribute"           VARCHAR(128) NOT NULL DEFAULT 'mail',
        "display_name_attribute"    VARCHAR(128) NOT NULL DEFAULT 'cn',
        "first_name_attribute"      VARCHAR(128) NOT NULL DEFAULT 'givenName',
        "last_name_attribute"       VARCHAR(128) NOT NULL DEFAULT 'sn',
        "sync_schedule"             VARCHAR(128) NOT NULL DEFAULT 'manual',
        "active"                    BOOLEAN NOT NULL DEFAULT TRUE,
        "use_tls"                   BOOLEAN NOT NULL DEFAULT FALSE,
        "last_sync_at"              TIMESTAMPTZ,
        "last_sync_status"          VARCHAR(64),
        "last_sync_users_created"   INTEGER,
        "last_sync_users_updated"   INTEGER
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_ldap_connections_tenant" ON "ldap_connections" ("tenant_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "ldap_connections"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "scim_tokens"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "saml_service_providers"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "webhook_deliveries"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "webhook_endpoints"`);
  }
}
