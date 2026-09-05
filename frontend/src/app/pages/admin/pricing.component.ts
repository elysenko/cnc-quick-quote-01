import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { IconComponent } from '../../shared/icon.component';
import { QuoteDraftService } from '../../core/quote-draft.service';
import { ToastService } from '../../shared/toast.service';
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
  private readonly draft = inject(QuoteDraftService);
  private readonly toast = inject(ToastService);

  readonly pricing = this.draft.pricing;
  readonly money = money;

  set(key: keyof ReturnType<typeof this.pricing>, raw: string): void {
    const cents = Math.round(Number(raw) * 100);
    if (Number.isNaN(cents)) return;
    this.pricing.update((p) => ({ ...p, [key]: cents }));
  }

  save(event: Event): void {
    event.preventDefault();
    this.toast.show('Pricing saved — applies to the next quote generated', 'success');
  }
}
