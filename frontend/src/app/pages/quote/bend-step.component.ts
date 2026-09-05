import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { BendEditorCanvasComponent } from '../../canvas/bend-editor-canvas.component';
import { IconComponent } from '../../shared/icon.component';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { QuoteDraftService } from '../../core/quote-draft.service';
import { BendDirection } from '../../core/models';
import { ToastService } from '../../shared/toast.service';

@Component({
  selector: 'app-bend-step',
  standalone: true,
  imports: [BendEditorCanvasComponent, IconComponent, EmptyStateComponent, RouterLink],
  templateUrl: './bend-step.component.html',
  styleUrl: './bend-step.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BendStepComponent {
  private readonly draft = inject(QuoteDraftService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private nextId = 100;

  private readonly query = toSignal(this.route.queryParamMap, { initialValue: null });

  readonly bends = this.draft.bends;
  readonly polylines = this.draft.partPolylines;
  readonly drawing = this.draft.drawing;

  /** Selection is owned by `?bend=<id>` so the selected state is deep-linkable. */
  readonly selectedId = computed(() => this.query()?.get('bend') ?? null);
  readonly selected = computed(() => this.bends().find((b) => b.id === this.selectedId()) ?? null);

  readonly partWidth = computed(() => this.drawing()?.bboxWidthMm ?? 240);
  readonly partHeight = computed(() => this.drawing()?.bboxHeightMm ?? 160);

  select(id: string | null): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { bend: id },
      queryParamsHandling: 'merge',
    });
  }

  create(coords: { x1: number; y1: number; x2: number; y2: number }): void {
    const id = `bnd_${this.nextId++}`;
    this.draft.addBend({
      id,
      drawingId: this.drawing()?.id ?? 'drw_8f21',
      x1: Math.round(coords.x1),
      y1: Math.round(coords.y1),
      x2: Math.round(coords.x2),
      y2: Math.round(coords.y2),
      angleDeg: 90,
      direction: 'up',
    });
    this.select(id);
    this.toast.show('Bend line added', 'success');
  }

  move(next: { id: string; x1: number; y1: number; x2: number; y2: number }): void {
    this.draft.updateBend(next.id, {
      x1: Math.round(next.x1),
      y1: Math.round(next.y1),
      x2: Math.round(next.x2),
      y2: Math.round(next.y2),
    });
  }

  setAngle(value: string): void {
    const id = this.selectedId();
    const angle = Number(value);
    if (!id || Number.isNaN(angle)) return;
    this.draft.updateBend(id, { angleDeg: Math.min(180, Math.max(0, angle)) });
  }

  setDirection(direction: BendDirection): void {
    const id = this.selectedId();
    if (id) this.draft.updateBend(id, { direction });
  }

  remove(id: string): void {
    this.draft.removeBend(id);
    if (this.selectedId() === id) this.select(null);
    this.toast.show('Bend line removed');
  }

  bendLength(id: string): number {
    const b = this.bends().find((x) => x.id === id);
    return b ? Math.round(Math.hypot(b.x2 - b.x1, b.y2 - b.y1)) : 0;
  }
}
