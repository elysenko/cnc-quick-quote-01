import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { readRaw, removeKey, writeRaw } from './storage';

const BASE = '/api';
const REFRESH_KEY = 'refresh-token';

/** The API's uniform failure envelope. Every handler can rely on this shape. */
export interface ApiErrorBody {
  code: string;
  message: string;
  field: string | null;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly field: string | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** True when the server rejected the input rather than the request itself. */
  get isValidation(): boolean {
    return this.status === 422 || this.status === 409;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Skips the 401 → refresh → retry dance (used by the refresh call itself). */
  raw?: boolean;
  query?: Record<string, string | number | undefined | null>;
}

/**
 * Single entry point for every call to the backend.
 *
 * Holds the short-lived access token in memory only; the long-lived refresh
 * token is the one persisted, so a stolen localStorage snapshot cannot be
 * replayed as a bearer token. A 401 transparently refreshes once and retries,
 * and only a failed refresh bounces the user to /login.
 */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly router = inject(Router);

  private accessToken: string | null = null;
  private refreshInFlight: Promise<boolean> | null = null;

  get refreshToken(): string | null {
    return readRaw(REFRESH_KEY);
  }

  get hasSession(): boolean {
    return this.accessToken !== null || this.refreshToken !== null;
  }

  setTokens(accessToken: string, refreshToken: string): void {
    this.accessToken = accessToken;
    writeRaw(REFRESH_KEY, refreshToken);
  }

  clearTokens(): void {
    this.accessToken = null;
    removeKey(REFRESH_KEY);
  }

  get<T>(path: string, query?: RequestOptions['query']): Promise<T> {
    return this.request<T>(path, { query });
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: 'POST', body });
  }

  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: 'PATCH', body });
  }

  put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: 'PUT', body });
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' });
  }

  /** Multipart upload — the browser sets the boundary, so no Content-Type here. */
  async upload<T>(path: string, form: FormData): Promise<T> {
    return this.request<T>(path, { method: 'POST', body: form });
  }

  /**
   * Multipart upload that reports real transfer progress.
   *
   * Uses XMLHttpRequest rather than fetch because fetch exposes no upload
   * progress events — the progress bar has to reflect actual bytes sent, not a
   * timer. Refreshes once and retries on a 401, matching `request()`.
   */
  async uploadWithProgress<T>(
    path: string,
    form: FormData,
    onProgress: (percent: number) => void,
  ): Promise<T> {
    try {
      return await this.sendUpload<T>(path, form, onProgress);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401 && (await this.refreshSession())) {
        return this.sendUpload<T>(path, form, onProgress);
      }
      throw error;
    }
  }

  private sendUpload<T>(
    path: string,
    form: FormData,
    onProgress: (percent: number) => void,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open('POST', BASE + path);
      if (this.accessToken) request.setRequestHeader('Authorization', `Bearer ${this.accessToken}`);

      request.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      });

      request.addEventListener('load', () => {
        let body: Partial<ApiErrorBody> & Record<string, unknown> = {};
        try {
          body = request.responseText ? JSON.parse(request.responseText) : {};
        } catch {
          /* non-JSON response falls through to the generic error below */
        }
        if (request.status >= 200 && request.status < 300) {
          onProgress(100);
          resolve(body as T);
        } else {
          reject(
            new ApiError(
              request.status,
              (body.code as string) ?? 'request_failed',
              (body.message as string) ?? 'That upload could not be completed.',
              (body.field as string) ?? null,
            ),
          );
        }
      });

      request.addEventListener('error', () =>
        reject(new ApiError(0, 'network_error', 'The upload could not reach the server.')),
      );
      request.addEventListener('abort', () =>
        reject(new ApiError(0, 'aborted', 'The upload was cancelled.')),
      );

      request.send(form);
    });
  }

  /** Fetches a binary response (the PDF receipt) with the session attached. */
  async blob(path: string): Promise<Blob> {
    const response = await this.send(path, { method: 'GET' });
    if (!response.ok) throw await this.toError(response);
    return response.blob();
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    let response = await this.send(path, options);

    if (response.status === 401 && !options.raw) {
      const refreshed = await this.refreshSession();
      if (refreshed) {
        response = await this.send(path, options);
      } else {
        this.clearTokens();
        void this.router.navigate(['/login']);
        throw await this.toError(response);
      }
    }

    if (!response.ok) throw await this.toError(response);
    if (response.status === 204) return undefined as T;

    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  private send(path: string, options: RequestOptions): Promise<Response> {
    const headers: Record<string, string> = {};
    if (this.accessToken) headers['Authorization'] = `Bearer ${this.accessToken}`;

    const isForm = options.body instanceof FormData;
    if (options.body !== undefined && !isForm) headers['Content-Type'] = 'application/json';

    return fetch(BASE + path + toQuery(options.query), {
      method: options.method ?? 'GET',
      headers,
      body:
        options.body === undefined
          ? undefined
          : isForm
            ? (options.body as FormData)
            : JSON.stringify(options.body),
    });
  }

  /** De-duplicated: concurrent 401s share one refresh rather than racing. */
  private refreshSession(): Promise<boolean> {
    if (this.refreshInFlight) return this.refreshInFlight;

    this.refreshInFlight = (async () => {
      const refreshToken = this.refreshToken;
      if (!refreshToken) return false;
      try {
        const session = await this.request<{ accessToken: string; refreshToken: string }>(
          '/auth/refresh',
          { method: 'POST', body: { refreshToken }, raw: true },
        );
        this.setTokens(session.accessToken, session.refreshToken);
        return true;
      } catch {
        return false;
      } finally {
        this.refreshInFlight = null;
      }
    })();

    return this.refreshInFlight;
  }

  private async toError(response: Response): Promise<ApiError> {
    let body: Partial<ApiErrorBody> = {};
    try {
      body = (await response.json()) as Partial<ApiErrorBody>;
    } catch {
      /* a non-JSON failure (proxy error page) falls through to the default */
    }
    return new ApiError(
      response.status,
      body.code ?? 'request_failed',
      body.message ?? 'Something went wrong. Please try again.',
      body.field ?? null,
    );
  }
}

function toQuery(query: RequestOptions['query']): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

/** Narrows an unknown catch value to the API's message, for inline display. */
export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  return error instanceof ApiError ? error.message : fallback;
}
