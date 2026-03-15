# WebAuthn MFA Settings + Social Account Linking — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the passkey toggle and social credentials forms on the settings page with a proper passkey device management flow (on a dedicated `/dashboard/settings/security` page) and a connected-accounts section for linking/unlinking Google, GitHub, and Microsoft to the logged-in admin portal user.

**Architecture:** All backend endpoints for passkey registration and social connections already exist. This plan adds the missing SDK methods, a new backend social linking flow (link-token relay so OAuth can carry userId), React Query hooks, and two updated/new frontend pages. No DB migrations needed.

**Tech Stack:** NestJS (backend), TypeORM, @simplewebauthn/browser (frontend registration), React Query, Next.js App Router, TypeScript, `packages/fortknox-sdk`.

---

### Task 1: SDK — Passkey management methods

**Files:**
- Modify: `packages/fortknox-sdk/src/core/client.ts` (after line 338, after `finishPasskeyLogin`)

The backend already has all four endpoints under `/mfa/webauthn/`. The SDK only has login methods. Add registration and management methods.

**Step 1: Add the four methods after `finishPasskeyLogin` (~line 338)**

```typescript
// ── Passkey Registration & Management ──────────────────────────────

async startPasskeyRegistration(): Promise<any> {
  const response = await this.request({
    url: `${this.config.baseURL}/mfa/webauthn/register/start`,
    method: "POST",
    body: {},
  });
  if (!response.ok) throw this.createError(response);
  return response.data?.data || response.data;
}

async finishPasskeyRegistration(
  registrationResponse: any,
  deviceName?: string,
): Promise<{ credentialId: string }> {
  const response = await this.request({
    url: `${this.config.baseURL}/mfa/webauthn/register/finish`,
    method: "POST",
    body: { response: registrationResponse, deviceName },
  });
  if (!response.ok) throw this.createError(response);
  return response.data?.data || response.data;
}

async listPasskeys(): Promise<
  Array<{
    id: string;
    deviceName?: string;
    createdAt: string;
    lastUsedAt?: string;
    transports: string[];
  }>
> {
  const response = await this.request({
    url: `${this.config.baseURL}/mfa/webauthn/credentials`,
    method: "GET",
  });
  if (!response.ok) throw this.createError(response);
  return response.data?.data?.credentials || response.data?.credentials || [];
}

async deletePasskey(credentialId: string): Promise<void> {
  const response = await this.request({
    url: `${this.config.baseURL}/mfa/webauthn/credentials/${credentialId}`,
    method: "DELETE",
  });
  if (!response.ok) throw this.createError(response);
}
```

**Step 2: Verify it compiles**

```bash
cd /Users/rishitshivesh/Projects/Personal/my-auth
yarn workspace @fortknox/sdk build 2>&1 | tail -20
```
Expected: no TypeScript errors.

**Step 3: Commit**

```bash
git add packages/fortknox-sdk/src/core/client.ts
git commit -m "feat(sdk): add passkey registration and management methods"
```

---

### Task 2: SDK — Social connections + linking methods

**Files:**
- Modify: `packages/fortknox-sdk/src/core/client.ts` (after passkey methods from Task 1)

**Step 1: Add three methods after the passkey methods**

```typescript
// ── Social Connections & Account Linking ───────────────────────────

async getSocialConnections(): Promise<
  Array<{
    id: string;
    provider: string;
    email: string;
    displayName: string;
    avatarUrl?: string;
    primary: boolean;
    lastUsedAt?: string;
    createdAt: string;
  }>
> {
  const response = await this.request({
    url: `${this.config.baseURL}/social/connections`,
    method: "GET",
  });
  if (!response.ok) throw this.createError(response);
  return response.data?.data?.connections || response.data?.connections || [];
}

async unlinkSocialAccount(provider: string): Promise<void> {
  const response = await this.request({
    url: `${this.config.baseURL}/social/connections/${provider}`,
    method: "DELETE",
  });
  if (!response.ok) throw this.createError(response);
}

/**
 * Initiate social account linking for an already-authenticated user.
 * Fetches a short-lived link token, then navigates the browser to the
 * OAuth flow with that token so the backend can associate the OAuth
 * callback with the authenticated user.
 */
async initiateSocialLinking(provider: string): Promise<void> {
  const response = await this.request({
    url: `${this.config.baseURL}/social/link/token`,
    method: "POST",
    body: {},
  });
  if (!response.ok) throw this.createError(response);
  const linkToken =
    response.data?.data?.linkToken || response.data?.linkToken;
  if (!linkToken) throw new AuthErrorClass("UNKNOWN_ERROR", "No link token");
  // Redirect browser — OAuth requires a full page navigation
  window.location.href = `${this.config.baseURL}/social/link/${provider}?lt=${linkToken}`;
}
```

**Step 2: Verify it compiles**

```bash
yarn workspace @fortknox/sdk build 2>&1 | tail -20
```
Expected: no errors.

**Step 3: Commit**

```bash
git add packages/fortknox-sdk/src/core/client.ts
git commit -m "feat(sdk): add social connections and account linking methods"
```

---

### Task 3: SDK React provider — expose all new methods

**Files:**
- Modify: `packages/fortknox-sdk/src/react/index.tsx`

**Step 1: Extend `AuthContextValue` interface — add after `finishPasskeyLogin` line**

```typescript
  // Passkey management
  startPasskeyRegistration: () => Promise<any>;
  finishPasskeyRegistration: (response: any, deviceName?: string) => Promise<{ credentialId: string }>;
  listPasskeys: () => Promise<any[]>;
  deletePasskey: (credentialId: string) => Promise<void>;

  // Social account linking
  getSocialConnections: () => Promise<any[]>;
  unlinkSocialAccount: (provider: string) => Promise<void>;
  initiateSocialLinking: (provider: string) => Promise<void>;
```

**Step 2: Add implementations inside `FortKnoxProvider` (before the `value` object)**

```typescript
const startPasskeyRegistration = async (): Promise<any> => {
  return client.startPasskeyRegistration();
};

const finishPasskeyRegistration = async (
  registrationResponse: any,
  deviceName?: string,
): Promise<{ credentialId: string }> => {
  return client.finishPasskeyRegistration(registrationResponse, deviceName);
};

const listPasskeys = async (): Promise<any[]> => {
  return client.listPasskeys();
};

const deletePasskey = async (credentialId: string): Promise<void> => {
  return client.deletePasskey(credentialId);
};

const getSocialConnections = async (): Promise<any[]> => {
  return client.getSocialConnections();
};

const unlinkSocialAccount = async (provider: string): Promise<void> => {
  return client.unlinkSocialAccount(provider);
};

const initiateSocialLinking = async (provider: string): Promise<void> => {
  return client.initiateSocialLinking(provider);
};
```

**Step 3: Add all seven to the `value` object**

Add inside `const value: AuthContextValue = { ... }`:
```typescript
  startPasskeyRegistration,
  finishPasskeyRegistration,
  listPasskeys,
  deletePasskey,
  getSocialConnections,
  unlinkSocialAccount,
  initiateSocialLinking,
```

**Step 4: Verify it compiles**

```bash
yarn workspace @fortknox/sdk build 2>&1 | tail -20
```
Expected: no errors.

**Step 5: Commit**

```bash
git add packages/fortknox-sdk/src/react/index.tsx
git commit -m "feat(sdk): expose passkey management and social linking in React provider"
```

---

### Task 4: Backend — Social account linking endpoints

**Files:**
- Modify: `apps/auth-service/src/modules/social-auth/social-auth.service.ts`
- Modify: `apps/auth-service/src/modules/social-auth/social-auth.controller.ts`

The goal: a logged-in user can link a social account without email confirmation. Flow:
1. `POST /social/link/token` (Protected) — returns a 60s JWT encoding `{ userId, tenantId, mode: "link" }`
2. `GET /social/link/:provider?lt=<token>` — validates token, redirects to OAuth with link-mode state
3. Existing OAuth callbacks detect `state.mode === "link"` → create `UserSocialConnection` directly → redirect to `/u/auth/callback?mode=link&provider=<provider>`

#### social-auth.service.ts changes

**Step 1: Add `createLinkToken` and `handleLinkCallback` methods to `SocialAuthService`**

Find the end of the class (before the closing `}`) and add:

```typescript
/**
 * Create a short-lived link token for authenticated linking initiation.
 */
async createLinkToken(
  userId: string,
  tenantId: string,
): Promise<{ linkToken: string }> {
  const linkToken = this.jwtService.sign(
    { userId, tenantId, mode: "link" },
    { expiresIn: "60s" },
  );
  return { linkToken };
}

/**
 * Verify a link token and return the payload.
 */
verifyLinkToken(token: string): { userId: string; tenantId: string } {
  try {
    return this.jwtService.verify(token) as { userId: string; tenantId: string };
  } catch {
    throw new UnauthorizedException("Invalid or expired link token");
  }
}

/**
 * Directly link a social account to an already-authenticated user.
 * Called when OAuth callback state.mode === "link".
 */
async handleLinkCallback(params: {
  userId: string;
  tenantId: string;
  profile: SocialProfile;
}): Promise<{ provider: string }> {
  const { userId, tenantId, profile } = params;

  // Check not already linked
  const existing = await this.socialConnectionRepository.findOne({
    where: { tenantId, provider: profile.provider, providerId: profile.providerId },
  });
  if (existing) {
    // Already linked — idempotent success
    return { provider: profile.provider };
  }

  const user = await this.userRepository.findOne({ where: { id: userId, tenantId } });
  if (!user) throw new NotFoundException("User not found");

  const connection = this.socialConnectionRepository.create({
    userId,
    tenantId,
    provider: profile.provider,
    providerId: profile.providerId,
    email: profile.email,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    primary: false,
  });
  await this.socialConnectionRepository.save(connection);

  this.logger.log(`Linked ${profile.provider} account for user ${userId}`);
  return { provider: profile.provider };
}
```

Note: you'll need to add `UnauthorizedException` and `NotFoundException` to the imports at the top of the service file if not already present.

#### social-auth.controller.ts changes

**Step 2: Add `POST /social/link/token` endpoint**

Find the `@Get("connections")` endpoint and add BEFORE it:

```typescript
// ── Account Linking (authenticated user) ────────────────────────────

@Post("link/token")
@Protected()
@HttpCode(HttpStatus.OK)
async getLinkToken(@Req() req: any) {
  const { userId, tenantId } = req.user;
  const result = await this.socialAuthService.createLinkToken(userId, tenantId);
  return { status: 200, data: result };
}

@Get("link/google")
async linkGoogle(@Query("lt") linkToken: string, @Res() res: Response) {
  const payload = this.socialAuthService.verifyLinkToken(linkToken);
  const state = Buffer.from(
    JSON.stringify({ mode: "link", userId: payload.userId, tenantId: payload.tenantId }),
  ).toString("base64url");
  const params = new URLSearchParams({
    client_id: this.configService.get("GOOGLE_CLIENT_ID"),
    redirect_uri: `${this.configService.get("AUTH_SERVICE_URL")}/social/google/callback`,
    response_type: "code",
    scope: "email profile",
    state,
  });
  return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}

@Get("link/github")
async linkGithub(@Query("lt") linkToken: string, @Res() res: Response) {
  const payload = this.socialAuthService.verifyLinkToken(linkToken);
  const state = Buffer.from(
    JSON.stringify({ mode: "link", userId: payload.userId, tenantId: payload.tenantId }),
  ).toString("base64url");
  const params = new URLSearchParams({
    client_id: this.configService.get("GITHUB_CLIENT_ID"),
    redirect_uri: `${this.configService.get("AUTH_SERVICE_URL")}/social/github/callback`,
    response_type: "code",
    scope: "user:email",
    state,
  });
  return res.redirect(`https://github.com/login/oauth/authorize?${params}`);
}

@Get("link/microsoft")
async linkMicrosoft(@Query("lt") linkToken: string, @Res() res: Response) {
  const payload = this.socialAuthService.verifyLinkToken(linkToken);
  const state = Buffer.from(
    JSON.stringify({ mode: "link", userId: payload.userId, tenantId: payload.tenantId }),
  ).toString("base64url");
  const tenantId = this.configService.get("MICROSOFT_TENANT_ID") || "common";
  const params = new URLSearchParams({
    client_id: this.configService.get("MICROSOFT_CLIENT_ID"),
    redirect_uri: `${this.configService.get("AUTH_SERVICE_URL")}/social/microsoft/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
  });
  return res.redirect(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params}`);
}
```

**Step 3: Modify `handleSocialCallback` to detect link mode**

Find the `handleSocialCallback` method (around line 155). At the top of that method, after the state is parsed and `req.user` is accessed, add a link-mode branch:

```typescript
private async handleSocialCallback(
  strategy: string,
  req: Request,
  res: Response,
) {
  try {
    // Parse state to detect link mode
    const rawState = (req.query as any).state as string | undefined;
    if (rawState) {
      let parsedState: any = {};
      try {
        parsedState = JSON.parse(Buffer.from(rawState, "base64url").toString());
      } catch {}

      if (parsedState.mode === "link" && parsedState.userId) {
        // Account linking flow — user already authenticated
        const profile = (req as any).user as any; // set by Passport
        await this.socialAuthService.handleLinkCallback({
          userId: parsedState.userId,
          tenantId: parsedState.tenantId,
          profile: {
            provider: strategy,
            providerId: profile.id || profile.sub,
            email: profile.email || profile.emails?.[0]?.value,
            displayName: profile.displayName || profile.name || profile.login,
            avatarUrl: profile.photos?.[0]?.value || profile.avatar_url,
          },
        });
        const adminPortalUrl = this.configService.get("ADMIN_PORTAL_URL") || "http://localhost:3000";
        return res.redirect(
          `${adminPortalUrl}/u/auth/callback?mode=link&provider=${strategy}`,
        );
      }
    }

    // ... existing logic below unchanged
```

**Step 4: Add `ConfigService` to controller constructor if not already injected**

The controller needs `configService` for the OAuth URLs. Check if it's already imported; if not, inject it:
```typescript
constructor(
  private readonly socialAuthService: SocialAuthService,
  private readonly configService: ConfigService,   // ← add if missing
) {}
```
And add `ConfigService` to the imports: `import { ConfigService } from "@nestjs/config";`

**Step 5: Verify the backend compiles**

```bash
cd /Users/rishitshivesh/Projects/Personal/my-auth
yarn workspace auth-service build 2>&1 | tail -30
```
Expected: no errors.

**Step 6: Commit**

```bash
git add apps/auth-service/src/modules/social-auth/
git commit -m "feat(social-auth): add account linking endpoints for authenticated users"
```

---

### Task 5: React Query hooks — passkeys + social connections

**Files:**
- Modify: `apps/admin-portal/lib/queries.ts`

**Step 1: Add at the end of queries.ts**

```typescript
// ── Passkey Management ─────────────────────────────────────────────

export function useListPasskeys() {
  return useQuery({
    queryKey: ["passkeys"],
    queryFn: () => authClient.listPasskeys(),
  });
}

export function useDeletePasskey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (credentialId: string) => authClient.deletePasskey(credentialId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["passkeys"] }),
  });
}

// ── Social Connections ─────────────────────────────────────────────

export function useSocialConnections() {
  return useQuery({
    queryKey: ["social-connections"],
    queryFn: () => authClient.getSocialConnections(),
  });
}

export function useUnlinkSocialAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (provider: string) => authClient.unlinkSocialAccount(provider),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["social-connections"] }),
  });
}
```

Check the top of `queries.ts` — if `useQueryClient` isn't imported yet, add it to the `@tanstack/react-query` import.

**Step 2: Verify the file compiles (TypeScript check)**

```bash
cd /Users/rishitshivesh/Projects/Personal/my-auth/apps/admin-portal
npx tsc --noEmit 2>&1 | head -40
```
Expected: no new errors from queries.ts.

**Step 3: Commit**

```bash
git add apps/admin-portal/lib/queries.ts
git commit -m "feat(admin-portal): add passkey and social connections query hooks"
```

---

### Task 6: New `/dashboard/settings/security` page

**Files:**
- Create: `apps/admin-portal/app/dashboard/settings/security/page.tsx`

This page is the MFA hub. It shows TOTP status and passkey device management.

**Step 1: Create the file with this content**

```tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Shield, Key, Smartphone, Trash2, Plus, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@repo/ui";
import { startRegistration } from "@simplewebauthn/browser";
import { useMfaStatus } from "@/lib/queries";
import { useListPasskeys, useDeletePasskey } from "@/lib/queries";
import { useAuth } from "@fortknox/sdk";
import { format } from "date-fns";

export default function SecuritySettingsPage() {
  const router = useRouter();
  const { data: mfaStatus, isLoading: mfaLoading } = useMfaStatus();
  const { data: passkeys = [], isLoading: passkeysLoading, refetch: refetchPasskeys } = useListPasskeys();
  const deletePasskey = useDeletePasskey();
  const { client } = useAuth();

  const [addingPasskey, setAddingPasskey] = useState(false);
  const [deviceName, setDeviceName] = useState("");
  const [showNameModal, setShowNameModal] = useState(false);
  const [pendingRegistration, setPendingRegistration] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleStartAddPasskey = async () => {
    try {
      setAddingPasskey(true);
      setError(null);
      const options = await client.startPasskeyRegistration();
      // Let the user register with their device first, then ask for name
      const registrationResponse = await startRegistration(options);
      setPendingRegistration(registrationResponse);
      setDeviceName("");
      setShowNameModal(true);
    } catch (err: any) {
      if (err?.name !== "NotAllowedError") {
        setError(err?.message || "Failed to start passkey registration");
      }
    } finally {
      setAddingPasskey(false);
    }
  };

  const handleFinishAddPasskey = async () => {
    if (!pendingRegistration) return;
    try {
      setAddingPasskey(true);
      await client.finishPasskeyRegistration(
        pendingRegistration,
        deviceName.trim() || undefined,
      );
      setShowNameModal(false);
      setPendingRegistration(null);
      setDeviceName("");
      setSuccessMsg("Passkey added successfully");
      refetchPasskeys();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err?.message || "Failed to save passkey");
    } finally {
      setAddingPasskey(false);
    }
  };

  const handleDeletePasskey = async (credentialId: string) => {
    try {
      await deletePasskey.mutateAsync(credentialId);
      setSuccessMsg("Passkey removed");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err?.message || "Failed to delete passkey");
    }
  };

  const totpEnabled = mfaStatus?.data?.methods?.includes("totp");
  const totpVerifiedAt = mfaStatus?.data?.totpVerifiedAt;

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Security</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage two-factor authentication and passkeys
        </p>
      </div>

      {successMsg && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300">
          <CheckCircle className="h-4 w-4 shrink-0" />
          {successMsg}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <XCircle className="h-4 w-4 shrink-0" />
          {error}
          <button className="ml-auto text-xs underline" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {/* TOTP Section */}
      <section className="rounded-xl border border-border p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Smartphone className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">Authenticator App (TOTP)</h2>
            <p className="text-xs text-muted-foreground">
              Time-based one-time passwords via Google Authenticator, Authy, etc.
            </p>
          </div>
          <div className="ml-auto">
            {mfaLoading ? null : totpEnabled ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900 dark:text-green-300">
                <CheckCircle className="h-3 w-3" /> Enabled
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                Not enabled
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-muted-foreground">
            {totpEnabled && totpVerifiedAt
              ? `Verified ${format(new Date(totpVerifiedAt), "MMM d, yyyy")}`
              : "Add extra protection to your account"}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/u/mfa/setup")}
          >
            {totpEnabled ? "Manage" : "Enable"}
          </Button>
        </div>
      </section>

      {/* Passkeys Section */}
      <section className="rounded-xl border border-border p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Key className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">Passkeys</h2>
            <p className="text-xs text-muted-foreground">
              Sign in with Face ID, Touch ID, or a security key — no password needed
            </p>
          </div>
        </div>

        {passkeysLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : passkeys.length > 0 ? (
          <ul className="divide-y divide-border rounded-lg border border-border overflow-hidden">
            {passkeys.map((pk: any) => (
              <li
                key={pk.id}
                className="flex items-center justify-between px-4 py-3 bg-background"
              >
                <div className="flex items-center gap-3">
                  <Shield className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {pk.deviceName || "Passkey"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Added {format(new Date(pk.createdAt), "MMM d, yyyy")}
                      {pk.lastUsedAt
                        ? ` · Last used ${format(new Date(pk.lastUsedAt), "MMM d, yyyy")}`
                        : ""}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleDeletePasskey(pk.id)}
                  disabled={deletePasskey.isPending}
                  className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                  aria-label="Delete passkey"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground py-2">
            No passkeys registered yet.
          </p>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={handleStartAddPasskey}
          disabled={addingPasskey}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          {addingPasskey ? "Registering..." : "Add a passkey"}
        </Button>
      </section>

      {/* Device Name Modal */}
      {showNameModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-xl border border-border bg-background p-6 shadow-xl space-y-4 mx-4">
            <h3 className="font-semibold text-foreground">Name your passkey</h3>
            <p className="text-sm text-muted-foreground">
              Give this passkey a name so you can identify it later (e.g. "iPhone Face ID").
            </p>
            <input
              type="text"
              placeholder="e.g. iPhone Face ID (optional)"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleFinishAddPasskey()}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setShowNameModal(false); setPendingRegistration(null); }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleFinishAddPasskey}
                disabled={addingPasskey}
              >
                {addingPasskey ? "Saving..." : "Save passkey"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Check if `@simplewebauthn/browser` is installed in admin-portal**

```bash
cat /Users/rishitshivesh/Projects/Personal/my-auth/apps/admin-portal/package.json | grep simplewebauthn
```

If not present, install it:
```bash
yarn workspace admin-portal add @simplewebauthn/browser
```

**Step 3: Check if `date-fns` is available**

```bash
cat /Users/rishitshivesh/Projects/Personal/my-auth/apps/admin-portal/package.json | grep date-fns
```

If not, install it:
```bash
yarn workspace admin-portal add date-fns
```

**Step 4: Verify TypeScript**

```bash
cd /Users/rishitshivesh/Projects/Personal/my-auth/apps/admin-portal
npx tsc --noEmit 2>&1 | grep "security/page" | head -20
```
Expected: no errors from the new file.

**Step 5: Commit**

```bash
git add apps/admin-portal/app/dashboard/settings/security/
git commit -m "feat(admin-portal): add /dashboard/settings/security page with TOTP status and passkey management"
```

---

### Task 7: Update `/dashboard/settings` — remove passkey toggle + social credentials; add Connected Accounts

**Files:**
- Modify: `apps/admin-portal/app/dashboard/settings/page.tsx`

This is a full rewrite of the settings page. Read the current file first, then replace with the following.

**Step 1: Replace the file content**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Mail, CheckCircle2, XCircle, ExternalLink } from "lucide-react";
import { Button } from "@repo/ui";
import { useTenantSettings, useUpdateTenantSettings } from "@/lib/queries";
import { useSocialConnections, useUnlinkSocialAccount } from "@/lib/queries";
import { useAuth } from "@fortknox/sdk";

const SOCIAL_PROVIDERS = [
  {
    id: "google",
    name: "Google",
    icon: "https://www.google.com/favicon.ico",
  },
  {
    id: "github",
    name: "GitHub",
    icon: "https://github.com/favicon.ico",
  },
  {
    id: "microsoft",
    name: "Microsoft",
    icon: "https://www.microsoft.com/favicon.ico",
  },
] as const;

export default function SettingsPage() {
  const router = useRouter();
  const { client } = useAuth();
  const { data: settings, isLoading: settingsLoading } = useTenantSettings();
  const updateSettings = useUpdateTenantSettings();
  const { data: connections = [], isLoading: connectionsLoading } = useSocialConnections();
  const unlinkAccount = useUnlinkSocialAccount();

  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linkingProvider, setLinkingProvider] = useState<string | null>(null);

  const flash = (msg: string, isError = false) => {
    if (isError) setError(msg);
    else setSuccessMsg(msg);
    setTimeout(() => { setSuccessMsg(null); setError(null); }, 4000);
  };

  const handleToggle = async (key: string, current: boolean) => {
    try {
      await updateSettings.mutateAsync({ [key]: !current });
      flash(`${key === "magicLinkEnabled" ? "Magic Link" : key} ${!current ? "enabled" : "disabled"}`);
    } catch {
      flash("Failed to update setting", true);
    }
  };

  const handleConnect = async (provider: string) => {
    try {
      setLinkingProvider(provider);
      await client.initiateSocialLinking(provider);
      // Navigation happens inside initiateSocialLinking — no code after this runs
    } catch (err: any) {
      setLinkingProvider(null);
      flash(err?.message || "Failed to initiate linking", true);
    }
  };

  const handleDisconnect = async (provider: string) => {
    try {
      await unlinkAccount.mutateAsync(provider);
      flash(`${provider} account disconnected`);
    } catch (err: any) {
      flash(err?.message || "Failed to disconnect account", true);
    }
  };

  const magicLinkEnabled = settings?.data?.magicLinkEnabled ?? false;

  const getConnection = (provider: string) =>
    connections.find((c: any) => c.provider === provider);

  if (settingsLoading) {
    return (
      <div className="space-y-4 max-w-2xl">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage login methods and connected accounts
        </p>
      </div>

      {successMsg && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {successMsg}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <XCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Login Methods */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Login Methods
        </h2>

        {/* Password — always on */}
        <div className="flex items-center justify-between rounded-xl border border-border bg-background px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
              <Lock className="h-4 w-4 text-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Password</p>
              <p className="text-xs text-muted-foreground">Always enabled</p>
            </div>
          </div>
          <span className="text-xs text-muted-foreground font-medium">Required</span>
        </div>

        {/* Magic Link */}
        <div className="flex items-center justify-between rounded-xl border border-border bg-background px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
              <Mail className="h-4 w-4 text-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Magic Link</p>
              <p className="text-xs text-muted-foreground">
                One-time sign-in link via email
              </p>
            </div>
          </div>
          <button
            role="switch"
            aria-checked={magicLinkEnabled}
            onClick={() => handleToggle("magicLinkEnabled", magicLinkEnabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              magicLinkEnabled ? "bg-primary" : "bg-muted-foreground/30"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                magicLinkEnabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {/* Link to Security page for MFA/Passkeys */}
        <button
          onClick={() => router.push("/dashboard/settings/security")}
          className="flex w-full items-center justify-between rounded-xl border border-dashed border-border bg-background px-5 py-4 hover:bg-muted/50 transition-colors text-left"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
              <ExternalLink className="h-4 w-4 text-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Passkeys & MFA</p>
              <p className="text-xs text-muted-foreground">
                Manage authenticator app and passkey devices
              </p>
            </div>
          </div>
          <ExternalLink className="h-4 w-4 text-muted-foreground" />
        </button>
      </section>

      {/* Connected Accounts */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Connected Accounts
        </h2>
        <p className="text-xs text-muted-foreground">
          Link social accounts to sign in to Fort Knox with them.
        </p>

        {connectionsLoading ? (
          <div className="space-y-2">
            {SOCIAL_PROVIDERS.map((p) => (
              <div key={p.id} className="h-16 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {SOCIAL_PROVIDERS.map((provider) => {
              const conn = getConnection(provider.id);
              return (
                <div
                  key={provider.id}
                  className="flex items-center justify-between rounded-xl border border-border bg-background px-5 py-4"
                >
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={provider.icon}
                      alt={provider.name}
                      width={20}
                      height={20}
                      className="rounded-sm"
                    />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {provider.name}
                      </p>
                      {conn ? (
                        <p className="text-xs text-muted-foreground">
                          {conn.email || conn.displayName}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Not connected
                        </p>
                      )}
                    </div>
                  </div>

                  {conn ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDisconnect(provider.id)}
                      disabled={unlinkAccount.isPending}
                      className="text-destructive hover:text-destructive"
                    >
                      Disconnect
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleConnect(provider.id)}
                      disabled={linkingProvider === provider.id}
                    >
                      {linkingProvider === provider.id ? "Redirecting..." : "Connect"}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
```

**Step 2: Verify TypeScript**

```bash
cd /Users/rishitshivesh/Projects/Personal/my-auth/apps/admin-portal
npx tsc --noEmit 2>&1 | grep "settings/page" | head -20
```
Expected: no errors.

**Step 3: Commit**

```bash
git add apps/admin-portal/app/dashboard/settings/page.tsx
git commit -m "feat(admin-portal): rewrite settings page with login methods + connected accounts"
```

---

### Task 8: Dashboard sidebar — add Security nav item

**Files:**
- Modify: `apps/admin-portal/components/dashboard/dashboard-sidebar.tsx`

**Step 1: Find the `navItems` array (around line 17)**

The array currently looks like:
```typescript
const navItems = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/applications", label: "Applications", icon: AppWindow },
  { href: "/dashboard/security", label: "Security", icon: ShieldCheck },
  { href: "/dashboard/profile", label: "Profile", icon: User },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];
```

Add the Security settings entry after Settings:

```typescript
const navItems = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/applications", label: "Applications", icon: AppWindow },
  { href: "/dashboard/security", label: "Security", icon: ShieldCheck },
  { href: "/dashboard/profile", label: "Profile", icon: User },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
  { href: "/dashboard/settings/security", label: "MFA & Passkeys", icon: KeyRound },
];
```

Also add `KeyRound` to the lucide-react import at the top.

**Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "dashboard-sidebar" | head -10
```
Expected: no errors.

**Step 3: Commit**

```bash
git add apps/admin-portal/components/dashboard/dashboard-sidebar.tsx
git commit -m "feat(admin-portal): add MFA & Passkeys nav item to dashboard sidebar"
```

---

### Task 9: Update `/u/auth/callback` — handle mode=link

**Files:**
- Modify: `apps/admin-portal/app/u/auth/callback/page.tsx`

Currently the callback always calls `claimSocialSession(ct)` which replaces the user session. For account linking, the user is already logged in and we just need to show success and redirect.

**Step 1: Replace the file content**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@fortknox/sdk";

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { claimSocialSession } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ct = searchParams.get("ct");
    const mode = searchParams.get("mode");
    const provider = searchParams.get("provider");

    // Account linking: user already authenticated, just redirect back
    if (mode === "link") {
      router.replace("/dashboard/settings?linked=" + (provider || "1"));
      return;
    }

    // Normal social login: exchange completion token for session
    if (!ct) {
      setError("No completion token — please try signing in again.");
      return;
    }

    claimSocialSession(ct)
      .then(() => router.replace("/dashboard"))
      .catch((err: any) => setError(err?.message || "Sign-in failed. Please try again."));
  }, [searchParams, claimSocialSession, router]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="max-w-sm text-center space-y-4">
          <p className="text-destructive text-sm">{error}</p>
          <a href="/u/login" className="text-primary text-sm underline">
            Back to login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}
```

**Step 2: Update `/dashboard/settings` to show a success toast when `?linked=` is in the URL**

Open `apps/admin-portal/app/dashboard/settings/page.tsx` and add to the component:

```tsx
// At the top of the component body, after other useState hooks:
const searchParams = useSearchParams();

// In a useEffect:
useEffect(() => {
  const linked = searchParams.get("linked");
  if (linked) {
    const name = SOCIAL_PROVIDERS.find((p) => p.id === linked)?.name || "Account";
    flash(`${name} connected successfully`);
    // Remove the query param without reloading
    router.replace("/dashboard/settings");
  }
}, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps
```

Add `useEffect` to the imports if not already imported: `import { useState, useEffect } from "react";`
Add `useSearchParams` to the next/navigation import.

**Step 3: Verify TypeScript**

```bash
cd /Users/rishitshivesh/Projects/Personal/my-auth/apps/admin-portal
npx tsc --noEmit 2>&1 | head -40
```
Expected: no new errors.

**Step 4: Commit**

```bash
git add apps/admin-portal/app/u/auth/callback/page.tsx apps/admin-portal/app/dashboard/settings/page.tsx
git commit -m "feat(admin-portal): handle mode=link in auth callback; show linked success toast on settings page"
```

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | SDK passkey registration methods | `fortknox-sdk/src/core/client.ts` |
| 2 | SDK social connections + linking | `fortknox-sdk/src/core/client.ts` |
| 3 | SDK React provider: expose new methods | `fortknox-sdk/src/react/index.tsx` |
| 4 | Backend: social link-token + linking endpoints | `social-auth.controller.ts`, `social-auth.service.ts` |
| 5 | React Query hooks: passkeys + social connections | `admin-portal/lib/queries.ts` |
| 6 | New `/dashboard/settings/security` page | `app/dashboard/settings/security/page.tsx` |
| 7 | Rewrite `/dashboard/settings` | `app/dashboard/settings/page.tsx` |
| 8 | Sidebar: add MFA & Passkeys nav item | `dashboard-sidebar.tsx` |
| 9 | `/u/auth/callback`: handle `mode=link` | `app/u/auth/callback/page.tsx` |
