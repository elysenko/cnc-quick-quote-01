import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { IconComponent, IconName } from '../shared/icon.component';
import { AuthService } from '../core/auth.service';
import { BrandingService } from '../core/branding.service';

interface NavItem {
  label: string;
  shortLabel: string;
  path: string;
  testid: string;
  icon: IconName;
  exact: boolean;
  adminOnly?: boolean;
}

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, IconComponent],
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShellComponent {
  private readonly auth = inject(AuthService);
  private readonly brandingService = inject(BrandingService);

  readonly branding = this.brandingService.branding;
  readonly user = this.auth.user;
  readonly isAdmin = this.auth.isAdmin;
  readonly drawerOpen = signal(false);

  private readonly allItems = signal<NavItem[]>([
    { label: 'New quote', shortLabel: 'Quote', path: '/quote/new/upload', testid: 'nav-new-quote', exact: false, icon: 'plus' },
    { label: 'My quotes', shortLabel: 'Quotes', path: '/quotes', testid: 'nav-quotes', exact: false, icon: 'doc' },
    { label: 'Orders', shortLabel: 'Orders', path: '/orders', testid: 'nav-orders', exact: false, icon: 'box' },
    { label: 'Account', shortLabel: 'Account', path: '/account', testid: 'nav-account', exact: false, icon: 'user' },
    { label: 'Admin console', shortLabel: 'Admin', path: '/admin', testid: 'nav-admin', exact: false, icon: 'sliders', adminOnly: true },
  ]);

  readonly navItems = computed(() => this.allItems().filter((i) => !i.adminOnly || this.isAdmin()));

  readonly initials = computed(() => {
    const name = this.user()?.name ?? '';
    return name.split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'AC';
  });

  toggleDrawer(): void {
    this.drawerOpen.update((open) => !open);
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
  }

  logout(): void {
    this.closeDrawer();
    this.auth.logout();
  }
}
