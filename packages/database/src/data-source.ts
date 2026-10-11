import "reflect-metadata";
import * as dotenv from "dotenv";
import { DataSource, DataSourceOptions } from "typeorm";
import * as path from "path";

// Load the monorepo root .env so `yarn workspace @repo/database migration:run`
// works without needing a local .env in packages/database.
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

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
import { UserInvite } from "./entities/user-invite.entity";
import { WebhookEndpoint } from "./entities/webhook-endpoint.entity";
import { WebhookDelivery } from "./entities/webhook-delivery.entity";
import { SamlServiceProvider } from "./entities/saml-service-provider.entity";
import { ScimToken } from "./entities/scim-token.entity";
import { LdapConnection } from "./entities/ldap-connection.entity";
import { Policy } from "./entities/policy.entity";
import { Group } from "./entities/group.entity";
import { UserGroup } from "./entities/user-group.entity";
import { GroupPolicy } from "./entities/group-policy.entity";
import { UserPolicy } from "./entities/user-policy.entity";
import { RolePolicy } from "./entities/role-policy.entity";
import { TenantMfaPolicy } from "./entities/tenant-mfa-policy.entity";

/**
 * Database connection configuration — single source of truth.
 *
 * Used by:
 *   - the NestJS runtime (`DatabaseModule` calls `buildDataSourceOptions()`
 *     inside its factory, after ConfigModule has loaded `.env`), and
 *   - the TypeORM CLI (migrations) via the `AppDataSource` export below.
 *
 * Connection resolution (first match wins):
 *   1. DB_URL                       (canonical)
 *   2. DATABASE_URL                 (accepted alias)
 *   3. DATABASE_HOST / DATABASE_PORT / DATABASE_USER / DATABASE_PASSWORD / DATABASE_NAME
 *
 * TLS:
 *   DB_SSL=true                     enable TLS
 *   DB_SSL_CA=<PEM or base64 PEM>   verify the server against this CA (recommended)
 *   DB_SSL_REJECT_UNAUTHORIZED=true verify against the system CA bundle
 *   Without either of the last two, TLS is encrypted but the server certificate
 *   is NOT verified (legacy behaviour, kept for managed providers such as
 *   Supabase poolers). Production deployments should set DB_SSL_CA.
 */
export type DatabaseEnv = Record<string, string | undefined>;

const truthy = (value: string | undefined): boolean =>
  /^(1|true|yes|on)$/i.test(value ?? "");

function resolveSsl(env: DatabaseEnv): false | { rejectUnauthorized: boolean; ca?: string } {
  if (!truthy(env.DB_SSL) && !truthy(env.DATABASE_SSL)) return false;

  const rawCa = env.DB_SSL_CA?.trim();
  if (rawCa) {
    const ca = rawCa.includes("BEGIN CERTIFICATE")
      ? rawCa
      : Buffer.from(rawCa, "base64").toString("utf8");
    return { rejectUnauthorized: true, ca };
  }

  return { rejectUnauthorized: truthy(env.DB_SSL_REJECT_UNAUTHORIZED) };
}

function resolveConnection(env: DatabaseEnv): { url: string } | {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
} {
  const url = env.DB_URL || env.DATABASE_URL;
  if (url) return { url };
  return {
    host: env.DATABASE_HOST || "localhost",
    port: parseInt(env.DATABASE_PORT || "5432", 10),
    username: env.DATABASE_USER || "postgres",
    password: env.DATABASE_PASSWORD || "",
    database: env.DATABASE_NAME || "postgres",
  };
}

export const ENTITIES = [
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
  UserInvite,
  WebhookEndpoint,
  WebhookDelivery,
  SamlServiceProvider,
  ScimToken,
  LdapConnection,
  Policy,
  Group,
  UserGroup,
  GroupPolicy,
  UserPolicy,
  RolePolicy,
  TenantMfaPolicy,
];

export function buildDataSourceOptions(env: DatabaseEnv = process.env): DataSourceOptions {
  return {
    type: "postgres",
    ...resolveConnection(env),
    entities: ENTITIES,
    migrations: [path.join(__dirname, "migrations", "*.{ts,js}")],
    migrationsTableName: "migrations",
    migrationsRun: false,
    logging: truthy(env.DB_LOGGING) || truthy(env.DATABASE_LOGGING),
    logger: "advanced-console",
    extra: {
      max: parseInt(env.DATABASE_POOL_MAX || "20", 10),
      min: parseInt(env.DATABASE_POOL_MIN || "2", 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    },
    ssl: resolveSsl(env),
    // No `schema` — tables resolve through the per-request search_path set by
    // TenantSchemaMiddleware (tenant schemas) or default to `public`.
    synchronize: false,
  } as DataSourceOptions;
}

/** Options resolved from the current process environment (CLI / scripts). */
export const dataSourceOptions: DataSourceOptions = buildDataSourceOptions();

// Create and export DataSource
export const AppDataSource = new DataSource(dataSourceOptions);
