import { Injectable, computed, signal } from '@angular/core';
import { BendLine, Drawing, MachineSettings, Material, PricingSettings, UploadSettings } from './models';
import { DEMO_PART_HEIGHT_MM, DEMO_PART_WIDTH_MM, cutLength, demoPartPolylines, nest } from './geometry';
import { priceQuote } from './pricing';

const DEMO_POLYLINES = demoPartPolylines();

/**
 * Wizard state shared by the four /quote/new steps. In production the service
 * layer feeds these signals from the drawings / bends / quotes tRPC routers.
 */
@Injectable({ providedIn: 'root' })
export class QuoteDraftService {
  readonly drawing = signal<Drawing | null>({
    id: 'drw_8f21',
    filename: 'bracket-rev-c.dxf',
    sizeBytes: 148_320,
    cutLengthMm: Math.round(cutLength(DEMO_POLYLINES) * 10) / 10,
    bboxWidthMm: DEMO_PART_WIDTH_MM,
    bboxHeightMm: DEMO_PART_HEIGHT_MM,
    entityCount: 34,
    skippedEntities: 2,
    uploadedAt: '2026-09-05T09:12:00Z',
    polylines: DEMO_POLYLINES,
  });

  readonly bends = signal<BendLine[]>([
    { id: 'bnd_1', drawingId: 'drw_8f21', x1: 46, y1: 18, x2: 46, y2: 142, angleDeg: 90, direction: 'up' },
    { id: 'bnd_2', drawingId: 'drw_8f21', x1: 194, y1: 18, x2: 194, y2: 142, angleDeg: 90, direction: 'down' },
  ]);

  readonly materials = signal<Material[]>([
    { id: 'mat_1', name: 'Mild steel 1.5 mm', thicknessMm: 1.5, costPerFtCents: 210, costMultiplier: 1, sheetWidthMm: 2500, sheetHeightMm: 1250, perSheetCostCents: 5400, active: true },
    { id: 'mat_2', name: 'Mild steel 3.0 mm', thicknessMm: 3, costPerFtCents: 320, costMultiplier: 1.35, sheetWidthMm: 2500, sheetHeightMm: 1250, perSheetCostCents: 9800, active: true },
    { id: 'mat_3', name: 'Aluminium 5052 2.0 mm', thicknessMm: 2, costPerFtCents: 285, costMultiplier: 1.6, sheetWidthMm: 2440, sheetHeightMm: 1220, perSheetCostCents: 11200, active: true },
    { id: 'mat_4', name: 'Stainless 304 1.2 mm', thicknessMm: 1.2, costPerFtCents: 410, costMultiplier: 2.1, sheetWidthMm: 2500, sheetHeightMm: 1250, perSheetCostCents: 16400, active: true },
  ]);

  readonly pricing = signal<PricingSettings>({
    costPerFtCents: 240,
    setupFeeCents: 4500,
    handlingCents: 1200,
    minimumOrderCents: 7500,
    costPerBendCents: 175,
  });

  readonly machine = signal<MachineSettings>({
    bedWidthMm: 3000,
    bedHeightMm: 1500,
    partSpacingMm: 8,
    sheetMarginMm: 12,
    animationSpeedMmPerSec: 900,
  });

  readonly uploads = signal<UploadSettings>({
    allowedExtensions: '.dxf, .dwg',
    maxUploadMb: 10,
    quantityMin: 1,
    quantityMax: 500,
  });

  readonly materialId = signal<string>('mat_2');
  readonly quantity = signal<number>(24);
  readonly uploaded = signal<boolean>(true);

  readonly material = computed<Material>(
    () => this.materials().find((m) => m.id === this.materialId()) ?? this.materials()[0],
  );

  readonly nesting = computed(() => {
    const drawing = this.drawing();
    const material = this.material();
    const machine = this.machine();
    return nest({
      partWidthMm: drawing?.bboxWidthMm ?? DEMO_PART_WIDTH_MM,
      partHeightMm: drawing?.bboxHeightMm ?? DEMO_PART_HEIGHT_MM,
      sheetWidthMm: material.sheetWidthMm,
      sheetHeightMm: material.sheetHeightMm,
      spacingMm: machine.partSpacingMm,
      marginMm: machine.sheetMarginMm,
      quantity: this.quantity(),
    });
  });

  readonly price = computed(() =>
    priceQuote({
      partCutLengthMm: this.drawing()?.cutLengthMm ?? 0,
      quantity: this.quantity(),
      bendsPerPart: this.bends().length,
      sheetCount: this.nesting().sheetCount,
      material: this.material(),
      pricing: this.pricing(),
    }),
  );

  readonly partPolylines = computed(() => this.drawing()?.polylines ?? DEMO_POLYLINES);

  addBend(bend: BendLine): void {
    this.bends.update((list) => [...list, bend]);
  }

  updateBend(id: string, patch: Partial<BendLine>): void {
    this.bends.update((list) => list.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  removeBend(id: string): void {
    this.bends.update((list) => list.filter((b) => b.id !== id));
  }

  setQuantity(value: number): void {
    this.quantity.set(value);
  }
}
