import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Migration: AddWebAuthnCredentialsTable
 *
 * 1. Creates dedicated `webauthn_credentials` table.
 * 2. Migrates existing JSONB credentials from `mfa_settings.webauthn_credentials`.
 * 3. Drops the `webauthn_credentials` JSONB column from `mfa_settings`.
 */
export class AddWebAuthnCredentialsTable1773700000000
  implements MigrationInterface
{
  name = "AddWebAuthnCredentialsTable1773700000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS template; SET search_path TO template, public, extensions;`);
    // 1. Create the new table
    await queryRunner.query(`
      CREATE TABLE "webauthn_credentials" (
        "id"            UUID          NOT NULL DEFAULT gen_random_uuid(),
        "user_id"       UUID          NOT NULL,
        "tenant_id"     UUID          NOT NULL,
        "credential_id" TEXT          NOT NULL,
        "public_key"    BYTEA         NOT NULL,
        "counter"       INTEGER       NOT NULL DEFAULT 0,
        "device_name"   VARCHAR(255),
        "transports"    TEXT[],
        "last_used_at"  TIMESTAMPTZ,
        "created_at"    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_webauthn_credentials" PRIMARY KEY ("id"),
        CONSTRAINT "FK_webauthn_credentials_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_webauthn_credentials_tenant"
          FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_webauthn_credentials_tenant_credential"
          UNIQUE ("tenant_id", "credential_id")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_webauthn_credentials_user_tenant"
        ON "webauthn_credentials" ("user_id", "tenant_id");
    `);

    // 2. Migrate existing JSONB credentials from mfa_settings
    //    Each element in the jsonb array becomes one row.
    //    public_key is stored as base64url string in JSONB → convert to bytea.
    await queryRunner.query(`
      INSERT INTO "webauthn_credentials"
        ("user_id", "tenant_id", "credential_id", "public_key",
         "counter", "device_name", "transports", "last_used_at", "created_at")
      SELECT
        ms."user_id",
        ms."tenant_id",
        cred->>'id'                                        AS credential_id,
        decode(
          regexp_replace(
            regexp_replace(cred->>'publicKey', '-', '+', 'g'),
            '_', '/', 'g'
          ) || repeat('=', (4 - length(cred->>'publicKey') % 4) % 4),
          'base64'
        )                                                  AS public_key,
        COALESCE((cred->>'counter')::integer, 0)           AS counter,
        cred->>'deviceName'                                AS device_name,
        ARRAY(
          SELECT jsonb_array_elements_text(COALESCE(cred->'transports', '[]'::jsonb))
        )                                                  AS transports,
        (cred->>'lastUsedAt')::timestamptz                 AS last_used_at,
        COALESCE((cred->>'createdAt')::timestamptz, NOW()) AS created_at
      FROM "mfa_settings" ms,
           jsonb_array_elements(
             CASE
               WHEN ms."webauthn_credentials" IS NULL
                 OR jsonb_typeof(ms."webauthn_credentials") = 'null'
               THEN '[]'::jsonb
               ELSE ms."webauthn_credentials"
             END
           ) AS cred
      WHERE jsonb_typeof(
              CASE
                WHEN ms."webauthn_credentials" IS NULL
                THEN '[]'::jsonb
                ELSE ms."webauthn_credentials"
              END
            ) = 'array'
        AND jsonb_array_length(
              CASE
                WHEN ms."webauthn_credentials" IS NULL
                THEN '[]'::jsonb
                ELSE ms."webauthn_credentials"
              END
            ) > 0
      ON CONFLICT ("tenant_id", "credential_id") DO NOTHING;
    `);

    // 3. Drop the JSONB column from mfa_settings
    await queryRunner.query(`
      ALTER TABLE "mfa_settings" DROP COLUMN IF EXISTS "webauthn_credentials";
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET search_path TO template, public, extensions;`);
    // Re-add the JSONB column
    await queryRunner.query(`
      ALTER TABLE "mfa_settings"
        ADD COLUMN "webauthn_credentials" JSONB NOT NULL DEFAULT '[]';
    `);

    // Restore data from the dedicated table back into JSONB
    await queryRunner.query(`
      WITH agg AS (
        SELECT
          wc."user_id",
          wc."tenant_id",
          jsonb_agg(
            jsonb_build_object(
              'id',          wc."credential_id",
              'publicKey',   encode(wc."public_key", 'base64'),
              'counter',     wc."counter",
              'deviceName',  wc."device_name",
              'transports',  to_jsonb(wc."transports"),
              'lastUsedAt',  wc."last_used_at",
              'createdAt',   wc."created_at"
            )
          ) AS credentials
        FROM "webauthn_credentials" wc
        GROUP BY wc."user_id", wc."tenant_id"
      )
      UPDATE "mfa_settings" ms
      SET "webauthn_credentials" = agg.credentials
      FROM agg
      WHERE ms."user_id"   = agg."user_id"
        AND ms."tenant_id" = agg."tenant_id";
    `);

    // Drop the dedicated table
    await queryRunner.query(`DROP TABLE IF EXISTS "webauthn_credentials";`);
  }
}
