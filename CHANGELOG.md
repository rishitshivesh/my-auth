# Changelog

## Unreleased — foundation hardening

### ⚠️ Breaking
- `POST /auth/reset-password` requires `email` in addition to `otp` and `password`.
  `@scrolloop/sdk`: `resetPassword(email, otp, password)`.
- `TOKEN_ENCRYPTION_KEY` is required when `NODE_ENV=production`.
- OAuth PKCE: only `code_challenge_method=S256` is accepted and it must be sent explicitly;
  public clients must always use PKCE. Authorization codes issued with `plain` are rejected.
- Removed `GET /api/health-check`, `GET /` and `GET /api-docs.yaml`. Use `GET /health`,
  `GET /health/ready` and Swagger at `/api-docs` (non-production).

### Security
- Fixed password-reset account takeover (see `docs/security.md`).
- Audit metadata sanitiser now strips secrets nested in arrays.
- Single cookie policy (httpOnly, Secure in production, SameSite=Strict).

### Added
- `/.well-known/jwks.json`, `/.well-known/openid-configuration`.
- `TRUST_PROXY`, `DB_SSL_CA`, `DB_SSL_REJECT_UNAUTHORIZED`, `SEED_EXAMPLE_CLIENTS`.
- `docker-compose.yml`, CI workflow, `scripts/smoke-test.sh`.

### Fixed
- Service failed to boot (dependency injection).
- Duplicate service instances (Redis, JWKS, RBAC cache, sessions).
- Env validation contradicted the runtime; `.env.example` was incomplete.
- Discovery `issuer` now matches the token `iss`.
- Password reset now revokes cached sessions and refresh tokens.
