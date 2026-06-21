# TODO

---

## ✅ Completed — Sprint 4 (Sprints 3+4 UI + Backend)

### Sprint 4 Backend
- [x] Webhook system — BullMQ delivery, HMAC-SHA256 signing, 5-attempt retry schedule, SSRF protection
- [x] SAML 2.0 IdP — SP registration, IdP metadata endpoint, assertion generation (unsigned stub)
- [x] SCIM 2.0 server — Users + Groups CRUD + PATCH, Bearer token auth guard
- [x] LDAP sync — ldapjs client, AES-256-GCM bind passwords, search-and-upsert, scheduled sync
- [x] All 5 new DB tables added to tenant schema provisioning + Sprint4Tables migration

### Sprint 4 Frontend
- [x] `/t/[slug]/webhooks` — endpoint list, create, test, rotate secret, delivery log
- [x] `/t/[slug]/connections/saml` — SP registration, IdP metadata URL display
- [x] `/t/[slug]/connections/scim` — token lifecycle, SCIM base URL, copy-on-create
- [x] `/t/[slug]/connections/ldap` — connection config, test, sync-now, results dialog
- [x] All Sprint 4 React Query hooks wired in `lib/queries.ts`
- [x] Sprint 4 types in `lib/types.ts`

### Sprint 3 Bootstrap & Auth Flows
- [x] Login page — `getPostLoginRoute()` reads `tenantSlug` JWT claim → `/t/{slug}/dashboard`
- [x] `authClient.tenant` uses `NEXT_PUBLIC_SENTRY_TENANT_SLUG` (slug, not UUID)
- [x] Middleware fail-closed — auth service unreachable → `/error?reason=api_unavailable`
- [x] `GET /superadmin/platform-info` public endpoint
- [x] `tenantSlug` in every JWT payload
- [x] Seeder — platform tenant only, env-driven, no fake companies
- [x] CLI setup tool (`npm run setup`)
- [x] `GET /users/orgs` + TenantSwitcher component (org switcher in topbar)

### Login & MFA Flows (Gemini)
- [x] Login page & flow wired with rate-limit/error handling
- [x] MFA enrollment — TOTP setup, QR code, verify, backup codes download/copy
- [x] MFA verification during login — TOTP + backup code fallback
- [x] MFA wizard (5-step Microsoft-style)
- [x] MFA grace period gate + nudge banner
- [x] Trusted device management page (`/t/[slug]/security/devices`)
- [x] Passkey setup + management
- [x] Email OTP enrollment
- [x] Magic link login for unverified users (marks email verified on click)
- [x] `verifyMfaBackupLogin` in SDK React context

### Security Fixes (This Session)
- [x] SSRF — DNS fail-open removed (`.catch(() => [])` → throws)
- [x] SSRF — IPv4-mapped IPv6 bypass fixed (`::ffff:192.168.x` now caught)
- [x] SSRF — Redirect bypass fixed (`maxRedirects: 0` on axios webhook delivery)
- [x] XML injection — `xmlEsc()` applied to all SAML values; `validateSlug()` for tenant slugs
- [x] MFA grace period — moved from localStorage to server-side `mfa_grace_started_at` column
- [x] Rate-limit bypass — RFC1918 ranges removed; dev escape via `DISABLE_RATE_LIMIT=true` only
- [x] Leaked Supabase credentials — `list-users.js` deleted (was untracked, no git history)

---

## 🔜 Pending

### High Priority
- [ ] **SAML XML signing** — `// SPRINT_N: xmldsig signing` marker in `saml.service.ts`
  Assertions are built correctly but unsigned — real SPs will reject them.
  Requires: `xml-crypto` or `xmldsig` library, signing with tenant RSA key pair.

- [ ] **Superadmin console UI** (`/superadmin`) — backend is complete, no frontend page.
  Needs: platform metrics dashboard, tenant list+management, create-first-admin form.
  Backend: all endpoints in `superadmin-setup.controller.ts` + `admin.service.ts`.

- [ ] **Open PR** — `sprint-3-ui` → `main`. Branch is clean, all security issues resolved.

- [ ] **Rotate Supabase credentials** — `list-users.js` contained a plaintext connection string.
  Even though untracked, the password should be rotated:
  Supabase Dashboard → Project Settings → Database → Reset Database Password.

### Medium Priority
- [ ] **`DISABLE_RATE_LIMIT=true`** — add to `.env.example` with danger comment.

- [ ] **Run migration `1910000000000-AddMfaGraceStartedAt`** — adds `mfa_grace_started_at`
  to users table in all tenant schemas. Must run before deploying MFA grace changes.

- [ ] **Login loop bug** (Gemini session flagged as in-progress) — "login is not working now,
  even after authenticator, error messages are not shown and it loops". Needs investigation.

- [ ] **Invite accept page** (`/invite/[token]`) — directory exists, likely a stub. Verify and wire.

### Low Priority / Sprint 5
- [ ] **SDK publishing** — npm publish for `@scrolloop/sdk`, `@scrolloop/sdk-node`, etc.
- [ ] **SDK docs** — wire into Fumadocs site at `apps/docs/`
- [ ] **Email templates** — production-grade HTML for invite, magic link, password reset
- [ ] **Helm chart hardening** — production values, secrets as K8s Secrets, HPA
- [ ] **SCIM pagination** — currently returns all results; needs `startIndex`/`count` params
- [ ] **LDAP scheduled sync** — BullMQ cron job wired to `syncSchedule` cron string
- [ ] **Webhook redeliver UI** — redeliver button on failed deliveries in webhook delivery panel
- [ ] **Audit log export** (GDPR) — `GET /audit/export` endpoint exists; needs frontend trigger
