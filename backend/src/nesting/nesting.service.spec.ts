import { ValidationError } from '../common/errors';
import { NestInput, NestingService, Placement } from './nesting.service';

/** Base sheet used by most cases: 1000 x 500 mm, no margin, no spacing. */
function input(overrides: Partial<NestInput> = {}): NestInput {
  return {
    partWidthMm: 200,
    partHeightMm: 100,
    sheetWidthMm: 1000,
    sheetHeightMm: 500,
    spacingMm: 0,
    marginMm: 0,
    quantity: 1,
    ...overrides,
  };
}

/** Footprint of a placement on its sheet, honouring the chosen orientation. */
function rect(p: Placement, partW: number, partH: number): { x0: number; y0: number; x1: number; y1: number } {
  const w = p.rotated ? partH : partW;
  const h = p.rotated ? partW : partH;
  return { x0: p.x, y0: p.y, x1: p.x + w, y1: p.y + h };
}

describe('NestingService', () => {
  const service = new NestingService();

  describe('layout', () => {
    it('packs an exact fit with no wasted rows or columns', () => {
      // usable 1000 x 500; 200 x 100 part -> 5 cols x 5 rows = 25 per sheet.
      const result = service.nest(input({ quantity: 25 }));

      expect(result.cols).toBe(5);
      expect(result.rows).toBe(5);
      expect(result.sheetCount).toBe(1);
      expect(result.placements).toHaveLength(25);
    });

    it('opens a second sheet for one part more than fits', () => {
      const result = service.nest(input({ quantity: 26 }));

      expect(result.sheetCount).toBe(2);
      expect(result.placements[25].sheet).toBe(1);
    });

    it('returns the sheet dimensions it was given', () => {
      const result = service.nest(input({ quantity: 1, sheetWidthMm: 3000, sheetHeightMm: 1500 }));

      expect(result.sheetWidthMm).toBe(3000);
      expect(result.sheetHeightMm).toBe(1500);
    });
  });

  describe('rotation', () => {
    it('rotates when 90 deg is denser', () => {
      // 100 x 200 flat -> 10 cols x 2 rows = 20; turned -> 5 cols x 5 rows = 25.
      const result = service.nest(input({ partWidthMm: 100, partHeightMm: 200, quantity: 25 }));

      expect(result.rotated).toBe(true);
      expect(result.cols).toBe(5);
      expect(result.rows).toBe(5);
      expect(result.cols * result.rows).toBe(25);
      expect(result.sheetCount).toBe(1);
      expect(result.placements.every((p) => p.rotated)).toBe(true);
    });

    it('stays flat when 0 deg is denser', () => {
      // 200 x 100 flat -> 25; turned -> 10 cols x 2 rows = 20.
      const result = service.nest(input({ quantity: 25 }));

      expect(result.rotated).toBe(false);
      expect(result.placements.every((p) => !p.rotated)).toBe(true);
    });

    it('prefers the flat orientation when both are equally dense', () => {
      const result = service.nest(input({ partWidthMm: 100, partHeightMm: 100, quantity: 1 }));

      expect(result.rotated).toBe(false);
    });
  });

  describe('parts that do not fit', () => {
    it('rejects a part larger than the sheet in both orientations', () => {
      const call = (): unknown => service.nest(input({ partWidthMm: 1200, partHeightMm: 600, quantity: 1 }));

      expect(call).toThrow(ValidationError);
      expect(call).toThrow('1000 × 500 mm usable area');
      expect(call).toThrow('This part is 1200 × 600 mm');
    });

    it('tags the rejection against the drawing field with a 422 envelope', () => {
      expect.assertions(3);
      try {
        service.nest(input({ partWidthMm: 1200, partHeightMm: 600 }));
      } catch (err) {
        expect(err).toBeInstanceOf(ValidationError);
        const error = err as ValidationError;
        expect(error.field).toBe('drawingId');
        expect(error.getStatus()).toBe(422);
      }
    });

    it('rejects a part that fits the raw sheet but not the usable area', () => {
      // 990 x 400 fits inside 1000 x 500, but a 10 mm margin leaves only 980 x 480.
      const call = (): unknown =>
        service.nest(input({ partWidthMm: 990, partHeightMm: 400, marginMm: 10, quantity: 1 }));

      expect(call).toThrow(ValidationError);
      expect(call).toThrow('980 × 480 mm usable area');
      expect(call).toThrow('after a 10 mm margin');
    });

    it('rejects a part made too large by spacing-free margins on both edges', () => {
      // 480 x 480: fits 500 mm of height raw, but not 500 - 2 x 15 = 470.
      const call = (): unknown =>
        service.nest(input({ partWidthMm: 480, partHeightMm: 480, marginMm: 15, quantity: 1 }));

      expect(call).toThrow(ValidationError);
    });

    it('does not clamp to one part per sheet the way the client preview does', () => {
      expect(() => service.nest(input({ partWidthMm: 5000, partHeightMm: 5000, quantity: 3 }))).toThrow(
        ValidationError,
      );
    });
  });

  describe('utilisation', () => {
    it('is the part area over the consumed sheet area', () => {
      // 200 x 100 x 26 = 520000 mm2 over 1000 x 500 x 2 sheets = 1000000 mm2.
      const result = service.nest(input({ quantity: 26 }));

      expect(result.utilisation).toBeCloseTo(0.52, 9);
    });

    it('reaches 1 when the sheet is filled exactly', () => {
      const result = service.nest(input({ quantity: 25 }));

      expect(result.utilisation).toBeCloseTo(1, 9);
    });
  });

  describe('placements', () => {
    const partWidthMm = 200;
    const partHeightMm = 100;
    const spacingMm = 8;
    const marginMm = 12;
    const quantity = 40;

    // usable 976 x 476. Flat: floor(984/208)=4 cols x floor(484/108)=4 rows = 16.
    // Turned: floor(984/108)=9 cols x floor(484/208)=2 rows = 18 -> rotation wins.
    const result = service.nest(
      input({ partWidthMm, partHeightMm, spacingMm, marginMm, quantity }),
    );

    it('emits exactly one placement per part', () => {
      expect(result.placements).toHaveLength(quantity);
      expect(result.rotated).toBe(true);
      expect(result.cols).toBe(9);
      expect(result.rows).toBe(2);
      expect(result.sheetCount).toBe(3);
    });

    it('numbers sheets contiguously from zero', () => {
      const sheets = [...new Set(result.placements.map((p) => p.sheet))].sort((a, b) => a - b);

      expect(sheets).toEqual([0, 1, 2]);
      expect(Math.max(...sheets)).toBe(result.sheetCount - 1);
      result.placements.forEach((p, i) => {
        if (i > 0) {
          const prev = result.placements[i - 1].sheet;
          expect(p.sheet === prev || p.sheet === prev + 1).toBe(true);
        }
      });
    });

    it('never overlaps two parts on the same sheet', () => {
      for (const [i, a] of result.placements.entries()) {
        for (const b of result.placements.slice(i + 1)) {
          if (a.sheet !== b.sheet) continue;
          const ra = rect(a, partWidthMm, partHeightMm);
          const rb = rect(b, partWidthMm, partHeightMm);
          const overlaps = ra.x0 < rb.x1 && rb.x0 < ra.x1 && ra.y0 < rb.y1 && rb.y0 < ra.y1;
          expect(overlaps).toBe(false);
        }
      }
    });

    it('keeps every part inside the margin-inset usable area', () => {
      for (const p of result.placements) {
        const r = rect(p, partWidthMm, partHeightMm);
        expect(r.x0).toBeGreaterThanOrEqual(marginMm);
        expect(r.y0).toBeGreaterThanOrEqual(marginMm);
        expect(r.x1).toBeLessThanOrEqual(1000 - marginMm);
        expect(r.y1).toBeLessThanOrEqual(500 - marginMm);
      }
    });

    it('leaves at least the configured spacing between neighbours in a row', () => {
      const first = result.placements[0];
      const second = result.placements[1];

      expect(second.x - first.x).toBe(partHeightMm + spacingMm);
      expect(second.y).toBe(first.y);
    });
  });
});
