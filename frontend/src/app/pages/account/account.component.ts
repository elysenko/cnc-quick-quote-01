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

  readonly user = this.auth.user;
  readonly isAdmin = this.auth.isAdmin;
  readonly branding = this.brandingService.branding;
  readonly saved = signal(false);

  save(event: Event): void {
    event.preventDefault();
    this.saved.set(true);
    this.toast.show('Profile updated', 'success');
  }

  logout(): void {
    this.auth.logout();
  }
}
