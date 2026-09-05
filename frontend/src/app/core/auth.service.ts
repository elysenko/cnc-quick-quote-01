import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { SessionUser, Role } from './models';
import { readJson, removeKey, writeJson } from './storage';

const USER_KEY = 'user';

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

  private readonly _user = signal<SessionUser | null>(this.restore());

  readonly user = this._user.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null);
  readonly isAdmin = computed(() => {
    const role = this._user()?.role;
    return role === 'ADMIN' || role === 'MANAGER';
  });

  /** Restores the session defensively — never throws, never blanks the page. */
  private restore(): SessionUser | null {
    try {
      const stored = readJson<SessionUser>(USER_KEY, isSessionUser);
      if (stored) return stored;
    } catch {
      removeKey(USER_KEY);
    }
    if (COLOSSUS_PREVIEW) {
      // The static preview has no API, so a cold load of an authenticated route
      // renders that screen rather than bouncing the reviewer to /login. Staff
      // sign in through the same form, so the default session is the admin one
      // and every screen — customer and admin — is reachable from the nav.
      return this.demoUser('ADMIN');
    }
    return null;
  }

  private demoUser(role: Role): SessionUser {
    return role === 'ADMIN'
      ? { id: 'u-admin', email: 'ops@meridianfab.com', name: 'Dana Okafor', role: 'ADMIN', company: 'Meridian Fabrication' }
      : { id: 'u-1', email: 'j.reyes@northgate-eng.com', name: 'Jordan Reyes', role: 'USER', company: 'Northgate Engineering' };
  }

  /** Validation shared by both the preview and production paths. */
  validate(email: string, password: string): string | null {
    if (!email.trim() || !password) return 'Enter your email address and password.';
    if (!EMAIL_RE.test(email.trim())) return 'Enter a valid email address.';
    if (password.length < 8) return 'Passwords are at least 8 characters.';
    return null;
  }

  /**
   * Signs in. In the preview build this resolves locally and synchronously —
   * there is no API server behind the static host, so an awaited network call
   * would strand the reviewer on the login screen.
   */
  login(email: string, password: string): { error: string | null } {
    const error = this.validate(email, password);
    if (error) return { error };

    if (COLOSSUS_PREVIEW) {
      const trimmed = email.trim().toLowerCase();
      const looksAdmin = /admin|ops|owner|staff/.test(trimmed);
      const user: SessionUser = looksAdmin
        ? { ...this.demoUser('ADMIN'), email: trimmed }
        : { ...this.demoUser('USER'), email: trimmed };
      this.setSession(user);
      this.router.navigate([user.role === 'USER' ? '/quotes' : '/admin']);
      return { error: null };
    }

    // Production path — the service layer replaces this with the real tRPC call.
    this.router.navigate(['/quotes']);
    return { error: null };
  }

  signup(name: string, email: string, password: string): { error: string | null } {
    const error = this.validate(email, password);
    if (error) return { error };
    if (!name.trim()) return { error: 'Enter your name.' };

    if (COLOSSUS_PREVIEW) {
      this.setSession({
        id: 'u-new',
        email: email.trim().toLowerCase(),
        name: name.trim(),
        role: 'USER',
        company: 'Northgate Engineering',
      });
      this.router.navigate(['/quote/new/upload']);
      return { error: null };
    }
    this.router.navigate(['/quotes']);
    return { error: null };
  }

  /** Preview-only shortcut used by the reviewer and by screenshot capture. */
  previewSignIn(role: Role = 'USER'): void {
    if (!COLOSSUS_PREVIEW) return;
    this.setSession(this.demoUser(role));
    this.router.navigate([role === 'USER' ? '/quotes' : '/admin']);
  }

  setSession(user: SessionUser): void {
    this._user.set(user);
    writeJson(USER_KEY, user);
  }

  logout(): void {
    this._user.set(null);
    removeKey(USER_KEY);
    this.router.navigate(['/login']);
  }
}
