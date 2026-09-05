import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { WorkBedCanvasComponent } from '../../canvas/work-bed-canvas.component';
import { CostBreakdownComponent } from '../../shared/cost-breakdown.component';
import { IconComponent } from '../../shared/icon.component';
import { QuoteDraftService } from '../../core/quote-draft.service';
import { feet, mm, money, percent } from '../../core/format';

@Component({
  selector: 'app-result-step',
  standalone: true,
  imports: [WorkBedCanvasComponent, CostBreakdownComponent, IconComponent, RouterLink],
  templateUrl: './result-step.component.html',
  styleUrl: './result-step.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResultStepComponent implements OnInit {
  private readonly draft = inject(QuoteDraftService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly query = toSignal(this.route.queryParamMap, { initialValue: null });

  readonly nesting = this.draft.nesting;
  readonly polylines = this.draft.partPolylines;
  readonly bends = this.draft.bends;
  readonly drawing = this.draft.drawing;
  readonly material = this.draft.material;
  readonly quantity = this.draft.quantity;
  readonly machine = this.draft.machine;
  readonly price = this.draft.price;
  readonly pricing = this.draft.pricing;
  readonly generating = this.draft.generating;

  readonly sheetIndex = signal(0);
  readonly money = money;
  readonly mm = mm;
  readonly feet = feet;
  readonly percent = percent;

  /** The work bed auto-starts here; `?anim=` keeps the running state addressable. */
  readonly running = computed(() => this.query()?.get('anim') !== 'stopped');

  /** Reference of the persisted quote — blank until the server has stored it. */
  readonly quoteRef = computed(() => this.draft.savedQuote()?.reference ?? '—');

  /** Drives the checkout link; falls back to the list when nothing is saved yet. */
  readonly quoteId = computed(() => this.draft.savedQuote()?.id ?? '');

  /**
   * Persists the quote as soon as the step opens, so what is displayed is what
   * was stored — the customer is never shown a price the server did not record.
   */
  ngOnInit(): void {
    void this.draft.ensureQuote();
  }

  toggleAnimation(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { anim: this.running() ? 'stopped' : 'running' },
      queryParamsHandling: 'merge',
    });
  }

  changeSheet(delta: number): void {
    const max = this.nesting().sheetCount - 1;
    this.sheetIndex.update((index) => Math.min(max, Math.max(0, index + delta)));
  }

  readonly partWidth = computed(() => this.drawing()?.bboxWidthMm ?? 0);
  readonly partHeight = computed(() => this.drawing()?.bboxHeightMm ?? 0);
}
