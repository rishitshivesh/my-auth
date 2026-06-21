# Scrolloop Sentry vs Auth0 — Feature Audit

> Generated: 2026-06-20  
> Legend: ✅ Done | ⚠️ Partial/stub | ❌ Missing | 🔜 Planned (sprint N)

---

## Authentication Methods

| Feature | Auth0 | Sentry | Notes |
|---------|-------|--------|-------|
| Username + password | ✅ | ✅ | Argon2id hashing |
| Magic link (passwordless) | ✅ | ✅ | `/api/auth/magic-link` |
| Google OAuth | ✅ | ✅ | Passport.js strategy |
| GitHub OAuth | ✅ | ✅ | Passport.js strategy |
| Microsoft OAuth | ✅ | ✅ | Passport.js strategy |
| Apple Sign In | ✅ | ❌ | Not yet implemented |
| Twitter/X OAuth | ✅ | ❌ | Not yet implemented |
| SAML IdP (inbound) | ✅ | 🔜 Sprint 4 | Planned via samlify |
| LDAP / Active Directory sync | ✅ | 🔜 Sprint 4 | Planned |
| Passkeys / WebAuthn | ✅ | ✅ | SimpleWebAuthn wired |
| Email OTP | ✅ | ⚠️ | Backend stub, no UI |
| SMS OTP | ✅ | ❌ | Requires SMS provider integration |
| Username login (no email) | ✅ | ❌ | Email is required identifier |

---

## Multi-Factor Authentication (MFA)

| Feature | Auth0 | Sentry | Notes |
|---------|-------|--------|-------|
| TOTP (Google Authenticator etc.) | ✅ | ✅ | speakeasy, QR code enrollment |
| WebAuthn (hardware keys) | ✅ | ✅ | |
| Backup codes | ✅ | ✅ | 10 single-use codes |
| SMS OTP as 2nd factor | ✅ | ❌ | |
| Email OTP as 2nd factor | ✅ | ⚠️ | Stub |
| Step-up authentication | ✅ | ❌ | Auth0 actions can trigger re-auth |
| Remember device (30-day bypass) | ✅ | ❌ | |
| Adaptive MFA (risk-based) | ✅ | ❌ | Auth0 uses ML signals |
| MFA enrollment flow UI | ✅ | ⚠️ | `/mfa/enroll` page stub exists |
| MFA enforcement policies per tenant | ✅ | ❌ | |

---

## Authorization / RBAC / FGA

| Feature | Auth0 | Sentry | Notes |
|---------|-------|--------|-------|
| Role-based access control | ✅ | ✅ | Roles, permissions, user_roles |
| Permission assignment to roles | ✅ | ✅ | |
| Permission assignment to users (direct) | ✅ | ⚠️ | Schema exists, API partial |
| Groups / teams | ✅ | ✅ | Schema exists |
| Fine-grained authorization (FGA / Zanzibar-style) | ✅ | ✅ | IAM policy engine — Deny/Allow/Condition blocks (Sprint 2) |
| ABAC (attribute-based) | ✅ | ⚠️ | Condition keys exist in policy engine, UI missing |
| Organization-level roles | ✅ | ✅ | Per-tenant schema, owner/admin/member bootstrapped on registration |
| Management API for roles | ✅ | ✅ | `/api/rbac/*` |
| UI for role/permission management | ✅ | ⚠️ | `/t/[slug]/roles` stub |

---

## Token Management

| Feature | Auth0 | Sentry | Notes |
|---------|-------|--------|-------|
| RS256 signed JWTs | ✅ | ✅ | Per-tenant RSA key pairs persisted in DB |
| JWKS endpoint | ✅ | ✅ | `/.well-known/jwks.json` |
| Token rotation | ✅ | ✅ | Refresh token rotation with family tracking |
| Refresh token reuse detection | ✅ | ✅ | Family revocation on reuse |
| Token introspection (RFC 7662) | ✅ | ✅ | `/oauth/introspect` |
| Token revocation (RFC 7009) | ✅ | ✅ | `/oauth/revoke` |
| Custom claims in access token | ✅ | ⚠️ | `tid`, `sid`, `jti` present; custom user claims not yet |
| ID token (OIDC) | ✅ | ⚠️ | Partial — `/oauth/userinfo` exists, ID token not fully spec-compliant |
| Opaque access tokens option | ✅ | ❌ | Sentry is JWT-only |
| Token lifetime configuration | ✅ | ⚠️ | Hardcoded 15min/7day; not per-tenant configurable |

---

## OAuth 2.0 / OIDC

| Feature | Auth0 | Sentry | Notes |
|---------|-------|--------|-------|
| Authorization Code flow | ✅ | ✅ | `/oauth/authorize` |
| Authorization Code + PKCE | ✅ | ✅ | PKCE enforced by default |
| Client Credentials flow | ✅ | ✅ | M2M tokens |
| Device Authorization flow | ✅ | ❌ | |
| Implicit flow (deprecated) | ✅ | ❌ | Intentionally excluded |
| Refresh Token flow | ✅ | ✅ | |
| UserInfo endpoint | ✅ | ✅ | `/oauth/userinfo` |
| Discovery document | ✅ | ✅ | `/.well-known/openid-configuration` |
| Dynamic Client Registration | ✅ | ❌ | |
| Pushed Authorization Requests (PAR) | ✅ | ❌ | |
| Consent screen | ✅ | ❌ | OAuth clients skip consent — no UI |
| Scope management | ✅ | ⚠️ | Scopes in DB, UI incomplete |

---

## Tenant / Organization Management

| Feature | Auth0 | Sentry | Notes |
|---------|-------|--------|-------|
| Multi-tenancy | ✅ | ✅ | Schema-per-tenant (`fk_{slug}`) + defense-in-depth row filter |
| Tenant branding (logo, colors) | ✅ | ✅ | `TenantBranding` entity + upload endpoint |
| Custom domain per tenant | ✅ | ❌ | Planned, not implemented |
| Self-service workspace creation | ✅ | ✅ | `POST /tenants/register` + `/onboarding` wizard |
| User invitations | ✅ | ✅ | `/api/user-invites`, `/invite/[token]` page |
| Organization metadata | ✅ | ⚠️ | Tenant settings partial |
| Tenant-level MFA policy | ✅ | ❌ | |
| Tenant-level password policy | ✅ | ✅ | `tenant_password_policy` table |
| Tenant connections (multiple IdPs per tenant) | ✅ | ❌ | |

---

## Session Management

| Feature | Auth0 | Sentry | Notes |
|---------|-------|--------|-------|
| Session listing | ✅ | ✅ | `/api/session` |
| Session revocation | ✅ | ✅ | Per-session + family revocation |
| Idle timeout | ✅ | ⚠️ | Configurable in env, not per-tenant |
| Absolute timeout | ✅ | ⚠️ | Refresh token expiry = 7 days |
| Device info on sessions | ✅ | ✅ | User-Agent + IP stored |
| Session anomaly detection | ✅ | ❌ | |
| Global logout (all sessions) | ✅ | ✅ | Via session family revocation |
| Back-channel logout (OIDC) | ✅ | ❌ | |

---

## Security

| Feature | Auth0 | Sentry | Notes |
|---------|-------|--------|-------|
| Brute-force protection | ✅ | ✅ | SlidingWindowRateLimiter in Redis |
| Rate limiting | ✅ | ✅ | Per-IP, per-route, Redis-backed |
| Credential breach detection | ✅ | ❌ | Auth0 integrates HaveIBeenPwned |
| Anomaly detection (logins from new locations) | ✅ | ❌ | |
| Bot detection | ✅ | ❌ | Auth0 uses Cloudflare Turnstile |
| IP allow/deny lists | ✅ | ❌ | |
| Suspicious IP throttling | ✅ | ❌ | |
| Security events log | ✅ | ✅ | `security_events` table |
| Audit log | ✅ | ✅ | `audit_logs` table with actor/action/resource |
| Password history (prevent reuse) | ✅ | ✅ | `password_history` table |
| Password strength enforcement | ✅ | ✅ | Configurable policy per tenant |
| Encrypted token storage | ✅ | ✅ | AES-256-GCM for OAuth tokens |
| HTTPS enforcement | ✅ | ✅ | HSTS via Helmet |
| CORS configuration | ✅ | ✅ | Origin allowlist from env |

---

## Audit & Compliance

| Feature | Auth0 | Sentry | Notes |
|---------|-------|--------|-------|
| Audit log (all auth events) | ✅ | ✅ | |
| Audit log streaming (webhooks / Splunk) | ✅ | 🔜 Sprint 4 | Webhook system planned |
| Log retention configuration | ✅ | ❌ | |
| GDPR: data export | ✅ | ✅ | `/api/audit/gdpr-export` |
| GDPR: right to erasure | ✅ | ✅ | `/api/audit/gdpr-delete` |
| GDPR: IP anonymization | ✅ | ✅ | GDPR_IP_SALT hashing |
| SOC 2 Type II | ✅ | ⚠️ | Architecture is SOC 2 ready; cert requires infra audit |
| HIPAA BAA availability | ✅ | ❌ | |
| PCI DSS | ❌ | ❌ | Neither handles card data |

---

## Extensibility & Hooks

| Feature | Auth0 | Sentry | Notes |
|---------|-------|--------|-------|
| Actions / post-login hooks | ✅ | ❌ | Planned (webhook system Sprint 4) |
| Pre-registration hooks | ✅ | ❌ | |
| Custom password hashing (migration hook) | ✅ | ❌ | |
| Webhooks | ✅ | 🔜 Sprint 4 | |
| Custom email templates | ✅ | ❌ | |
| Management API | ✅ | ✅ | Full REST API for all resources |
| Custom domains (vanity) | ✅ | ❌ | |
| Terraform provider | ✅ | ❌ | |
| Deploy CLI | ✅ | ❌ | |

---

## Developer Experience

| Feature | Auth0 | Sentry | Notes |
|---------|-------|--------|-------|
| TypeScript / browser SDK | ✅ | ✅ | `packages/sdk-typescript` |
| React SDK | ✅ | ✅ | `@scrolloop/sdk` |
| Next.js integration | ✅ | ✅ | |
| Node.js server SDK | ✅ | ✅ | `packages/sdk-node` |
| Vue SDK | ✅ | ⚠️ | Scaffolded, not complete |
| Angular SDK | ✅ | ⚠️ | Scaffolded, not complete |
| Go SDK | ✅ | ⚠️ | Scaffolded, not complete |
| Python SDK (Django/FastAPI/Flask) | ✅ | ⚠️ | Scaffolded, not complete |
| Java / Spring Boot SDK | ✅ | ⚠️ | Scaffolded, not complete |
| Ruby / Rack SDK | ✅ | ⚠️ | Scaffolded, not complete |
| Rust SDK | ✅ | ⚠️ | Scaffolded, not complete |
| Nginx / OpenResty SDK | ❌ | ⚠️ | Scaffolded — Sentry has coverage Auth0 lacks |
| Swagger / OpenAPI docs | ✅ | ✅ | NestJS Swagger wired |
| Local dev setup (Docker Compose) | ✅ | ✅ | postgres + redis + mailhog |
| Self-hosted option | ❌ | ✅ | Docker + Helm chart — key differentiator |
| Kubernetes Helm chart | ❌ | ✅ | `helm/` directory |

---

## Summary Scorecard

| Category | Auth0 | Sentry | Gap |
|----------|-------|--------|-----|
| Authentication methods | 13 | 8 | Apple, Twitter, SAML, SMS, LDAP |
| MFA | 10 | 5 | SMS, step-up, remember device, adaptive |
| Authorization | 9 | 7 | Direct permissions UI, ABAC UI |
| Token management | 9 | 7 | Custom claims, ID token spec, opaque |
| OAuth / OIDC | 11 | 7 | Device flow, PAR, consent, DCR |
| Tenant management | 9 | 6 | Custom domain, connections, tenant MFA policy |
| Session management | 8 | 5 | Idle timeout config, anomaly, back-channel logout |
| Security | 12 | 8 | Breach detection, anomaly, bot, IP lists |
| Audit & Compliance | 10 | 7 | Log streaming, retention, HIPAA |
| Extensibility | 9 | 2 | Actions/hooks, email templates, Terraform |
| Developer experience | 11 | 10 | SDK completeness, Terraform (Sentry ahead on self-host) |

**Overall:** Sentry covers ~65% of Auth0's surface area. Core auth, RBAC, multi-tenancy, and the security-critical paths are solid. Biggest gaps are extensibility (hooks/actions), advanced MFA options, and compliance tooling.

---

## Priority Gaps to Close (by Sprint)

### Sprint 4 (next)
- [ ] Webhook system → unblocks Actions, log streaming, Zapier
- [ ] SAML IdP (inbound) → enterprise requirement
- [ ] LDAP / Active Directory sync → enterprise requirement
- [ ] Audit log streaming (Splunk, Datadog, custom webhook)

### Sprint 5
- [ ] Custom email templates
- [ ] Consent screen for OAuth
- [ ] Tenant-level MFA enforcement policy
- [ ] Credential breach detection (HaveIBeenPwned integration)
- [ ] Remember-this-device for MFA

### Sprint 6
- [ ] Step-up authentication
- [ ] Adaptive MFA (risk signals: new device, new location, time-of-day)
- [ ] IP allow/deny lists per tenant
- [ ] Bot detection (Cloudflare Turnstile / hCaptcha)
- [ ] Custom domain per tenant (CNAME + TLS via Let's Encrypt)

### Long-term / differentiators
- [ ] Terraform provider
- [ ] Deploy CLI (`sentry deploy`)
- [ ] HIPAA BAA (requires infra audit)
- [ ] Complete all SDK packages (Vue, Angular, Go, Python, Java, Ruby, Rust)
