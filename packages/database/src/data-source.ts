import "reflect-metadata";
import { DataSource, DataSourceOptions } from "typeorm";
import * as path from "path";

// Import all entities explicitly
import { Tenant } from "./entities/tenant.entity";
import { User } from "./entities/user.entity";
import { Session } from "./entities/session.entity";
import { MfaSettings } from "./entities/mfa-settings.entity";
import { WebAuthnCredential } from "./entities/webauthn-credential.entity";
import { SecurityEvent } from "./entities/security-event.entity";
import { Role } from "./entities/role.entity";
import { Permission } from "./entities/permission.entity";
import { OAuthClient } from "./entities/oauth-client.entity";
import { OAuthAuthorizationCode } from "./entities/oauth-authorization-code.entity";
import { OAuthAccessToken } from "./entities/oauth-access-token.entity";
import { OAuthRefreshToken } from "./entities/oauth-refresh-token.entity";
import { OAuthConsent } from "./entities/oauth-consent.entity";
import { RolePermission } from "./entities/role-permission.entity";
import { UserRole } from "./entities/user-role.entity";
import { SocialLinkRequest } from "./entities/social-link-request.entity";
import { TenantSocialProvider } from "./entities/tenant-social-providers.entity";
import { UserSocialConnection } from "./entities/user-social-connections.entity";
import { TenantBranding } from "./entities/tenant-branding.entity";
import { KeyPair } from "./entities/key-pair.entity";

/**
 * TypeORM DataSource Configuration
 *
 * This file is used by TypeORM CLI for migrations
 * and can also be imported by the NestJS application
 */

const useSSL = process.env.DB_SSL === "true";
const dbUrl = process.env.DB_URL ?? process.env.DATABASE_URL;

const connectionConfig = dbUrl
  ? { url: dbUrl }
  : {
      host: process.env.DATABASE_HOST || "localhost",
      port: parseInt(process.env.DATABASE_PORT || "5432", 10),
      username: process.env.DATABASE_USER || "postgres",
      password: process.env.DATABASE_PASSWORD || "",
      database: process.env.DATABASE_NAME || "postgres",
    };

export const dataSourceOptions: DataSourceOptions = {
  type: "postgres",
  ...connectionConfig,

  // Entities - explicit import for reliability
  entities: [
    Tenant,
    Session,
    MfaSettings,
    WebAuthnCredential,
    SecurityEvent,
    Role,
    Permission,
    OAuthClient,
    OAuthAuthorizationCode,
    OAuthAccessToken,
    OAuthRefreshToken,
    OAuthConsent,
    RolePermission,
    SocialLinkRequest,
    TenantSocialProvider,
    UserSocialConnection,
    UserRole,
    User,
    TenantBranding,
    KeyPair,
  ],

  // Migrations
  migrations: [path.join(__dirname, "migrations", "*.{ts,js}")],

  // Migration settings
  migrationsTableName: "migrations",
  migrationsRun: false, // Don't auto-run migrations

  // Logging
  logging: process.env.DATABASE_LOGGING === "true",
  logger: "advanced-console",

  // Connection pool
  extra: {
    max: parseInt(process.env.DATABASE_POOL_MAX || "20", 10),
    min: parseInt(process.env.DATABASE_POOL_MIN || "2", 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  },

  // SSL (for production or cloud databases like Supabase)
  ssl: useSSL
    ? {
        rejectUnauthorized: false, // Supabase requires this
      }
    : false,

  // Schema
  schema: process.env.DATABASE_SCHEMA || "public",

  // Synchronize (NEVER use in production!)
  synchronize: false,
};

// Create and export DataSource
export const AppDataSource = new DataSource(dataSourceOptions);
