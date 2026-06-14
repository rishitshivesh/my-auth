import * as Joi from "joi";

const boolString = Joi.string()
  .valid("true", "false", "1", "0", "yes", "no", "on", "off")
  .default("false");

export const validationSchema = Joi.object({
  // ── APPLICATION ───────────────────────────────────────────────
  NODE_ENV: Joi.string()
    .valid("development", "test", "production")
    .default("development"),
  PORT: Joi.number().port().default(4000),

  // ── CORE IDENTITY ─────────────────────────────────────────────
  ISSUER_BASE_URL: Joi.string()
    .uri({ scheme: ["http", "https"] })
    .required(),
  FRONTEND_URL: Joi.string()
    .uri({ scheme: ["http", "https"] })
    .required(),
  TENANT_RESOLUTION: Joi.string()
    .valid("path", "subdomain")
    .default("path"),

  // ── JWT & KEY MANAGEMENT ──────────────────────────────────────
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_ALG: Joi.string().valid("RS256", "EdDSA").default("RS256"),
  JWT_ISSUER: Joi.string().default("https://sentry.scrolloop.com"),
  JWKS_CACHE_SECONDS: Joi.number().integer().min(0).default(300),
  KEYRING_MASTER_KEY: Joi.string().base64().length(44).required(),
  KEY_ACTIVE_TTL_DAYS: Joi.number().integer().min(1).default(90),
  KEY_ROTATION_GRACE_DAYS: Joi.number().integer().min(0).default(2),

  // ── SESSION ───────────────────────────────────────────────────
  SESSION_SECRET: Joi.string().min(32).required(),

  // ── CORS ──────────────────────────────────────────────────────
  CORS_ORIGINS: Joi.string().required(),

  // ── DATABASE ──────────────────────────────────────────────────
  DB_URL: Joi.string()
    .uri({ scheme: ["postgres", "postgresql"] })
    .required(),
  DB_SSL: boolString,
  DB_LOGGING: boolString,

  // ── REDIS ─────────────────────────────────────────────────────
  REDIS_HOST: Joi.string().default("localhost"),
  REDIS_PORT: Joi.number().integer().min(1).default(6379),
  REDIS_USERNAME: Joi.string().allow("").default(""),
  REDIS_PASSWORD: Joi.string().allow("").default(""),
  REDIS_DB: Joi.number().integer().min(0).default(0),
  REDIS_KEY_PREFIX: Joi.string().default("sentry"),

  // ── WEBAUTHN ──────────────────────────────────────────────────
  WEBAUTHN_RP_ID: Joi.string().default("localhost"),
  WEBAUTHN_ORIGIN: Joi.string()
    .uri({ scheme: ["http", "https"] })
    .default("http://localhost:3000"),

  // ── EMAIL ─────────────────────────────────────────────────────
  EMAIL_FROM: Joi.string().email().default("noreply@sentry.scrolloop.com"),
  EMAIL_FROM_NAME: Joi.string().default("Scrolloop Sentry"),
  EMAIL_REPLY_TO: Joi.string().email().default("support@sentry.scrolloop.com"),

  SMTP_HOST: Joi.string().allow("").optional(),
  SMTP_PORT: Joi.number().port().default(587),
  SMTP_SECURE: boolString,
  SMTP_USER: Joi.string().allow("").optional(),
  SMTP_PASS: Joi.string().allow("").optional(),

  AWS_SES_REGION: Joi.string().allow("").optional(),
  AWS_SES_ACCESS_KEY_ID: Joi.string().allow("").optional(),
  AWS_SES_SECRET_ACCESS_KEY: Joi.string().allow("").optional(),

  // ── SOCIAL AUTH (internal portal) ─────────────────────────────
  INTERNAL_GOOGLE_CLIENT_ID: Joi.string().allow("").optional(),
  INTERNAL_GOOGLE_CLIENT_SECRET: Joi.string().allow("").optional(),
  INTERNAL_GOOGLE_CALLBACK_URL: Joi.string().allow("").optional(),

  INTERNAL_GITHUB_CLIENT_ID: Joi.string().allow("").optional(),
  INTERNAL_GITHUB_CLIENT_SECRET: Joi.string().allow("").optional(),
  INTERNAL_GITHUB_CALLBACK_URL: Joi.string().allow("").optional(),

  INTERNAL_MICROSOFT_CLIENT_ID: Joi.string().allow("").optional(),
  INTERNAL_MICROSOFT_CLIENT_SECRET: Joi.string().allow("").optional(),
  INTERNAL_MICROSOFT_CALLBACK_URL: Joi.string().allow("").optional(),
  INTERNAL_MICROSOFT_TENANT: Joi.string().allow("").optional(),

  // ── PORTAL URLS ───────────────────────────────────────────────
  PORTAL_URL: Joi.string()
    .uri({ scheme: ["http", "https"] })
    .default("http://localhost:3000"),
  INTERNAL_PORTAL_URL: Joi.string()
    .uri({ scheme: ["http", "https"] })
    .default("http://localhost:3000"),
  AUTH_SERVICE_URL: Joi.string()
    .uri({ scheme: ["http", "https"] })
    .default("http://localhost:4000"),

  // ── FILE STORAGE ──────────────────────────────────────────────
  UPLOAD_DIR: Joi.string().optional(),
  PUBLIC_BASE_URL: Joi.string()
    .uri({ scheme: ["http", "https"] })
    .default("http://localhost:4000"),

  // ── OBSERVABILITY ─────────────────────────────────────────────
  SUPPORT_EMAIL: Joi.string().email().allow("").optional(),
}).options({ allowUnknown: true });
