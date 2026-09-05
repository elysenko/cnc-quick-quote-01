import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
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
export class ResultStepComponent {
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

  readonly sheetIndex = signal(0);
  readonly money = money;
  readonly mm = mm;
  readonly feet = feet;
  readonly percent = percent;

  /** The work bed auto-starts here; `?anim=` keeps the running state addressable. */
  readonly running = computed(() => this.query()?.get('anim') !== 'stopped');
  readonly quoteRef = 'Q-2026-0148';

  toggleAnimation(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { anim: this.running() ? 'stopped' : 'running' },
      queryParamsHandling: 'merge',
    });
  }

  changeSheet(delta: number): void {
    const max = this.nesting().sheetCount - 1;
    this.sheetIndex.update((i) => Math.min(max, Math.max(0, i + delta)));
  }

  readonly partWidth = computed(() => this.drawing()?.bboxWidthMm ?? 240);
  readonly partHeight = computed(() => this.drawing()?.bboxHeightMm ?? 160);
}
