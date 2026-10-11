import * as Joi from "joi";

/**
 * Environment contract for the auth-service.
 *
 * This schema is the single source of truth: every variable the service reads
 * is declared here, and `.env.example` documents exactly this set. The app
 * refuses to boot when a required value is missing or malformed.
 *
 * Keep `.env.example` in sync when you add, rename or remove a variable.
 */

const boolString = Joi.string()
  .valid("true", "false", "1", "0", "yes", "no", "on", "off")
  .default("false");

const httpUrl = Joi.string().uri({ scheme: ["http", "https"] });

/** Required in production, optional elsewhere. */
const requiredInProduction = (schema: Joi.Schema): Joi.Schema =>
  Joi.when("NODE_ENV", {
    is: "production",
    then: schema.required(),
    otherwise: schema.optional().allow(""),
  });

export const validationSchema = Joi.object({
  // ── Application ───────────────────────────────────────────────
  NODE_ENV: Joi.string()
    .valid("development", "test", "production")
    .default("development"),
  PORT: Joi.number().port().default(4000),
  TRUST_PROXY: Joi.string().allow("").optional(),

  // ── Public URLs ───────────────────────────────────────────────
  ISSUER_BASE_URL: httpUrl.required(),
  FRONTEND_URL: httpUrl.required(),
  PORTAL_URL: httpUrl.default("http://localhost:3000"),
  INTERNAL_PORTAL_URL: httpUrl.default("http://localhost:3000"),
  AUTH_SERVICE_URL: httpUrl.default("http://localhost:4000"),
  PUBLIC_BASE_URL: httpUrl.default("http://localhost:4000"),
  ADMIN_PORTAL_ORIGIN: httpUrl.optional(),
  CORS_ORIGINS: Joi.string().required(),

  // ── Platform & tenancy ────────────────────────────────────────
  SENTRY_PLATFORM_NAME: Joi.string().default("Scrolloop Sentry"),
  SENTRY_PLATFORM_SLUG: Joi.string()
    .pattern(/^[a-z0-9][a-z0-9-]{1,62}$/)
    .default("sentry"),
  SENTRY_PLATFORM_DOMAIN: Joi.string().hostname().optional(),
  ALLOW_TENANT_ID_HEADER: boolString,
  COOKIE_DOMAIN: Joi.string().optional(),

  // ── Tokens & keys ─────────────────────────────────────────────
  JWT_ISSUER: httpUrl.default("https://sentry.scrolloop.com"),
  // HS256 secret for short-lived internal tokens (MFA enrollment).
  JWT_SECRET: Joi.string().min(32).required(),
  // Wraps RSA private keys at rest. 32 random bytes, base64 (44 chars).
  KEYRING_MASTER_KEY: Joi.string().base64().length(44).required(),
  // Encrypts stored third-party OAuth tokens. 32 random bytes, hex (64 chars).
  TOKEN_ENCRYPTION_KEY: requiredInProduction(
    Joi.string().pattern(/^[0-9a-fA-F]{64}$/),
  ),
  SESSION_SECRET: Joi.string().min(32).required(),
  SESSION_TTL: Joi.number().integer().min(300).default(604800),

  // ── Database (DB_URL preferred; DATABASE_URL or DATABASE_* accepted) ─
  DB_URL: Joi.string().uri({ scheme: ["postgres", "postgresql"] }).optional(),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ["postgres", "postgresql"] })
    .optional(),
  DATABASE_HOST: Joi.string().optional(),
  DATABASE_PORT: Joi.number().port().optional(),
  DATABASE_USER: Joi.string().optional(),
  DATABASE_PASSWORD: Joi.string().allow("").optional(),
  DATABASE_NAME: Joi.string().optional(),
  DB_SSL: boolString,
  DB_SSL_CA: Joi.string().optional(),
  DB_SSL_REJECT_UNAUTHORIZED: boolString,
  DB_LOGGING: boolString,
  DATABASE_POOL_MAX: Joi.number().integer().min(1).default(20),
  DATABASE_POOL_MIN: Joi.number().integer().min(0).default(2),

  // ── Redis ─────────────────────────────────────────────────────
  REDIS_HOST: Joi.string().default("localhost"),
  REDIS_PORT: Joi.number().port().default(6379),
  REDIS_USERNAME: Joi.string().allow("").default(""),
  REDIS_PASSWORD: Joi.string().allow("").default(""),
  REDIS_DB: Joi.number().integer().min(0).default(0),
  REDIS_KEY_PREFIX: Joi.string().default("sentry"),

  // ── Rate limiting ─────────────────────────────────────────────
  // Development-only escape hatch; ignored unless NODE_ENV=development.
  DISABLE_RATE_LIMIT: boolString,

  // ── WebAuthn ──────────────────────────────────────────────────
  WEBAUTHN_RP_ID: Joi.string().default("localhost"),
  WEBAUTHN_ORIGIN: httpUrl.default("http://localhost:3000"),

  // ── Email (SES > SMTP > console) ──────────────────────────────
  EMAIL_FROM: Joi.string().email().default("noreply@sentry.scrolloop.com"),
  EMAIL_FROM_NAME: Joi.string().default("Scrolloop Sentry"),
  EMAIL_REPLY_TO: Joi.string().email().default("support@sentry.scrolloop.com"),
  SUPPORT_EMAIL: Joi.string().email().allow("").optional(),
  SMTP_HOST: Joi.string().allow("").optional(),
  SMTP_PORT: Joi.number().port().default(587),
  SMTP_SECURE: boolString,
  SMTP_USER: Joi.string().allow("").optional(),
  SMTP_PASS: Joi.string().allow("").optional(),
  AWS_SES_REGION: Joi.string().allow("").optional(),
  AWS_SES_ACCESS_KEY_ID: Joi.string().allow("").optional(),
  AWS_SES_SECRET_ACCESS_KEY: Joi.string().allow("").optional(),

  // ── Social login for the platform portal (all optional) ───────
  INTERNAL_GOOGLE_CLIENT_ID: Joi.string().allow("").optional(),
  INTERNAL_GOOGLE_CLIENT_SECRET: Joi.string().allow("").optional(),
  INTERNAL_GOOGLE_CALLBACK_URL: Joi.string().allow("").optional(),
  INTERNAL_GITHUB_CLIENT_ID: Joi.string().allow("").optional(),
  INTERNAL_GITHUB_CLIENT_SECRET: Joi.string().allow("").optional(),
  INTERNAL_GITHUB_CALLBACK_URL: Joi.string().allow("").optional(),
  INTERNAL_MICROSOFT_CLIENT_ID: Joi.string().allow("").optional(),
  INTERNAL_MICROSOFT_CLIENT_SECRET: Joi.string().allow("").optional(),
  INTERNAL_MICROSOFT_CALLBACK_URL: Joi.string().allow("").optional(),

  // ── File storage ──────────────────────────────────────────────
  UPLOAD_DIR: Joi.string().optional(),

  // ── First-run / seeding (never set in production) ─────────────
  SENTRY_SETUP_LOG_DIR: Joi.string().optional(),
  SEED_SUPERADMIN_EMAIL: Joi.string().email().optional(),
  SEED_SUPERADMIN_PASSWORD: Joi.string().min(12).optional(),
  SEED_EXAMPLE_CLIENTS: boolString,
})
  .or("DB_URL", "DATABASE_URL", "DATABASE_HOST")
  .messages({
    "object.missing":
      "Database connection not configured: set DB_URL (or DATABASE_URL, or DATABASE_HOST + DATABASE_* )",
  })
  .options({ allowUnknown: true });
