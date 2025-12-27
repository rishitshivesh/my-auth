export default () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '4000', 10),

  issuerBaseUrl: process.env.ISSUER_BASE_URL!,
  tenantResolution: process.env.TENANT_RESOLUTION ?? 'path',

  jwtAlg: process.env.JWT_ALG ?? 'RS256',
  jwksCacheSeconds: parseInt(process.env.JWKS_CACHE_SECONDS ?? '300', 10),

  dbUrl: process.env.DB_URL!,
  redisUrl: process.env.REDIS_URL ?? '',

  keyActiveTtlDays: parseInt(process.env.KEY_ACTIVE_TTL_DAYS ?? '90', 10),
  keyRotationGraceDays: parseInt(
    process.env.KEY_ROTATION_GRACE_DAYS ?? '2',
    10,
  ),

  keyringMasterKeyB64: process.env.KEYRING_MASTER_KEY!,
});
