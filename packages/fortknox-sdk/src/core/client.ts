/**
 * Fort Knox SDK - Core Client
 * 
 * The session runtime - owns tokens, knows when to refresh
 * Works in any environment (browser, Node, Next.js)
 */

import type {
  FortKnoxConfig,
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
} from './types';
import { AuthError as AuthErrorClass } from './types';
import { createFetchTransport } from './transport';
import {
  createAuthState,
  setAccessToken,
  clearAccessToken,
  isTokenExpired,
  queueRequest,
  flushPendingRequests,
  rejectPendingRequests,
} from './state';

export class FortKnoxClient {
  private config: Required<FortKnoxConfig>;
  private state: AuthState;
  private transport: Transport;
  private listeners: AuthEventListener[] = [];

  constructor(config: FortKnoxConfig) {
    this.config = {
      debug: false,
      refreshMargin: 30,
      maxRefreshRetries: 3,
      onTokenRefreshed: () => {},
      onLogout: () => {},
      onError: () => {},
      transport: createFetchTransport(),
      ...config,
    };

    this.state = createAuthState();
    this.transport = this.config.transport;

    this.log('FortKnox client initialized', {
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
    this.log('Login attempt', { email: credentials.email });

    const response = await this.request({
      url: `${this.config.baseURL}/auth/login`,
      method: 'POST',
      body: credentials,
    });

    if (!response.ok) {
      throw this.createError(response);
    }

    const data = response.data;

    // Handle MFA challenge
    if (data.mfaRequired) {
      this.log('MFA required');
      return data;
    }

    // Set access token
    if (data.accessToken) {
      setAccessToken(this.state, data.accessToken);
      this.emit({ type: 'token_refreshed', accessToken: data.accessToken });
      this.config.onTokenRefreshed(data.accessToken);
    }

    this.log('Login successful', { userId: data.user?.id });

    return data;
  }

  /**
   * Logout - clear session
   */
  async logout(): Promise<void> {
    this.log('Logout');

    try {
      // Call logout endpoint (clears refresh cookie)
      await this.request({
        url: `${this.config.baseURL}/auth/logout`,
        method: 'POST',
      });
    } catch (error) {
      // Logout even if API call fails
      this.log('Logout API call failed', error);
    } finally {
      this.clearSession();
    }
  }

  /**
   * Get current user
   */
  async getCurrentUser(): Promise<User> {
    this.log('Get current user');

    const response = await this.request({
      url: `${this.config.baseURL}/users/me`,
      method: 'GET',
    });

    if (!response.ok) {
      throw this.createError(response);
    }

    return response.data;
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return !!this.state.accessToken && !isTokenExpired(this.state, this.config.refreshMargin);
  }

  /**
   * Get current access token (or undefined)
   */
  getAccessToken(): string | undefined {
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
      this.log('Request queued (refresh in progress)', req.url);
      return this.queueRequestDuringRefresh(req);
    }

    // Add auth headers
    const requestWithAuth = this.addAuthHeaders(req);

    // Make request
    const response = await this.transport(requestWithAuth);

    // If 401 and we have a token, try to refresh
    if (response.status === 401 && this.state.accessToken) {
      this.log('Got 401, attempting refresh', req.url);
      
      try {
        await this.refresh();
        
        // Retry original request with new token
        const retryRequest = this.addAuthHeaders(req);
        const retryResponse = await this.transport(retryRequest);
        
        if (retryResponse.status === 401) {
          // Still 401 after refresh - session is dead
          this.log('Still 401 after refresh - session expired');
          this.clearSession();
          throw new AuthErrorClass('SESSION_EXPIRED', 'Your session has expired. Please log in again.');
        }
        
        return retryResponse;
      } catch (error) {
        // Refresh failed
        this.log('Refresh failed', error);
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
      'Content-Type': 'application/json',
      'X-Tenant-ID': this.config.tenant,
      'Authorization': '', // Placeholder
      ...req.headers,
    };

    // Add access token if available
    if (this.state.accessToken) {
      headers['Authorization'] = `Bearer ${this.state.accessToken}`;
    }

    return {
      ...req,
      headers,
      credentials: 'include', // Always send cookies
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
      this.log('Refresh already in progress, waiting...');
      return this.state.refreshPromise;
    }

    this.state.isRefreshing = true;
    this.log('Starting token refresh');

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
        this.log('Token refresh successful');
        return;
      } catch (error) {
        lastError = error;
        attempt++;
        
        if (attempt < this.config.maxRefreshRetries) {
          const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
          this.log(`Refresh attempt ${attempt} failed, retrying in ${delay}ms`, error);
          await this.sleep(delay);
        }
      }
    }

    // All retries failed
    this.log('All refresh attempts failed', lastError);
    throw new AuthErrorClass('REFRESH_FAILED', 'Failed to refresh token', lastError);
  }

  /**
   * Single refresh attempt
   * NO refresh token is passed - httpOnly cookie handles it
   */
  private async refreshOnce(): Promise<void> {
    const response = await this.transport({
      url: `${this.config.baseURL}/auth/refresh`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-ID': this.config.tenant,
      },
      credentials: 'include', // This sends the refresh cookie
    });

    if (!response.ok) {
      throw new AuthErrorClass('REFRESH_FAILED', 'Refresh failed', response.data);
    }

    // Update access token
    const newToken = response.data.accessToken;
    if (!newToken) {
      throw new AuthErrorClass('REFRESH_FAILED', 'No access token in refresh response');
    }

    setAccessToken(this.state, newToken);
    this.emit({ type: 'token_refreshed', accessToken: newToken });
    this.config.onTokenRefreshed(newToken);
  }

  // ============================================================
  // REQUEST QUEUING
  // ============================================================

  /**
   * Queue a request during token refresh
   */
  private queueRequestDuringRefresh(req: TransportRequest): Promise<TransportResponse> {
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
    this.log('Clearing session');
    
    clearAccessToken(this.state);
    rejectPendingRequests(this.state, new AuthErrorClass('SESSION_EXPIRED', 'Session expired'));
    
    this.emit({ type: 'logout' });
    this.emit({ type: 'session_expired' });
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
        console.error('Error in auth event listener:', error);
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
    const message = data?.message || response.statusText || 'Request failed';
    
    const error = new AuthErrorClass(code, message, data);
    
    this.emit({ type: 'error', error });
    this.config.onError(error);
    
    return error;
  }

  /**
   * Map HTTP status to error code
   */
  private statusToErrorCode(status: number): any {
    switch (status) {
      case 401: return 'UNAUTHORIZED';
      case 403: return 'FORBIDDEN';
      case 404: return 'USER_NOT_FOUND';
      case 429: return 'RATE_LIMIT_EXCEEDED';
      default: return 'UNKNOWN_ERROR';
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
      console.log('[FortKnox]', ...args);
    }
  }
}
