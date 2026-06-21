import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserInvites1800200000000 implements MigrationInterface {
  name = 'AddUserInvites1800200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_invites" (
        "id"          uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at"  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at"  TIMESTAMP WITH TIME ZONE,
        "tenant_id"   uuid NOT NULL,
        "email"       varchar(255) NOT NULL,
        "token"       varchar(128) NOT NULL,
        "role_ids"    jsonb NOT NULL DEFAULT '[]',
        "invited_by"  uuid,
        "expires_at"  TIMESTAMP WITH TIME ZONE NOT NULL,
        "accepted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_user_invites" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_user_invites_token" UNIQUE ("token")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_user_invites_tenant_id" ON "user_invites" ("tenant_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_user_invites_email" ON "user_invites" ("email")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "user_invites"`);
  }
}
