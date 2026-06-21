/**
 * Scrolloop Sentry Database Entities
 *
 * All TypeORM entities for the authentication system
 */

// Base
export * from "./src/entities/base.entity";

// Core Entities
export * from "./src/entities/tenant.entity";
export * from "./src/entities/user.entity";
export * from "./src/entities/session.entity";

// Security
export * from "./src/entities/mfa-settings.entity";
export * from "./src/entities/webauthn-credential.entity";
export * from "./src/entities/security-event.entity";

// RBAC
export * from "./src/entities/role.entity";
export * from "./src/entities/permission.entity";
export * from "./src/data-source";
export * from "./src/entities/user-role.entity";
export * from "./src/entities/role-permission.entity";

// OAuth
export * from "./src/entities/oauth-client.entity";
export * from "./src/entities/oauth-authorization-code.entity";
export * from "./src/entities/oauth-access-token.entity";
export * from "./src/entities/oauth-refresh-token.entity";
export * from "./src/entities/oauth-consent.entity";

export * from "./src/entities/user-social-connections.entity";
export * from "./src/entities/tenant-social-providers.entity";
export * from "./src/entities/social-link-request.entity";
export * from "./src/entities/tenant-branding.entity";
export * from "./src/entities/key-pair.entity";

// IAM Policy Engine
export * from "./src/entities/policy.entity";
export * from "./src/entities/group.entity";
export * from "./src/entities/user-group.entity";
export * from "./src/entities/group-policy.entity";
export * from "./src/entities/user-policy.entity";
export * from "./src/entities/role-policy.entity";

// Invites
export * from "./src/entities/user-invite.entity";

// Re-export for convenience
export { Tenant } from "./src/entities/tenant.entity";
export { User } from "./src/entities/user.entity";
export { Session } from "./src/entities/session.entity";
export { MfaSettings } from "./src/entities/mfa-settings.entity";
export {
  SecurityEvent,
  SecurityEventType,
} from "./src/entities/security-event.entity";
export { Role } from "./src/entities/role.entity";
export { Permission } from "./src/entities/permission.entity";
