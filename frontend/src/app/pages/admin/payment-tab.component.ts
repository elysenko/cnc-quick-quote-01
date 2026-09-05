import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { IconComponent } from '../../shared/icon.component';
import { ToastService } from '../../shared/toast.service';

interface Secret {
  id: string;
  label: string;
  hint: string;
  masked: string | null;
}

@Component({
  selector: 'app-admin-payment-tab',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './payment-tab.component.html',
  styleUrl: './payment-tab.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentTabComponent {
  private readonly toast = inject(ToastService);

  readonly secrets = signal<Secret[]>([
    { id: 'stripe_secret', label: 'Stripe secret key', hint: 'Used to create hosted Checkout sessions.', masked: null },
    { id: 'stripe_webhook', label: 'Stripe webhook signing secret', hint: 'Verifies payment webhooks against the raw request body.', masked: null },
    { id: 'stripe_publishable', label: 'Stripe publishable key', hint: 'Safe to expose; identifies your account at checkout.', masked: 'pk_live_••••8821' },
  ]);

  readonly replacing = signal<string | null>(null);

  startReplace(id: string): void { this.replacing.set(id); }
  cancel(): void { this.replacing.set(null); }

  saveSecret(id: string, value: string): void {
    const trimmed = value.trim();
    if (!trimmed) {
      this.toast.show('Enter a key before saving', 'danger');
      return;
    }
    const masked = `${trimmed.slice(0, 8)}••••${trimmed.slice(-4)}`;
    this.secrets.update((list) => list.map((s) => (s.id === id ? { ...s, masked } : s)));
    this.replacing.set(null);
    this.toast.show('Credential encrypted and stored', 'success');
  }
}
