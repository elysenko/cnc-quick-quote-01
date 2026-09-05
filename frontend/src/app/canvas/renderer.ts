import { BendLine, NestingResult } from '../core/models';
import { Poly } from '../core/geometry';

/** Uniform world (mm, Y-up) -> screen (px, Y-down) transform. */
export interface Transform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface Palette {
  bed: string;
  bedGrid: string;
  sheet: string;
  sheetEdge: string;
  part: string;
  cut: string;
  bend: string;
  laser: string;
  laserGlow: string;
  label: string;
}

/** Reads the canvas palette from CSS custom properties so tokens stay authoritative. */
export function readPalette(el: Element): Palette {
  const s = getComputedStyle(el);
  const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;
  return {
    bed: v('--color-bed', '#131c26'),
    bedGrid: v('--color-bed-grid', '#24303d'),
    sheet: v('--color-sheet', '#dfe6ef'),
    sheetEdge: v('--color-sheet-edge', '#9aa9bb'),
    part: v('--color-part-fill', '#ffffff'),
    cut: v('--color-cut', '#1668d6'),
    bend: v('--color-bend', '#f5820b'),
    laser: v('--color-laser', '#e11d48'),
    laserGlow: v('--color-laser-glow', '#fb7185'),
    label: v('--color-ink-subtle', '#8595a8'),
  };
}

export function fitTransform(
  worldW: number,
  worldH: number,
  viewW: number,
  viewH: number,
  padding = 16,
): Transform {
  const scale = Math.min(
    (viewW - padding * 2) / Math.max(worldW, 1),
    (viewH - padding * 2) / Math.max(worldH, 1),
  );
  return {
    scale,
    offsetX: (viewW - worldW * scale) / 2,
    offsetY: (viewH - worldH * scale) / 2,
  };
}

export const sx = (t: Transform, x: number): number => t.offsetX + x * t.scale;
export const sy = (t: Transform, y: number, worldH: number): number =>
  t.offsetY + (worldH - y) * t.scale;

export function clear(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.clearRect(0, 0, w, h);
}

export function drawBed(
  ctx: CanvasRenderingContext2D,
  t: Transform,
  bedW: number,
  bedH: number,
  p: Palette,
  gridMm = 100,
): void {
  ctx.fillStyle = p.bed;
  ctx.fillRect(sx(t, 0), sy(t, bedH, bedH), bedW * t.scale, bedH * t.scale);

  ctx.strokeStyle = p.bedGrid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= bedW; x += gridMm) {
    ctx.moveTo(sx(t, x), sy(t, 0, bedH));
    ctx.lineTo(sx(t, x), sy(t, bedH, bedH));
  }
  for (let y = 0; y <= bedH; y += gridMm) {
    ctx.moveTo(sx(t, 0), sy(t, y, bedH));
    ctx.lineTo(sx(t, bedW), sy(t, y, bedH));
  }
  ctx.stroke();
}

export function drawSheet(
  ctx: CanvasRenderingContext2D,
  t: Transform,
  x: number,
  y: number,
  w: number,
  h: number,
  worldH: number,
  p: Palette,
): void {
  ctx.fillStyle = p.sheet;
  ctx.strokeStyle = p.sheetEdge;
  ctx.lineWidth = 1.5;
  ctx.fillRect(sx(t, x), sy(t, y + h, worldH), w * t.scale, h * t.scale);
  ctx.strokeRect(sx(t, x), sy(t, y + h, worldH), w * t.scale, h * t.scale);
}

/** Applies placement rotation + offset to part-local polylines. */
export function placePolylines(
  polys: Poly[],
  originX: number,
  originY: number,
  rotated: boolean,
  partW: number,
): Poly[] {
  return polys.map((poly) =>
    poly.map(([px, py]) =>
      rotated
        ? [originX + py, originY + (partW - px)]
        : [originX + px, originY + py],
    ),
  );
}

export function drawPolylines(
  ctx: CanvasRenderingContext2D,
  t: Transform,
  polys: Poly[],
  worldH: number,
  stroke: string,
  fill: string | null,
  lineWidth = 1.4,
): void {
  for (const poly of polys) {
    if (poly.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(sx(t, poly[0][0]), sy(t, poly[0][1], worldH));
    for (let i = 1; i < poly.length; i++) {
      ctx.lineTo(sx(t, poly[i][0]), sy(t, poly[i][1], worldH));
    }
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

export function drawBends(
  ctx: CanvasRenderingContext2D,
  t: Transform,
  bends: BendLine[],
  worldH: number,
  p: Palette,
  selectedId: string | null = null,
  offsetX = 0,
  offsetY = 0,
): void {
  for (const b of bends) {
    const active = b.id === selectedId;
    ctx.save();
    ctx.setLineDash([9, 6]);
    ctx.strokeStyle = p.bend;
    ctx.lineWidth = active ? 3.5 : 2;
    ctx.beginPath();
    ctx.moveTo(sx(t, b.x1 + offsetX), sy(t, b.y1 + offsetY, worldH));
    ctx.lineTo(sx(t, b.x2 + offsetX), sy(t, b.y2 + offsetY, worldH));
    ctx.stroke();
    ctx.restore();

    if (active) {
      for (const [hx, hy] of [[b.x1, b.y1], [b.x2, b.y2]]) {
        ctx.beginPath();
        ctx.fillStyle = p.bend;
        ctx.arc(sx(t, hx + offsetX), sy(t, hy + offsetY, worldH), 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

export function drawLaserHead(
  ctx: CanvasRenderingContext2D,
  t: Transform,
  x: number,
  y: number,
  worldH: number,
  p: Palette,
): void {
  const px = sx(t, x);
  const py = sy(t, y, worldH);
  const glow = ctx.createRadialGradient(px, py, 0, px, py, 18);
  glow.addColorStop(0, p.laserGlow);
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(px, py, 18, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = p.laser;
  ctx.beginPath();
  ctx.arc(px, py, 4.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = p.laser;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(px - 14, py); ctx.lineTo(px - 7, py);
  ctx.moveTo(px + 7, py); ctx.lineTo(px + 14, py);
  ctx.moveTo(px, py - 14); ctx.lineTo(px, py - 7);
  ctx.moveTo(px, py + 7); ctx.lineTo(px, py + 14);
  ctx.stroke();
}

export function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  p: Palette,
): void {
  ctx.fillStyle = p.label;
  ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText(text, x, y);
}

export function nestingWorld(nesting: NestingResult): { w: number; h: number } {
  return { w: nesting.sheetWidthMm, h: nesting.sheetHeightMm };
}

/** Screen (px) -> world (mm, Y-up). Inverse of sx/sy. */
export function toWorld(t: Transform, px: number, py: number, worldH: number): { x: number; y: number } {
  return {
    x: (px - t.offsetX) / t.scale,
    y: worldH - (py - t.offsetY) / t.scale,
  };
}

/** Squared distance from point p to segment ab — hit-testing without a sqrt. */
export function distSqToSegment(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return (px - cx) * (px - cx) + (py - cy) * (py - cy);
}
