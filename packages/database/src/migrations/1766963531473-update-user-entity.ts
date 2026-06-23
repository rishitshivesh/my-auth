import { MigrationInterface, QueryRunner } from "typeorm";

export class Sh1766963531473 implements MigrationInterface {
    name = 'Sh1766963531473'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS template; SET search_path TO template, public, extensions;`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "email_verification_expires"`);
        await queryRunner.query(`ALTER TABLE "users" ADD "email_verification_expires_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "users" ADD "metadata" jsonb NOT NULL DEFAULT '{}'`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."metadata" IS 'Additional user metadata'`);
        await queryRunner.query(`ALTER TABLE "users" ADD "timezone" character varying(10)`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."timezone" IS 'User timezone (e.g., America/New_York)'`);
        await queryRunner.query(`CREATE INDEX "IDX_40ec4dea118345e4d95fb836ad" ON "users" ("last_login_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_cf96ca0dc9c97fdc2ae06831d8" ON "users" ("email_verified") `);
        await queryRunner.query(`CREATE INDEX "IDX_3676155292d72c67cd4e090514" ON "users" ("status") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`SET search_path TO template, public, extensions;`);
        await queryRunner.query(`DROP INDEX "IDX_3676155292d72c67cd4e090514"`);
        await queryRunner.query(`DROP INDEX "IDX_cf96ca0dc9c97fdc2ae06831d8"`);
        await queryRunner.query(`DROP INDEX "IDX_40ec4dea118345e4d95fb836ad"`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."timezone" IS 'User timezone (e.g., America/New_York)'`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "timezone"`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."metadata" IS 'Additional user metadata'`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "metadata"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "email_verification_expires_at"`);
        await queryRunner.query(`ALTER TABLE "users" ADD "email_verification_expires" TIMESTAMP WITH TIME ZONE`);
    }

}
