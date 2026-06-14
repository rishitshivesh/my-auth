import { MigrationInterface, QueryRunner } from "typeorm";

export class AddKeyPairsTable1781000000000 implements MigrationInterface {
  name = "AddKeyPairsTable1781000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "key_pairs" (
        "id"                    UUID          NOT NULL DEFAULT gen_random_uuid(),
        "kid"                   VARCHAR       NOT NULL,
        "tenant_id"             UUID,
        "algorithm"             VARCHAR       NOT NULL DEFAULT 'RS256',
        "use"                   VARCHAR       NOT NULL DEFAULT 'sig',
        "public_key_pem"        TEXT          NOT NULL,
        "encrypted_private_key" TEXT          NOT NULL,
        "iv"                    TEXT          NOT NULL,
        "auth_tag"              TEXT          NOT NULL,
        "status"                VARCHAR(20)   NOT NULL DEFAULT 'active',
        "created_at"            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        "expires_at"            TIMESTAMPTZ   NOT NULL,
        "retired_at"            TIMESTAMPTZ,
        "revoked_at"            TIMESTAMPTZ,
        CONSTRAINT "PK_key_pairs" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_key_pairs_kid" UNIQUE ("kid")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_key_pairs_tenant_status"
        ON "key_pairs" ("tenant_id", "status");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "key_pairs";`);
  }
}
