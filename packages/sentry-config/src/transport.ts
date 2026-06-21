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
}

export class SentryAxiosTransport {
  private readonly axiosInstance: AxiosInstance;
  private readonly config: SentrySDKConfig;

  constructor(config: SentrySDKConfig) {
    this.config = config;

    this.axiosInstance = axios.create({
      baseURL: config.baseURL,
      timeout: config.timeout,
      withCredentials: config.withCredentials,
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
}
