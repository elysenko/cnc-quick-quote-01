import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { IconComponent } from '../../shared/icon.component';
import { QuoteDraftService } from '../../core/quote-draft.service';
import { ToastService } from '../../shared/toast.service';
import { ApiClient, errorMessage } from '../../core/api';
import { PricingSettings } from '../../core/models';
import { money } from '../../core/format';

@Component({
  selector: 'app-admin-pricing',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './pricing.component.html',
  styleUrl: './pricing.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PricingComponent {
  private readonly api = inject(ApiClient);
  private readonly draft = inject(QuoteDraftService);
  private readonly toast = inject(ToastService);

  readonly pricing = this.draft.pricing;
  readonly money = money;

  constructor() {
    void this.draft.loadReferenceData();
  }

  set(key: keyof PricingSettings, raw: string): void {
    const cents = Math.round(Number(raw) * 100);
    if (Number.isNaN(cents)) return;
    this.pricing.update((p) => ({ ...p, [key]: cents }));
  }

  async save(event: Event): Promise<void> {
    event.preventDefault();
    try {
      await this.api.put<unknown>('/admin/settings/pricing', this.pricing());
      await this.draft.loadReferenceData();
      this.toast.show('Pricing saved — applies to the next quote generated', 'success');
    } catch (error) {
      this.toast.show(errorMessage(error, 'We could not save the pricing rules.'), 'danger');
    }
  }
}
