import { MigrationInterface, QueryRunner } from "typeorm";

export class Sh1766964901163 implements MigrationInterface {
    name = 'Sh1766964901163'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "last_failed_login" TIMESTAMP WITH TIME ZONE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "last_failed_login"`);
    }

}
