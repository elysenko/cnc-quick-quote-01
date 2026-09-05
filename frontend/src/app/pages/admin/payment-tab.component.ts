import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { IconComponent } from '../../shared/icon.component';
import { ToastService } from '../../shared/toast.service';
import { ApiClient, errorMessage } from '../../core/api';

interface Secret {
  id: string;
  label: string;
  hint: string;
  masked: string | null;
}

/** Field of `settings.payment` each row reads from and writes back to. */
type PaymentField = 'stripeSecretKey' | 'stripeWebhookSecret' | 'stripePublishableKey';

const ROWS: { id: string; field: PaymentField; label: string; hint: string }[] = [
  { id: 'stripe_secret', field: 'stripeSecretKey', label: 'Stripe secret key', hint: 'Used to create hosted Checkout sessions.' },
  { id: 'stripe_webhook', field: 'stripeWebhookSecret', label: 'Stripe webhook signing secret', hint: 'Verifies payment webhooks against the raw request body.' },
  { id: 'stripe_publishable', field: 'stripePublishableKey', label: 'Stripe publishable key', hint: 'Safe to expose; identifies your account at checkout.' },
];

interface SettingsResponse {
  payment: Record<PaymentField, string | null>;
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
  private readonly api = inject(ApiClient);
  private readonly toast = inject(ToastService);

  /** Masked values only — the API never returns a secret in the clear. */
  readonly secrets = signal<Secret[]>(ROWS.map(({ id, label, hint }) => ({ id, label, hint, masked: null })));

  readonly replacing = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  startReplace(id: string): void { this.replacing.set(id); }
  cancel(): void { this.replacing.set(null); }

  private async load(): Promise<void> {
    try {
      const settings = await this.api.get<SettingsResponse>('/admin/settings');
      this.secrets.set(
        ROWS.map(({ id, field, label, hint }) => ({ id, label, hint, masked: settings.payment[field] ?? null })),
      );
    } catch (error) {
      this.toast.show(errorMessage(error, 'We could not load the payment credentials.'), 'danger');
    }
  }

  async saveSecret(id: string, value: string): Promise<void> {
    const trimmed = value.trim();
    if (!trimmed) {
      this.toast.show('Enter a key before saving', 'danger');
      return;
    }
    const row = ROWS.find((r) => r.id === id);
    if (!row) return;
    try {
      // Only the field being replaced is sent; the others keep their stored value.
      await this.api.put<{ ok: true }>('/admin/settings/payment', { [row.field]: trimmed });
      await this.load();
      this.replacing.set(null);
      this.toast.show('Credential encrypted and stored', 'success');
    } catch (error) {
      // The replace form stays open so the operator can paste a corrected key.
      this.toast.show(errorMessage(error, 'We could not store that credential.'), 'danger');
    }
  }
}
