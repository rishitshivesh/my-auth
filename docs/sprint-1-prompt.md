The repo isn't publicly indexed. That's fine — I have enough context from our previous Fort Knox work to craft a devastating, thorough prompt. Here's the Claude Code prompt:

```
# Fort Knox Auth Platform — Full Audit, Gap Analysis & Completion Plan

You are performing a **brutal, zero-mercy technical audit** of this repository. This is an Auth0 competitor — a multi-tenant authentication platform with enterprise-grade RBAC, session management, MFA, user management, and SDKs for every major language/framework. Your job is to read everything, understand the intended architecture, and produce a comprehensive audit report. **No code changes yet. Analysis and planning only.**

---

## PHASE 1: REPO DISCOVERY

Start by mapping the full repository structure:

```bash
find . -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.json" -o -name "*.yaml" -o -name "*.yml" -o -name "*.env*" -o -name "*.prisma" -o -name "*.sql" \) \
  ! -path "*/node_modules/*" ! -path "*/.next/*" ! -path "*/dist/*" | sort

```

Then read every file. Group them mentally into:

* Core auth server (NestJS backend)
* Frontend / admin dashboard (Next.js)
* SDK packages
* Database schema / migrations
* Config / env / Docker / CI
  PHASE 2: AUDIT DIMENSIONS
  For each dimension below, be ruthless. Rate every section as: ✅ SOLID / ⚠️ SHAKY / ❌ BROKEN / 🗑️ DEAD CODE
  2.1 — Authentication Core
  Audit the full auth flow end-to-end:

* Password auth: Is bcrypt/argon2 used correctly? Are there timing-safe comparisons? Salt rounds? Raw password ever logged or returned?
* JWT strategy: Access token + refresh token — are they separate? Are they short-lived (access ≤15min)? Are refresh tokens stored and rotatable? Are they httpOnly cookies or Authorization headers? Is there a serialized refresh lock to prevent race conditions on concurrent refresh?
* Session management: Is session state server-side or stateless? If Redis is used, what's the TTL strategy? Is session invalidation (logout, password change, MFA enable) handled properly — does it nuke all sessions or just the current one?
* Token rotation: On refresh, is the old token invalidated? Is there a refresh token family/chain to detect reuse attacks?
* OAuth2 / Social login: Which providers are wired up? Is state parameter validated? Is PKCE used? Are tokens stored securely post-OAuth?
* Magic link / passwordless: Is there an implementation? Is the token single-use? TTL?
  2.2 — MFA (Multi-Factor Authentication)
  This was broken last time. Audit every line:

* TOTP (Google Authenticator style): Is `speakeasy` or `otplib` used? Is the secret encrypted at rest? Is the QR code generation correct? Is the window tolerance set (1 step back allowed)? Is there a backup code system? Are backup codes hashed?
* Enrollment flow: Can a user enroll MFA? Is there a confirmation step (verify before enabling)? What happens if they lose their device?
* Enforcement flow: After password auth passes, is MFA challenge correctly gated before issuing JWT? Or is the JWT issued before MFA is complete (critical bug)?
* Recovery: Is there a recovery code flow? Are codes single-use?
* Admin bypass / reset: Can superadmin reset MFA for a user?
* MFA per tenant: Can tenants enforce MFA for all their users?
  2.3 — RBAC & Authorization (Target: AWS IAM-level)
  This needs to be enterprise-grade. Audit what exists and identify every gap vs. the target:
  Target model:

* Tenants → Groups/Roles → Users
* Policies: JSON-document style (like AWS IAM), support `Allow` and `Deny`, with `Deny` always winning
* Resources: namespaced (e.g., `fortkn:resource:users:*`, `fortkn:resource:audit:read`)
* Actions: CRUD + custom (e.g., `users:create`, `audit:read`, `mfa:enforce`)
* Conditions: IP range, time-of-day, MFA-required, device-trust
* Policy attachment: to users directly OR to groups/roles, OR inline on a resource
* Permission boundary: max permissions a role can grant (like IAM permission boundary)
  Audit:

* Does a `Policy` entity exist in the schema?
* Is there an `Effect: Allow | Deny` field?
* Is there `Principal`, `Action`, `Resource`, `Condition` in the policy document?
* Is policy evaluation logic implemented (does Deny override Allow)?
* Is wildcard matching implemented (`users:*`, `*`)?
* Are group memberships respected in policy evaluation?
* Is there a middleware/guard that actually enforces RBAC on routes?
* Are there hardcoded role checks (`if role === 'admin'`) that bypass the policy engine?
* Is RBAC enforced at the tenant level (tenant isolation)?
  2.4 — User Management (Target: Active Directory-level)
  Target model:

* Users belong to one or more tenants
* Users have profiles (email, phone, metadata, avatar, status: active/suspended/pending)
* Users can be in groups/OUs (Organizational Units)
* Password policies per tenant (min length, complexity, expiry, history/reuse prevention)
* Account lockout (failed attempts → lock → unlock via email or admin)
* User provisioning: invite flow, SCIM-compatible structure (for enterprise SSO)
* User lifecycle: invite → activate → active → suspended → deleted (soft delete)
* Audit trail: every change to a user is logged with actor, timestamp, diff
* Admin can impersonate users (with audit log)
* Bulk operations: import users via CSV
  Audit:

* What's the current User entity? What fields exist?
* Is there a `status` field with a proper enum lifecycle?
* Is there a `PasswordHistory` table to prevent reuse?
* Is account lockout implemented? (`failedAttempts`, `lockedUntil`)
* Is there an invite/activation flow or just direct registration?
* Are users properly scoped per tenant (no cross-tenant data leakage)?
* Is there a user metadata / custom attributes store?
* Is there an audit log entity at all?
  2.5 — Tenant Architecture & Isolation

* Is slug-based tenant routing implemented correctly?
* Is there a `tenantId` on every sensitive entity (users, sessions, policies, audit logs)?
* Can a request from Tenant A ever accidentally read Tenant B's data? Audit all repository queries — are they ALL filtered by `tenantId`?
* Is there a superadmin concept that can cross tenants?
* Is the tenant onboarding flow complete? (create tenant → configure → add users → configure branding)
* Is there per-tenant branding/config (login page customization, allowed callback URLs, CORS, token lifetimes)?
* Is there a tenant-level feature flag system (e.g., "MFA enforcement on/off per tenant")?
  2.6 — Frontend / Admin Dashboard Audit
  Be maximally brutal here. Look at every page and component:

* Is there proper form validation (client + server)?
* Are there raw unprotected API calls (no auth headers)?
* Are there hardcoded values (URLs, secrets, tenant IDs)?
* Is error handling present or are there silent failures / empty catch blocks?
* Is loading state handled or does the UI just hang?
* Are there `any` types used where proper types should be?
* Are there components that never get mounted (dead routes)?
* Is there proper redirect after login (no infinite redirect loops)?
* Is the session expiry handled gracefully on the frontend (token refresh → retry vs. logout)?
* Is there a superadmin portal separate from the tenant admin portal?
* Is the login UI functional end-to-end (form → API → JWT → redirect)?
* Is the MFA enrollment UI actually wired to the backend?
* Is React Query used or are there bare `useEffect` + `useState` data-fetching patterns?
* Are there layout/route protection issues (pages accessible without auth)?
  2.7 — SDK Audit
  Target: SDKs that work in: Node.js, Browser (React/Vue/Angular/Vanilla), Java, Go, Ruby, Rust, Nginx (via JWT validation module or Lua).
  What exists currently? Audit the package(s):

* Is there a clear SDK package in the monorepo?
* What does it expose? (login, logout, getToken, refreshToken, hasPermission, getUser)
* Is the token refresh logic in the SDK?
* Is there an interceptor pattern (for axios/fetch) to auto-refresh?
* Is there framework adapters (React context, Vue plugin, Angular module)?
* Is it publishable (correct `package.json`, `exports` field, ESM + CJS builds)?
* What's missing vs. Auth0's SDK surface area?
  List the SDKs that need to be built from scratch. For each target language/runtime, note what the SDK must do:

* Node.js (server): verify JWT, protect routes, SDK for NestJS guard, Express middleware, Fastify plugin
* Browser: login redirect, token storage (memory, not localStorage), silent refresh, React hook, Vue composable, Angular guard
* Java: Spring Security integration, JWT verifier
* Go: middleware, JWT validation
* Ruby: Rack middleware, Devise-compatible
* Rust: Axum/Actix middleware
* Nginx: `auth_request` endpoint or OpenResty Lua JWT validation
  2.8 — Security Audit

* Are there any SQL injection vectors (raw queries without parameterization)?
* Is CORS configured properly (no wildcard in production)?
* Is rate limiting on auth endpoints (login, token, MFA)?
* Is there brute force protection on login?
* Are secrets in `.env` files committed to the repo? (check `.gitignore`)
* Is there CSRF protection on cookie-based auth?
* Is PII (emails, names) logged anywhere?
* Are JWTs verified on every protected route?
* Is there a public key endpoint (`/.well-known/jwks.json`) for external JWT verification?
* Is `kid` (key ID) in the JWT header for key rotation support?
  2.9 — Dead Code & Technical Debt

* List every file/module that is imported nowhere
* List every TODO/FIXME/HACK comment
* List every `console.log` left in production code
* List every empty controller/service method
* List every unused database column or entity
* List every commented-out block that's more than 5 lines
  2.10 — Infrastructure & Deployment

* Is there a `docker-compose.yml` for local dev?
* Is there a production Dockerfile?
* Is there a CI pipeline (GitHub Actions / Azure DevOps)?
* Is there a database migration strategy (not just `synchronize: true` in TypeORM)?
* Is Redis configured for production (TLS, AUTH)?
* Is there a health check endpoint?
* Is there observability (structured logging, tracing, metrics)?
  PHASE 3: REPORT FORMAT
  Produce the report in this exact structure:

```
# FORT KNOX AUDIT REPORT

## EXECUTIVE SUMMARY
[3-5 sentences: overall health, biggest risk, readiness to ship]

## WHAT'S ACTUALLY GOOD ✅
[List of things that are well-implemented. Be honest — if something is solid, credit it.]

## DEAD CODE 🗑️
[File by file list of unused code, dead routes, orphaned modules]

## SHAKY BUT FIXABLE ⚠️
[Things that work but are fragile, incomplete, or wrong in edge cases]

## CRITICAL BROKEN THINGS ❌
[Blockers. Things that would cause security incidents, data loss, or total failure in prod.]

### MFA SPECIFIC BUGS
[Exact file + line where MFA is broken and why]

### FRONTEND SPECIFIC ISSUES
[Component by component breakdown of shitty FE code]

### RBAC GAPS VS IAM TARGET
[Exact list of what's missing to reach AWS IAM-level policy engine]

### USER MANAGEMENT GAPS VS ACTIVE DIRECTORY TARGET
[Exact list of what's missing]

### SDK GAPS
[What SDKs exist, what's missing, what's broken in the current SDK]

## SECURITY VULNERABILITIES
[Ranked by severity: CRITICAL / HIGH / MEDIUM / LOW]

## ARCHITECTURE DECISIONS TO REVISIT
[Things that technically work but will cause pain at scale or will block enterprise features]

## COMPLETION ROADMAP (PHASES)
Phase 1 — Critical fixes (security + MFA) [estimated scope]
Phase 2 — RBAC engine rewrite to IAM model [estimated scope]
Phase 3 — User management to AD model [estimated scope]
Phase 4 — SDK suite (all languages) [estimated scope]
Phase 5 — Frontend rewrite / polish [estimated scope]
Phase 6 — Enterprise features (SCIM, SAML, SSO) [estimated scope]

## OPEN QUESTIONS FOR RISHIT
[Things you couldn't determine from code alone — decisions that need to be made]

```

CONSTRAINTS

* Do NOT make any code changes
* Do NOT run `npm install` or start the server
* Do NOT skip any file — read everything
* If a file is empty or has only boilerplate, say so explicitly
* If you find a security vulnerability, name it precisely (e.g., "TOTP JWT issued before MFA challenge verified — JWT escape vulnerability")
* Be as specific as possible: file names, line numbers, function names
* Assume the target is Auth0 + AWS IAM + Active Directory combined into one product. Measure every gap against that bar.