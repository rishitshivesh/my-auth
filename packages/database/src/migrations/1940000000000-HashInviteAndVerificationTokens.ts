import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Stores invite and email-verification tokens as SHA-256 hex digests.
 *
 * Existing rows are hashed in place, so links already emailed keep working
 * (the application hashes the presented token before lookup). Columns are
 * unchanged (varchar(128)/varchar(255) both fit a 64-char digest), so the
 * `template` schema and TenantSchemaService provisioning need no change.
 *
 * Every tenant schema (fk_*) is processed. Invites are idempotent via the
 * length guard (raw invite tokens are 128 hex chars). Email-verification
 * tokens cannot be told apart from digests by shape, so this migration must
 * run exactly once, which TypeORM's migrations table guarantees.
 */
export class HashInviteAndVerificationTokens1940000000000 implements MigrationInterface {
  name = "HashInviteAndVerificationTokens1940000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schemas = (await queryRunner.query(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'fk\\_%' ESCAPE '\\'`,
    )) as Array<{ schema_name: string }>;

    for (const { schema_name } of schemas) {
      const schema = `"${schema_name.replace(/"/g, '""')}"`;
      await queryRunner.query(
        `UPDATE ${schema}."user_invites"
            SET token = encode(sha256(convert_to(token, 'UTF8')), 'hex')
          WHERE length(token) <> 64`,
      );
      await queryRunner.query(
        `UPDATE ${schema}."users"
            SET email_verification_token = encode(sha256(convert_to(email_verification_token, 'UTF8')), 'hex')
          WHERE email_verification_token IS NOT NULL`,
      );
    }
  }

  public async down(): Promise<void> {
    // Irreversible by design: the raw tokens are not recoverable from their digests.
  }
}
