import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  effect,
  input,
  viewChild,
} from '@angular/core';
import { BendLine, NestingResult } from '../core/models';
import { Poly } from '../core/geometry';
import { LaserPath, buildLaserPath, headAt } from './laser-path';
import { attachViewport } from './viewport';
import {
  Palette,
  Transform,
  clear,
  drawBed,
  drawBends,
  drawLaserHead,
  drawPolylines,
  drawSheet,
  fitTransform,
  placePolylines,
  readPalette,
  sx,
  sy,
} from './renderer';

/**
 * Work-bed visualisation. Static geometry (bed, sheet, part outlines, bend
 * lines) is pre-rendered to an offscreen canvas and completed cut segments are
 * accumulated on a second layer, so each animation frame only composites two
 * bitmaps, strokes the newly cut segment, and redraws the laser head.
 */
@Component({
  selector: 'app-work-bed-canvas',
  standalone: true,
  templateUrl: './work-bed-canvas.component.html',
  styleUrl: './work-bed-canvas.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkBedCanvasComponent implements AfterViewInit, OnDestroy {
  readonly nesting = input.required<NestingResult>();
  readonly polylines = input.required<Poly[]>();
  readonly bends = input<BendLine[]>([]);
  readonly partWidthMm = input.required<number>();
  readonly partHeightMm = input.required<number>();
  readonly bedWidthMm = input(3000);
  readonly bedHeightMm = input(1500);
  readonly speedMmPerSec = input(900);
  readonly running = input(false);
  readonly sheetIndex = input(0);

  private readonly hostRef = viewChild.required<ElementRef<HTMLElement>>('stage');
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  private detachViewport: (() => void) | null = null;
  private frame = 0;
  private lastTs = 0;
  private distance = 0;

  private staticLayer: HTMLCanvasElement | null = null;
  private progressLayer: HTMLCanvasElement | null = null;
  private transform: Transform = { scale: 1, offsetX: 0, offsetY: 0 };
  private palette: Palette | null = null;
  private path: LaserPath = { segments: [], totalLength: 0 };
  private view = { w: 1, h: 1 };
  private ready = false;

  constructor() {
    // Any input change rebuilds the static layer and restarts the walk.
    effect(() => {
      this.nesting();
      this.polylines();
      this.bends();
      this.sheetIndex();
      this.speedMmPerSec();
      if (this.ready) {
        this.rebuild();
        this.reset();
      }
    });

    effect(() => {
      const run = this.running();
      if (!this.ready) return;
      if (run) this.start();
      else this.stop();
    });
  }

  ngAfterViewInit(): void {
    const canvas = this.canvasRef().nativeElement;
    const host = this.hostRef().nativeElement;
    this.palette = readPalette(host);
    this.detachViewport = attachViewport(canvas, host, ({ cssWidth, cssHeight }) => {
      this.view = { w: cssWidth, h: cssHeight };
      this.rebuild();
      this.render();
    });
    this.ready = true;
    this.rebuild();
    this.reset();
    if (this.running()) this.start();
    else this.render();
  }

  ngOnDestroy(): void {
    this.stop();
    this.detachViewport?.();
  }

  /** World geometry for the currently displayed sheet. */
  private worldPolylines(): Poly[] {
    const nesting = this.nesting();
    const sheetX = (this.bedWidthMm() - nesting.sheetWidthMm) / 2;
    const sheetY = (this.bedHeightMm() - nesting.sheetHeightMm) / 2;
    const out: Poly[] = [];
    for (const placement of nesting.placements) {
      if (placement.sheet !== this.sheetIndex()) continue;
      out.push(
        ...placePolylines(
          this.polylines(),
          sheetX + placement.x,
          sheetY + placement.y,
          placement.rotated,
          this.partWidthMm(),
        ),
      );
    }
    return out;
  }

  private rebuild(): void {
    const canvas = this.canvasRef().nativeElement;
    const dpr = canvas.width / Math.max(this.view.w, 1);
    const bedW = this.bedWidthMm();
    const bedH = this.bedHeightMm();
    this.transform = fitTransform(bedW, bedH, this.view.w, this.view.h, 14);

    const make = () => {
      const layer = document.createElement('canvas');
      layer.width = canvas.width;
      layer.height = canvas.height;
      const ctx = layer.getContext('2d');
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      return layer;
    };

    this.staticLayer = make();
    this.progressLayer = make();

    const ctx = this.staticLayer.getContext('2d');
    const p = this.palette;
    if (!ctx || !p) return;

    const nesting = this.nesting();
    const sheetX = (bedW - nesting.sheetWidthMm) / 2;
    const sheetY = (bedH - nesting.sheetHeightMm) / 2;

    drawBed(ctx, this.transform, bedW, bedH, p, 100);
    drawSheet(ctx, this.transform, sheetX, sheetY, nesting.sheetWidthMm, nesting.sheetHeightMm, bedH, p);

    const worldPolys = this.worldPolylines();
    const perPart = this.polylines().length;
    for (let i = 0; i < worldPolys.length; i += perPart) {
      const part = worldPolys.slice(i, i + perPart);
      drawPolylines(ctx, this.transform, part.slice(0, 1), bedH, p.sheetEdge, p.part, 1);
      drawPolylines(ctx, this.transform, part.slice(1), bedH, p.sheetEdge, null, 1);
    }

    // Bend lines follow each placed part.
    const bendsWorld: BendLine[] = [];
    for (const placement of nesting.placements) {
      if (placement.sheet !== this.sheetIndex()) continue;
      for (const b of this.bends()) {
        const map = (x: number, y: number): [number, number] =>
          placement.rotated
            ? [sheetX + placement.x + y, sheetY + placement.y + (this.partWidthMm() - x)]
            : [sheetX + placement.x + x, sheetY + placement.y + y];
        const [x1, y1] = map(b.x1, b.y1);
        const [x2, y2] = map(b.x2, b.y2);
        bendsWorld.push({ ...b, x1, y1, x2, y2 });
      }
    }
    drawBends(ctx, this.transform, bendsWorld, bedH, p);

    ctx.fillStyle = p.label;
    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(
      `SHEET ${this.sheetIndex() + 1}/${nesting.sheetCount}  ${nesting.sheetWidthMm} x ${nesting.sheetHeightMm} mm`,
      sx(this.transform, sheetX),
      sy(this.transform, sheetY + nesting.sheetHeightMm, bedH) - 7,
    );

    this.path = buildLaserPath(worldPolys);
  }

  private reset(): void {
    this.distance = 0;
    this.lastTs = 0;
    const ctx = this.progressLayer?.getContext('2d');
    if (ctx && this.progressLayer) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.progressLayer.width, this.progressLayer.height);
      ctx.restore();
    }
    this.render();
  }

  private start(): void {
    if (this.frame) return;
    this.lastTs = 0;
    const tick = (ts: number) => {
      if (!this.lastTs) this.lastTs = ts;
      const dt = Math.min((ts - this.lastTs) / 1000, 0.1);
      this.lastTs = ts;
      this.step(dt);
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  private stop(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.reset();
  }

  /** Delta-time stepping keeps pacing stable regardless of frame rate. */
  private step(dt: number): void {
    const previous = this.distance;
    this.distance += this.speedMmPerSec() * dt;
    if (this.path.totalLength > 0 && this.distance >= this.path.totalLength) {
      this.distance = 0;
      const ctx = this.progressLayer?.getContext('2d');
      if (ctx && this.progressLayer) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.progressLayer.width, this.progressLayer.height);
        ctx.restore();
      }
    } else {
      this.paintProgress(previous, this.distance);
    }
    this.render();
  }

  /** Strokes only the newly completed span onto the persistent progress layer. */
  private paintProgress(from: number, to: number): void {
    const ctx = this.progressLayer?.getContext('2d');
    const p = this.palette;
    if (!ctx || !p || !this.path.segments.length) return;
    const bedH = this.bedHeightMm();
    const start = headAt(this.path, from);
    const end = headAt(this.path, to);
    if (!start || !end) return;

    ctx.strokeStyle = p.cut;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    // Each segment is stroked independently: consecutive segments can belong to
    // different contours, and bridging them would paint a rapid-traverse move
    // as if it were a cut.
    for (let i = start.segmentIndex; i <= end.segmentIndex; i++) {
      const seg = this.path.segments[i];
      const ax = i === start.segmentIndex ? start.x : seg.x1;
      const ay = i === start.segmentIndex ? start.y : seg.y1;
      const bx = i === end.segmentIndex ? end.x : seg.x2;
      const by = i === end.segmentIndex ? end.y : seg.y2;
      ctx.moveTo(sx(this.transform, ax), sy(this.transform, ay, bedH));
      ctx.lineTo(sx(this.transform, bx), sy(this.transform, by, bedH));
    }
    ctx.stroke();
  }

  private render(): void {
    const canvas = this.canvasRef().nativeElement;
    const ctx = canvas.getContext('2d');
    const p = this.palette;
    if (!ctx || !p || !this.staticLayer || !this.progressLayer) return;

    clear(ctx, this.view.w, this.view.h);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.staticLayer, 0, 0);
    ctx.drawImage(this.progressLayer, 0, 0);
    ctx.restore();

    if (this.running()) {
      const head = headAt(this.path, this.distance);
      if (head) drawLaserHead(ctx, this.transform, head.x, head.y, this.bedHeightMm(), p);
    }
  }
}
