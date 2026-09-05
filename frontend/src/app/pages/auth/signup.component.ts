import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { BrandingService } from '../../core/branding.service';

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './signup.component.html',
  styleUrl: './signup.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignupComponent {
  private readonly auth = inject(AuthService);
  private readonly brandingService = inject(BrandingService);

  readonly branding = this.brandingService.branding;
  readonly name = signal('');
  readonly email = signal('');
  readonly password = signal('');
  readonly confirm = signal('');
  readonly error = signal<string | null>(null);
  readonly submitting = signal(false);

  readonly previewShortcut = COLOSSUS_PREVIEW ? 'Skip signup — Demo Mode' : null;

  async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.submitting()) return;

    if (this.password() !== this.confirm()) {
      this.error.set('Those passwords do not match.');
      return;
    }

    this.submitting.set(true);
    this.error.set(null);
    try {
      const { error } = await this.auth.signup(this.name(), this.email(), this.password());
      this.error.set(error);
    } finally {
      this.submitting.set(false);
    }
  }

  // Retained because the template references it inside a preview-only block.
  demoSignIn(): void {
    /* no production behaviour — the button is compiled out of the real build */
  }
}
