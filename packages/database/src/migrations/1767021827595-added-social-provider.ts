import { MigrationInterface, QueryRunner } from "typeorm";

export class AddedSocialProvider1767021827595 implements MigrationInterface {
    name = 'AddedSocialProvider1767021827595'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "user_social_connections" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "tenant_id" uuid NOT NULL, "user_id" uuid NOT NULL, "provider" character varying(50) NOT NULL, "provider_id" character varying(255) NOT NULL, "email" character varying(255) NOT NULL, "display_name" character varying(255), "avatar_url" character varying(500), "access_token" text, "refresh_token" text, "token_expires_at" TIMESTAMP WITH TIME ZONE, "scopes" text, "metadata" jsonb, "primary" boolean NOT NULL DEFAULT false, "last_used_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_d7021f41e26777eeb91370d592a" PRIMARY KEY ("id")); COMMENT ON COLUMN "user_social_connections"."provider" IS 'Social provider (google, github, etc.)'; COMMENT ON COLUMN "user_social_connections"."provider_id" IS 'User ID at the provider'; COMMENT ON COLUMN "user_social_connections"."email" IS 'Email from provider'; COMMENT ON COLUMN "user_social_connections"."display_name" IS 'Display name from provider'; COMMENT ON COLUMN "user_social_connections"."avatar_url" IS 'Avatar URL from provider'; COMMENT ON COLUMN "user_social_connections"."access_token" IS 'Encrypted access token'; COMMENT ON COLUMN "user_social_connections"."refresh_token" IS 'Encrypted refresh token'; COMMENT ON COLUMN "user_social_connections"."token_expires_at" IS 'When access token expires'; COMMENT ON COLUMN "user_social_connections"."scopes" IS 'Granted scopes (space-separated)'; COMMENT ON COLUMN "user_social_connections"."metadata" IS 'Provider-specific metadata'; COMMENT ON COLUMN "user_social_connections"."primary" IS 'Is this the primary auth method?'; COMMENT ON COLUMN "user_social_connections"."last_used_at" IS 'When this connection was last used to login'`);
        await queryRunner.query(`CREATE INDEX "IDX_cd68f461affb0e8e3232f5b7c8" ON "user_social_connections" ("email") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_fdeed009ab54540f0382ab83f2" ON "user_social_connections" ("tenant_id", "provider", "provider_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_c0a90523a682924e31433309de" ON "user_social_connections" ("tenant_id", "user_id") `);
        await queryRunner.query(`CREATE TABLE "tenant_social_providers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "tenant_id" uuid NOT NULL, "provider" character varying(50) NOT NULL, "enabled" boolean NOT NULL DEFAULT false, "client_id" character varying(255), "client_secret" text, "scopes" text, "use_shared_app" boolean NOT NULL DEFAULT false, "config" jsonb, CONSTRAINT "PK_526fa69451e0f896a6b8e8378d5" PRIMARY KEY ("id")); COMMENT ON COLUMN "tenant_social_providers"."provider" IS 'Social provider'; COMMENT ON COLUMN "tenant_social_providers"."enabled" IS 'Is this provider enabled for this tenant?'; COMMENT ON COLUMN "tenant_social_providers"."client_id" IS 'OAuth client ID (tenant-specific or shared)'; COMMENT ON COLUMN "tenant_social_providers"."client_secret" IS 'Encrypted OAuth client secret'; COMMENT ON COLUMN "tenant_social_providers"."scopes" IS 'Requested scopes (space-separated)'; COMMENT ON COLUMN "tenant_social_providers"."use_shared_app" IS 'Use Fort Knox shared OAuth app?'; COMMENT ON COLUMN "tenant_social_providers"."config" IS 'Provider-specific configuration'`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_88ae55aaa3284254302359d1d2" ON "tenant_social_providers" ("tenant_id", "provider") `);
        await queryRunner.query(`CREATE TABLE "social_link_requests" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "tenant_id" uuid NOT NULL, "user_id" uuid NOT NULL, "provider" character varying(50) NOT NULL, "provider_id" character varying(255) NOT NULL, "provider_email" character varying(255) NOT NULL, "token" character varying(255) NOT NULL, "profileData" jsonb NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "completed" boolean NOT NULL DEFAULT false, "completed_at" TIMESTAMP WITH TIME ZONE, "ip_address" inet, "user_agent" text, CONSTRAINT "UQ_329dce005a16fe212c2f8e085fa" UNIQUE ("token"), CONSTRAINT "PK_abfa46288bea6d87014395f724d" PRIMARY KEY ("id")); COMMENT ON COLUMN "social_link_requests"."token" IS 'Verification token sent via email'; COMMENT ON COLUMN "social_link_requests"."profileData" IS 'Social profile data to be linked'; COMMENT ON COLUMN "social_link_requests"."expires_at" IS 'When this request expires'; COMMENT ON COLUMN "social_link_requests"."completed" IS 'Has this request been completed?'`);
        await queryRunner.query(`CREATE INDEX "IDX_58a440bdd91e424e499fd6ccc8" ON "social_link_requests" ("tenant_id", "user_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_329dce005a16fe212c2f8e085f" ON "social_link_requests" ("token") `);
        await queryRunner.query(`ALTER TABLE "users" ADD "primary_auth_method" character varying(50) NOT NULL DEFAULT 'password'`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."primary_auth_method" IS 'Primary authentication method'`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "user_social_connections" ADD CONSTRAINT "FK_3b82f267bfd42e63d0bd4796a7c" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_social_connections" ADD CONSTRAINT "FK_c1d6c9f388e3684951dbe2dc9bd" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "tenant_social_providers" ADD CONSTRAINT "FK_cb56d98f8fb5571d82e3a69f08d" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "social_link_requests" ADD CONSTRAINT "FK_f1e34369b507dc55c7a64cca182" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "social_link_requests" ADD CONSTRAINT "FK_3110c40eb496bb3547e24dbf9c7" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "social_link_requests" DROP CONSTRAINT "FK_3110c40eb496bb3547e24dbf9c7"`);
        await queryRunner.query(`ALTER TABLE "social_link_requests" DROP CONSTRAINT "FK_f1e34369b507dc55c7a64cca182"`);
        await queryRunner.query(`ALTER TABLE "tenant_social_providers" DROP CONSTRAINT "FK_cb56d98f8fb5571d82e3a69f08d"`);
        await queryRunner.query(`ALTER TABLE "user_social_connections" DROP CONSTRAINT "FK_c1d6c9f388e3684951dbe2dc9bd"`);
        await queryRunner.query(`ALTER TABLE "user_social_connections" DROP CONSTRAINT "FK_3b82f267bfd42e63d0bd4796a7c"`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "password_hash" SET NOT NULL`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."primary_auth_method" IS 'Primary authentication method'`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "primary_auth_method"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_329dce005a16fe212c2f8e085f"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_58a440bdd91e424e499fd6ccc8"`);
        await queryRunner.query(`DROP TABLE "social_link_requests"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_88ae55aaa3284254302359d1d2"`);
        await queryRunner.query(`DROP TABLE "tenant_social_providers"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c0a90523a682924e31433309de"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_fdeed009ab54540f0382ab83f2"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_cd68f461affb0e8e3232f5b7c8"`);
        await queryRunner.query(`DROP TABLE "user_social_connections"`);
    }

}
