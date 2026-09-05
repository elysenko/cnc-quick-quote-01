import { NestingResult, Placement } from './models';

export type Poly = number[][];

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
