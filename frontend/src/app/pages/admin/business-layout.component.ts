import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-admin-business',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './business-layout.component.html',
  styleUrl: './business-layout.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BusinessLayoutComponent {
  readonly tabs = [
    { path: 'branding', label: 'Branding', testid: 'business-tab-branding' },
    { path: 'contact', label: 'Contact', testid: 'business-tab-contact' },
    { path: 'payment', label: 'Payment', testid: 'business-tab-payment' },
    { path: 'shipping', label: 'Shipping', testid: 'business-tab-shipping' },
  ];
}
