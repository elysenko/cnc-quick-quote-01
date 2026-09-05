import { NestingResult, Placement } from './models';

export type Poly = number[][];

/** Builds a rounded-rectangle outline as a flattened polyline (mm, part-local). */
function roundedRect(w: number, h: number, r: number, segs = 8): Poly {
  const pts: Poly = [];
  const corners: [number, number, number][] = [
    [w - r, h - r, 0],
    [r, h - r, Math.PI / 2],
    [r, r, Math.PI],
    [w - r, r, (3 * Math.PI) / 2],
  ];
  for (const [cx, cy, start] of corners) {
    for (let i = 0; i <= segs; i++) {
      const a = start + (i / segs) * (Math.PI / 2);
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  }
  pts.push(pts[0]);
  return pts;
}

function circle(cx: number, cy: number, r: number, segs = 28): Poly {
  const pts: Poly = [];
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

function slot(cx: number, cy: number, len: number, r: number, segs = 14): Poly {
  const pts: Poly = [];
  const half = len / 2;
  for (let i = 0; i <= segs; i++) {
    const a = -Math.PI / 2 + (i / segs) * Math.PI;
    pts.push([cx + half + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  for (let i = 0; i <= segs; i++) {
    const a = Math.PI / 2 + (i / segs) * Math.PI;
    pts.push([cx - half + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  pts.push(pts[0]);
  return pts;
}

/** The demo part: a 240 x 160 mm flanged mounting bracket with holes and a slot. */
export const DEMO_PART_WIDTH_MM = 240;
export const DEMO_PART_HEIGHT_MM = 160;

export function demoPartPolylines(): Poly[] {
  return [
    roundedRect(DEMO_PART_WIDTH_MM, DEMO_PART_HEIGHT_MM, 12),
    circle(28, 28, 7),
    circle(DEMO_PART_WIDTH_MM - 28, 28, 7),
    circle(28, DEMO_PART_HEIGHT_MM - 28, 7),
    circle(DEMO_PART_WIDTH_MM - 28, DEMO_PART_HEIGHT_MM - 28, 7),
    slot(DEMO_PART_WIDTH_MM / 2, DEMO_PART_HEIGHT_MM / 2, 64, 11),
    circle(DEMO_PART_WIDTH_MM / 2, DEMO_PART_HEIGHT_MM - 34, 5),
  ];
}

/** Total cut length of a polyline set, in millimetres. */
export function cutLength(polylines: Poly[]): number {
  let total = 0;
  for (const poly of polylines) {
    for (let i = 1; i < poly.length; i++) {
      total += Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]);
    }
  }
  return total;
}

export interface NestInput {
  partWidthMm: number;
  partHeightMm: number;
  sheetWidthMm: number;
  sheetHeightMm: number;
  spacingMm: number;
  marginMm: number;
  quantity: number;
}

/**
 * Axis-aligned row/column packer. Both 0 deg and 90 deg orientations are
 * computed and the denser result wins — mirrors the backend nesting service.
 */
export function nest(input: NestInput): NestingResult {
  const usableW = input.sheetWidthMm - input.marginMm * 2;
  const usableH = input.sheetHeightMm - input.marginMm * 2;

  const layout = (w: number, h: number) => {
    const cols = Math.floor((usableW + input.spacingMm) / (w + input.spacingMm));
    const rows = Math.floor((usableH + input.spacingMm) / (h + input.spacingMm));
    return { cols: Math.max(cols, 0), rows: Math.max(rows, 0), perSheet: Math.max(cols, 0) * Math.max(rows, 0) };
  };

  const flat = layout(input.partWidthMm, input.partHeightMm);
  const turned = layout(input.partHeightMm, input.partWidthMm);
  const rotated = turned.perSheet > flat.perSheet;
  const chosen = rotated ? turned : flat;
  const pw = rotated ? input.partHeightMm : input.partWidthMm;
  const ph = rotated ? input.partWidthMm : input.partHeightMm;

  const perSheet = Math.max(chosen.perSheet, 1);
  const sheetCount = Math.max(1, Math.ceil(input.quantity / perSheet));

  const placements: Placement[] = [];
  for (let i = 0; i < input.quantity; i++) {
    const indexOnSheet = i % perSheet;
    placements.push({
      sheet: Math.floor(i / perSheet),
      rotated,
      x: input.marginMm + (indexOnSheet % chosen.cols) * (pw + input.spacingMm),
      y: input.marginMm + Math.floor(indexOnSheet / chosen.cols) * (ph + input.spacingMm),
    });
  }

  const partArea = input.partWidthMm * input.partHeightMm * input.quantity;
  const sheetArea = input.sheetWidthMm * input.sheetHeightMm * sheetCount;

  return {
    sheetCount,
    utilisation: sheetArea > 0 ? partArea / sheetArea : 0,
    rotated,
    cols: chosen.cols,
    rows: chosen.rows,
    placements,
    sheetWidthMm: input.sheetWidthMm,
    sheetHeightMm: input.sheetHeightMm,
  };
}
