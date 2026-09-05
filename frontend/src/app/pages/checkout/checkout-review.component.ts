import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { CostBreakdownComponent } from '../../shared/cost-breakdown.component';
import { IconComponent } from '../../shared/icon.component';
import { QuoteDraftService } from '../../core/quote-draft.service';
import { feet, money } from '../../core/format';

@Component({
  selector: 'app-checkout-review',
  standalone: true,
  imports: [RouterLink, CostBreakdownComponent, IconComponent],
  templateUrl: './checkout-review.component.html',
  styleUrl: './checkout-review.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutReviewComponent {
  private readonly draft = inject(QuoteDraftService);
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.paramMap, { initialValue: null });

  readonly quoteId = computed(() => this.params()?.get('quoteId') ?? 'q_0148');
  readonly material = this.draft.material;
  readonly quantity = this.draft.quantity;
  readonly bends = this.draft.bends;
  readonly nesting = this.draft.nesting;
  readonly drawing = this.draft.drawing;
  readonly price = this.draft.price;
  readonly pricing = this.draft.pricing;

  readonly money = money;
  readonly feet = feet;
}
