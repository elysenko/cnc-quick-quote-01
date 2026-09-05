import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { IconComponent } from '../../shared/icon.component';
import { QuoteDraftService } from '../../core/quote-draft.service';
import { money } from '../../core/format';

@Component({
  selector: 'app-checkout-payment',
  standalone: true,
  imports: [RouterLink, IconComponent],
  templateUrl: './checkout-payment.component.html',
  styleUrl: './checkout-payment.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutPaymentComponent {
  private readonly draft = inject(QuoteDraftService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly params = toSignal(this.route.paramMap, { initialValue: null });
  private readonly query = toSignal(this.route.queryParamMap, { initialValue: null });

  readonly quoteId = computed(() => this.params()?.get('quoteId') ?? 'q_0148');
  /** `?state=error` shows the Stripe-unreachable retry path. */
  readonly failed = computed(() => this.query()?.get('state') === 'error');
  readonly redirecting = signal(false);

  readonly price = this.draft.price;
  readonly money = money;
  readonly grandTotal = computed(() => this.price().totalCents + 2400);

  payNow(): void {
    this.redirecting.set(true);
    setTimeout(() => {
      this.redirecting.set(false);
      this.router.navigate(['/orders/confirmation'], { queryParams: { session_id: 'cs_test_a1b2c3d4' } });
    }, 900);
  }

  showFailure(): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: { state: 'error' }, queryParamsHandling: 'merge' });
  }

  retry(): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: { state: null }, queryParamsHandling: 'merge' });
  }
}
