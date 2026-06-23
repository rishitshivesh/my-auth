import axios, { type AxiosInstance, type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import type { SentrySDKConfig } from './index';

export class SentryAPIError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'SentryAPIError';
  }

  get isUnauthorized(): boolean { return this.status === 401; }
  get isForbidden(): boolean { return this.status === 403; }
  get isNotFound(): boolean { return this.status === 404; }
  get isServerError(): boolean { return this.status >= 500; }
}

interface RetryConfig extends InternalAxiosRequestConfig {
  _retryCount?: number;
  _retry?: boolean;
}

export class SentryAxiosTransport {
  private readonly axiosInstance: AxiosInstance;
  private readonly config: SentrySDKConfig;
  private refreshPromise: Promise<void> | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  onSessionExpired?: () => void;

  constructor(config: SentrySDKConfig) {
    this.config = config;

    this.axiosInstance = axios.create({
      baseURL: config.baseURL,
      timeout: config.timeout,
      withCredentials: true, // httpOnly cookies must be sent on every request
      headers: {
        Accept: 'application/json',
        'X-Tenant-Slug': config.tenantSlug,
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Unwrap { data: T, statusCode, message } envelope from every backend response
    this.axiosInstance.interceptors.response.use(
      (response) => {
        const body = response.data as { data?: unknown; statusCode?: number; message?: string } | null;
        if (body !== null && typeof body === 'object' && 'data' in body) {
          response.data = body.data;
        }
        return response;
      },
      async (error: AxiosError) => {
        const cfg = error.config as RetryConfig | undefined;

        // Serialized refresh lock: intercept 401s and refresh once
        if (
          cfg &&
          error.response?.status === 401 &&
          !cfg._retry &&
          !cfg.url?.includes('/auth/refresh') &&
          !cfg.url?.includes('/auth/login')
        ) {
          cfg._retry = true;

          // Only one refresh in flight at a time — prevents token family revocation
          if (!this.refreshPromise) {
            this.refreshPromise = this.executeRefresh().finally(() => {
              this.refreshPromise = null;
            });
          }

          try {
            await this.refreshPromise;
            return this.axiosInstance(cfg);
          } catch {
            this.onSessionExpired?.();
            throw new SentryAPIError('Session expired', 401);
          }
        }

        // Retry once on 5xx, never on 4xx
        if (
          cfg &&
          error.response &&
          error.response.status >= 500 &&
          (cfg._retryCount ?? 0) < this.config.retries
        ) {
          cfg._retryCount = (cfg._retryCount ?? 0) + 1;
          await new Promise<void>((r) => setTimeout(r, 500 * cfg._retryCount!));
          return this.axiosInstance(cfg);
        }

        const body = error.response?.data as {
          message?: string;
          error?: string;
          statusCode?: number;
        } | undefined;

        throw new SentryAPIError(
          body?.message ?? body?.error ?? error.message ?? 'Request failed',
          error.response?.status ?? 0,
        );
      },
    );
  }

  protected async executeRefresh(): Promise<void> {
    await this.axiosInstance.post('/api/auth/refresh', null, {
      withCredentials: true,
      _retry: true,
    } as InternalAxiosRequestConfig & { _retry: boolean });
  }

  getAxiosInstance(): AxiosInstance { return this.axiosInstance; }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    const res = await this.axiosInstance.get<T>(path, { params });
    return res.data;
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    const res = await this.axiosInstance.post<T>(path, body);
    return res.data;
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
    const res = await this.axiosInstance.patch<T>(path, body);
    return res.data;
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    const res = await this.axiosInstance.put<T>(path, body);
    return res.data;
  }

  async delete<T>(path: string): Promise<T> {
    const res = await this.axiosInstance.delete<T>(path);
    return res.data;
  }

  async upload<T>(path: string, formData: FormData): Promise<T> {
    const res = await this.axiosInstance.post<T>(path, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  }

  async download(path: string, params?: Record<string, unknown>): Promise<Blob> {
    const res = await this.axiosInstance.get(path, {
      params,
      responseType: 'blob',
    });
    return res.data as Blob;
  }

  scheduleProactiveRefresh(expiresAt: number): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    const msUntilRefresh = expiresAt * 1000 - Date.now() - 60_000;

    const doRefresh = () => {
      // Use the same serialized lock as the 401 interceptor.
      // Without this, a proactive refresh racing a 401 interceptor refresh
      // causes two parallel token exchanges → token family revocation → auth loop.
      if (!this.refreshPromise) {
        this.refreshPromise = this.executeRefresh().finally(() => {
          this.refreshPromise = null;
        });
      }
      this.refreshPromise.catch(() => this.onSessionExpired?.());
    };

    if (msUntilRefresh <= 0) {
      doRefresh();
      return;
    }
    this.refreshTimer = setTimeout(doRefresh, msUntilRefresh);
  }

  clearRefreshTimer(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  async tryRestoreSession<T>(): Promise<T | null> {
    try {
      return await this.get<T>('/api/auth/session');
    } catch {
      return null;
    }
  }
}
