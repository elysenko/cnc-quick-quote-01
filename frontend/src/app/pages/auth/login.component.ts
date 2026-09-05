import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
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

  readonly branding = this.brandingService.branding;
  readonly email = signal('');
  readonly password = signal('');
  readonly error = signal<string | null>(null);
  readonly submitting = signal(false);

  /** Preview-only shortcut label; held in TypeScript so it is folded out of production. */
  readonly previewShortcut = COLOSSUS_PREVIEW ? 'Skip login — Demo Mode' : null;

  submit(event: Event): void {
    event.preventDefault();
    this.submitting.set(true);
    const { error } = this.auth.login(this.email(), this.password());
    this.error.set(error);
    this.submitting.set(false);
  }

  demoSignIn(): void {
    this.auth.previewSignIn('USER');
  }

  demoAdminSignIn(): void {
    this.auth.previewSignIn('ADMIN');
  }
}
