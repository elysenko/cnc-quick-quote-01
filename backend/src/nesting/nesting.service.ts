import { Injectable } from '@nestjs/common';
import { ValidationError } from '../common/errors';

/** Where one part lands on a sheet. `x`/`y` are the part's bottom-left corner in sheet mm. */
export interface Placement {
  x: number;
  y: number;
  rotated: boolean;
  sheet: number;
}

/**
 * Result of a nest. Mirrors the Angular `NestingResult` field for field so the
 * quote view can swap the client-side preview for the server answer without any
 * remapping — and so a mismatch is a compile error rather than a silent one.
 */
export interface NestingResult {
  sheetCount: number;
  utilisation: number;
  rotated: boolean;
  cols: number;
  rows: number;
  placements: Placement[];
  sheetWidthMm: number;
  sheetHeightMm: number;
}

/** Everything the packer needs; all lengths in millimetres. */
export interface NestInput {
  partWidthMm: number;
  partHeightMm: number;
  sheetWidthMm: number;
  sheetHeightMm: number;
  spacingMm: number;
  marginMm: number;
  quantity: number;
}

interface Layout {
  cols: number;
  rows: number;
  perSheet: number;
}

/** One decimal place, without the trailing `.0` noise `toFixed` would add. */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Axis-aligned row/column packer — the authoritative copy of the algorithm the
 * Angular client runs in `core/geometry.ts#nest`.
 *
 * It is deliberately a straight port rather than a smarter packer: the browser
 * shows a live nesting preview while the customer types, and the number it shows
 * has to be the number they are charged for. Any cleverness added here (true
 * 2D bin packing, part interlocking) must be added there in the same commit.
 */
@Injectable()
export class NestingService {
  /**
   * Packs `quantity` copies of the part onto as few sheets as possible.
   *
   * @throws ValidationError when the part fits in neither orientation. The
   * frontend clamps `perSheet` to 1 so its preview degrades gracefully mid-typing;
   * the backend must not, because a clamp here would quietly quote an impossible
   * job at one part per sheet.
   */
  nest(input: NestInput): NestingResult {
    const usableW = input.sheetWidthMm - input.marginMm * 2;
    const usableH = input.sheetHeightMm - input.marginMm * 2;

    const layout = (w: number, h: number): Layout => {
      const cols = Math.floor((usableW + input.spacingMm) / (w + input.spacingMm));
      const rows = Math.floor((usableH + input.spacingMm) / (h + input.spacingMm));
      return {
        cols: Math.max(cols, 0),
        rows: Math.max(rows, 0),
        perSheet: Math.max(cols, 0) * Math.max(rows, 0),
      };
    };

    const flat = layout(input.partWidthMm, input.partHeightMm);
    const turned = layout(input.partHeightMm, input.partWidthMm);
    const rotated = turned.perSheet > flat.perSheet;
    const chosen = rotated ? turned : flat;
    const pw = rotated ? input.partHeightMm : input.partWidthMm;
    const ph = rotated ? input.partWidthMm : input.partHeightMm;

    const perSheet = chosen.perSheet;
    if (perSheet === 0) {
      throw new ValidationError(
        `This part is ${round1(input.partWidthMm)} × ${round1(input.partHeightMm)} mm, which does not ` +
          `fit the ${round1(usableW)} × ${round1(usableH)} mm usable area of a ` +
          `${round1(input.sheetWidthMm)} × ${round1(input.sheetHeightMm)} mm sheet ` +
          `(after a ${round1(input.marginMm)} mm margin). Split the part or choose a larger sheet.`,
        'drawingId',
      );
    }

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
}
