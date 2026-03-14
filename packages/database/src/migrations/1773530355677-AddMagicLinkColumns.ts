import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMagicLinkColumns1773530355677 implements MigrationInterface {
    name = 'AddMagicLinkColumns1773530355677'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "magic_link_token" character varying(255)`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."magic_link_token" IS 'SHA-256 hash of the magic link token'`);
        await queryRunner.query(`ALTER TABLE "users" ADD "magic_link_expires_at" TIMESTAMP WITH TIME ZONE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "magic_link_expires_at"`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."magic_link_token" IS 'SHA-256 hash of the magic link token'`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "magic_link_token"`);
    }

}
