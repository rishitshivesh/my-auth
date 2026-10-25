/**
 * Scrolloop Sentry SDK - Core Client
 *
 * The session runtime - owns session state, knows when to refresh, and
 * composes the typed feature modules (core/modules/*) that cover every
 * auth-service flow the admin portal or any other client application needs.
 * Works in any environment (browser, Node, Next.js).
 *
 * The access token itself never lives here (see docs/adr/0003-access-token-delivery.md):
 * it is set by the server as an httpOnly cookie and sent automatically via
 * `credentials: "include"`. This client tracks only whether a session is
 * believed to be live (`state.authenticated`), when it is expected to expire
 * (for proactive refresh), and the non-secret session claims the server
 * returns alongside the cookie.
 *
 * There is deliberately no module-level singleton: construct one client per
 * tenant (the portal serves tenants on subdomains).
 */

import type {
  SentryConfig,
  Transport,
  TransportRequest,
  TransportResponse,
  AuthState,
  LoginCredentials,
  LoginResponse,
  User,
  AuthEvent,
  AuthEventListener,
  LoginIntentResponse,
  SessionClaims,
} from "./types";
import { AuthError as AuthErrorClass } from "./types";
import type {
  MfaLoginOutcome,
  OrgMembership,
  Passkey,
  SocialConnection,
  WebAuthnCredentialJSON,
  AuthOutcome,
  PasskeyLoginStart,
  RedirectOptions,
  MagicLinkPreview,
  ReauthRequirements,
  MagicLinkSent,
  MagicLinkVerifyOptions,
  MagicLinkVerifyOutcome,
} from "./api-types";
import { createFetchTransport } from "./transport";
import { SentryApiError } from "./errors";
import {
  createAuthState,
  markAuthenticated,
  clearAuthentication,
  queueRequest,
  flushPendingRequests,
  rejectPendingRequests,
} from "./state";
import {
  createAccountModule,
  createAuditModule,
  createSamlModule,
  createConsentModule,
  createInvitesModule,
  createMfaModule,
  createPasskeysModule,
  createSessionsModule,
  createSignInModule,
  createSocialModule,
  createTenantModule,
  type AccountModule,
  type AuditModule,
  type SamlModule,
  type ConsentModule,
  type InvitesModule,
  type MfaModule,
  type PasskeysModule,
  type SessionsModule,
  type SignInModule,
  type SocialModule,
  type TenantModule,
  type ModuleContext,
} from "./modules";
import { call, payloadOf } from "./modules/context";

type ResolvedConfig = Required<Omit<SentryConfig, "webauthn">> & Pick<SentryConfig, "webauthn">;

export class SentryClient {
  private config: ResolvedConfig;
  private state: AuthState;
  private transport: Transport;
  private listeners: AuthEventListener[] = [];
  private initPromise?: Promise<void>;

  /** Password login, MFA completion, magic link, recovery, provider discovery. */
  readonly signIn: SignInModule;
  /** Registration, email verification, profile, password, deletion, step-up. */
  readonly account: AccountModule;
  /** Authenticated MFA management (TOTP, backup codes, email OTP). */
  readonly mfa: MfaModule;
  /** Passkey sign-in, registration and management. */
  readonly passkeys: PasskeysModule;
  /** Device/session list and revocation. */
  readonly sessions: SessionsModule;
  /** Invitation preview and acceptance. */
  readonly invites: InvitesModule;
  /** OAuth/OIDC authorize URL and consent decision. */
  readonly consent: ConsentModule;
  /** Social login and account linking. */
  readonly social: SocialModule;
  /** Workspace discovery and self-service creation. */
  readonly tenant: TenantModule;
  /** Tenant audit log list/export. */
  readonly audit: AuditModule;
  /** SAML browser entry-point URLs. */
  readonly saml: SamlModule;

  constructor(config: SentryConfig) {
    this.config = {
      debug: false,
      refreshMargin: 30,
      maxRefreshRetries: 3,
      onTokenRefreshed: () => {},
      onLogout: () => {},
      onError: () => {},
      ...config, // ← Spread config FIRST
      transport: config.transport || createFetchTransport(), // ← Then set transport
    };

    this.state = createAuthState();
    this.transport = this.config.transport;

    const ctx = this.createModuleContext();
    this.signIn = createSignInModule(ctx);
    this.account = createAccountModule(ctx);
    this.mfa = createMfaModule(ctx);
    this.passkeys = createPasskeysModule(ctx, { loadBrowser: this.config.webauthn });
    this.sessions = createSessionsModule(ctx);
    this.invites = createInvitesModule(ctx);
    this.consent = createConsentModule(ctx);
    this.social = createSocialModule(ctx, this.config.tenant);
    this.tenant = createTenantModule(ctx);
    this.audit = createAuditModule(ctx);
    this.saml = createSamlModule(ctx);

    this.initPromise = this.tryRestoreSession();

    this.log("Sentry client initialized", {
      baseURL: this.config.baseURL,
      tenant: this.config.tenant,
    });
  }

  private createModuleContext(): ModuleContext {
    return {
      baseURL: this.config.baseURL,
      request: (req) => this.request(req),
      publicRequest: (req) => this.transport(this.withTenantHeaders(req)),
      fail: (response) => this.createError(response),
      sessionEstablished: (expiresIn, session) => this.onSessionEstablished(expiresIn, session),
      endLocalSession: () => this.clearSession(),
      log: (...args) => this.log(...args),
    };
  }

  // ============================================================
  // PUBLIC API - AUTHENTICATION (flat, backwards-compatible entry points;
  // each delegates to the typed module of the same name)
  // ============================================================

  /** Login with email and password. Branch on the result: session / MFA challenge / MFA enrollment. */
  login(credentials: LoginCredentials): Promise<LoginResponse> {
    return this.signIn.login(credentials);
  }

  loginIntent(email: string): Promise<LoginIntentResponse> {
    return this.signIn.loginIntent(email);
  }

  /** Request a password reset code by email. */
  forgotPassword(email: string, options?: RedirectOptions): Promise<void> {
    return this.signIn.forgotPassword(email, options);
  }

  /** Reset password with the code emailed by forgotPassword(); the code is bound to `email`. */
  resetPassword(email: string, otp: string, password: string): Promise<void> {
    return this.signIn.resetPassword(email, otp, password);
  }

  /** Complete an MFA challenge with a TOTP code (tempToken comes from login()). */
  verifyMfaLogin(tempToken: string, code: string): Promise<MfaLoginOutcome> {
    return this.signIn.verifyMfa(tempToken, code);
  }

  /** Complete an MFA challenge with a backup code (XXXX-XXXX). */
  verifyMfaBackupLogin(tempToken: string, code: string): Promise<MfaLoginOutcome> {
    return this.signIn.verifyMfaBackupCode(tempToken, code);
  }

  /** Initiate social login - redirects the browser to the OAuth provider. */
  initiateSocialLogin(provider: string): void {
    this.social.login(provider);
  }

  /**
   * Claim a social session using the completion token from /u/auth/callback?ct=...
   */
  async claimSocialSession(completionToken: string): Promise<void> {
    const response = await this.transport(
      this.withTenantHeaders({
        url: `${this.config.baseURL}/auth/social/claim-session`,
        method: "POST",
        body: { ct: completionToken },
      }),
    );
    if (!response.ok) throw this.createError(response);

    const data = payloadOf(response);
    const expiresIn = typeof data.expiresIn === "number" ? data.expiresIn : undefined;
    const session =
      typeof data.session === "object" && data.session !== null ? (data.session as SessionClaims) : undefined;
    this.onSessionEstablished(expiresIn, session);

    // Older servers omit the claims; backfill them with one refresh (the
    // refresh cookie is already set). Best-effort: failure leaves claims unset
    // until the next natural refresh and does not affect the session.
    if (!session) {
      try {
        await this.refreshOnce();
      } catch {
        this.log("Could not backfill session claims after social login");
      }
    }
  }

  sendMagicLink(email: string, options?: RedirectOptions & { poll?: boolean }): Promise<MagicLinkSent> {
    return this.signIn.sendMagicLink(email, options);
  }

  /**
   * Verify a magic link token. May yield a session, an MFA challenge, required MFA enrollment,
   * or (with `matchCode`) `{status:"confirmed-on-other-device"}` and no session.
   */
  verifyMagicLink(token: string, options?: MagicLinkVerifyOptions): Promise<MagicLinkVerifyOutcome> {
    return this.signIn.verifyMagicLink(token, options);
  }

  /** Tells the UI which proof a step-up needs, from the existing MFA status (no extra endpoint). */
  async getReauthRequirements(): Promise<ReauthRequirements> {
    const status = await this.mfa.getStatus();
    const methods = status.methods ?? [];
    return {
      mfaEnabled: status.enabled,
      methods,
      canUseTotp: status.enabled && methods.includes("totp"),
      canUsePasskey: status.enabled && (methods.includes("webauthn") || methods.includes("passkey")),
    };
  }

  previewMagicLink(token: string): Promise<MagicLinkPreview> {
    return this.signIn.previewMagicLink(token);
  }

  /** Start WebAuthn authentication; returns options plus the `sessionNonce` for finishPasskeyLogin(). */
  startPasskeyLogin(email: string): Promise<PasskeyLoginStart> {
    return this.passkeys.startLogin(email);
  }

  finishPasskeyLogin(
    email: string,
    assertion: WebAuthnCredentialJSON,
    sessionNonce: string,
  ): Promise<AuthOutcome> {
    return this.passkeys.finishLogin(email, assertion, sessionNonce);
  }

  /** Complete passkey authentication in one step (browser only). */
  authenticateWithPasskey(email: string): Promise<AuthOutcome> {
    return this.passkeys.authenticate(email);
  }

  startPasskeyRegistration(): Promise<WebAuthnCredentialJSON> {
    return this.passkeys.startRegistration();
  }

  finishPasskeyRegistration(
    registrationResponse: WebAuthnCredentialJSON,
    deviceName?: string,
  ): Promise<{ credentialId: string }> {
    return this.passkeys.finishRegistration(registrationResponse, deviceName);
  }

  listPasskeys(): Promise<Passkey[]> {
    return this.passkeys.list();
  }

  deletePasskey(credentialId: string): Promise<void> {
    return this.passkeys.remove(credentialId);
  }

  getSocialConnections(): Promise<SocialConnection[]> {
    return this.social.listConnections();
  }

  unlinkSocialAccount(provider: string): Promise<void> {
    return this.social.unlink(provider);
  }

  initiateSocialLinking(provider: string): Promise<void> {
    return this.social.startLinking(provider);
  }

  /**
   * Logout - clear session
   */
  async logout(): Promise<void> {
    this.log("Logout");

    try {
      // Call logout endpoint (clears refresh cookie)
      await this.request({
        url: `${this.config.baseURL}/auth/logout`,
        method: "POST",
      });
    } catch (error) {
      // Logout even if API call fails
      this.log("Logout API call failed", error);
    } finally {
      this.clearSession();
    }
  }

  /**
   * Try to restore session from refresh cookie on page load
   */
  private async tryRestoreSession(): Promise<void> {
    try {
      this.log("Attempting to restore session from refresh cookie");
      await this.refreshOnce();
      this.log("Session restored successfully");
    } catch (error) {
      // No valid refresh cookie — expected on first load or after magic-link
      // landing before a session has been established.
      this.log("No valid session to restore", error);
    }
  }

  /**
   * Wait for initialization (session restore attempt) to complete
   */
  async waitForInit(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
    }
  }

  /**
   * Get the configured base URL
   */
  getBaseURL(): string {
    return this.config.baseURL;
  }

  /** The tenant slug this client is bound to. */
  getTenant(): string {
    return this.config.tenant;
  }

  /**
   * Get all orgs the current user belongs to (home tenant + guest memberships)
   */
  getUserOrgs(): Promise<OrgMembership[]> {
    return this.tenant.listMyOrgs();
  }

  /**
   * Get current user
   */
  async getCurrentUser(): Promise<User> {
    await this.waitForInit();
    this.log("Get current user");
    return call<User>(this.createModuleContext(), {
      url: `${this.config.baseURL}/users/me`,
      method: "GET",
    });
  }

  /**
   * Check if the client believes it currently has a live session.
   *
   * This reflects the outcome of the last login/refresh/session-restore
   * call, not possession of a credential — the SDK never holds the access
   * token itself (ADR-0003). A false positive (session actually expired
   * server-side) is caught by the 401→refresh→retry path on the next request.
   */
  isAuthenticated(): boolean {
    return this.state.authenticated;
  }

  /**
   * Non-secret session claims (tenantId, tenantSlug, groups) from the last
   * successful login/refresh. Returns null before any session is established.
   */
  getSessionClaims(): SessionClaims | null {
    return this.state.session ?? null;
  }

  getUserTenantSlug(): string | null {
    return this.state.session?.tenantSlug ?? null;
  }

  // ============================================================
  // REQUEST PIPELINE - THE CORE LOGIC
  // ============================================================

  /**
   * Make an authenticated request
   * Handles 401s with automatic refresh
   */
  async request(req: TransportRequest): Promise<TransportResponse> {
    // If currently refreshing, queue this request
    if (this.state.isRefreshing) {
      this.log("Request queued (refresh in progress)", req.url);
      return this.queueRequestDuringRefresh(req);
    }

    const response = await this.transport(this.withTenantHeaders(req));

    // On 401, always try one silent refresh + retry — we have no local
    // token-possession flag to gate this on, and the attempt is cheap.
    if (response.status === 401) {
      this.log("Got 401, attempting refresh", req.url);

      try {
        await this.refresh();

        const retryResponse = await this.transport(this.withTenantHeaders(req));

        if (retryResponse.status === 401) {
          // Still 401 after refresh - session is dead
          this.log("Still 401 after refresh - session expired");
          this.clearSession();
          throw new AuthErrorClass(
            "SESSION_EXPIRED",
            "Your session has expired. Please log in again.",
          );
        }

        return retryResponse;
      } catch (error) {
        // Refresh failed
        this.log("Refresh failed", error);
        this.clearSession();
        throw error;
      }
    }

    return response;
  }

  /**
   * Add tenant header and cookie credentials to a request.
   * No Authorization header is ever set — the httpOnly cookie is the only
   * credential this client sends (ADR-0003).
   */
  private withTenantHeaders(req: TransportRequest): TransportRequest {
    return {
      ...req,
      headers: {
        "Content-Type": "application/json",
        "X-Tenant-Slug": this.config.tenant,
        ...req.headers,
      },
      credentials: "include", // Always send cookies
    };
  }

  // ============================================================
  // TOKEN REFRESH - THE CRITICAL PART
  // ============================================================

  /**
   * Refresh the session using the refresh token cookie.
   * Concurrency-safe - only one refresh at a time
   */
  private async refresh(): Promise<void> {
    // If already refreshing, wait for that refresh
    if (this.state.isRefreshing && this.state.refreshPromise) {
      this.log("Refresh already in progress, waiting...");
      return this.state.refreshPromise;
    }

    this.state.isRefreshing = true;
    this.log("Starting token refresh");

    this.state.refreshPromise = this.refreshWithRetry();

    try {
      await this.state.refreshPromise;
    } finally {
      this.state.isRefreshing = false;
      this.state.refreshPromise = undefined;

      // Process queued requests
      this.processQueuedRequests();
    }
  }

  /**
   * Refresh with exponential backoff retry
   */
  private async refreshWithRetry(): Promise<void> {
    let attempt = 0;
    let lastError: unknown;

    while (attempt < this.config.maxRefreshRetries) {
      try {
        await this.refreshOnce();
        this.log("Token refresh successful");
        return;
      } catch (error) {
        lastError = error;
        attempt++;

        if (attempt < this.config.maxRefreshRetries) {
          const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
          this.log(
            `Refresh attempt ${attempt} failed, retrying in ${delay}ms`,
            error,
          );
          await this.sleep(delay);
        }
      }
    }

    // All retries failed
    this.log("All refresh attempts failed", lastError);
    throw new AuthErrorClass(
      "REFRESH_FAILED",
      "Failed to refresh token",
      lastError,
    );
  }

  /**
   * Single refresh attempt.
   * No refresh token is passed - the httpOnly cookie handles it, and the
   * server sets a new access-token cookie; the body carries only
   * non-secret session metadata.
   */
  private async refreshOnce(): Promise<void> {
    const response = await this.transport({
      url: `${this.config.baseURL}/auth/refresh`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Tenant-Slug": this.config.tenant,
      },
      credentials: "include", // This sends the refresh cookie
    });

    if (!response.ok) {
      throw new AuthErrorClass(
        "REFRESH_FAILED",
        "Refresh failed",
        response.data,
      );
    }

    const data = payloadOf(response);
    this.onSessionEstablished(
      typeof data.expiresIn === "number" ? data.expiresIn : undefined,
      data.session as SessionClaims | undefined,
    );
  }

  /**
   * Record a successful login/refresh/verify: mark the session live, cache
   * the non-secret claims the server returned, and notify listeners. Never
   * receives or stores the access token itself.
   */
  private onSessionEstablished(expiresIn?: number, session?: SessionClaims): void {
    markAuthenticated(this.state, expiresIn, session);
    this.emit({ type: "token_refreshed" });
    this.config.onTokenRefreshed();
  }

  // ============================================================
  // REQUEST QUEUING
  // ============================================================

  /**
   * Queue a request during token refresh
   */
  private queueRequestDuringRefresh(
    req: TransportRequest,
  ): Promise<TransportResponse> {
    return new Promise((resolve, reject) => {
      queueRequest(this.state, {
        request: req,
        resolve,
        reject,
      });
    });
  }

  /**
   * Process all queued requests after refresh completes
   */
  private processQueuedRequests(): void {
    const count = this.state.pendingRequests.length;
    if (count === 0) return;

    this.log(`Processing ${count} queued requests`);

    flushPendingRequests(this.state, async (pendingReq) => {
      try {
        const response = await this.request(pendingReq.request);
        pendingReq.resolve(response);
      } catch (error) {
        pendingReq.reject(error);
      }
    });
  }

  // ============================================================
  // SESSION MANAGEMENT
  // ============================================================

  /**
   * Clear local session state
   */
  private clearSession(): void {
    this.log("Clearing session");

    clearAuthentication(this.state);
    rejectPendingRequests(
      this.state,
      new AuthErrorClass("SESSION_EXPIRED", "Session expired"),
    );

    this.emit({ type: "logout" });
    this.emit({ type: "session_expired" });
    this.config.onLogout();
  }

  // ============================================================
  // EVENTS
  // ============================================================

  /**
   * Subscribe to auth events
   */
  on(listener: AuthEventListener): () => void {
    this.listeners.push(listener);

    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Emit event to all listeners
   */
  private emit(event: AuthEvent): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.error("Error in auth event listener:", error);
      }
    });
  }

  // ============================================================
  // UTILITIES
  // ============================================================

  /**
   * Create AuthError from response
   */
  private createError(response: TransportResponse): AuthErrorClass {
    const error = SentryApiError.fromResponse(response);

    this.emit({ type: "error", error });
    this.config.onError(error);

    return error;
  }

  /**
   * Sleep utility for retry backoff
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Debug logging
   */
  log(...args: unknown[]): void {
    if (this.config.debug) {
      console.log("[Sentry]", ...args);
    }
  }
}
