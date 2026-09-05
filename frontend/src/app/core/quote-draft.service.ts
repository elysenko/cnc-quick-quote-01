import { Injectable, computed, inject, signal } from '@angular/core';
import {
  BendLine,
  Drawing,
  MachineSettings,
  Material,
  NestingResult,
  PricingSettings,
  UploadSettings,
} from './models';
import { nest } from './geometry';
import { PriceResult, priceQuote } from './pricing';
import { ApiClient } from './api';

/** Server shape of a persisted quote — the authoritative price. */
export interface QuoteRecord {
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
  polylines: number[][][];
}

interface SettingsBundle {
  pricing: PricingSettings;
  machine: MachineSettings;
  upload: UploadSettings;
}

/** Rendered when no material has been chosen yet, so the summary panels can
 *  bind safely before the catalogue has loaded. */
const NO_MATERIAL: Material = {
  id: '',
  name: 'No material selected',
  thicknessMm: 0,
  costPerFtCents: 0,
  costMultiplier: 1,
  sheetWidthMm: 2500,
  sheetHeightMm: 1250,
  perSheetCostCents: 0,
  active: false,
};

const EMPTY_NESTING: NestingResult = {
  sheetCount: 0,
  utilisation: 0,
  rotated: false,
  cols: 0,
  rows: 0,
  placements: [],
  sheetWidthMm: 2500,
  sheetHeightMm: 1250,
};

/**
 * State shared by the four /quote/new steps.
 *
 * Everything here is loaded from the API: the drawing comes from the upload
 * endpoint (which parsed the real DXF), the materials and limits from admin
 * settings. `nesting` and `price` recompute locally so the configure step
 * responds instantly to a quantity change; once the quote is generated the
 * server's persisted result takes over and is what the customer is charged.
 */
@Injectable({ providedIn: 'root' })
export class QuoteDraftService {
  private readonly api = inject(ApiClient);

  readonly drawing = signal<Drawing | null>(null);
  readonly bends = signal<BendLine[]>([]);
  readonly materials = signal<Material[]>([]);

  readonly pricing = signal<PricingSettings>({
    costPerFtCents: 0,
    setupFeeCents: 0,
    handlingCents: 0,
    minimumOrderCents: 0,
    costPerBendCents: 0,
  });

  readonly machine = signal<MachineSettings>({
    bedWidthMm: 3000,
    bedHeightMm: 1500,
    partSpacingMm: 8,
    sheetMarginMm: 12,
    animationSpeedMmPerSec: 900,
  });

  readonly uploads = signal<UploadSettings>({
    allowedExtensions: '.dxf',
    maxUploadMb: 10,
    quantityMin: 1,
    quantityMax: 500,
  });

  readonly materialId = signal<string>('');
  readonly quantity = signal<number>(1);

  /** The quote persisted by the API for the current inputs, once generated. */
  readonly savedQuote = signal<QuoteRecord | null>(null);
  readonly generating = signal(false);
  readonly loadError = signal<string | null>(null);

  readonly uploaded = computed(() => this.drawing() !== null);

  readonly material = computed<Material>(
    () => this.materials().find((m) => m.id === this.materialId()) ?? this.materials()[0] ?? NO_MATERIAL,
  );

  /** True when the saved quote still describes exactly what is on screen. */
  private readonly savedMatches = computed(() => {
    const saved = this.savedQuote();
    return (
      saved !== null &&
      saved.drawingId === this.drawing()?.id &&
      saved.materialId === this.material().id &&
      saved.quantity === this.quantity() &&
      saved.bendCount === this.bends().length
    );
  });

  private readonly localNesting = computed<NestingResult>(() => {
    const drawing = this.drawing();
    const material = this.material();
    if (!drawing || !material.id) return EMPTY_NESTING;
    const machine = this.machine();
    return nest({
      partWidthMm: drawing.bboxWidthMm,
      partHeightMm: drawing.bboxHeightMm,
      sheetWidthMm: material.sheetWidthMm,
      sheetHeightMm: material.sheetHeightMm,
      spacingMm: machine.partSpacingMm,
      marginMm: machine.sheetMarginMm,
      quantity: this.quantity(),
    });
  });

  readonly nesting = computed<NestingResult>(() =>
    this.savedMatches() ? this.savedQuote()!.nesting : this.localNesting(),
  );

  readonly price = computed<PriceResult>(() => {
    if (this.savedMatches()) return this.savedQuote()!.price;
    return priceQuote({
      partCutLengthMm: this.drawing()?.cutLengthMm ?? 0,
      quantity: this.quantity(),
      bendsPerPart: this.bends().length,
      sheetCount: this.localNesting().sheetCount,
      material: this.material(),
      pricing: this.pricing(),
    });
  });

  readonly partPolylines = computed<number[][][]>(() => this.drawing()?.polylines ?? []);

  // ── Loading ───────────────────────────────────────────────────────────────

  /** Pulls the catalogue and the admin limits the wizard has to respect. */
  async loadReferenceData(): Promise<void> {
    try {
      const [materials, settings] = await Promise.all([
        this.api.get<Material[]>('/materials'),
        this.api.get<SettingsBundle>('/settings/public'),
      ]);
      this.materials.set(materials);
      this.pricing.set(settings.pricing);
      this.machine.set(settings.machine);
      this.uploads.set(settings.upload);
      if (!this.materialId() && materials.length) this.materialId.set(materials[0].id);
      this.quantity.update((value) =>
        Math.min(settings.upload.quantityMax, Math.max(settings.upload.quantityMin, value)),
      );
      this.loadError.set(null);
    } catch {
      this.loadError.set('We could not load the material catalogue. Please refresh.');
    }
  }

  setDrawing(drawing: Drawing): void {
    this.drawing.set(drawing);
    this.bends.set([]);
    this.savedQuote.set(null);
    void this.loadBends(drawing.id);
  }

  async loadBends(drawingId: string): Promise<void> {
    this.bends.set(await this.api.get<BendLine[]>('/bends', { drawingId }));
  }

  // ── Bend editing (optimistic, reconciled with the server) ─────────────────

  async addBend(bend: BendLine): Promise<BendLine | null> {
    const drawingId = this.drawing()?.id;
    if (!drawingId) return null;
    this.bends.update((list) => [...list, bend]);
    try {
      const saved = await this.api.post<BendLine>('/bends', { ...bend, drawingId });
      this.bends.update((list) => list.map((b) => (b.id === bend.id ? saved : b)));
      this.savedQuote.set(null);
      return saved;
    } catch {
      this.bends.update((list) => list.filter((b) => b.id !== bend.id));
      return null;
    }
  }

  async updateBend(id: string, patch: Partial<BendLine>): Promise<void> {
    const previous = this.bends().find((b) => b.id === id);
    this.bends.update((list) => list.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    try {
      const saved = await this.api.patch<BendLine>(`/bends/${id}`, patch);
      this.bends.update((list) => list.map((b) => (b.id === id ? saved : b)));
      this.savedQuote.set(null);
    } catch {
      if (previous) this.bends.update((list) => list.map((b) => (b.id === id ? previous : b)));
    }
  }

  async removeBend(id: string): Promise<void> {
    const previous = this.bends();
    this.bends.update((list) => list.filter((b) => b.id !== id));
    try {
      await this.api.delete(`/bends/${id}`);
      this.savedQuote.set(null);
    } catch {
      this.bends.set(previous);
    }
  }

  setQuantity(value: number): void {
    this.quantity.set(value);
    this.savedQuote.set(null);
  }

  // ── Quote generation ──────────────────────────────────────────────────────

  /**
   * Persists the quote server-side and adopts its numbers. Called when the
   * result step opens, so what the customer sees is what was stored.
   */
  async ensureQuote(): Promise<QuoteRecord | null> {
    if (this.savedMatches()) return this.savedQuote();
    const drawingId = this.drawing()?.id;
    const materialId = this.material().id;
    if (!drawingId || !materialId) return null;

    this.generating.set(true);
    try {
      const quote = await this.api.post<QuoteRecord>('/quotes', {
        drawingId,
        materialId,
        quantity: this.quantity(),
      });
      this.savedQuote.set(quote);
      this.loadError.set(null);
      return quote;
    } catch (error) {
      this.loadError.set(
        error instanceof Error ? error.message : 'We could not generate that quote.',
      );
      return null;
    } finally {
      this.generating.set(false);
    }
  }
}
