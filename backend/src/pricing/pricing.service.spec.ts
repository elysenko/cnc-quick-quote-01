import type { PricingSettings } from '../settings/settings.types';
import { BreakdownLine, PriceInput, PriceResult, PricingService } from './pricing.service';

/** The shipped defaults from `settings.types.ts`, restated so a defaults change fails loudly here. */
const PRICING: PricingSettings = {
  costPerFtCents: 240,
  setupFeeCents: 4500,
  handlingCents: 1200,
  minimumOrderCents: 7500,
  costPerBendCents: 175,
};

function input(overrides: Partial<PriceInput> = {}): PriceInput {
  return {
    partCutLengthMm: 1524, // exactly 5 ft
    quantity: 1,
    bendsPerPart: 0,
    sheetCount: 1,
    material: { name: 'Mild Steel 2mm', perSheetCostCents: 3200, costMultiplier: 1.25 },
    pricing: PRICING,
    ...overrides,
  };
}

function line(result: PriceResult, key: string): BreakdownLine {
  const found = result.lines.find((l) => l.key === key);
  if (!found) throw new Error(`missing breakdown line: ${key}`);
  return found;
}

describe('PricingService', () => {
  const service = new PricingService();

  describe('hand-computed quotes', () => {
    it('prices a ten-off bracket exactly', () => {
      // cut: 1524 mm x 10 = 15240 mm = 50.00 ft; 50 x 240 = 12000c
      // material: 2 sheets x 3200c x 1.25 = 8000c
      // bends: 3 x 10 = 30 bends x 175c = 5250c
      // setup 4500c + handling 1200c
      // subtotal = 4500 + 12000 + 8000 + 5250 + 1200 = 30950c
      const result = service.price(input({ quantity: 10, bendsPerPart: 3, sheetCount: 2 }));

      expect(line(result, 'setup').amountCents).toBe(4500);
      expect(line(result, 'cutting').amountCents).toBe(12000);
      expect(line(result, 'material').amountCents).toBe(8000);
      expect(line(result, 'bends').amountCents).toBe(5250);
      expect(line(result, 'handling').amountCents).toBe(1200);
      expect(result.subtotalCents).toBe(30950);
      expect(result.totalCents).toBe(30950);
      expect(result.totalCutLengthMm).toBe(15240);
      expect(result.totalBends).toBe(30);
    });

    it('prices a three-off flat plate exactly, rounding the cut line', () => {
      // cut: 1000 mm x 3 = 3000 mm = 9.8425196...ft; x 240 = 2362.2047c -> 2362c
      // material: 1 sheet x 5000c x 1.10 = 5500c
      // bends: none -> 0c; setup 4500c + handling 1200c
      // subtotal = 4500 + 2362 + 5500 + 0 + 1200 = 13562c
      const result = service.price(
        input({
          partCutLengthMm: 1000,
          quantity: 3,
          material: { name: 'Stainless 1.5mm', perSheetCostCents: 5000, costMultiplier: 1.1 },
        }),
      );

      expect(line(result, 'cutting').amountCents).toBe(2362);
      expect(line(result, 'material').amountCents).toBe(5500);
      expect(line(result, 'bends').amountCents).toBe(0);
      expect(result.subtotalCents).toBe(13562);
      expect(result.totalCents).toBe(13562);
    });

    it('rounds a half cent up, as the client preview does', () => {
      // 76.2 mm = 0.25 ft; 0.25 x 2c = 0.5c -> Math.round -> 1c
      const result = service.price(
        input({ partCutLengthMm: 76.2, pricing: { ...PRICING, costPerFtCents: 2 } }),
      );

      expect(line(result, 'cutting').amountCents).toBe(1);
    });
  });

  describe('breakdown presentation', () => {
    it('emits the five lines in order with the labels the UI renders', () => {
      const result = service.price(input());

      expect(result.lines.map((l) => l.key)).toEqual([
        'setup',
        'cutting',
        'material',
        'bends',
        'handling',
      ]);
      expect(result.lines.map((l) => l.label)).toEqual([
        'Setup fee',
        'Laser cutting',
        'Material',
        'Bending',
        'Handling',
      ]);
    });

    it('formats the cut path in feet to two decimals', () => {
      const result = service.price(input({ quantity: 10 }));

      expect(line(result, 'cutting').detail).toBe('50.00 ft of cut path at 2.40/ft');
      expect(line(result, 'setup').detail).toBe('Charged once per order');
      expect(line(result, 'handling').detail).toBe('Deburr, inspect and pack');
    });

    it('names the material, sheet count and multiplier', () => {
      const result = service.price(input({ sheetCount: 4 }));

      expect(line(result, 'material').detail).toBe('4 x Mild Steel 2mm sheet, multiplier 1.25');
    });

    it('describes a flat part as having no bends and charges nothing', () => {
      const result = service.price(input({ bendsPerPart: 0, quantity: 12 }));

      expect(line(result, 'bends').detail).toBe('No bend lines on this part');
      expect(line(result, 'bends').amountCents).toBe(0);
      expect(result.totalBends).toBe(0);
    });

    it('describes bends with the per-bend rate', () => {
      const result = service.price(input({ bendsPerPart: 2, quantity: 6 }));

      expect(line(result, 'bends').detail).toBe('12 bends at 1.75 each');
      expect(line(result, 'bends').amountCents).toBe(2100);
    });
  });

  describe('quantity scaling', () => {
    it('scales cutting and bending with quantity but charges setup and handling once', () => {
      const single = service.price(input({ quantity: 5, bendsPerPart: 2 }));
      const double = service.price(input({ quantity: 10, bendsPerPart: 2 }));

      expect(double.totalCutLengthMm).toBe(single.totalCutLengthMm * 2);
      expect(double.totalBends).toBe(single.totalBends * 2);
      expect(line(double, 'cutting').amountCents).toBe(line(single, 'cutting').amountCents * 2);
      expect(line(double, 'bends').amountCents).toBe(line(single, 'bends').amountCents * 2);

      expect(line(double, 'setup').amountCents).toBe(line(single, 'setup').amountCents);
      expect(line(double, 'handling').amountCents).toBe(line(single, 'handling').amountCents);
      expect(line(double, 'setup').amountCents).toBe(PRICING.setupFeeCents);
      expect(line(double, 'handling').amountCents).toBe(PRICING.handlingCents);
    });
  });

  describe('material multiplier', () => {
    it('doubles the material line when the multiplier doubles', () => {
      const base = service.price(
        input({
          sheetCount: 2,
          material: { name: 'Mild Steel 2mm', perSheetCostCents: 3200, costMultiplier: 1 },
        }),
      );
      const doubled = service.price(
        input({
          sheetCount: 2,
          material: { name: 'Mild Steel 2mm', perSheetCostCents: 3200, costMultiplier: 2 },
        }),
      );

      expect(line(base, 'material').amountCents).toBe(6400);
      expect(line(doubled, 'material').amountCents).toBe(12800);
    });

    it('scales the material line with sheet count', () => {
      const one = service.price(input({ sheetCount: 1 }));
      const three = service.price(input({ sheetCount: 3 }));

      expect(line(one, 'material').amountCents).toBe(4000);
      expect(line(three, 'material').amountCents).toBe(12000);
    });
  });

  describe('minimum order', () => {
    it('floors a tiny job at the minimum and flags it', () => {
      // cut: 100 mm x 1 = 0.3280 ft x 240 = 78.74c -> 79c
      // subtotal = 4500 + 79 + 500 + 0 + 1200 = 6279c, under the 7500c minimum
      const result = service.price(
        input({
          partCutLengthMm: 100,
          material: { name: 'Mild Steel 1mm', perSheetCostCents: 500, costMultiplier: 1 },
        }),
      );

      expect(result.subtotalCents).toBe(6279);
      expect(result.totalCents).toBe(PRICING.minimumOrderCents);
      expect(result.totalCents).toBe(7500);
      expect(result.minimumApplied).toBe(true);
    });

    it('leaves a large job at its subtotal', () => {
      const result = service.price(input({ quantity: 10, bendsPerPart: 3, sheetCount: 2 }));

      expect(result.subtotalCents).toBe(30950);
      expect(result.totalCents).toBe(result.subtotalCents);
      expect(result.minimumApplied).toBe(false);
    });

    it('does not flag a subtotal that lands exactly on the minimum', () => {
      const result = service.price(
        input({
          partCutLengthMm: 0,
          material: { name: 'Offcut', perSheetCostCents: 1800, costMultiplier: 1 },
        }),
      );

      // 4500 + 0 + 1800 + 0 + 1200 = 7500c
      expect(result.subtotalCents).toBe(7500);
      expect(result.minimumApplied).toBe(false);
      expect(result.totalCents).toBe(7500);
    });
  });

  describe('integer cents', () => {
    it('never leaks a fractional amount into a line or total', () => {
      const result = service.price(
        input({
          partCutLengthMm: 1234.567,
          quantity: 7,
          bendsPerPart: 3,
          sheetCount: 3,
          material: { name: 'Brass 0.9mm', perSheetCostCents: 4275, costMultiplier: 1.33 },
        }),
      );

      for (const l of result.lines) {
        expect(Number.isInteger(l.amountCents)).toBe(true);
      }
      expect(Number.isInteger(result.subtotalCents)).toBe(true);
      expect(Number.isInteger(result.totalCents)).toBe(true);
    });
  });

  describe('parity with the Angular preview', () => {
    it('reproduces a quote derived by hand from core/pricing.ts', () => {
      // partCutLengthMm 1234.5 x 7 = 8641.5 mm -> 28.351377952755904 ft ("28.35 ft")
      // cutting: 28.351377952755904 x 265 = 7513.115... -> 7513c
      // material: 3 x 4275 x 1.33 = 17057.25 -> 17057c
      // bends: 2 x 7 = 14 x 210 = 2940c; setup 3800c; handling 950c
      // subtotal = 3800 + 7513 + 17057 + 2940 + 950 = 32260c, above the 5000c minimum
      const result = service.price({
        partCutLengthMm: 1234.5,
        quantity: 7,
        bendsPerPart: 2,
        sheetCount: 3,
        material: { name: 'Aluminium 3mm', perSheetCostCents: 4275, costMultiplier: 1.33 },
        pricing: {
          costPerFtCents: 265,
          setupFeeCents: 3800,
          handlingCents: 950,
          minimumOrderCents: 5000,
          costPerBendCents: 210,
        },
      });

      expect(result.lines).toEqual([
        { key: 'setup', label: 'Setup fee', detail: 'Charged once per order', amountCents: 3800 },
        {
          key: 'cutting',
          label: 'Laser cutting',
          detail: '28.35 ft of cut path at 2.65/ft',
          amountCents: 7513,
        },
        {
          key: 'material',
          label: 'Material',
          detail: '3 x Aluminium 3mm sheet, multiplier 1.33',
          amountCents: 17057,
        },
        { key: 'bends', label: 'Bending', detail: '14 bends at 2.10 each', amountCents: 2940 },
        { key: 'handling', label: 'Handling', detail: 'Deburr, inspect and pack', amountCents: 950 },
      ]);
      expect(result.subtotalCents).toBe(32260);
      expect(result.totalCents).toBe(32260);
      expect(result.minimumApplied).toBe(false);
      expect(result.totalCutLengthMm).toBe(8641.5);
      expect(result.totalBends).toBe(14);
    });
  });
});
