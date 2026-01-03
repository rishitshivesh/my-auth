import { MigrationInterface, QueryRunner } from "typeorm";

export class Sh1767455582553 implements MigrationInterface {
    name = 'Sh1767455582553'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "preferred_auth_method" character varying(50)`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."preferred_auth_method" IS 'User preferred authentication method'`);
        await queryRunner.query(`ALTER TABLE "users" ADD "mfa_enabled" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."mfa_enabled" IS 'Whether user has enabled MFA'`);
        await queryRunner.query(`ALTER TABLE "tenants" ADD "branding" jsonb`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN "branding"`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."mfa_enabled" IS 'Whether user has enabled MFA'`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "mfa_enabled"`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."preferred_auth_method" IS 'User preferred authentication method'`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "preferred_auth_method"`);
    }

}
