import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { CostBreakdownComponent } from '../../shared/cost-breakdown.component';
import { IconComponent } from '../../shared/icon.component';
import { QuoteDraftService, QuoteRecord } from '../../core/quote-draft.service';
import { ApiClient, errorMessage } from '../../core/api';
import { ToastService } from '../../shared/toast.service';
import { NestingResult } from '../../core/models';
import { PriceResult } from '../../core/pricing';
import { feet, money } from '../../core/format';

const EMPTY_NESTING: NestingResult = {
  sheetCount: 0,
  utilisation: 0,
  rotated: false,
  cols: 0,
  rows: 0,
  placements: [],
  sheetWidthMm: 0,
  sheetHeightMm: 0,
};

const EMPTY_PRICE: PriceResult = {
  lines: [],
  subtotalCents: 0,
  totalCents: 0,
  minimumApplied: false,
  totalCutLengthMm: 0,
  totalBends: 0,
};

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
  private readonly api = inject(ApiClient);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.paramMap, { initialValue: null });

  /** Loaded by id: a customer can deep-link here without the wizard running. */
  private readonly quote = signal<QuoteRecord | null>(null);

  readonly quoteId = computed(() => this.params()?.get('quoteId') ?? '');
  readonly material = computed<{ name: string }>(() => ({ name: this.quote()?.materialName ?? '' }));
  readonly quantity = computed(() => this.quote()?.quantity ?? 0);
  /** Only the count is shown here, so it comes from the quote's bend count. */
  readonly bends = computed<readonly unknown[]>(() =>
    new Array<unknown>(this.quote()?.bendCount ?? 0),
  );
  readonly nesting = computed<NestingResult>(() => this.quote()?.nesting ?? EMPTY_NESTING);
  readonly drawing = computed<{ filename: string } | null>(() => {
    const quote = this.quote();
    return quote ? { filename: quote.drawingName } : null;
  });
  readonly price = computed<PriceResult>(() => this.quote()?.price ?? EMPTY_PRICE);
  readonly pricing = this.draft.pricing;

  readonly money = money;
  readonly feet = feet;

  constructor() {
    void this.draft.loadReferenceData();
    effect(() => {
      const id = this.quoteId();
      if (id) void this.load(id);
    });
  }

  private async load(id: string): Promise<void> {
    try {
      this.quote.set(await this.api.get<QuoteRecord>(`/quotes/${id}`));
    } catch (error) {
      this.quote.set(null);
      this.toast.show(errorMessage(error, 'We could not load that quote.'), 'danger');
    }
  }
}
