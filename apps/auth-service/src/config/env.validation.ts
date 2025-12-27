import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(4000),

  ISSUER_BASE_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .required(),
  TENANT_RESOLUTION: Joi.string().valid('path', 'subdomain').default('path'),

  JWT_ALG: Joi.string().valid('RS256', 'EdDSA').default('RS256'),
  JWKS_CACHE_SECONDS: Joi.number().integer().min(0).default(300),

  KEYRING_MASTER_KEY: Joi.string().base64().length(44).required(), // 32 bytes (base64 => 44 chars)

  DB_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .required(),
  DB_SSL: Joi.string()
    .valid('true', 'false', '1', '0', 'yes', 'no', 'on', 'off')
    .default('false'),
  DB_LOGGING: Joi.string()
    .valid('true', 'false', '1', '0', 'yes', 'no', 'on', 'off')
    .default('false'),

  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().integer().min(1).default(6379),
  REDIS_USERNAME: Joi.string().allow(''),
  REDIS_PASSWORD: Joi.string().allow(''),
});
