import { createCipheriv, randomBytes } from "crypto";
import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Encrypts tenant_social_providers.client_secret at rest.
 *
 * Stored format matches TokenEncryptionService.encryptSecret():
 *   enc:v1:<iv hex>:<authTag hex>:<ciphertext hex>   (AES-256-GCM, key = TOKEN_ENCRYPTION_KEY)
 *
 * Idempotent: rows already carrying the `enc:` prefix are skipped. The key is only
 * required when at least one plaintext secret exists.
 */
const PREFIX = "enc:v1:";

function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  const body = cipher.update(plaintext, "utf8", "hex") + cipher.final("hex");
  return `${PREFIX}${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${body}`;
}

export class EncryptTenantSocialProviderSecrets1947000000000 implements MigrationInterface {
  name = "EncryptTenantSocialProviderSecrets1947000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schemas = (await queryRunner.query(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'fk\\_%' ESCAPE '\\'`,
    )) as Array<{ schema_name: string }>;

    let key: Buffer | undefined;
    for (const { schema_name } of schemas) {
      const schema = `"${schema_name.replace(/"/g, '""')}"`;
      const exists = (await queryRunner.query(
        `SELECT 1 FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = 'tenant_social_providers' AND column_name = 'client_secret'`,
        [schema_name],
      )) as unknown[];
      if (exists.length === 0) continue;

      const rows = (await queryRunner.query(
        `SELECT id, client_secret FROM ${schema}."tenant_social_providers"
          WHERE client_secret IS NOT NULL AND client_secret <> '' AND client_secret NOT LIKE 'enc:%'`,
      )) as Array<{ id: string; client_secret: string }>;
      if (rows.length === 0) continue;

      if (!key) {
        const hex = process.env["TOKEN_ENCRYPTION_KEY"];
        key = hex ? Buffer.from(hex, "hex") : undefined;
        if (!key || key.length !== 32) {
          throw new Error(
            "TOKEN_ENCRYPTION_KEY (64 hex chars) is required to encrypt existing tenant social provider secrets",
          );
        }
      }
      for (const row of rows) {
        await queryRunner.query(
          `UPDATE ${schema}."tenant_social_providers" SET client_secret = $1 WHERE id = $2`,
          [encrypt(row.client_secret, key), row.id],
        );
      }
    }
  }

  public async down(): Promise<void> {
    // Irreversible by design: decrypting secrets back to plaintext would weaken storage.
  }
}
