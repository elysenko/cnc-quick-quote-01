import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { IconComponent } from '../../shared/icon.component';
import { QuoteRecord } from '../../core/quote-draft.service';
import { ApiClient, errorMessage } from '../../core/api';
import { ToastService } from '../../shared/toast.service';
import { money } from '../../core/format';

interface ShippingOption {
  id: string;
  active: boolean;
  computedCents: number;
}

interface ShippingOptions {
  methods: ShippingOption[];
  blocked: boolean;
  blockedReason: string | null;
  subtotalCents: number;
}

interface CheckoutSession {
  sessionId: string;
  url: string;
}

@Component({
  selector: 'app-checkout-payment',
  standalone: true,
  imports: [RouterLink, IconComponent],
  templateUrl: './checkout-payment.component.html',
  styleUrl: './checkout-payment.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutPaymentComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(ApiClient);
  private readonly toast = inject(ToastService);

  private readonly params = toSignal(this.route.paramMap, { initialValue: null });
  private readonly query = toSignal(this.route.queryParamMap, { initialValue: null });

  private readonly quote = signal<QuoteRecord | null>(null);
  private readonly methods = signal<ShippingOption[]>([]);
  /** Set when the API could not open a checkout session; nothing was charged. */
  private readonly failure = signal<string | null>(null);

  readonly quoteId = computed(() => this.params()?.get('quoteId') ?? '');
  /** The delivery method chosen on the previous step. */
  readonly shippingMethodId = computed(() => this.query()?.get('ship') ?? '');
  /** A real failure, or `?state=error` to preview the retry path. */
  readonly failed = computed(() => this.query()?.get('state') === 'error' || this.failure() !== null);
  readonly redirecting = signal(false);

  readonly money = money;
  private readonly shippingCents = computed(
    () => this.methods().find((m) => m.id === this.shippingMethodId())?.computedCents ?? 0,
  );
  readonly grandTotal = computed(
    () => (this.quote()?.price.totalCents ?? 0) + this.shippingCents(),
  );

  constructor() {
    effect(() => {
      const id = this.quoteId();
      if (id) void this.load(id);
    });
  }

  private async load(id: string): Promise<void> {
    try {
      const [quote, options] = await Promise.all([
        this.api.get<QuoteRecord>(`/quotes/${id}`),
        this.api.get<ShippingOptions>(`/checkout/quotes/${id}/options`),
      ]);
      this.quote.set(quote);
      this.methods.set(options.methods.filter((m) => m.active));
    } catch (error) {
      this.quote.set(null);
      this.methods.set([]);
      this.toast.show(errorMessage(error, 'We could not load this order.'), 'danger');
    }
  }

  /** Opens a hosted checkout session and hands the browser to the provider. */
  async payNow(): Promise<void> {
    const shippingMethodId = this.shippingMethodId();
    if (!shippingMethodId) {
      this.toast.show('Choose a delivery method before paying.', 'info');
      void this.router.navigate(['/checkout', this.quoteId(), 'shipping']);
      return;
    }

    this.redirecting.set(true);
    this.failure.set(null);
    try {
      const session = await this.api.post<CheckoutSession>('/checkout/sessions', {
        quoteId: this.quoteId(),
        shippingMethodId,
      });
      window.location.assign(session.url);
    } catch (error) {
      // Nothing is persisted until the provider confirms, so retrying is safe.
      const message = errorMessage(error, 'We could not reach the payment provider.');
      this.redirecting.set(false);
      this.failure.set(message);
      this.toast.show(message, 'danger');
    }
  }

  showFailure(): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: { state: 'error' }, queryParamsHandling: 'merge' });
  }

  retry(): void {
    this.failure.set(null);
    this.router.navigate([], { relativeTo: this.route, queryParams: { state: null }, queryParamsHandling: 'merge' });
  }
}
