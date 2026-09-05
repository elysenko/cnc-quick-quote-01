import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { IconComponent } from '../../shared/icon.component';
import { QuoteDraftService } from '../../core/quote-draft.service';
import { BrandingService } from '../../core/branding.service';
import { money } from '../../core/format';

@Component({
  selector: 'app-order-confirmation',
  standalone: true,
  imports: [RouterLink, IconComponent],
  templateUrl: './order-confirmation.component.html',
  styleUrl: './order-confirmation.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderConfirmationComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly draft = inject(QuoteDraftService);
  private readonly brandingService = inject(BrandingService);
  private readonly query = toSignal(this.route.queryParamMap, { initialValue: null });
  private timer: ReturnType<typeof setTimeout> | null = null;

  readonly branding = this.brandingService.branding;
  readonly sessionId = computed(() => this.query()?.get('session_id') ?? 'cs_test_a1b2c3d4');
  /** `?state=pending` holds the polling view so it stays reviewable. */
  readonly stuck = computed(() => this.query()?.get('state') === 'pending');
  readonly settled = signal(false);

  readonly orderNumber = 'ORD-2026-3041';
  readonly price = this.draft.price;
  readonly material = this.draft.material;
  readonly quantity = this.draft.quantity;
  readonly money = money;
  readonly grandTotal = computed(() => this.price().totalCents + 2400);

  ngOnInit(): void {
    // Polls by session id: the webhook may land before or after the browser
    // returns from Stripe, and both orderings converge on one order.
    this.timer = setTimeout(() => this.settled.set(true), 1400);
  }

  ngOnDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  readonly ready = computed(() => this.settled() && !this.stuck());
}
