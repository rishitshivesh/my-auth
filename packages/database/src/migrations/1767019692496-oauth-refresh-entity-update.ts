import { MigrationInterface, QueryRunner } from "typeorm";

export class Sh1767019692496 implements MigrationInterface {
    name = 'Sh1767019692496'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "oauth_refresh_tokens" ADD "session_id" uuid`);
        await queryRunner.query(`ALTER TABLE "oauth_refresh_tokens" DROP CONSTRAINT "FK_fb5c17c6a502c4e8bfe643edd83"`);
        await queryRunner.query(`ALTER TABLE "oauth_refresh_tokens" ALTER COLUMN "client_id" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "oauth_refresh_tokens" ADD CONSTRAINT "FK_fb5c17c6a502c4e8bfe643edd83" FOREIGN KEY ("client_id") REFERENCES "oauth_clients"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "oauth_refresh_tokens" ADD CONSTRAINT "FK_153ccd844f940084b8f51018b1e" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "oauth_refresh_tokens" DROP CONSTRAINT "FK_153ccd844f940084b8f51018b1e"`);
        await queryRunner.query(`ALTER TABLE "oauth_refresh_tokens" DROP CONSTRAINT "FK_fb5c17c6a502c4e8bfe643edd83"`);
        await queryRunner.query(`ALTER TABLE "oauth_refresh_tokens" ALTER COLUMN "client_id" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "oauth_refresh_tokens" ADD CONSTRAINT "FK_fb5c17c6a502c4e8bfe643edd83" FOREIGN KEY ("client_id") REFERENCES "oauth_clients"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "oauth_refresh_tokens" DROP COLUMN "session_id"`);
    }

}
