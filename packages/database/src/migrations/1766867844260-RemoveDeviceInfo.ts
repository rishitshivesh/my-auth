import { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveDeviceInfo1766867844260 implements MigrationInterface {
    name = 'RemoveDeviceInfo1766867844260'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "sessions" ALTER COLUMN "device_info" DROP NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "sessions" ALTER COLUMN "device_info" SET NOT NULL`);
    }

}
