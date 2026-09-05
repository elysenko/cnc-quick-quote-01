import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  effect,
  input,
  output,
  viewChild,
} from '@angular/core';
import { BendLine } from '../core/models';
import { Poly } from '../core/geometry';
import { attachViewport } from './viewport';
import {
  Palette,
  Transform,
  clear,
  distSqToSegment,
  drawBends,
  drawPolylines,
  fitTransform,
  readPalette,
  sx,
  sy,
  toWorld,
} from './renderer';

type DragMode = 'none' | 'create' | 'move' | 'handle-a' | 'handle-b';

/**
 * Bend line editor. Click-drag on blank space adds a bend; drag the body to
 * move it; drag either endpoint to rotate/resize. Hit-testing uses squared
 * distance so no square roots run inside the pointer-move path.
 */
@Component({
  selector: 'app-bend-editor-canvas',
  standalone: true,
  templateUrl: './bend-editor-canvas.component.html',
  styleUrl: './bend-editor-canvas.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BendEditorCanvasComponent implements AfterViewInit, OnDestroy {
  readonly polylines = input.required<Poly[]>();
  readonly bends = input.required<BendLine[]>();
  readonly partWidthMm = input.required<number>();
  readonly partHeightMm = input.required<number>();
  readonly selectedId = input<string | null>(null);

  readonly selectBend = output<string | null>();
  readonly createBend = output<{ x1: number; y1: number; x2: number; y2: number }>();
  readonly moveBend = output<{ id: string; x1: number; y1: number; x2: number; y2: number }>();

  private readonly hostRef = viewChild.required<ElementRef<HTMLElement>>('stage');
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  private detach: (() => void) | null = null;
  private transform: Transform = { scale: 1, offsetX: 0, offsetY: 0 };
  private palette: Palette | null = null;
  private view = { w: 1, h: 1 };
  private ready = false;

  private mode: DragMode = 'none';
  private draft: { x1: number; y1: number; x2: number; y2: number } | null = null;
  private dragId: string | null = null;
  private grabOffset = { dx1: 0, dy1: 0, dx2: 0, dy2: 0 };

  constructor() {
    effect(() => {
      this.polylines();
      this.bends();
      this.selectedId();
      if (this.ready) this.render();
    });
  }

  ngAfterViewInit(): void {
    const canvas = this.canvasRef().nativeElement;
    const host = this.hostRef().nativeElement;
    this.palette = readPalette(host);
    this.detach = attachViewport(canvas, host, ({ cssWidth, cssHeight }) => {
      this.view = { w: cssWidth, h: cssHeight };
      this.transform = fitTransform(this.partWidthMm(), this.partHeightMm(), cssWidth, cssHeight, 26);
      this.render();
    });
    this.ready = true;
    this.render();
  }

  ngOnDestroy(): void {
    this.detach?.();
  }

  private pointToWorld(event: PointerEvent): { x: number; y: number } {
    const rect = this.canvasRef().nativeElement.getBoundingClientRect();
    return toWorld(this.transform, event.clientX - rect.left, event.clientY - rect.top, this.partHeightMm());
  }

  onPointerDown(event: PointerEvent): void {
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    const { x, y } = this.pointToWorld(event);
    const handleTolSq = Math.pow(14 / this.transform.scale, 2);
    const bodyTolSq = Math.pow(10 / this.transform.scale, 2);

    for (const bend of this.bends()) {
      const dA = (x - bend.x1) ** 2 + (y - bend.y1) ** 2;
      const dB = (x - bend.x2) ** 2 + (y - bend.y2) ** 2;
      if (dA < handleTolSq) {
        this.mode = 'handle-a';
        this.dragId = bend.id;
        this.selectBend.emit(bend.id);
        return;
      }
      if (dB < handleTolSq) {
        this.mode = 'handle-b';
        this.dragId = bend.id;
        this.selectBend.emit(bend.id);
        return;
      }
    }

    for (const bend of this.bends()) {
      if (distSqToSegment(x, y, bend.x1, bend.y1, bend.x2, bend.y2) < bodyTolSq) {
        this.mode = 'move';
        this.dragId = bend.id;
        this.grabOffset = { dx1: bend.x1 - x, dy1: bend.y1 - y, dx2: bend.x2 - x, dy2: bend.y2 - y };
        this.selectBend.emit(bend.id);
        return;
      }
    }

    this.mode = 'create';
    this.draft = { x1: x, y1: y, x2: x, y2: y };
    this.selectBend.emit(null);
    this.render();
  }

  onPointerMove(event: PointerEvent): void {
    if (this.mode === 'none') return;
    const { x, y } = this.pointToWorld(event);
    const bend = this.bends().find((b) => b.id === this.dragId);

    if (this.mode === 'create' && this.draft) {
      this.draft = { ...this.draft, x2: x, y2: y };
      this.render();
      return;
    }
    if (!bend) return;

    if (this.mode === 'handle-a') {
      this.moveBend.emit({ id: bend.id, x1: x, y1: y, x2: bend.x2, y2: bend.y2 });
    } else if (this.mode === 'handle-b') {
      this.moveBend.emit({ id: bend.id, x1: bend.x1, y1: bend.y1, x2: x, y2: y });
    } else if (this.mode === 'move') {
      this.moveBend.emit({
        id: bend.id,
        x1: x + this.grabOffset.dx1,
        y1: y + this.grabOffset.dy1,
        x2: x + this.grabOffset.dx2,
        y2: y + this.grabOffset.dy2,
      });
    }
  }

  onPointerUp(): void {
    if (this.mode === 'create' && this.draft) {
      const { x1, y1, x2, y2 } = this.draft;
      if ((x2 - x1) ** 2 + (y2 - y1) ** 2 > 64) this.createBend.emit({ x1, y1, x2, y2 });
    }
    this.mode = 'none';
    this.draft = null;
    this.dragId = null;
    this.render();
  }

  private render(): void {
    const canvas = this.canvasRef().nativeElement;
    const ctx = canvas.getContext('2d');
    const p = this.palette;
    if (!ctx || !p) return;

    const worldH = this.partHeightMm();
    const worldW = this.partWidthMm();
    this.transform = fitTransform(worldW, worldH, this.view.w, this.view.h, 26);
    clear(ctx, this.view.w, this.view.h);

    // Part bounding box.
    ctx.fillStyle = p.part;
    ctx.strokeStyle = p.sheetEdge;
    ctx.lineWidth = 1;
    ctx.fillRect(sx(this.transform, 0), sy(this.transform, worldH, worldH), worldW * this.transform.scale, worldH * this.transform.scale);
    ctx.strokeRect(sx(this.transform, 0), sy(this.transform, worldH, worldH), worldW * this.transform.scale, worldH * this.transform.scale);

    drawPolylines(ctx, this.transform, this.polylines(), worldH, p.cut, null, 1.6);
    drawBends(ctx, this.transform, this.bends(), worldH, p, this.selectedId());

    if (this.draft) {
      ctx.save();
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = p.bend;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx(this.transform, this.draft.x1), sy(this.transform, this.draft.y1, worldH));
      ctx.lineTo(sx(this.transform, this.draft.x2), sy(this.transform, this.draft.y2, worldH));
      ctx.stroke();
      ctx.restore();
    }
  }
}
