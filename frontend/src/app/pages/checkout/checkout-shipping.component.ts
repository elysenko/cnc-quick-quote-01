import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { IconComponent } from '../../shared/icon.component';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { QuoteRecord } from '../../core/quote-draft.service';
import { BrandingService } from '../../core/branding.service';
import { ApiClient, errorMessage } from '../../core/api';
import { ToastService } from '../../shared/toast.service';
import { NestingResult, ShippingMethod } from '../../core/models';
import { PriceResult } from '../../core/pricing';
import { money } from '../../core/format';

/** A method with the cost the API worked out for this specific quote. */
export interface PricedMethod extends ShippingMethod {
  computedCents: number;
}

interface ShippingOptions {
  methods: PricedMethod[];
  blocked: boolean;
  blockedReason: string | null;
  subtotalCents: number;
  currency: string;
}

const EMPTY_NESTING: NestingResult = {
  sheetCount: 0, utilisation: 0, rotated: false, cols: 0, rows: 0,
  placements: [], sheetWidthMm: 0, sheetHeightMm: 0,
};

const EMPTY_PRICE: PriceResult = {
  lines: [], subtotalCents: 0, totalCents: 0,
  minimumApplied: false, totalCutLengthMm: 0, totalBends: 0,
};

const NO_METHOD: PricedMethod = {
  id: '', name: 'Delivery', kind: 'flat', costCents: 0,
  etaDays: 0, active: true, computedCents: 0,
};

@Component({
  selector: 'app-checkout-shipping',
  standalone: true,
  imports: [RouterLink, IconComponent, EmptyStateComponent],
  templateUrl: './checkout-shipping.component.html',
  styleUrl: './checkout-shipping.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutShippingComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly brandingService = inject(BrandingService);
  private readonly api = inject(ApiClient);
  private readonly toast = inject(ToastService);

  private readonly params = toSignal(this.route.paramMap, { initialValue: null });
  private readonly query = toSignal(this.route.queryParamMap, { initialValue: null });

  private readonly quote = signal<QuoteRecord | null>(null);
  /** Delivery methods priced for this quote by the API. */
  readonly methods = signal<PricedMethod[]>([]);
  /** True when the workshop has configured no active delivery method. */
  private readonly noMethodsConfigured = signal(false);

  readonly branding = this.brandingService.branding;
  readonly quoteId = computed(() => this.params()?.get('quoteId') ?? '');
  /** Blocked by the API; `?methods=none` still previews the same state. */
  readonly blocked = computed(
    () => this.noMethodsConfigured() || this.query()?.get('methods') === 'none',
  );

  readonly priced = computed<PricedMethod[]>(() => this.methods().filter((m) => m.active));
  readonly selectedId = computed(() => this.query()?.get('ship') ?? this.priced()[0]?.id ?? '');

  readonly nesting = computed<NestingResult>(() => this.quote()?.nesting ?? EMPTY_NESTING);
  readonly price = computed<PriceResult>(() => this.quote()?.price ?? EMPTY_PRICE);
  readonly money = money;

  readonly selected = computed<PricedMethod>(
    () => this.priced().find((m) => m.id === this.selectedId()) ?? this.priced()[0] ?? NO_METHOD,
  );
  readonly grandTotal = computed(() => this.price().totalCents + this.selected().computedCents);

  constructor() {
    effect(() => {
      const id = this.quoteId();
      if (id) void this.load(id);
    });
  }

  private async load(id: string): Promise<void> {
    await Promise.all([this.loadQuote(id), this.loadOptions(id)]);
  }

  private async loadQuote(id: string): Promise<void> {
    try {
      this.quote.set(await this.api.get<QuoteRecord>(`/quotes/${id}`));
    } catch (error) {
      this.quote.set(null);
      this.toast.show(errorMessage(error, 'We could not load that quote.'), 'danger');
    }
  }

  /** Costs come back already computed for this quote — never recomputed here. */
  private async loadOptions(id: string): Promise<void> {
    try {
      const options = await this.api.get<ShippingOptions>(`/checkout/quotes/${id}/options`);
      this.methods.set(options.methods);
      this.noMethodsConfigured.set(options.blocked);
      if (options.blocked && options.blockedReason) {
        this.toast.show(options.blockedReason, 'danger');
      }
    } catch (error) {
      this.methods.set([]);
      this.noMethodsConfigured.set(true);
      this.toast.show(errorMessage(error, 'We could not load delivery options.'), 'danger');
    }
  }

  select(id: string): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: { ship: id }, queryParamsHandling: 'merge' });
  }
}
