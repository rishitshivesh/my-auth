/**
 * Scrolloop Sentry SDK - Core Client
 *
 * The session runtime - owns tokens, knows when to refresh
 * Works in any environment (browser, Node, Next.js)
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
} from "./types";
import { AuthError as AuthErrorClass } from "./types";
import { createFetchTransport } from "./transport";
import {
  createAuthState,
  setAccessToken,
  clearAccessToken,
  isTokenExpired,
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
      return data;
    }

    // Set access token
    if (data.accessToken) {
      setAccessToken(this.state, data.accessToken);
      this.emit({ type: "token_refreshed", accessToken: data.accessToken });
      this.config.onTokenRefreshed(data.accessToken);
    }

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
   * Reset password with OTP
   */
  async resetPassword(otp: string, password: string): Promise<void> {
    this.log("Reset password with OTP");
    const response = await this.transport({
      url: `${this.config.baseURL}/auth/reset-password`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Tenant-Slug": this.config.tenant,
      },
      body: { otp, password },
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

    const accessToken =
      response.data?.data?.data?.accessToken ||
      response.data?.data?.accessToken ||
      response.data?.accessToken;
    if (!accessToken) {
      throw new AuthErrorClass(
        "UNKNOWN_ERROR",
        "No access token in MFA verify response",
      );
    }

    setAccessToken(this.state, accessToken);
    this.emit({ type: "token_refreshed", accessToken });
    this.config.onTokenRefreshed(accessToken);
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

    const accessToken =
      response.data?.data?.accessToken || response.data?.accessToken;
    if (!accessToken) {
      throw new AuthErrorClass(
        "UNKNOWN_ERROR",
        "No access token in claim-session response",
      );
    }

    setAccessToken(this.state, accessToken);
    this.emit({ type: "token_refreshed", accessToken });
    this.config.onTokenRefreshed(accessToken);
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

    const accessToken =
      response.data?.data?.data?.accessToken ||
      response.data?.data?.accessToken ||
      response.data?.accessToken;
    if (!accessToken) {
      throw new AuthErrorClass(
        "UNKNOWN_ERROR",
        "No access token in magic-link verify response",
      );
    }

    setAccessToken(this.state, accessToken);
    this.emit({ type: "token_refreshed", accessToken });
    this.config.onTokenRefreshed(accessToken);
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

    const accessToken =
      response.data?.data?.accessToken || response.data?.accessToken;
    if (!accessToken) {
      throw new AuthErrorClass(
        "UNKNOWN_ERROR",
        "No access token in passkey login response",
      );
    }

    setAccessToken(this.state, accessToken);
    this.emit({ type: "token_refreshed", accessToken });
    this.config.onTokenRefreshed(accessToken);
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

    // Step 3: Verify with server (establishes session, sets access token)
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
   * ⭐ NEW: Try to restore session from refresh cookie
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
   * ⭐ NEW: Wait for initialization to complete
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
    await this.waitForInit(); // ← Add this line
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
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return (
      !!this.state.accessToken &&
      !isTokenExpired(this.state, this.config.refreshMargin)
    );
  }

  /**
   * Parse the JWT payload from the current access token.
   * Returns null if no token is present.
   */
  getTokenClaims(): Record<string, any> | null {
    if (!this.state.accessToken) return null;
    try {
      const payload = JSON.parse(
        atob(
          this.state.accessToken
            .split(".")[1]!
            .replace(/-/g, "+")
            .replace(/_/g, "/"),
        ),
      );
      return payload;
    } catch {
      return null;
    }
  }

  getUserTenantId(): string | null {
    return this.getTokenClaims()?.tenantId ?? null;
  }

  getUserTenantSlug(): string | null {
    return this.getTokenClaims()?.tenantSlug ?? null;
  }

  isInGroup(groupName: string): boolean {
    const groups: string[] | undefined = this.getTokenClaims()?.groups;
    return Array.isArray(groups) && groups.includes(groupName);
  }

  isSentryInternal(): boolean {
    const sentryTenantId =
      typeof process !== "undefined"
        ? (process.env as any)?.NEXT_PUBLIC_SENTRY_TENANT_ID ||
          process.env.SENTRY_TENANT_ID
        : undefined;
    const claims = this.getTokenClaims();
    if (!claims) return false;
    const tenantMatches = sentryTenantId
      ? claims.tenantId === sentryTenantId
      : claims.tenantSlug === "sentry";
    return tenantMatches && this.isInGroup("sentry-internal");
  }

  /**
   * Get current access token, silently refreshing if expired.
   *
   * Serialized: concurrent calls while a refresh is in-flight all await the
   * same this.state.refreshPromise rather than issuing duplicate requests.
   */
  async getAccessToken(): Promise<string | undefined> {
    if (isTokenExpired(this.state, this.config.refreshMargin)) {
      try {
        await this.refresh();
      } catch {
        return undefined;
      }
    }
    return this.state.accessToken;
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

    // Add auth headers
    const requestWithAuth = this.addAuthHeaders(req);

    // Make request
    const response = await this.transport(requestWithAuth);

    // If 401 and we have a token, try to refresh
    if (response.status === 401 && this.state.accessToken) {
      this.log("Got 401, attempting refresh", req.url);

      try {
        await this.refresh();

        // Retry original request with new token
        const retryRequest = this.addAuthHeaders(req);
        const retryResponse = await this.transport(retryRequest);

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
   * Add authorization and tenant headers to request
   */
  private addAuthHeaders(req: TransportRequest): TransportRequest {
    const headers = {
      "Content-Type": "application/json",
      "X-Tenant-Slug": this.config.tenant,
      Authorization: "", // Placeholder
      ...req.headers,
    };

    // Add access token if available
    if (this.state.accessToken) {
      headers["Authorization"] = `Bearer ${this.state.accessToken}`;
    }

    return {
      ...req,
      headers,
      credentials: "include", // Always send cookies
    };
  }

  // ============================================================
  // TOKEN REFRESH - THE CRITICAL PART
  // ============================================================

  /**
   * Refresh access token using refresh token cookie
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
   * Single refresh attempt
   * NO refresh token is passed - httpOnly cookie handles it
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

    // Update access token
    const newToken = response.data?.data?.accessToken;
    if (!newToken) {
      throw new AuthErrorClass(
        "REFRESH_FAILED",
        "No access token in refresh response",
      );
    }

    setAccessToken(this.state, newToken);
    this.emit({ type: "token_refreshed", accessToken: newToken });
    this.config.onTokenRefreshed(newToken);
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

    clearAccessToken(this.state);
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
