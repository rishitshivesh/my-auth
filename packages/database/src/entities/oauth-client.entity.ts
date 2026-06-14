import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  OneToMany,
} from "typeorm";
import { BaseEntity } from "./base.entity";
import { Tenant } from "./tenant.entity";
import { OAuthAuthorizationCode } from "./oauth-authorization-code.entity";
import { OAuthAccessToken } from "./oauth-access-token.entity";
import { OAuthRefreshToken } from "./oauth-refresh-token.entity";
import { OAuthConsent } from "./oauth-consent.entity";

export type ClientType = "confidential" | "public";
export type ApplicationType = "web" | "native" | "spa";
export type SubjectType = "public" | "pairwise";
export type TokenEndpointAuthMethod =
  | "client_secret_basic"
  | "client_secret_post"
  | "none";

/**
 * OAuth2 Client (Registered Application)
 * Represents third-party or first-party applications that can authenticate users
 */
@Entity("oauth_clients")
@Index(["tenantId", "clientId"], { unique: true })
@Index(["tenantId"])
@Index(["clientId"])
@Index(["isActive"])
@Index(["isFirstParty"])
export class OAuthClient extends BaseEntity {
  // ============================================================
  // RELATIONSHIPS
  // ============================================================

  @Column({ type: "uuid", name: "tenant_id" })
  tenantId!: string;

  @ManyToOne(() => Tenant, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "tenant_id" })
  tenant!: Tenant;

  @OneToMany(() => OAuthAuthorizationCode, (code) => code.client)
  authorizationCodes!: OAuthAuthorizationCode[];

  @OneToMany(() => OAuthAccessToken, (token) => token.client)
  accessTokens!: OAuthAccessToken[];

  @OneToMany(() => OAuthRefreshToken, (token) => token.client)
  refreshTokens!: OAuthRefreshToken[];

  @OneToMany(() => OAuthConsent, (consent) => consent.client)
  consents!: OAuthConsent[];

  // ============================================================
  // CLIENT IDENTIFICATION
  // ============================================================

  @Column({
    type: "varchar",
    length: 255,
    unique: true,
    name: "client_id",
    comment: "Unique client identifier (e.g., app_abc123)",
  })
  clientId!: string;

  @Column({
    type: "varchar",
    length: 255,
    nullable: true,
    name: "client_secret_hash",
    comment: "Hashed client secret (NULL for public clients)",
    select: false, // Don't select by default
  })
  clientSecretHash?: string;

  @Column({
    type: "varchar",
    length: 20,
    name: "client_type",
    comment: "confidential (has secret) | public (no secret, PKCE required)",
  })
  clientType!: ClientType;

  // ============================================================
  // CLIENT METADATA
  // ============================================================

  @Column({
    type: "varchar",
    length: 255,
    comment: "Human-readable application name",
  })
  name!: string;

  @Column({
    type: "text",
    nullable: true,
    comment: "Application description",
  })
  description?: string;

  @Column({
    type: "varchar",
    length: 500,
    nullable: true,
    name: "logo_url",
    comment: "URL to application logo",
  })
  logoUrl?: string;

  @Column({
    type: "varchar",
    length: 500,
    nullable: true,
    name: "website_url",
    comment: "Application website URL",
  })
  websiteUrl?: string;

  @Column({
    type: "varchar",
    length: 500,
    nullable: true,
    name: "privacy_policy_url",
    comment: "Privacy policy URL",
  })
  privacyPolicyUrl?: string;

  @Column({
    type: "varchar",
    length: 500,
    nullable: true,
    name: "terms_of_service_url",
    comment: "Terms of service URL",
  })
  termsOfServiceUrl?: string;

  // ============================================================
  // OAUTH2 CONFIGURATION
  // ============================================================

  @Column({
    type: "simple-array",
    name: "grant_types",
    comment: "Allowed OAuth2 grant types",
  })
  grantTypes!: string[]; // ['authorization_code', 'refresh_token', 'client_credentials']

  @Column({
    type: "simple-array",
    name: "redirect_uris",
    comment: "Allowed redirect URIs for OAuth2 flow",
  })
  redirectUris!: string[]; // ['https://app.example.com/callback', 'http://localhost:3000/callback']

  @Column({
    type: "simple-array",
    nullable: true,
    name: "post_logout_redirect_uris",
    comment: "Allowed redirect URIs after logout",
  })
  postLogoutRedirectUris?: string[];

  @Column({
    type: "simple-array",
    nullable: true,
    name: "allowed_origins",
    comment: "Allowed CORS origins",
  })
  allowedOrigins?: string[];

  @Column({
    type: "varchar",
    length: 50,
    default: "client_secret_basic",
    name: "token_endpoint_auth_method",
    comment: "How client authenticates at token endpoint",
  })
  tokenEndpointAuthMethod!: TokenEndpointAuthMethod;

  // ============================================================
  // PKCE CONFIGURATION
  // ============================================================

  @Column({
    type: "boolean",
    default: false,
    name: "require_pkce",
    comment: "Whether PKCE is required (always true for public clients)",
  })
  requirePkce!: boolean;

  // ============================================================
  // SCOPE CONFIGURATION
  // ============================================================

  @Column({
    type: "simple-array",
    nullable: true,
    name: "allowed_scopes",
    comment: "Scopes this client can request",
  })
  allowedScopes?: string[]; // ['openid', 'profile', 'email', 'users:read']

  @Column({
    type: "simple-array",
    nullable: true,
    name: "default_scopes",
    comment: "Default scopes if none specified",
  })
  defaultScopes?: string[];

  // ============================================================
  // TOKEN SETTINGS
  // ============================================================

  @Column({
    type: "integer",
    default: 900,
    name: "access_token_ttl",
    comment: "Access token lifetime in seconds (default: 15 minutes)",
  })
  accessTokenTtl!: number;

  @Column({
    type: "integer",
    default: 604800,
    name: "refresh_token_ttl",
    comment: "Refresh token lifetime in seconds (default: 7 days)",
  })
  refreshTokenTtl!: number;

  @Column({
    type: "integer",
    default: 3600,
    name: "id_token_ttl",
    comment: "ID token lifetime in seconds (default: 1 hour)",
  })
  idTokenTtl!: number;

  @Column({
    type: "integer",
    default: 600,
    name: "authorization_code_ttl",
    comment: "Authorization code lifetime in seconds (default: 10 minutes)",
  })
  authorizationCodeTtl!: number;

  @Column({
    type: "boolean",
    default: true,
    name: "rotate_refresh_tokens",
    comment: "Whether to rotate refresh tokens on use",
  })
  rotateRefreshTokens!: boolean;

  // ============================================================
  // OIDC CONFIGURATION
  // ============================================================

  @Column({
    type: "varchar",
    length: 20,
    default: "web",
    name: "application_type",
    comment: "OIDC application type",
  })
  applicationType!: ApplicationType;

  @Column({
    type: "varchar",
    length: 20,
    default: "public",
    name: "subject_type",
    comment: "OIDC subject identifier type",
  })
  subjectType!: SubjectType;

  // ============================================================
  // CONSENT & TRUST
  // ============================================================

  @Column({
    type: "boolean",
    default: false,
    name: "require_consent",
    comment: "Whether to show consent screen (always true for third-party)",
  })
  requireConsent!: boolean;

  @Column({
    type: "boolean",
    default: false,
    name: "is_first_party",
    comment: "Whether this is a first-party client (Scrolloop Sentry owned)",
  })
  isFirstParty!: boolean;

  @Column({
    type: "boolean",
    default: true,
    name: "is_active",
    comment: "Whether this client is active",
  })
  isActive!: boolean;

  // ============================================================
  // METADATA
  // ============================================================

  @Column({
    type: "jsonb",
    nullable: true,
    comment: "Additional metadata (custom claims, etc.)",
  })
  metadata?: Record<string, any>;

  @Column({
    type: "varchar",
    length: 255,
    nullable: true,
    name: "created_by",
    comment: "User ID who created this client",
  })
  createdBy?: string;

  // ============================================================
  // HELPERS
  // ============================================================

  /**
   * Check if client is public (no secret)
   */
  get isPublic(): boolean {
    return this.clientType === "public";
  }

  /**
   * Check if client is confidential (has secret)
   */
  get isConfidential(): boolean {
    return this.clientType === "confidential";
  }

  /**
   * Check if grant type is allowed
   */
  isGrantTypeAllowed(grantType: string): boolean {
    return this.grantTypes.includes(grantType);
  }

  /**
   * Check if redirect URI is allowed
   */
  isRedirectUriAllowed(redirectUri: string): boolean {
    return this.redirectUris.includes(redirectUri);
  }

  /**
   * Check if scope is allowed
   */
  isScopeAllowed(scope: string): boolean {
    if (!this.allowedScopes) return true; // No restrictions
    return this.allowedScopes.includes(scope);
  }
}
