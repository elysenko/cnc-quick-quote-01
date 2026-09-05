import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Sends anonymous visitors to /login, remembering where they were headed so the
 * post-sign-in landing can be restored. Redirects at most once and never from
 * /login itself — a guard loop blanks the page.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isAuthenticated()) return true;
  return router.createUrlTree(['/login'], {
    queryParams: state.url && state.url !== '/' ? { redirect: state.url } : undefined,
  });
};

/** Staff-only areas. Customers are returned to their own quotes, not to /login. */
export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isAuthenticated()) return router.createUrlTree(['/login']);
  return auth.isAdmin() ? true : router.createUrlTree(['/quotes']);
};
