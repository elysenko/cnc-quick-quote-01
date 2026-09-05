import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { WorkBedCanvasComponent } from '../../canvas/work-bed-canvas.component';
import { CostBreakdownComponent } from '../../shared/cost-breakdown.component';
import { IconComponent } from '../../shared/icon.component';
import { QuoteDraftService, QuoteRecord } from '../../core/quote-draft.service';
import { ApiClient, errorMessage } from '../../core/api';
import { ToastService } from '../../shared/toast.service';
import { BendLine, NestingResult } from '../../core/models';
import { PriceResult } from '../../core/pricing';
import { dateTime, feet, money, percent } from '../../core/format';

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

/** Part bounding box, read back from the outline the quote was priced from. */
function bbox(polylines: number[][][]): { width: number; height: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const poly of polylines) {
    for (const [x, y] of poly) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (minX === Infinity) return { width: 0, height: 0 };
  return { width: maxX - minX, height: maxY - minY };
}

@Component({
  selector: 'app-quote-detail',
  standalone: true,
  imports: [RouterLink, WorkBedCanvasComponent, CostBreakdownComponent, IconComponent],
  templateUrl: './quote-detail.component.html',
  styleUrl: './quote-detail.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuoteDetailComponent {
  private readonly draft = inject(QuoteDraftService);
  private readonly api = inject(ApiClient);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.paramMap, { initialValue: null });

  /** The persisted quote — the authoritative geometry and price. */
  private readonly quote = signal<QuoteRecord | null>(null);
  /** Real bend lines for this quote's drawing; empty until they load. */
  private readonly bendLines = signal<BendLine[]>([]);

  readonly quoteId = computed(() => this.params()?.get('quoteId') ?? '');
  readonly reference = computed(() => this.quote()?.reference ?? '');

  readonly nesting = computed<NestingResult>(() => this.quote()?.nesting ?? EMPTY_NESTING);
  readonly polylines = computed<number[][][]>(() => this.quote()?.polylines ?? []);
  readonly bends = this.bendLines.asReadonly();
  readonly drawing = computed<{ filename: string } | null>(() => {
    const quote = this.quote();
    return quote ? { filename: quote.drawingName } : null;
  });
  readonly material = computed<{ name: string }>(() => ({ name: this.quote()?.materialName ?? '' }));
  readonly quantity = computed(() => this.quote()?.quantity ?? 0);
  readonly machine = this.draft.machine;
  readonly price = computed<PriceResult>(() => this.quote()?.price ?? EMPTY_PRICE);
  readonly pricing = this.draft.pricing;

  readonly money = money;
  readonly percent = percent;
  readonly feet = feet;
  /** The approved template passes a literal; the quote's own timestamp wins. */
  readonly dateTime = (iso: string): string => dateTime(this.quote()?.createdAt ?? iso);

  readonly partWidth = computed(() => bbox(this.polylines()).width);
  readonly partHeight = computed(() => bbox(this.polylines()).height);

  constructor() {
    void this.draft.loadReferenceData();
    effect(() => {
      const id = this.quoteId();
      if (id) void this.load(id);
    });
  }

  private async load(id: string): Promise<void> {
    try {
      const quote = await this.api.get<QuoteRecord>(`/quotes/${id}`);
      this.quote.set(quote);
      await this.loadBends(quote.drawingId);
    } catch (error) {
      this.quote.set(null);
      this.bendLines.set([]);
      this.toast.show(errorMessage(error, 'We could not load that quote.'), 'danger');
    }
  }

  /** Bend coordinates belong to the drawing, so they are fetched, not invented. */
  private async loadBends(drawingId: string): Promise<void> {
    try {
      this.bendLines.set(await this.api.get<BendLine[]>('/bends', { drawingId }));
    } catch {
      this.bendLines.set([]);
    }
  }
}
