# Session Audit — 2026-06-17

## Objective

Fix all type/reference errors in the monorepo so `yarn build` passes cleanly.
Previously: repo did not build at all.

---

## Errors Fixed

### `apps/auth-service` — TypeScript (`tsc --noEmit`)

| File | Error | Fix |
|------|-------|-----|
| `admin.service.ts:462-468` | `{}` not assignable to `string`/`boolean` — `stored.*` is `unknown` | Cast each field: `(stored.x as string \| undefined) ?? default` |
| `admin.controller.ts:98` | Return type uses unexported `RecentActivityItem` | Added `export` to the interface |
| `auth.controller.ts:385-391` | `session` possibly `undefined` | `session ? { ...fields } : null` |
| `auth.controller.ts:666` | `Record<string,unknown>` not assignable to `AuthenticationResponseJSON` | `dto.response as unknown as AuthenticationResponseJSON` |
| `mfa.controller.ts:343` | `WebAuthnRegistrationResponse` missing `clientExtensionResults` vs `RegistrationResponseJSON` | Added `clientExtensionResults?: Record<string,unknown>` to interface; cast via `unknown` |
| `oauth.controller.ts:278,287,296,361,446` | Local `OAuthClient` interface (with index signature) clashing with `@repo/database` entity (no index signature) | Removed local interface; imported entity from `@repo/database` |
| `oauth.controller.ts:493` | `user.email` is `string \| undefined`, DTO expects `string` | `user.email ?? ''` |
| `oauth.controller.ts:569` | `introspectToken()` returns `Record<string,unknown>`, method return type is `IntrospectTokenResponseDto` | Cast `as unknown as Promise<IntrospectTokenResponseDto>` |
| `oauth-token.service.ts:80` | `expiresIn: string \| number` not assignable to `StringValue \| number` | Added `import type { StringValue } from 'ms'`; export private key as PEM; cast `expiresIn as StringValue` |
| `oauth-token.service.ts:308,681` | `publicKey: KeyObject` not assignable to `string \| Buffer` in `jwtService.verify()` | `publicKey.export({ type: 'spki', format: 'pem' }) as string` |
| `oauth-token.service.ts:686` | `jti: unknown` used as `BinaryLike` in `crypto.createHash` | `payload.jti as string` |
| `rbac/policy-evaluation.service.ts:174,177` | `rangeStr`/`bitsStr` from `cidr.split('/')` may be `undefined` | Added `if (!rangeStr \|\| !bitsStr) return false` guard |
| `session.controller.ts:111` (×2) | `req.user.sessionId` is `string \| undefined` | `req.user.sessionId ?? ''` |
| `social-auth.controller.ts:55-60` | `privateKey as string` (KeyObject) + `expiresIn as string` (not StringValue) | PEM export + `StringValue` cast — same pattern as oauth-token |
| `social-auth.controller.ts:200` | `SocialProfile` not assignable to `Record<string,unknown> & {...}` | `req.user as unknown as Record<string,unknown> & {...}` |
| `social-auth.controller.ts:258` | `req.ip` is `string \| undefined` | `req.ip ?? '0.0.0.0'` |
| `social-auth.controller.ts:310` | `publicKey as string` (KeyObject) | PEM export |
| `social-auth.controller.ts:362` | `req.user.tenantId` doesn't exist on `AuthenticatedRequest.user` | Changed to `req.tenantId` (top-level on request) |
| `tenant-branding.controller.ts:78,137` | `req.headers` possibly `undefined` | `req.headers?.['user-agent'] ?? 'unknown'` |
| `user.controller.ts:210-215, 262-267` | `ListUsersQueryDto & { createdAfter?: Date }` creates `string & Date` intersection | Replaced with `ListUsersOptions` type from `user.service.ts` |

### `packages/sdk-typescript` — DTS Build

| File | Error | Fix |
|------|-------|-----|
| `src/web/index.ts:83` | `client` parameter declared but never read (TS6133) | Renamed to `_client` |

### `apps/admin-portal` — Module Resolution

| Issue | Fix |
|-------|-----|
| `@scrolloop/sdk` not found (no workspace symlinks) | Ran `yarn install` to materialize workspace package links |

### `apps/admin-portal` — Next.js 15 Prerender Errors

| Page | Error | Fix |
|------|-------|-----|
| `/u/auth/callback` | `useSearchParams()` must be in Suspense boundary | Wrapped inner component with `<Suspense>` in default export |
| `/u/magic-link` | Same | Same |
| `/u/login` | `useSearchParams` imported but never used | Removed dead import |
| `/tenants` | `useSearchParams()` without Suspense (via `withAdmin`) | Added `TenantsPageWithSuspense` wrapper with `<Suspense>` |

---

## Build Result

```
Tasks:    6 successful, 6 total
Cached:    5 cached, 6 total
Time:    7.811s
```

All packages compile clean. Zero errors.

---

## Pending Work (Phase 1 + 2 from invite feature plan)

### Phase 1 — Backend (zero invite infrastructure exists)

1. `packages/database/src/entities/user-invite.entity.ts` — new entity with: `tenantId`, `tenantName`, `tenantSlug`, `email`, `token` (SHA-256 hash, `select:false`), `expiresAt`, `invitedByUserId?`, `invitedByEmail?`, `acceptedAt?`, `revokedAt?`, `metadata?`
2. Export `UserInvite` from `packages/database/index.ts`
3. `apps/auth-service/src/modules/auth/invite.repository.ts` — extends `TenantAwareRepository<UserInvite>`
4. Add to `SecurityEventType`: `INVITE_SENT: "invite.sent"`, `INVITE_ACCEPTED: "invite.accepted"`, `INVITE_REVOKED: "invite.revoked"`
5. Add `sendInviteEmail()` to `apps/auth-service/src/modules/email/email.service.ts`
6. Add `createInvite()`, `validateInvite()`, `acceptInvite()` to `auth.service.ts`
7. Add `CreateInviteDto`, `AcceptInviteDto` to `auth.dto.ts`
8. Add 3 routes to `auth.controller.ts`:
   - `POST /auth/invite` (protected)
   - `GET /auth/invite/validate/:token` (public)
   - `POST /auth/invite/accept` (public)
9. Update `auth.module.ts`: add `UserInvite` to `TypeOrmModule.forFeature`, add `InviteRepository` to `providers`

### Phase 2 — Frontend (UI built but all calls 404)

1. Add `useCreateInvite()` to `apps/admin-portal/lib/queries.ts`
2. Wire "Invite User" button in `apps/admin-portal/app/t/[slug]/users/page.tsx` with inline modal
3. Update `apps/admin-portal/app/invite/[token]/page.tsx` success redirect to `/u/login`
