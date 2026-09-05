import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { WorkBedCanvasComponent } from '../../canvas/work-bed-canvas.component';
import { CostBreakdownComponent } from '../../shared/cost-breakdown.component';
import { IconComponent } from '../../shared/icon.component';
import { QuoteDraftService } from '../../core/quote-draft.service';
import { dateTime, feet, money, percent } from '../../core/format';

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
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.paramMap, { initialValue: null });

  readonly quoteId = computed(() => this.params()?.get('quoteId') ?? 'q_0148');
  readonly reference = computed(() => `Q-2026-${this.quoteId().replace('q_', '')}`);

  readonly nesting = this.draft.nesting;
  readonly polylines = this.draft.partPolylines;
  readonly bends = this.draft.bends;
  readonly drawing = this.draft.drawing;
  readonly material = this.draft.material;
  readonly quantity = this.draft.quantity;
  readonly machine = this.draft.machine;
  readonly price = this.draft.price;
  readonly pricing = this.draft.pricing;

  readonly money = money;
  readonly percent = percent;
  readonly feet = feet;
  readonly dateTime = dateTime;

  readonly partWidth = computed(() => this.drawing()?.bboxWidthMm ?? 240);
  readonly partHeight = computed(() => this.drawing()?.bboxHeightMm ?? 160);
}
