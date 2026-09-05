import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { BrandingService } from '../../core/branding.service';

@Component({
  selector: 'app-admin-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './admin-shell.component.html',
  styleUrl: './admin-shell.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminShellComponent {
  private readonly brandingService = inject(BrandingService);
  readonly branding = this.brandingService.branding;

  readonly tabs = [
    { path: 'materials', label: 'Materials', testid: 'admin-tab-materials' },
    { path: 'pricing', label: 'Pricing', testid: 'admin-tab-pricing' },
    { path: 'machine', label: 'Machine', testid: 'admin-tab-machine' },
    { path: 'uploads', label: 'Uploads', testid: 'admin-tab-uploads' },
    { path: 'business', label: 'Business', testid: 'admin-tab-business' },
    { path: 'orders', label: 'Orders', testid: 'admin-tab-orders' },
    { path: 'settings', label: 'Settings', testid: 'admin-tab-settings' },
  ];
}
