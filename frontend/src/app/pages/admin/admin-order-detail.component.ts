import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { IconComponent } from '../../shared/icon.component';
import { CostBreakdownComponent } from '../../shared/cost-breakdown.component';
import { QuoteDraftService } from '../../core/quote-draft.service';
import { dateTime, money } from '../../core/format';

@Component({
  selector: 'app-admin-order-detail',
  standalone: true,
  imports: [RouterLink, IconComponent, CostBreakdownComponent],
  templateUrl: './admin-order-detail.component.html',
  styleUrl: './admin-order-detail.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminOrderDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly draft = inject(QuoteDraftService);
  private readonly params = toSignal(this.route.paramMap, { initialValue: null });

  readonly orderId = computed(() => this.params()?.get('orderId') ?? 'o_3041');
  readonly orderNumber = computed(() => `ORD-2026-${this.orderId().replace('o_', '')}`);

  readonly price = this.draft.price;
  readonly pricing = this.draft.pricing;
  readonly material = this.draft.material;
  readonly quantity = this.draft.quantity;
  readonly money = money;
  readonly dateTime = dateTime;
}
