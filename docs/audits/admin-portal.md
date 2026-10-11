# Admin Portal Frontend Audit

**Date:** 2026-03-18
**Scope:** `apps/admin-portal`
**Auditor:** Claude Code

---

## 1. Routing Structure

### Root-level Routes (`app/`)

| Route | Component Type | API Calls | Notes |
|---|---|---|---|
| `/` | Client | None | Landing page, static marketing content |
| `/u/login` | Client | `authClient.request()` for login | Step-based auth flow |
| `/u/signup` | Client | None (stub) | Name, email, password fields |
| `/u/mfa` | Client | `verifyMfaLogin()` | Reads `_fk_mfa_temp_token` from sessionStorage |
| `/u/magic-link` | Client | `verifyMagicLink()` | Redirects to `/dashboard` on success |
| `/u/reset-password` | Client | None (stub) | Password reset form |
| `/u/auth/callback` | — | — | Empty file |
| `/auth/callback` | — | — | Empty file |
| `/onboarding/create-tenant` | Client | None (stub) | Tenant creation form |
| `/onboarding/country` | — | — | Empty file |

### Dashboard Routes (`app/dashboard/`)

**Layout:** `app/dashboard/layout.tsx` — Client Component with auth guard. Redirects to `/u/login` if `!user`.

| Route | Component Type | API Calls |
|---|---|---|
| `/dashboard` | Client | `useDashboard()` |
| `/dashboard/applications` | Client | None (empty state placeholder) |
| `/dashboard/profile` | Client | `useAuth()` for user data |
| `/dashboard/security` | Client | None (mock data only) |
| `/dashboard/settings` | Client | None (stub) |
| `/dashboard/settings/security` | Client | `useMfaStatus()`, `useListPasskeys()`, `useDeletePasskey()` |

### Tenant Portal Routes (`app/t/[slug]/`)

**⚠ CRITICAL:** No `layout.tsx` exists at this route segment — zero layout-level tenant isolation.

| Route | Component Type | API Calls |
|---|---|---|
| `/t/[slug]/dashboard` | Client | `useTenantMetrics()`, `useTenantActivity()`, `useApiCallTrend()` |
| `/t/[slug]/applications` | Client | None (mock data) |
| `/t/[slug]/connections` | Client | None (mock data) |
| `/t/[slug]/branding` | Client | `useBranding()`, `useUpdateBranding()`, `useUploadLogo()` |
| `/t/[slug]/security` | Client | None (mock data) |
| `/t/[slug]/settings` | Client | None (stub) |

---

## 2. Component Inventory

### `components/auth/`

| Component | Purpose | Data Source |
|---|---|---|
| `step-based-auth-flow.tsx` | Multi-step auth dispatcher | Props |
| `email-step.tsx` | Email input step | Props |
| `credentials-step.tsx` | Email + password entry | Props |
| `method-selection-step.tsx` | Choose auth method | Props |
| `mfa-challenge.tsx` | MFA code input | Props |
| `mfa-method-selector.tsx` | Select MFA method | Props |
| `advanced-mfa-challenge.tsx` | Advanced MFA UI | Props |
| `totp-setup.tsx` | TOTP QR code setup | Props |
| `magic-link-form.tsx` | Magic link request | Props |
| `reset-password-form.tsx` | Password reset | Props |
| `verify-email-form.tsx` | Email verification | Props |
| `passkey-login-button.tsx` | Passkey login trigger | Props + SDK |
| `passkey-register-modal.tsx` | Passkey registration | Props + SDK |
| `multi-option-login.tsx` | Dispatcher for login methods | Props |
| `enhanced-password-input.tsx` | Password field with strength meter | Props |
| `login-form.tsx` | Email/password + social | Props |
| `signup-form.tsx` | Full registration form | Props |

### `components/portal/`

| Component | Purpose | Data Source |
|---|---|---|
| `sidebar.tsx` | Collapsible nav sidebar | Props: items, currentPath, collapsed, logoUrl, tenantName |
| `topbar.tsx` | Header with title and actions | Props |
| `applications-table.tsx` | Paginated app list | **Hardcoded mock data** |
| `connections-list.tsx` | OAuth/SAML connections | **Hardcoded mock data** |
| `mfa-settings.tsx` | MFA method toggles | Props |
| `audit-log-list.tsx` | Audit event display | Props |
| `active-sessions.tsx` | Session management | Props |
| `trusted-device-card.tsx` | Device trust card | Props |
| `user-menu.tsx` | User dropdown | Props + `useAuth()` |
| `tenant-switcher.tsx` | Tenant selection | Props |
| `status-badge.tsx` | Status indicator | Props |

### `components/layouts/`

| Component | Purpose | Notes |
|---|---|---|
| `portal-layout.tsx` | Tenant portal wrapper | **BUG: Uses mock tenant state; no tenant validation** |
| `universal-auth-layout.tsx` | Auth pages wrapper | Props: logoUrl, primaryColor, etc. |
| `onboarding-layout.tsx` | Onboarding wrapper | Props |
| `public-layout.tsx` | Public pages wrapper | Props |

### `components/branding/`, `components/inputs/`, `components/onboarding/`, `components/dashboard/`

Standard presentational components. All Client Components. Props-driven.

---

## 3. Data Fetching Patterns

**Library:** React Query v5 (TanStack Query)

**Config** (`app/layout.tsx`):
```typescript
new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } } })
```

**All query/mutation hooks** are centralized in `src/lib/queries.ts`:

| Hook | Endpoint | HTTP |
|---|---|---|
| `useDashboard()` | `/dashboard` | GET |
| `useMfaStatus()` | `/mfa/status` | GET |
| `useSetupTotp()` | `/mfa/setup/totp` | POST |
| `useVerifyTotp()` | `/mfa/verify/totp` | POST |
| `useDisableTotp()` | `/mfa/totp` | DELETE |
| `useTenantSettings()` | `/dashboard/tenant-settings` | GET |
| `useUpdateTenantSettings()` | `/dashboard/tenant-settings` | PATCH |
| `useUpdateSocialProvider()` | `/dashboard/tenant-settings/social/:provider` | PATCH |
| `useListPasskeys()` | SDK: `authClient.listPasskeys()` | — |
| `useDeletePasskey()` | SDK: `authClient.deletePasskey()` | — |
| `useSocialConnections()` | SDK: `authClient.getSocialConnections()` | — |
| `useUnlinkSocialAccount()` | SDK: `authClient.unlinkSocialAccount()` | — |
| `useTenantMetrics()` | `/dashboard/tenant-metrics` | GET |
| `useTenantActivity()` | `/dashboard/tenant-activity?limit=N` | GET |
| `useApiCallTrend()` | `/dashboard/api-call-trend?days=N` | GET |
| `useAuthBreakdown()` | `/dashboard/auth-breakdown` | GET |
| `useBranding()` | `/tenants/current/branding` | GET |
| `useUpdateBranding()` | `/tenants/current/branding` | PUT |
| `useUploadLogo()` | `/tenants/current/branding/logo` | POST (raw fetch + FormData) |

All authenticated calls go through `authClient.request()` which injects auth headers and manages token refresh. The logo upload is the only raw `fetch()` call outside the SDK.

---

## 4. State Management

**No global state library.** Pattern is:

- **React Query** — server/async state (data, loading, errors)
- **`useState`** — local UI state (forms, modals, toggles)
- **`useAuth()` from `@fortknox/sdk`** — session state (user, isLoading, client methods)
- **`sessionStorage`** — MFA temp token (`_fk_mfa_temp_token`)

No Zustand, Jotai, Redux, or React Context found.

---

## 5. Form Handling

**Pattern:** Manual `useState` + `onChange` handlers. No form library.

**Example** (`/t/[slug]/branding/page.tsx`):
```typescript
const [form, setForm] = useState<Partial<BrandingConfig>>({})
<Input
  value={form.logoUrl ?? ""}
  onChange={(e) => setForm((p) => ({ ...p, logoUrl: e.target.value }))}
/>
async function handleSave() {
  await updateBranding.mutateAsync(form)
}
```

No react-hook-form, Formik, or zod validation integration.

---

## 6. Toast / Notification System

**Pattern:** **Custom inline `Toast` component** — not sonner, react-hot-toast, or shadcn/ui toast.

Implementation is duplicated per page:
```typescript
function Toast({ message, kind }: { message: string; kind: "success" | "error" }) {
  return (
    <div role="alert" className={`fixed bottom-6 right-6 z-50 ...`}>
      {kind === "success" ? "✓" : "✕"} {message}
    </div>
  )
}
```

3-second auto-dismiss via `setTimeout` + useState. No global toast registry.

---

## 7. Modal Pattern

**Pattern:** Custom inline overlay div. No Dialog from shadcn/ui.

```typescript
{showNameModal && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
    <div className="w-full max-w-sm rounded-xl border border-border bg-background p-6 shadow-xl">
      ...
    </div>
  </div>
)}
```

State toggle via `useState(false)`. No React Portal. Rendered inline in JSX tree.

---

## 8. Navigation / Layout

**Root Layout** (`app/layout.tsx`) — Client Component:
- Initializes `FortKnoxClient` (SDK)
- Wraps with `QueryClientProvider`, `FortKnoxProvider`, `ThemeProvider`

**Dashboard Layout** (`app/dashboard/layout.tsx`):
- Auth guard: `if (!user) router.push('/u/login')`
- Skeleton loading while `isLoading`

**Portal Layout** (`components/layouts/portal-layout.tsx`):
- Wraps `/t/[slug]/*` pages via import (NOT a file-based `layout.tsx`)
- Provides sidebar + topbar
- **⚠ Does NOT validate `tenantSlug` prop against authenticated user's tenantId**

**⚠ No file-based `app/t/[slug]/layout.tsx` exists.**

---

## 9. Design Tokens

- **Tailwind CSS** via `@repo/ui` shared package
- **CSS custom properties** set at runtime for tenant branding:
  ```typescript
  root.style.setProperty("--brand-primary", branding.primaryColor)
  root.style.setProperty("--brand-font", branding.fontFamily)
  ```
- **Semantic tokens:** `bg-background`, `text-foreground`, `border-border`, `bg-card`, `text-muted-foreground`, `bg-primary`
- **Dark mode:** Class-based (`dark:` prefix used throughout)
- No `tailwind.config.ts` in `admin-portal` itself; config lives in `@repo/ui`

---

## 10. Missing Pages

| Route | Exists? | Status |
|---|---|---|
| `/t/[slug]/dashboard` | ✅ | Implemented |
| `/t/[slug]/users` | ❌ | **MISSING** |
| `/t/[slug]/providers` | ❌ | **MISSING** |
| `/t/[slug]/audit-logs` | ❌ | **MISSING** |
| `/t/[slug]/billing` | ❌ | **MISSING** |
| `/t/[slug]/team` | ❌ | **MISSING** |
| `/t/[slug]/branding` | ✅ | Implemented |
| `/t/[slug]/api-keys` | ❌ | **MISSING** |
| `/t/[slug]/applications` | ✅ | Implemented (mock data) |
| `/t/[slug]/applications/new` | ❌ | **MISSING** |
| `/login` | ❌ | Exists as `/u/login` |
| `/login/mfa` | ❌ | Exists as `/u/mfa` |
| `/login/magic-link-sent` | ❌ | **MISSING** |

**9 of 13 expected routes are missing.**

---

## 11. Tenant Isolation Audit

### a) JWT / Session Claim

**Claim field:** `tenantId`

**Set in:** `apps/auth-service/src/modules/auth/auth.service.ts`
```typescript
const accessToken = this.jwtService.sign({
  sub: user.id,
  email: user.email,
  tenantId: data.tenantId,   // ← present in every access token
  sessionId: session.id,
}, { secret: ..., expiresIn: "15m" })
```

**Validated by:** `JwtStrategy` — throws `UnauthorizedException` if `tenantId` is absent from payload.

**Status:** ✅ tenantId is always present and validated on every authenticated request.

---

### b) Layout-Level Guard

**File:** `apps/admin-portal/src/app/t/[slug]/layout.tsx`

**Status:** ❌ **FILE DOES NOT EXIST**

No code compares `params.slug` against the authenticated user's `tenantId` claim at the layout level. A user can navigate to any `/t/<any-slug>/` path and the page will render and begin making API calls.

---

### c) Middleware Guard

**File:** `apps/admin-portal/middleware.ts`

**Status:** ❌ **FILE DOES NOT EXIST**

No Next.js middleware intercepts requests to `/t/[slug]/*`. There is zero frontend request-level validation.

---

### d) API-Level Guard

**Guard file:** `apps/auth-service/src/common/guards/tenant-binding.guard.ts`

`TenantBindingGuard` enforces tenant isolation on all protected API routes:
```typescript
if (tokenTenantId !== requestTenantId) {
  this.logger.warn("Tenant binding violation detected", {
    userId: user.sub,
    tokenTenant: tokenTenantId,
    requestTenant: requestTenantId,
    ip: request.ip,
    path: request.path,
  });
  throw new ForbiddenException("Token is not valid for this tenant");
}
```

Applied via `@UseGuards(JwtAuthGuard, TenantBindingGuard)` on protected controllers.

**Status:** ✅ API-level protection is present and enforced.

---

### e) Cross-Tenant URL Test

**Scenario:** User A (tenant: `acme-corp`) navigates to `/t/stark-ind/dashboard`

| Layer | Protection | Result |
|---|---|---|
| Frontend layout | ❌ NONE | Page renders and starts loading |
| Next.js middleware | ❌ NONE | Request passes through |
| API call | ✅ TenantBindingGuard | 403 Forbidden on data fetch |

**Verdict:** ⚠ **INSUFFICIENT** — Frontend-only protection is absent. API will reject the data request, but the UI renders a loading state for an unauthorized route before the 403 returns. Backend guard is necessary but not sufficient for a secure UX.

---

### f) Multi-Application Access

**Route:** `/t/[slug]/applications/[appId]`

**Status:** Route does not exist. `ApplicationsTable` uses hardcoded mock data with no real loading. Application ownership validation cannot be assessed — no implementation exists yet.

**When implemented:** The backend must validate that the `appId` belongs to the tenant in the JWT before returning any data. This check must live in the OAuth client controller, not in the frontend.

---

### g) Super-Admin vs Tenant-Admin

**JWT payload:** Contains `sub`, `email`, `tenantId`, `sessionId`. **No `role` claim.**

**Frontend:** No role checks in any component or page.

**Backend:** `TenantBindingGuard` exists but no `SuperAdminGuard` or equivalent found.

**Status:** ❌ **NO ROLE DISTINCTION IMPLEMENTED.** There is currently no mechanism to distinguish a Fort Knox super-admin (who can view all tenants) from a tenant-admin. This must be addressed before any admin-only routes are exposed.

---

### h) Session Scope

**JWT:** Contains a single `tenantId` — session is scoped to one tenant at a time.

**SDK initialization** (`app/layout.tsx`):
```typescript
export const authClient = createWebClient({
  baseURL: "http://localhost:4000",
  tenant: "220bea14-69ca-420f-a8a2-d017e600ea4b",  // ⚠ HARDCODED UUID
  debug: true,
})
```

**Tenant switching:** `PortalLayout` has a mock `setCurrentTenant()` state call that changes the displayed tenant name but does **not** re-initialize the SDK client, does **not** re-authenticate, and does **not** re-issue a token for the new tenant.

**Status:** ⚠ **Session is single-tenant. Tenant switching UI is a stub that does nothing meaningful.** Proper switching would require logout → re-auth with new tenant context, or issuance of a new tenant-scoped token.

---

## 12. Token Storage and Transmission

**Storage:**
- Access token: `httpOnly` cookie (auto-sent by browser)
- MFA temp token: `sessionStorage` key `_fk_mfa_temp_token`

**Transmission:**
- SDK transport uses `fetch` with `credentials: 'include'` — cookies sent automatically
- Authorization header also supported (Bearer scheme)

**tenantId transmission:**
- Encoded in JWT claim — **not** sent in request body or query params
- `TenantResolverMiddleware` on the auth-service extracts tenantId from `X-Tenant-ID` header or subdomain, then cross-verifies against JWT in `TenantBindingGuard`

**Security assessment:**
- ✅ tenantId is not trusted from client request body
- ✅ Token is httpOnly (not accessible from JS)
- ⚠ Logo upload uses raw `fetch()` instead of SDK — verify it sends credentials correctly
- ⚠ SDK initialized with a hardcoded tenant UUID — multi-tenant deployment will break

---

## 13. SDK Usage

**Pattern:** ✅ Consistent SDK usage for all authenticated calls via `authClient.request()`.

**Exceptions:**
1. `useUploadLogo()` — raw `fetch()` with `credentials: 'include'`. Should use SDK transport.
2. Login page branding fetch — raw `fetch()` with `cache: 'no-store'`. Acceptable (public, unauthenticated).

**Critical bug:** SDK is initialized with a hardcoded tenant UUID. Should be dynamic (resolved from session, subdomain, or environment variable per deployment).

---

## 14. Code Modularity

**Rule for all future code:** Pages must import logic from components, hooks, or SDK. No inline business logic, state machines, or data processing in page files.

**Current violations:**
- `/t/[slug]/branding/page.tsx` — 250 lines with form state, file upload, toast, and preview all inline. Should be `<BrandingForm>` + `useBrandingForm()` hook.
- `/dashboard/page.tsx` — 175 lines with stats arrays and color utility functions inline.
- `/dashboard/settings/security/page.tsx` — 270 lines with passkey registration state machine inline.
- `applications-table.tsx` and `connections-list.tsx` — hardcoded mock arrays should be in `/lib/mocks/` or removed.
- `portal-layout.tsx` — hardcoded mock tenant list in component state.

**Required pattern for all new pages:**
```
page.tsx → imports <FeatureView> from components/feature/
         → imports useFeatureData() from lib/queries.ts
         → imports useFeatureForm() from lib/hooks/ (if form)
         → page file is ≤ 40 lines
```

---

## Summary

### Security Issues (Ordered by Severity)

| # | Issue | Severity | Fix Required |
|---|---|---|---|
| 1 | No `app/t/[slug]/layout.tsx` tenant guard | HIGH | Add layout with slug ↔ JWT comparison |
| 2 | No `middleware.ts` tenant check | HIGH | Add Next.js middleware for `/t/*` routes |
| 3 | SDK initialized with hardcoded tenant UUID | HIGH | Resolve tenant dynamically |
| 4 | No role distinction (super-admin vs tenant-admin) | HIGH | Add role claim to JWT + guards |
| 5 | Tenant switcher UI is non-functional | MEDIUM | Implement proper re-auth or remove |
| 6 | Logo upload bypasses SDK transport | LOW | Use `authClient.request()` for multipart |

### Functional Gaps

- 9 of 13 expected pages are missing
- All existing tenant portal pages use mock/stub data
- No form validation library (react-hook-form recommended)
- Toast system is duplicated per page (consolidate into shared hook)
- Modal system is ad-hoc (adopt shadcn/ui Dialog)
