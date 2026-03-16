# Authentication Flows

This document covers every login path Fort Knox supports: password, magic link, passkey, MFA step-up, and the login-intent discovery mechanism.

---

## Login Intent

Before presenting a login form, call login-intent to discover what methods the user has available:

```
POST /auth/login-intent
{ "email": "user@example.com" }
```

Response:
```json
{
  "exists": true,
  "email": "user@example.com",
  "methods": ["password", "google", "passkey"],
  "preferredMethod": "passkey",
  "branding": {
    "companyName": "Acme Corp",
    "logoUrl": "https://...",
    "primaryColor": "#0066FF"
  }
}
```

If `exists: false`, the user has no account — show registration or social signup.
`methods` drives which login options to display. `branding` enables white-labeling the login page.

---

## Email / Password Login

### Happy path

```
POST /auth/login
{
  "email": "user@example.com",
  "password": "hunter2"
}
```

Response (no MFA):
```json
{
  "accessToken": "eyJ...",
  "user": { "id": "...", "email": "...", "firstName": "..." }
}
```

The refresh token is set as an `httpOnly` cookie named `refreshToken`.

### With MFA enabled

```json
{
  "mfaRequired": true,
  "tempToken": "eyJ...",
  "availableMethods": ["totp", "webauthn"]
}
```

The `tempToken` is a short-lived JWT with `type: "mfa_pending"`. It proves the user passed the password step. Pass it to `/auth/mfa/verify` or the passkey finish endpoint.

### Complete MFA

```
POST /auth/mfa/verify
{
  "tempToken": "eyJ...",
  "code": "123456"
}
```

Or with a backup code:
```
POST /auth/mfa/verify-backup
{
  "tempToken": "eyJ...",
  "code": "AAAA-BBBB-CCCC"
}
```

Response: same as no-MFA login — `accessToken` + `refreshToken` cookie.

### Failure behavior

- Wrong password: `failedLoginAttempts` incremented, `SecurityEvent` written
- 5th failure: account locked until `lockedUntil` (exponential backoff)
- Locked account: `401 Unauthorized` with `account_locked` error code + unlock timestamp

---

## Token Refresh

The access token lives 15 minutes. Refresh it with the cookie:

```
POST /auth/refresh
```
(No body — reads `refreshToken` cookie)

Response:
```json
{
  "accessToken": "eyJ...",
  "expiresIn": 900
}
```

A new refresh token is set in the cookie. The old token is marked `usedAt = NOW()` and cannot be reused.

If the same old refresh token is presented twice, the entire token family is revoked and a `401` is returned. This means someone captured a refresh token — force re-login.

---

## Logout

```
POST /auth/logout
Authorization: Bearer <accessToken>
```

- Sets `revokedAt = NOW()` on the session row
- Nulls `refreshTokenHash` on the session row
- Deletes the Redis cache entry
- Revokes all `oauth_refresh_tokens` for that session

---

## Magic Link Login

No password needed — a single-use link is sent to the user's email.

### Step 1: Request link

```
POST /auth/magic-link/send
{ "email": "user@example.com" }
```

A `magicLinkToken` (SHA-256 hashed) is stored on the user record with a 15-minute TTL. An email is sent with the raw token as a URL parameter.

### Step 2: Verify link

```
POST /auth/magic-link/verify
{ "token": "<raw-token-from-email>" }
```

- Hash the token, look up user by hash
- Check expiry
- Clear the token, issue access + refresh tokens
- Write `login_success` security event

---

## Password Reset

### Step 1: Request reset

```
POST /auth/forgot-password
{ "email": "user@example.com" }
```

A 6-digit OTP is generated, stored hashed, and emailed. TTL is 15 minutes.

### Step 2: Apply new password

```
POST /auth/reset-password
{
  "otp": "123456",
  "password": "newSecurePassword",
  "email": "user@example.com"
}
```

Validates:
- OTP matches hash
- OTP not expired
- New password not in last 5 hashes (password history)

On success: updates `passwordHash`, clears the reset token, revokes all sessions (force re-login everywhere), writes `PASSWORD_RESET_COMPLETED` event.

---

## Email Verification

After registration, the user receives a verification email with a token:

```
POST /auth/verify-email
{ "token": "<verification-token>" }
```

Sets `emailVerified = true`. Tenants can require email verification before login by setting `settings.requireEmailVerification = true`.

Resend:
```
POST /auth/resend-verification
{ "email": "user@example.com" }
```

---

## Registration

```
POST /auth/register
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "firstName": "Alice",
  "lastName": "Smith",
  "tenantId": "tenant-uuid"
}
```

Steps performed:
1. Check `settings.allowSignup` on tenant — if false, reject
2. Check email uniqueness within tenant
3. Hash password with Argon2id
4. Create user with `status: active`, `emailVerified: false`
5. Send verification email
6. Write `USER_CREATED` security event
7. Return `accessToken` + `refreshToken` cookie (logged in immediately)

If email already exists: writes `REGISTRATION_FAILED` event, returns generic message (no email enumeration).

---

## Get Current User

```
GET /auth/me
Authorization: Bearer <accessToken>
```

Returns:
```json
{
  "user": {
    "id": "...",
    "email": "...",
    "firstName": "...",
    "emailVerified": true,
    "mfaEnabled": false,
    "primaryAuthMethod": "password",
    "roles": ["user"],
    "permissions": ["profile:read", "profile:write"]
  },
  "session": {
    "id": "...",
    "deviceInfo": { "browser": "Chrome", "os": "macOS" },
    "ipAddress": "1.2.3.4",
    "location": "San Francisco, US",
    "createdAt": "2026-03-01T00:00:00Z"
  }
}
```

---

## Auth Flow State Machine

```
                    ┌─────────────┐
                    │   /login    │
                    └──────┬──────┘
                           │
              ┌────────────▼────────────┐
              │   Validate credentials  │
              └────────────┬────────────┘
                           │
               ┌───────────┴───────────┐
               │ MFA enabled?          │
               │ No           Yes      │
               ▼               ▼
        ┌──────────┐   ┌──────────────┐
        │  Issue   │   │  Return      │
        │  tokens  │   │  tempToken   │
        └──────────┘   └──────┬───────┘
                              │
                    ┌─────────▼──────────┐
                    │  /auth/mfa/verify  │
                    │  (TOTP or backup)  │
                    └─────────┬──────────┘
                              │
                       ┌──────▼───────┐
                       │  Issue tokens │
                       └──────────────┘
```

---

## Error Codes

| Code | HTTP | Meaning |
|---|---|---|
| `invalid_credentials` | 401 | Wrong email or password |
| `account_locked` | 401 | Too many failed attempts |
| `account_inactive` | 401 | Account suspended or deleted |
| `email_not_verified` | 401 | Tenant requires email verification |
| `mfa_required` | 200 | MFA step needed (not an error) |
| `invalid_mfa_code` | 401 | Wrong TOTP or backup code |
| `token_expired` | 401 | Access or refresh token expired |
| `token_reuse_detected` | 401 | Refresh token used twice — family revoked |
| `session_revoked` | 401 | Session explicitly logged out |
| `signup_disabled` | 403 | Tenant has signup disabled |
