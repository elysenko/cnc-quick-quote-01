import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { BrandingService } from '../../core/branding.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly brandingService = inject(BrandingService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly branding = this.brandingService.branding;
  readonly email = signal('');
  readonly password = signal('');
  readonly error = signal<string | null>(null);
  readonly submitting = signal(false);

  /** Preview-only shortcut label; null in production, so the demo row never renders. */
  readonly previewShortcut = COLOSSUS_PREVIEW ? 'Skip login — Demo Mode' : null;

  async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.submitting()) return;

    this.submitting.set(true);
    this.error.set(null);
    try {
      const { error } = await this.auth.login(this.email(), this.password());
      this.error.set(error);
      if (!error) this.returnToRequestedPage();
    } finally {
      this.submitting.set(false);
    }
  }

  /** Honours `?redirect=` from the auth guard so a deep link survives sign-in. */
  private returnToRequestedPage(): void {
    const redirect = this.route.snapshot.queryParamMap.get('redirect');
    if (redirect && redirect.startsWith('/')) void this.router.navigateByUrl(redirect);
  }

  // Retained because the template references them inside a preview-only block.
  demoSignIn(): void {
    /* no production behaviour — the button is compiled out of the real build */
  }

  demoAdminSignIn(): void {
    /* no production behaviour — the button is compiled out of the real build */
  }
}
