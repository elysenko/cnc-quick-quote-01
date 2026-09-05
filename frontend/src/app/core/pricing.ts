import { BreakdownLine, Material, PricingSettings } from './models';
import { feet } from './format';

export interface PriceInput {
  partCutLengthMm: number;
  quantity: number;
  bendsPerPart: number;
  sheetCount: number;
  material: Material;
  pricing: PricingSettings;
}

export interface PriceResult {
  lines: BreakdownLine[];
  subtotalCents: number;
  totalCents: number;
  minimumApplied: boolean;
  totalCutLengthMm: number;
  totalBends: number;
}

const MM_PER_FOOT = 304.8;

/**
 * total = max(minimumOrder, setupFee + cutFt x costPerFt + sheetCost + handling + bends x costPerBend)
 * Cut length and bend count scale with quantity; setup and handling are once per order.
 */
export function priceQuote(input: PriceInput): PriceResult {
  const totalCutLengthMm = input.partCutLengthMm * input.quantity;
  const totalBends = input.bendsPerPart * input.quantity;
  const cutFt = totalCutLengthMm / MM_PER_FOOT;

  const cutCents = Math.round(cutFt * input.pricing.costPerFtCents);
  const sheetCents = Math.round(input.sheetCount * input.material.perSheetCostCents * input.material.costMultiplier);
  const bendCents = totalBends * input.pricing.costPerBendCents;

  const lines: BreakdownLine[] = [
    {
      key: 'setup',
      label: 'Setup fee',
      detail: 'Charged once per order',
      amountCents: input.pricing.setupFeeCents,
    },
    {
      key: 'cutting',
      label: 'Laser cutting',
      detail: `${feet(totalCutLengthMm)} of cut path at ${(input.pricing.costPerFtCents / 100).toFixed(2)}/ft`,
      amountCents: cutCents,
    },
    {
      key: 'material',
      label: 'Material',
      detail: `${input.sheetCount} x ${input.material.name} sheet, multiplier ${input.material.costMultiplier.toFixed(2)}`,
      amountCents: sheetCents,
    },
    {
      key: 'bends',
      label: 'Bending',
      detail: totalBends === 0
        ? 'No bend lines on this part'
        : `${totalBends} bends at ${(input.pricing.costPerBendCents / 100).toFixed(2)} each`,
      amountCents: bendCents,
    },
    {
      key: 'handling',
      label: 'Handling',
      detail: 'Deburr, inspect and pack',
      amountCents: input.pricing.handlingCents,
    },
  ];

  const subtotalCents = lines.reduce((sum, line) => sum + line.amountCents, 0);
  const minimumApplied = subtotalCents < input.pricing.minimumOrderCents;

  return {
    lines,
    subtotalCents,
    totalCents: Math.max(subtotalCents, input.pricing.minimumOrderCents),
    minimumApplied,
    totalCutLengthMm,
    totalBends,
  };
}
