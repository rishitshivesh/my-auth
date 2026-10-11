/**
 * Scrolloop Sentry SDK - Core Client
 *
 * The session runtime - owns tokens, knows when to refresh
 * Works in any environment (browser, Node, Next.js)
 *
 * The access token itself never lives here (see docs/adr/0003-access-token-delivery.md):
 * it is set by the server as an httpOnly cookie and sent automatically via
 * `credentials: "include"`. This client tracks only whether a session is
 * believed to be live (`state.authenticated`), when it is expected to expire
 * (for proactive refresh), and the non-secret session claims the server
 * returns alongside the cookie.
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
  AuthError,
  AuthEvent,
  AuthEventListener,
  LoginIntentResponse,
  SessionClaims,
} from "./types";
import { AuthError as AuthErrorClass } from "./types";
import { createFetchTransport } from "./transport";
import {
  createAuthState,
  markAuthenticated,
  clearAuthentication,
  queueRequest,
  flushPendingRequests,
  rejectPendingRequests,
} from "./state";

export class SentryClient {
  private config: Required<SentryConfig>;
  private state: AuthState;
  private transport: Transport;
  private listeners: AuthEventListener[] = [];
  private initPromise?: Promise<void>;

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
    this.initPromise = this.tryRestoreSession();

    this.log("Sentry client initialized", {
      baseURL: this.config.baseURL,
      tenant: this.config.tenant,
    });
  }

  // ============================================================
  // PUBLIC API - AUTHENTICATION
  // ============================================================

  /**
   * Login with email and password
   */
  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    this.log("Login attempt", { email: credentials.email });

    const response = await this.request({
      url: `${this.config.baseURL}/auth/login`,
      method: "POST",
      body: credentials,
    });

    if (!response.ok) {
      throw this.createError(response);
    }

    const data = response.data?.data;

    // Handle MFA challenge
    if (data.mfaRequired) {
      this.log("MFA required");
      return {
        mfaRequired: true,
        mfaChallenge: {
          tempToken: data.tempToken,
          methods: data.availableMethods || [],
          preferredMethod: data.preferredMethod,
        },
      } as any;
    }

    this.onSessionEstablished(data.expiresIn, data.session);
    this.log("Login successful", { email: data.user?.email });

    return data;
  }

  async loginIntent(email: string): Promise<LoginIntentResponse> {
    this.log("Login Intent request", { email });
    const response = await this.request({
      url: `${this.config.baseURL}/auth/login-intent`,
      method: "POST",
      body: { email },
    });

    if (!response.ok) {
      throw this.createError(response);
    }

    return response.data?.data;
  }

  /**
   * Request password reset OTP
   */
  async forgotPassword(email: string): Promise<void> {
    this.log("Forgot password request", { email });
    const response = await this.transport({
      url: `${this.config.baseURL}/auth/forgot-password`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Tenant-Slug": this.config.tenant,
      },
      body: { email },
    });

    if (!response.ok) {
      throw this.createError(response);
    }
  }

  /**
   * Reset password with the code emailed by forgotPassword().
   * The code is bound to `email`; it is rejected for any other account.
   */
  async resetPassword(email: string, otp: string, password: string): Promise<void> {
    this.log("Reset password with OTP");
    const response = await this.transport({
      url: `${this.config.baseURL}/auth/reset-password`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Tenant-Slug": this.config.tenant,
      },
      body: { email, otp, password },
    });

    if (!response.ok) {
      throw this.createError(response);
    }
  }

  /**
   * Verify TOTP code during MFA login step.
   * tempToken is the short-lived token returned by /auth/login when mfaRequired=true.
   */
  async verifyMfaLogin(tempToken: string, code: string): Promise<void> {
    const response = await this.transport({
      url: `${this.config.baseURL}/auth/mfa/verify`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Tenant-Slug": this.config.tenant,
      },
      body: { tempToken, code },
      credentials: "include",
    });

    if (!response.ok) {
      throw this.createError(response);
    }

    const data = response.data?.data;
    this.onSessionEstablished(data?.expiresIn, data?.session);
  }

  /**
   * Initiate social login — redirects the browser to the OAuth provider
   */
  initiateSocialLogin(provider: string): void {
    if (typeof window === "undefined") {
      throw new Error(
        "initiateSocialLogin is only available in browser environments",
      );
    }
    const returnUrl = encodeURIComponent(window.location.origin);
    window.location.href = `${this.config.baseURL}/auth/social/${provider}/login?tenant_id=${this.config.tenant}&return_url=${returnUrl}`;
  }

  /**
   * Claim a social session using the completion token from /u/auth/callback?ct=...
   */
  async claimSocialSession(completionToken: string): Promise<void> {
    const response = await this.transport({
      url: `${this.config.baseURL}/auth/social/claim-session`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Tenant-Slug": this.config.tenant,
      },
      body: { ct: completionToken },
      credentials: "include",
    });

    if (!response.ok) {
      throw this.createError(response);
    }

    const data = response.data?.data;
    this.onSessionEstablished(data?.expiresIn, data?.session);

    // The claim-session completion token carries no tenant/group claims (it
    // only wraps the access token itself), so `data.session` is always
    // absent here. Backfill it with one refresh call — the refresh-token
    // cookie is already set from the OAuth callback step, so this succeeds
    // silently and brings `getSessionClaims()`/`getUserTenantSlug()` in line
    // with every other login path. Best-effort: a failure here just leaves
    // session claims unset until the next natural refresh, it does not
    // affect the session this method just established.
    if (!data?.session) {
      try {
        await this.refreshOnce();
      } catch {
        this.log("Could not backfill session claims after social login");
      }
    }
  }

  /**
   * Send a magic link sign-in email
   */
  async sendMagicLink(email: string): Promise<void> {
    const response = await this.transport({
      url: `${this.config.baseURL}/auth/magic-link/send`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Tenant-Slug": this.config.tenant,
      },
      body: { email },
    });

    if (!response.ok) {
      throw this.createError(response);
    }
  }

  /**
   * Verify a magic link token and establish session
   */
  async verifyMagicLink(token: string): Promise<void> {
    const response = await this.transport({
      url: `${this.config.baseURL}/auth/magic-link/verify`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Tenant-Slug": this.config.tenant,
      },
      body: { token },
      credentials: "include",
    });

    if (!response.ok) {
      throw this.createError(response);
    }

    const data = response.data?.data;
    this.onSessionEstablished(data?.expiresIn, data?.session);
  }

  /**
   * Start WebAuthn (passkey) authentication.
   * Returns the raw server response which includes both WebAuthn options and
   * the opaque `sessionNonce` required by `finishPasskeyLogin`.
   */
  async startPasskeyLogin(email: string): Promise<any> {
    const response = await this.request({
      url: `${this.config.baseURL}/auth/webauthn/login/start`,
      method: "POST",
      body: { email },
    });

    if (!response.ok) {
      throw this.createError(response);
    }

    return response.data?.data || response.data;
  }

  /**
   * Finish WebAuthn (passkey) authentication with the browser assertion.
   *
   * @param sessionNonce - Opaque nonce returned by `startPasskeyLogin()`; the
   *   server uses it to retrieve the single-use challenge from Redis.
   */
  async finishPasskeyLogin(
    email: string,
    assertion: any,
    sessionNonce: string,
  ): Promise<void> {
    const response = await this.request({
      url: `${this.config.baseURL}/auth/webauthn/login/finish`,
      method: "POST",
      body: { email, response: assertion, sessionNonce },
      credentials: "include",
    } as any);

    if (!response.ok) {
      throw this.createError(response);
    }

    const data = response.data?.data;
    this.onSessionEstablished(data?.expiresIn, data?.session);
  }

  /**
   * Complete passkey authentication in one step (browser-side orchestration).
   *
   * 1. Fetches WebAuthn options + sessionNonce from the server.
   * 2. Calls `startAuthentication(options)` from `@simplewebauthn/browser`.
   * 3. Verifies the assertion with the server and establishes a session.
   *
   * Throws `AuthError` with code `PASSKEY_AUTH_CANCELLED` if the user cancels
   * or if the browser does not support WebAuthn.
   */
  async authenticateWithPasskey(email: string): Promise<void> {
    if (typeof window === "undefined") {
      throw new AuthErrorClass(
        "PASSKEY_NOT_SUPPORTED",
        "authenticateWithPasskey is only available in browser environments",
      );
    }

    // Step 1: Get options + nonce from server
    const serverData = await this.startPasskeyLogin(email);
    const { sessionNonce, ...optionsJSON } = serverData;

    // Step 2: Invoke the browser's native WebAuthn API
    let assertion: any;
    try {
      const { startAuthentication } = await import(
        "@simplewebauthn/browser" as any
      );
      assertion = await startAuthentication({ optionsJSON });
    } catch (err: any) {
      if (err?.name === "NotAllowedError" || err?.name === "AbortError") {
        throw new AuthErrorClass(
          "PASSKEY_AUTH_CANCELLED",
          "Passkey authentication was cancelled",
        );
      }
      if (err?.name === "NotSupportedError" || err?.name === "SecurityError") {
        throw new AuthErrorClass(
          "PASSKEY_NOT_SUPPORTED",
          "This browser or device does not support passkeys",
        );
      }
      throw err;
    }

    // Step 3: Verify with server (establishes session, sets auth cookies)
    await this.finishPasskeyLogin(email, assertion, sessionNonce);
  }

  // ── Passkey Registration & Management ──────────────────────────────

  /**
   * Register a new passkey credential.
   *
   * 1. Fetches WebAuthn registration options from the server.
   * 2. Calls `startRegistration(options)` from `@simplewebauthn/browser`
   *    to invoke the device's authenticator.
   * 3. Returns the browser's `RegistrationResponseJSON` for use with
   *    `finishPasskeyRegistration()`.
   *
   * Throws `AuthError` with code `PASSKEY_REGISTRATION_CANCELLED` if the
   * user dismisses the prompt or if the browser API is unavailable.
   */
  async startPasskeyRegistration(): Promise<any> {
    if (typeof window === "undefined") {
      throw new AuthErrorClass(
        "PASSKEY_NOT_SUPPORTED",
        "startPasskeyRegistration is only available in browser environments",
      );
    }

    // Step 1: Fetch registration options from server
    const optionsResponse = await this.request({
      url: `${this.config.baseURL}/mfa/webauthn/register/start`,
      method: "POST",
    });
    if (!optionsResponse.ok) throw this.createError(optionsResponse);
    const optionsJSON = optionsResponse.data?.data || optionsResponse.data;

    // Step 2: Invoke the browser's native WebAuthn API
    try {
      const { startRegistration } = await import(
        "@simplewebauthn/browser" as any
      );
      return await startRegistration({ optionsJSON });
    } catch (err: any) {
      if (err?.name === "NotAllowedError" || err?.name === "AbortError") {
        throw new AuthErrorClass(
          "PASSKEY_REGISTRATION_CANCELLED",
          "Passkey registration was cancelled",
        );
      }
      if (err?.name === "NotSupportedError" || err?.name === "SecurityError") {
        throw new AuthErrorClass(
          "PASSKEY_REGISTRATION_CANCELLED",
          "This browser or device does not support passkeys",
        );
      }
      throw err;
    }
  }

  /** Finish WebAuthn passkey registration — verifies and stores the credential */
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
    const data = response.data?.data || response.data;
    if (!data?.credentialId) {
      throw new AuthErrorClass(
        "UNKNOWN_ERROR",
        "No credentialId in registration response",
      );
    }
    return data as { credentialId: string };
  }

  /** List all registered passkeys for the current user */
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

  /** Delete a registered passkey by credential ID */
  async deletePasskey(credentialId: string): Promise<void> {
    const response = await this.request({
      url: `${this.config.baseURL}/mfa/webauthn/credentials/${credentialId}`,
      method: "DELETE",
    });
    if (!response.ok) throw this.createError(response);
  }

  // ── Social Connections & Account Linking ───────────────────────────

  /** Get all linked social accounts for the current user */
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

  /** Unlink a social account from the current user */
  async unlinkSocialAccount(provider: string): Promise<void> {
    const response = await this.request({
      url: `${this.config.baseURL}/social/connections/${provider}`,
      method: "DELETE",
    });
    if (!response.ok) throw this.createError(response);
  }

  /**
   * Initiate social account linking for an already-authenticated user.
   * Fetches a short-lived link token then navigates the browser to the
   * OAuth flow so the backend can associate the callback with this user.
   */
  async initiateSocialLinking(provider: string): Promise<void> {
    const response = await this.request({
      url: `${this.config.baseURL}/social/link/token`,
      method: "POST",
    });
    if (!response.ok) throw this.createError(response);
    const linkToken =
      response.data?.data?.linkToken || response.data?.linkToken;
    if (!linkToken) {
      throw new AuthErrorClass("UNKNOWN_ERROR", "No link token in response");
    }
    // Full page navigation — OAuth requires a browser redirect, not fetch
    if (typeof window === "undefined") {
      throw new AuthErrorClass(
        "UNKNOWN_ERROR",
        "initiateSocialLinking is only available in browser environments",
      );
    }
    window.location.href = `${this.config.baseURL}/social/link/${provider}?lt=${linkToken}`;
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

      // Try to refresh - uses httpOnly cookie
      await this.refreshOnce();

      this.log("Session restored successfully");
    } catch (error) {
      // No valid refresh cookie — this is expected on first load or after magic-link
      // landing before a session has been established. Do not surface to console.
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

  /**
   * Get all orgs the current user belongs to (home tenant + guest memberships)
   */
  async getUserOrgs(): Promise<
    Array<{
      tenantId: string;
      slug: string;
      name: string;
      role: string;
      isGuest: boolean;
      logoUrl?: string;
    }>
  > {
    const response = await this.request({
      url: `${this.config.baseURL}/users/orgs`,
      method: 'GET',
    });
    if (!response.ok) throw this.createError(response);
    const payload = response.data?.data ?? response.data;
    return Array.isArray(payload) ? payload : [];
  }

  /**
   * Get current user
   */
  async getCurrentUser(): Promise<User> {
    await this.waitForInit();
    this.log("Get current user");

    const response = await this.request({
      url: `${this.config.baseURL}/users/me`,
      method: "GET",
    });

    if (!response.ok) {
      throw this.createError(response);
    }

    return response.data?.data;
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
    let lastError: any;

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

    const data = response.data?.data;
    this.onSessionEstablished(data?.expiresIn, data?.session);
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
  private createError(response: TransportResponse): AuthError {
    const data = response.data;

    const code = data?.code || this.statusToErrorCode(response.status);
    const message = data?.message || response.statusText || "Request failed";

    const error = new AuthErrorClass(code, message, data);

    this.emit({ type: "error", error });
    this.config.onError(error);

    return error;
  }

  /**
   * Map HTTP status to error code
   */
  private statusToErrorCode(status: number): any {
    switch (status) {
      case 401:
        return "UNAUTHORIZED";
      case 403:
        return "FORBIDDEN";
      case 404:
        return "USER_NOT_FOUND";
      case 429:
        return "RATE_LIMIT_EXCEEDED";
      default:
        return "UNKNOWN_ERROR";
    }
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
  private log(...args: any[]): void {
    if (this.config.debug) {
      console.log("[Sentry]", ...args);
    }
  }
}
