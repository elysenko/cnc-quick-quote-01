import { Injectable } from '@nestjs/common';
import type { PricingSettings } from '../settings/settings.types';

/** One row of the quote breakdown. `label`/`detail` are rendered verbatim by the UI. */
export interface BreakdownLine {
  key: string;
  label: string;
  detail: string;
  amountCents: number;
}

/** A priced quote. All money is integer cents end to end — never floats. */
export interface PriceResult {
  lines: BreakdownLine[];
  subtotalCents: number;
  totalCents: number;
  minimumApplied: boolean;
  totalCutLengthMm: number;
  totalBends: number;
}

/** The subset of a material that affects price. */
export interface PriceMaterial {
  name: string;
  perSheetCostCents: number;
  costMultiplier: number;
}

export interface PriceInput {
  partCutLengthMm: number;
  quantity: number;
  bendsPerPart: number;
  sheetCount: number;
  material: PriceMaterial;
  pricing: PricingSettings;
}

const MM_PER_FOOT = 304.8;

/**
 * Local copy of the Angular `core/format.ts#feet` helper.
 *
 * Duplicated rather than shared because the string ends up inside a stored
 * breakdown line: the browser preview and the persisted quote must agree
 * character for character, so this formatting must not drift.
 */
function feet(valueMm: number): string {
  return `${(valueMm / MM_PER_FOOT).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ft`;
}

/**
 * Authoritative pricing engine — a verbatim port of `core/pricing.ts#priceQuote`.
 *
 * The customer sees a live price while they configure the quote; this service
 * produces the price they actually pay. They must be byte-identical, so the
 * order of operations and every `Math.round` boundary below is load-bearing and
 * any change has to land in both files at once.
 */
@Injectable()
export class PricingService {
  /**
   * total = max(minimumOrder, setup + cutFt x costPerFt + sheetCost + handling + bends x costPerBend).
   * Cut length and bend count scale with quantity; setup and handling are once per order.
   */
  price(input: PriceInput): PriceResult {
    const totalCutLengthMm = input.partCutLengthMm * input.quantity;
    const totalBends = input.bendsPerPart * input.quantity;
    const cutFt = totalCutLengthMm / MM_PER_FOOT;

    const cutCents = Math.round(cutFt * input.pricing.costPerFtCents);
    const sheetCents = Math.round(
      input.sheetCount * input.material.perSheetCostCents * input.material.costMultiplier,
    );
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
        detail:
          totalBends === 0
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
}
