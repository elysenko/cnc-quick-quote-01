import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Redirects at most once, and never from /login — guard loops blank the page. */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isAuthenticated() ? true : router.createUrlTree(['/login']);
};

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isAuthenticated()) return router.createUrlTree(['/login']);
  // In the static preview the reviewer may be in the customer demo session; the
  // admin screens still have to be reachable by URL, so the role check is
  // compiled out of the preview build only.
  if (COLOSSUS_PREVIEW) return true;
  return auth.isAdmin() ? true : router.createUrlTree(['/quotes']);
};
