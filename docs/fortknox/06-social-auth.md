# Social Authentication

Fort Knox supports OAuth2 social login via Google, GitHub, Microsoft, Apple, LinkedIn, and Facebook. All providers share a common flow built on Passport.js strategies. The system supports both new account creation and linking social accounts to existing users.

---

## Supported Providers

| Provider | Strategy | Scopes |
|---|---|---|
| Google | `GoogleStrategy` | `openid email profile` |
| GitHub | `GithubStrategy` | `user:email` |
| Microsoft | `MicrosoftStrategy` | `openid email profile` |
| Apple | `AppleStrategy` | `name email` |
| LinkedIn | `LinkedinStrategy` | `openid email profile` |
| Facebook | `FacebookStrategy` | `email public_profile` |

Each tenant can enable/disable providers individually via `TenantSocialProvider` records.

---

## Login Flow

### Step 1: Initiate OAuth

```
GET /auth/social/:provider/login?tenant_id=acme&return_url=https://app.acme.com/dashboard
```

The server:
1. Validates the tenant
2. Encodes state as base64url JSON: `{ tenantId, returnUrl }`
3. Redirects to the provider's OAuth authorize endpoint

### Step 2: OAuth Callback

```
GET /auth/social/:provider/callback
```

Passport verifies the OAuth response and calls the strategy's `validate()` function, which extracts:
- Provider user ID
- Email address
- Display name, first/last name
- Avatar URL
- Email verified flag

### Step 3: Account Resolution

`handleSocialCallback()` runs the following logic:

```
1. Look up UserSocialConnection by (provider, providerId, tenantId)
   → Found: return existing user session
   → Not found:

2. Look up user by email within tenant
   → Email exists: create SocialLinkRequest, return { type: "link_required" }
   → Email not found: create new user + UserSocialConnection, return session
```

When `link_required` is returned, the user must confirm linking via email before the connection is created.

### Step 4: Complete Login

After the callback resolves, the user is redirected to:

```
{returnUrl}?completion_token=xxx
```

The frontend exchanges this token:

```
POST /auth/social/claim-session
{ "completionToken": "xxx" }
```

Response: `{ accessToken }` + `httpOnly` refresh token cookie.

---

## Account Linking

### For Unauthenticated Users (Email Conflict)

When a social login matches an existing email:

1. A `SocialLinkRequest` is created (expires in 1 hour)
2. A confirmation email is sent to the user
3. The user clicks the link in the email

```
GET /auth/social/link/confirm?token=xxx
```

On success, a `UserSocialConnection` is created and the user is logged in.

### For Authenticated Users

An already-logged-in user can add social providers to their account:

**Step 1: Get a link token**

```
POST /auth/social/link/token
Authorization: Bearer <accessToken>
```

Response: `{ "linkToken": "..." }` (expires in 60 seconds)

**Step 2: Redirect to OAuth**

```
GET /auth/social/link/:provider?lt=<linkToken>
```

State is encoded with `mode: "link"` so the callback knows this is a linking operation, not a new login.

**Step 3: Callback creates connection**

No email confirmation needed. The connection is created immediately for an authenticated user.

---

## Managing Connections

### List connections

```
GET /auth/social/connections
Authorization: Bearer <accessToken>
```

```json
[
  {
    "provider": "google",
    "email": "alice@gmail.com",
    "displayName": "Alice Smith",
    "lastUsedAt": "2026-03-16T10:00:00Z",
    "createdAt": "2026-01-01T00:00:00Z"
  }
]
```

### Unlink a provider

```
DELETE /auth/social/connections/:provider
Authorization: Bearer <accessToken>
```

Removes the `UserSocialConnection` record. The user's primary auth method must remain — cannot unlink if it's the only login method and no password is set.

---

## Tenant Provider Configuration

Social providers are configured per-tenant in the `TenantSocialProvider` table.

| Field | Type | Notes |
|---|---|---|
| `provider` | enum | Provider name |
| `enabled` | boolean | Whether this provider is active |
| `clientId` | string | Tenant-specific OAuth app client ID |
| `clientSecret` | string | Encrypted, `select: false` |
| `scopes` | string | Space-separated scope override |
| `useSharedApp` | boolean | Use Fort Knox's shared OAuth app |
| `config` | jsonb | Provider-specific config |

If `useSharedApp: true`, the environment-level OAuth credentials are used. If false, the tenant must supply their own `clientId` and `clientSecret`.

---

## Entities

### UserSocialConnection

Stores the link between a Fort Knox user and their account at an external provider.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `tenantId` | uuid | |
| `userId` | uuid | FK → User |
| `provider` | enum | `google`, `github`, `microsoft`, etc. |
| `providerId` | string | User ID at the provider |
| `email` | string | Email from provider |
| `displayName` | string? | |
| `avatarUrl` | string? | |
| `accessToken` | string? | AES-256-GCM encrypted, `select: false` |
| `refreshToken` | string? | AES-256-GCM encrypted, `select: false` |
| `tokenExpiresAt` | timestamptz? | |
| `scopes` | string? | Space-separated |
| `metadata` | jsonb? | Raw provider profile |
| `primary` | boolean | Designated primary connection |
| `lastUsedAt` | timestamptz? | Updated on each social login |

### SocialLinkRequest

Temporary record created when a social login finds an email collision.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `tenantId` | uuid | |
| `userId` | uuid | FK → User |
| `provider` | enum | |
| `providerId` | string | |
| `providerEmail` | string | |
| `token` | string | Unique hex, sent in email |
| `profileData` | jsonb | Encrypted tokens + provider profile |
| `expiresAt` | timestamptz | 1 hour from creation |
| `completed` | boolean | Marked true on confirm |
| `completedAt` | timestamptz? | |

---

## State Encoding

OAuth state is base64url-encoded JSON to prevent CSRF and carry context through the redirect:

**Login state:**
```json
{ "tenantId": "acme", "returnUrl": "https://app.acme.com/dashboard" }
```

**Linking state:**
```json
{ "mode": "link", "userId": "user-uuid", "tenantId": "acme" }
```

Decoding on callback:
```typescript
const state = JSON.parse(Buffer.from(rawState, "base64url").toString());
```

The `returnUrl` is validated against an `allowedOrigins` whitelist to prevent open redirect attacks.

---

## Security Considerations

- **Token storage**: Provider access and refresh tokens are encrypted with AES-256-GCM before storage. The `select: false` option ensures they are never returned in queries by default.
- **Email enumeration**: The `link_required` response does not reveal whether the email exists — it sends an email to the address. The frontend shows the same message regardless.
- **CSRF**: State parameter is required and validated on every callback.
- **Redirect validation**: `returnUrl` is checked against a whitelist.
- **Linking confirmation**: When a social account matches an existing email, a confirmation email is required (not just OAuth proof) to prevent account takeover.

---

## Endpoint Summary

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/auth/social/:provider/login` | None | Start OAuth flow |
| `GET` | `/auth/social/:provider/callback` | Passport | Handle OAuth callback |
| `POST` | `/auth/social/claim-session` | None | Exchange completion token |
| `POST` | `/auth/social/link/token` | Bearer | Get link token |
| `GET` | `/auth/social/link/:provider` | None | Start linking OAuth flow |
| `GET` | `/auth/social/link/confirm` | None | Confirm via email token |
| `GET` | `/auth/social/connections` | Bearer | List connections |
| `DELETE` | `/auth/social/connections/:provider` | Bearer | Unlink provider |
