# Multi-Factor Authentication

Fort Knox supports four MFA methods: TOTP, WebAuthn/passkeys, email OTP, and backup codes. SMS OTP has entity fields but no implementation yet.

---

## MFA Status

```
GET /mfa/status
Authorization: Bearer <accessToken>
```

```json
{
  "enabled": true,
  "methods": ["totp", "webauthn"],
  "preferredMethod": "totp",
  "backupCodesRemaining": 8
}
```

---

## TOTP (Authenticator App)

TOTP generates time-based 6-digit codes compatible with Google Authenticator, Authy, 1Password, etc.

### Setup

**Step 1: Generate secret and QR code**

```
POST /mfa/setup/totp
Authorization: Bearer <accessToken>
```

Response:
```json
{
  "secret": "JBSWY3DPEHPK3PXP",
  "qrCodeUrl": "data:image/png;base64,...",
  "backupCodes": ["AAAA-BBBB", "CCCC-DDDD", ...]
}
```

The `secret` is stored encrypted (`select: false`) in `mfa_settings.totp_secret`. The QR code encodes an `otpauth://` URI.

10 backup codes are generated at this step. Store them safely — they cannot be retrieved again.

**Step 2: Verify and enable**

```
POST /mfa/verify/totp
Authorization: Bearer <accessToken>
{ "code": "123456" }
```

Verifies the 6-digit code with a ±60-second window (2 time steps). On success, sets `totp_enabled = true` and `totp_verified_at = NOW()`.

### During login

If TOTP is the user's preferred method, `/auth/login` returns:
```json
{
  "mfaRequired": true,
  "tempToken": "eyJ...",
  "availableMethods": ["totp", "backup_code"]
}
```

Complete login:
```
POST /auth/mfa/verify
{
  "tempToken": "eyJ...",
  "code": "123456"
}
```

### Disable TOTP

```
DELETE /mfa/totp
Authorization: Bearer <accessToken>
```

Sets `totp_enabled = false`, clears `totp_secret`.

---

## Backup Codes

Backup codes are emergency one-time passwords generated alongside TOTP. They bypass TOTP if the user loses access to their authenticator app.

- 10 codes per user
- Each code is a random hex string, displayed as `XXXX-XXXX`
- Stored as SHA-256 hashes in `backup_codes` JSONB array
- Consumed codes move to `backup_codes_used` — they cannot be reused

### Use a backup code at login

```
POST /auth/mfa/verify-backup
{
  "tempToken": "eyJ...",
  "code": "AAAA-BBBB"
}
```

### Regenerate backup codes

```
POST /mfa/backup-codes/regenerate
Authorization: Bearer <accessToken>
```

Returns 10 new codes. The old codes are invalidated immediately.

### Check remaining count

Available in `GET /mfa/status` → `backupCodesRemaining`.

---

## WebAuthn / Passkeys

WebAuthn allows users to authenticate with Touch ID, Face ID, Windows Hello, or hardware security keys. Fort Knox uses `@simplewebauthn/server` v13.

### Configuration

Two environment variables are required:

```env
WEBAUTHN_RP_ID=yourdomain.com       # Relying party ID (must match origin domain)
WEBAUTHN_ORIGIN=https://yourdomain.com  # Full origin URL
```

In development:
```env
WEBAUTHN_RP_ID=localhost
WEBAUTHN_ORIGIN=http://localhost:3000
```

### Registration

**Step 1: Get challenge options**

```
POST /mfa/webauthn/register/start
Authorization: Bearer <accessToken>
```

Returns a `PublicKeyCredentialCreationOptions` object from `@simplewebauthn/server`. Challenge is stored in-memory (see note below).

**Step 2: Browser creates credential**

```typescript
import { startRegistration } from '@simplewebauthn/browser';

const options = await fetch('/mfa/webauthn/register/start', { method: 'POST', ... }).then(r => r.json());
const registrationResponse = await startRegistration({ optionsJSON: options });
```

**Step 3: Verify and save**

```
POST /mfa/webauthn/register/finish
Authorization: Bearer <accessToken>
{
  "registrationResponse": { ... },   // from startRegistration()
  "deviceName": "MacBook Pro"        // optional user-facing label
}
```

The credential is appended to `mfa_settings.webauthn_credentials` JSONB array:
```json
{
  "id": "base64url-credential-id",
  "publicKey": "base64url-public-key",
  "counter": 0,
  "deviceName": "MacBook Pro",
  "transports": ["internal"],
  "lastUsedAt": "2026-03-16T00:00:00Z",
  "createdAt": "2026-03-16T00:00:00Z"
}
```

### Authentication (passkey login)

**Step 1: Get challenge**

```
POST /auth/webauthn/login/start
{ "email": "user@example.com" }
```

**Step 2: Browser signs challenge**

```typescript
import { startAuthentication } from '@simplewebauthn/browser';

const options = await fetch('/auth/webauthn/login/start', { ... }).then(r => r.json());
const assertion = await startAuthentication(options);
```

**Step 3: Verify and issue tokens**

```
POST /auth/webauthn/login/finish
{
  "email": "user@example.com",
  "assertion": { ... }  // from startAuthentication()
}
```

Verifies signature, increments `counter` (replay detection), issues access + refresh tokens.

### Manage credentials

List:
```
GET /mfa/webauthn/credentials
Authorization: Bearer <accessToken>
```

Delete:
```
DELETE /mfa/webauthn/credentials/:credentialId
Authorization: Bearer <accessToken>
```

### Production note

**WebAuthn challenges are currently stored in-memory** (`Map<string, ChallengeEntry>` in `WebAuthnService`). This works for single-instance deployments only. Before running multiple auth-service instances behind a load balancer, migrate challenge storage to Redis. The code contains `// replace with Redis!` comments marking the exact location.

---

## Email OTP

An alternative to TOTP that doesn't require an authenticator app. A 6-digit code is emailed to the user.

### Request OTP

```
POST /mfa/request-email-otp
Authorization: Bearer <accessToken>
```

Sends a code to the user's verified email address. TTL: 10 minutes.

### Verify OTP

```
POST /mfa/verify-email-otp
Authorization: Bearer <accessToken>
{ "code": "123456" }
```

Can also be used as a second factor during login when `email` is in `availableMethods`.

---

## MFA in the Login Flow

The full MFA-aware login sequence:

```
1. POST /auth/login  →  { mfaRequired: true, tempToken, availableMethods }

2a. TOTP:          POST /auth/mfa/verify        { tempToken, code }
2b. Backup code:   POST /auth/mfa/verify-backup { tempToken, code }
2c. Passkey:       POST /auth/webauthn/login/start → browser → POST /auth/webauthn/login/finish

3. Receive { accessToken } + httpOnly refreshToken cookie
```

The `tempToken` expires in 10 minutes. It cannot be used for anything other than the MFA step.

---

## Disable All MFA

Removes all MFA methods (TOTP + WebAuthn + backup codes) in one call:

```
DELETE /mfa/all
Authorization: Bearer <accessToken>
```

Sets all `mfa_settings` flags to false, clears secrets and credentials.
