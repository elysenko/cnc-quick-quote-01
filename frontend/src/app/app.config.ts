import { APP_INITIALIZER, ApplicationConfig, inject } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { routes } from './app.routes';
import { AuthService } from './core/auth.service';
import { BrandingService } from './core/branding.service';

/**
 * Resolved before the first route activates, so the router's guards see a
 * settled session and the sign-in screen paints already branded. Both calls
 * swallow their own failures — a cold backend must still render the app rather
 * than hang on a white screen.
 */
function bootstrapApp(): () => Promise<void> {
  const auth = inject(AuthService);
  const branding = inject(BrandingService);
  return async () => {
    await Promise.all([auth.restoreSession(), branding.load()]);
  };
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(
      routes,
      withInMemoryScrolling({ scrollPositionRestoration: 'top', anchorScrolling: 'enabled' }),
    ),
    provideHttpClient(),
    provideAnimations(),
    {
      provide: APP_INITIALIZER,
      useFactory: bootstrapApp,
      multi: true,
    },
  ],
};
