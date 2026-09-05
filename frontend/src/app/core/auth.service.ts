import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { SessionUser, Role } from './models';
import { ApiClient, errorMessage } from './api';
import { readJson, removeKey, writeJson } from './storage';

const USER_KEY = 'user';

interface SessionResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: { id: string; email: string; name: string | null; role: Role; company: string | null };
}

function isSessionUser(value: unknown): value is SessionUser {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  const roles: Role[] = ['USER', 'MANAGER', 'ADMIN'];
  return (
    typeof v['id'] === 'string' &&
    typeof v['email'] === 'string' &&
    typeof v['name'] === 'string' &&
    typeof v['role'] === 'string' &&
    roles.includes(v['role'] as Role)
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly router = inject(Router);
  private readonly api = inject(ApiClient);

  private readonly _user = signal<SessionUser | null>(this.restore());
  private readonly _ready = signal(false);

  readonly user = this._user.asReadonly();
  /** False until the stored session has been revalidated against the API. */
  readonly ready = this._ready.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null);
  readonly isAdmin = computed(() => {
    const role = this._user()?.role;
    return role === 'ADMIN' || role === 'MANAGER';
  });

  /**
   * Restores the cached profile so a reload paints the right shell immediately.
   * The refresh token is the real credential — `restoreSession()` confirms it
   * against the API and clears the cache if it has expired.
   */
  private restore(): SessionUser | null {
    try {
      return readJson<SessionUser>(USER_KEY, isSessionUser);
    } catch {
      removeKey(USER_KEY);
      return null;
    }
  }

  /**
   * Called once during app initialisation: exchanges the persisted refresh
   * token for a live access token so a returning visitor is not bounced to the
   * sign-in screen.
   */
  async restoreSession(): Promise<void> {
    const refreshToken = this.api.refreshToken;
    if (!refreshToken) {
      this.clear();
      this._ready.set(true);
      return;
    }
    try {
      const session = await this.api.post<SessionResponse>('/auth/refresh', { refreshToken });
      this.applySession(session);
    } catch {
      this.clear();
    } finally {
      this._ready.set(true);
    }
  }

  /** Client-side pre-checks; the server re-validates everything regardless. */
  validate(email: string, password: string): string | null {
    if (!email.trim() || !password) return 'Enter your email address and password.';
    if (!EMAIL_RE.test(email.trim())) return 'Enter a valid email address.';
    if (password.length < 8) return 'Passwords are at least 8 characters.';
    return null;
  }

  async login(email: string, password: string): Promise<{ error: string | null }> {
    const invalid = this.validate(email, password);
    if (invalid) return { error: invalid };

    try {
      const session = await this.api.post<SessionResponse>('/auth/login', {
        email: email.trim(),
        password,
      });
      this.applySession(session);
      this.routeAfterAuth(session.user.role);
      return { error: null };
    } catch (error) {
      return { error: errorMessage(error, 'We could not sign you in. Please try again.') };
    }
  }

  async signup(
    name: string,
    email: string,
    password: string,
  ): Promise<{ error: string | null }> {
    const invalid = this.validate(email, password);
    if (invalid) return { error: invalid };
    if (!name.trim()) return { error: 'Enter your name.' };

    try {
      const session = await this.api.post<SessionResponse>('/auth/register', {
        name: name.trim(),
        email: email.trim(),
        password,
      });
      this.applySession(session);
      void this.router.navigate([
        session.user.role === 'USER' ? '/quote/new/upload' : '/admin',
      ]);
      return { error: null };
    } catch (error) {
      return { error: errorMessage(error, 'We could not create your account.') };
    }
  }

  async logout(): Promise<void> {
    const refreshToken = this.api.refreshToken;
    this.clear();
    void this.router.navigate(['/login']);
    if (refreshToken) {
      // Best effort: the local session is already gone, so a network failure
      // here must not strand the user on a signed-in-looking screen.
      try {
        await this.api.post('/auth/logout', { refreshToken });
      } catch {
        /* ignored by design */
      }
    }
  }

  /** Staff land in the admin console; customers land on their quotes. */
  private routeAfterAuth(role: Role): void {
    void this.router.navigate([role === 'USER' ? '/quotes' : '/admin']);
  }

  private applySession(session: SessionResponse): void {
    this.api.setTokens(session.accessToken, session.refreshToken);
    const user: SessionUser = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name ?? session.user.email,
      role: session.user.role,
      company: session.user.company ?? undefined,
    };
    this._user.set(user);
    writeJson(USER_KEY, user);
  }

  private clear(): void {
    this._user.set(null);
    this.api.clearTokens();
    removeKey(USER_KEY);
  }
}
