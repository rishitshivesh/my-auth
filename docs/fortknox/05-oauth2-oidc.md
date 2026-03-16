# OAuth2 & OIDC Server

Fort Knox is a full OAuth2 authorization server with OpenID Connect support. It implements the Authorization Code flow (with PKCE), Client Credentials, and Refresh Token grant types, plus standard OIDC discovery and token management endpoints.

---

## OIDC Discovery

```
GET /.well-known/openid-configuration
```

Returns the OIDC discovery document:

```json
{
  "issuer": "https://auth.yourapp.com",
  "authorization_endpoint": "https://auth.yourapp.com/oauth/authorize",
  "token_endpoint": "https://auth.yourapp.com/oauth/token",
  "userinfo_endpoint": "https://auth.yourapp.com/oauth/userinfo",
  "jwks_uri": "https://auth.yourapp.com/oauth/jwks",
  "introspection_endpoint": "https://auth.yourapp.com/oauth/introspect",
  "revocation_endpoint": "https://auth.yourapp.com/oauth/revoke",
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token", "client_credentials"],
  "subject_types_supported": ["public"],
  "id_token_signing_alg_values_supported": ["RS256"],
  "scopes_supported": ["openid", "profile", "email", "offline_access"]
}
```

```
GET /oauth/jwks
```

Returns the JSON Web Key Set with the public key used to verify ID tokens.

---

## Authorization Code Flow (+ PKCE)

This is the standard flow for web and native apps.

### Step 1: Redirect user to authorization endpoint

```
GET /oauth/authorize
  ?client_id=your-client-id
  &redirect_uri=https://yourapp.com/callback
  &response_type=code
  &scope=openid profile email offline_access
  &state=random-csrf-token
  &code_challenge=BASE64URL(SHA256(code_verifier))  ← PKCE
  &code_challenge_method=S256
```

PKCE is supported with both `S256` and `plain` methods. `S256` is strongly recommended.

If the user is not logged in, they are redirected to the login page. After authentication, they are redirected to `redirect_uri` with:

```
https://yourapp.com/callback?code=AUTHORIZATION_CODE&state=random-csrf-token
```

### Step 2: Exchange code for tokens

```
POST /oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=AUTHORIZATION_CODE
&redirect_uri=https://yourapp.com/callback
&client_id=your-client-id
&client_secret=your-client-secret   ← or omit for public clients using PKCE
&code_verifier=PLAIN_CODE_VERIFIER  ← PKCE
```

Response:

```json
{
  "access_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 900,
  "refresh_token": "abc123...",
  "id_token": "eyJ...",
  "scope": "openid profile email offline_access"
}
```

- `access_token`: JWT, 15-minute TTL
- `refresh_token`: opaque hex, 30-day TTL (only if `offline_access` scope included)
- `id_token`: JWT with OIDC user claims

### Step 3 (optional): Refresh tokens

```
POST /oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
&refresh_token=abc123...
&client_id=your-client-id
&client_secret=your-client-secret
```

Returns a new access token and a new refresh token (rotation). The old refresh token is immediately invalidated.

---

## Client Credentials (Machine-to-Machine)

For server-to-server communication where there is no user context.

```
POST /oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
&client_id=your-service-client-id
&client_secret=your-service-client-secret
&scope=users:read tenants:read
```

Response:
```json
{
  "access_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 900,
  "scope": "users:read tenants:read"
}
```

No refresh token is issued for client credentials. The client re-authenticates when the token expires.

Requirements:
- Client must be `confidential` type
- Scope must be within the client's allowed scopes

---

## UserInfo Endpoint

```
GET /oauth/userinfo
Authorization: Bearer <access_token>
```

Returns standard OIDC claims based on the granted scopes:

```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "email_verified": true,
  "name": "Alice Smith",
  "given_name": "Alice",
  "family_name": "Smith",
  "picture": "https://...",
  "updated_at": 1700000000
}
```

---

## Token Introspection

```
POST /oauth/introspect
Authorization: Basic base64(client_id:client_secret)
Content-Type: application/x-www-form-urlencoded

token=<access_or_refresh_token>
```

Active token:
```json
{
  "active": true,
  "sub": "user-uuid",
  "client_id": "your-client-id",
  "scope": "openid profile email",
  "exp": 1700000900,
  "iat": 1700000000
}
```

Expired or invalid:
```json
{ "active": false }
```

---

## Token Revocation

```
POST /oauth/revoke
Authorization: Basic base64(client_id:client_secret)
Content-Type: application/x-www-form-urlencoded

token=<access_or_refresh_token>
```

Returns `200 OK` regardless of whether the token existed (per RFC 7009).

---

## Managing OAuth Clients

### Create client

```
POST /oauth/clients
Authorization: Bearer <accessToken>
{
  "name": "My Application",
  "type": "confidential",
  "redirectUris": ["https://myapp.com/callback"],
  "scopes": ["openid", "profile", "email", "offline_access"],
  "grantTypes": ["authorization_code", "refresh_token"]
}
```

Client types:
- `confidential` — server-side apps that can store a secret
- `public` — SPAs and native apps using PKCE

### Rotate client secret

```
POST /oauth/clients/:clientId/rotate-secret
```

Returns the new secret immediately. The old secret is invalidated.

### Delete client

```
DELETE /oauth/clients/:clientId
```

Cascades: deletes all authorization codes, access tokens, and refresh tokens for this client.

---

## Scopes

| Scope | Claims granted |
|---|---|
| `openid` | Required for OIDC — enables `id_token` and `sub` claim |
| `profile` | `name`, `given_name`, `family_name`, `picture` |
| `email` | `email`, `email_verified` |
| `offline_access` | Enables refresh token issuance |

---

## ID Token Claims

When `openid` is in scope, an `id_token` JWT is returned with:

```json
{
  "iss": "https://auth.yourapp.com",
  "sub": "user-uuid",
  "aud": "client-id",
  "exp": 1700000900,
  "iat": 1700000000,
  "nonce": "random-nonce",  ← if provided in authorization request
  "email": "user@example.com",
  "email_verified": true,
  "name": "Alice Smith",
  "given_name": "Alice",
  "family_name": "Smith",
  "picture": "https://..."
}
```

---

## Token Storage

| Token | Format | Storage | TTL |
|---|---|---|---|
| Authorization code | Opaque hex | SHA-256 hash in `oauth_authorization_codes` | 10 minutes |
| Access token | JWT | SHA-256 hash in `oauth_access_tokens` for revocation tracking | 15 minutes |
| Refresh token | Opaque hex | SHA-256 hash in `oauth_refresh_tokens` with family chain | 30 days |
| ID token | JWT (signed) | Not stored — stateless | 15 minutes |

---

## Security Considerations

- **PKCE is mandatory** for public clients (enforced if `code_challenge` is absent)
- **Refresh token rotation**: every use issues a new token, old is consumed
- **Token reuse detection**: presenting a consumed refresh token revokes the entire token family
- **Redirect URI validation**: exact match required, no wildcards
- **Client secret**: never logged, returned only on creation and rotation
- **Scope validation**: requested scope must be a subset of client's allowed scopes
