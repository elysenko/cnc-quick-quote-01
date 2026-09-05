import { Injectable } from '@nestjs/common';
import type { Drawing, Material, Quote } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MaterialsService } from '../materials/materials.service';
import { DrawingsService } from '../drawings/drawings.service';
import { NestingService, NestingResult } from '../nesting/nesting.service';
import { PricingService, PriceResult } from '../pricing/pricing.service';
import { SettingsService } from '../settings/settings.service';
import { asJson } from '../common/json';
import { ForbiddenError, NotFoundError, ValidationError } from '../common/errors';
import { AuthenticatedUser } from '../auth/auth.types';
import {
  MachineSettings,
  PricingSettings,
  UploadSettings,
} from '../settings/settings.types';

/** Frozen at generation time; orders read this, never the live configuration. */
export interface PricingSnapshot {
  pricing: PricingSettings;
  machine: MachineSettings;
  material: {
    id: string;
    name: string;
    thicknessMm: number;
    costPerFtCents: number;
    costMultiplier: number;
    sheetWidthMm: number;
    sheetHeightMm: number;
    perSheetCostCents: number;
  };
  capturedAt: string;
}

export interface QuoteView {
  id: string;
  reference: string;
  drawingId: string;
  drawingName: string;
  materialId: string;
  materialName: string;
  thicknessMm: number;
  quantity: number;
  bendCount: number;
  sheetCount: number;
  utilisation: number;
  cutLengthMm: number;
  totalCents: number;
  status: string;
  createdAt: string;
  nesting: NestingResult;
  price: PriceResult;
  pricingSnapshot: PricingSnapshot;
  polylines: number[][][];
}

@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly materials: MaterialsService,
    private readonly drawings: DrawingsService,
    private readonly nesting: NestingService,
    private readonly pricing: PricingService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Geometry was measured at upload time, so quoting is pure arithmetic: nest,
   * price, snapshot, persist. Nothing here re-reads the DXF.
   */
  async create(
    input: { drawingId: string; materialId: string; quantity: number },
    user: AuthenticatedUser,
  ): Promise<QuoteView> {
    const drawing = await this.drawings.byIdForUser(input.drawingId, user.id, false);
    const material = await this.materials.forQuote(input.materialId);
    const bundle = await this.settings.get();
    const quantity = validateQuantity(input.quantity, bundle.upload);

    const bendCount = await this.prisma.bendLine.count({
      where: { drawingId: drawing.id },
    });

    const nesting = this.nesting.nest({
      partWidthMm: drawing.bboxWidthMm,
      partHeightMm: drawing.bboxHeightMm,
      sheetWidthMm: material.sheetWidthMm,
      sheetHeightMm: material.sheetHeightMm,
      spacingMm: bundle.machine.partSpacingMm,
      marginMm: bundle.machine.sheetMarginMm,
      quantity,
    });

    const price = this.pricing.price({
      partCutLengthMm: drawing.cutLengthMm,
      quantity,
      bendsPerPart: bendCount,
      sheetCount: nesting.sheetCount,
      material,
      pricing: bundle.pricing,
    });

    const snapshot: PricingSnapshot = {
      pricing: bundle.pricing,
      machine: bundle.machine,
      material: {
        id: material.id,
        name: material.name,
        thicknessMm: material.thicknessMm,
        costPerFtCents: material.costPerFtCents,
        costMultiplier: material.costMultiplier,
        sheetWidthMm: material.sheetWidthMm,
        sheetHeightMm: material.sheetHeightMm,
        perSheetCostCents: material.perSheetCostCents,
      },
      capturedAt: new Date().toISOString(),
    };

    const quote = await this.prisma.quote.create({
      data: {
        reference: await this.nextReference(),
        userId: user.id,
        drawingId: drawing.id,
        materialId: material.id,
        quantity,
        bendCount,
        sheetCount: nesting.sheetCount,
        utilisation: nesting.utilisation,
        cutLengthMm: drawing.cutLengthMm,
        nestingResult: asJson(nesting),
        breakdown: asJson(price),
        pricingSnapshot: asJson(snapshot),
        totalCents: price.totalCents,
        status: 'quoted',
      },
    });

    return toView(quote, drawing, material);
  }

  async list(userId: string): Promise<QuoteView[]> {
    const quotes = await this.prisma.quote.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { drawing: true, material: true },
      take: 200,
    });
    return quotes.map((quote) => toView(quote, quote.drawing, quote.material));
  }

  async byId(id: string, user: AuthenticatedUser): Promise<QuoteView> {
    const quote = await this.prisma.quote.findUnique({
      where: { id },
      include: { drawing: true, material: true },
    });
    if (!quote) throw new NotFoundError('That quote no longer exists.');
    if (quote.userId !== user.id && !isStaff(user)) {
      throw new ForbiddenError('That quote belongs to another account.');
    }
    return toView(quote, quote.drawing, quote.material);
  }

  /** Sequential, human-readable reference: `Q-<year>-<0001>`. */
  private async nextReference(): Promise<string> {
    const year = new Date().getUTCFullYear();
    const count = await this.prisma.quote.count({
      where: { reference: { startsWith: `Q-${year}-` } },
    });
    return `Q-${year}-${String(count + 1).padStart(4, '0')}`;
  }
}

function validateQuantity(quantity: unknown, limits: UploadSettings): number {
  const range = `Quantity must be between ${limits.quantityMin} and ${limits.quantityMax}.`;
  if (quantity === null || quantity === undefined || typeof quantity !== 'number' || Number.isNaN(quantity)) {
    throw new ValidationError(range, 'quantity');
  }
  if (!Number.isInteger(quantity)) {
    throw new ValidationError('Quantity must be a whole number of parts.', 'quantity');
  }
  if (quantity < limits.quantityMin || quantity > limits.quantityMax) {
    throw new ValidationError(range, 'quantity');
  }
  return quantity;
}

function toView(quote: Quote, drawing: Drawing, material: Material): QuoteView {
  return {
    id: quote.id,
    reference: quote.reference,
    drawingId: quote.drawingId,
    drawingName: drawing.filename,
    materialId: quote.materialId,
    materialName: material.name,
    thicknessMm: material.thicknessMm,
    quantity: quote.quantity,
    bendCount: quote.bendCount,
    sheetCount: quote.sheetCount,
    utilisation: quote.utilisation,
    cutLengthMm: quote.cutLengthMm,
    totalCents: quote.totalCents,
    status: quote.status,
    createdAt: quote.createdAt.toISOString(),
    nesting: quote.nestingResult as unknown as NestingResult,
    price: quote.breakdown as unknown as PriceResult,
    pricingSnapshot: quote.pricingSnapshot as unknown as PricingSnapshot,
    polylines: (drawing.polylines as unknown as number[][][]) ?? [],
  };
}

function isStaff(user: AuthenticatedUser): boolean {
  return user.role === 'ADMIN' || user.role === 'MANAGER';
}
