import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../shared/icon.component';
import { AuthService } from '../../core/auth.service';
import { BrandingService } from '../../core/branding.service';
import { ToastService } from '../../shared/toast.service';

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [RouterLink, IconComponent],
  templateUrl: './account.component.html',
  styleUrl: './account.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountComponent {
  private readonly auth = inject(AuthService);
  private readonly brandingService = inject(BrandingService);
  private readonly toast = inject(ToastService);

  /** The live session profile — the same record the API signed us in with. */
  readonly user = this.auth.user;
  readonly isAdmin = this.auth.isAdmin;
  readonly branding = this.brandingService.branding;
  /** Stays false: nothing is saved until a profile endpoint exists. */
  readonly saved = signal(false);

  save(event: Event): void {
    event.preventDefault();
    // There is no profile update endpoint yet, so say so rather than
    // pretending the edit was stored.
    this.toast.show(
      `Profile editing isn't available yet — email ${this.branding().supportEmail} to change your details.`,
      'info',
    );
  }

  async logout(): Promise<void> {
    await this.auth.logout();
  }
}
