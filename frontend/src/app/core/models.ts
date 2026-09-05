/** Domain types shared across the CNC Quick Quote UI.
 *  These mirror the tRPC/Prisma contract described in the technical plan. */

export type Role = 'USER' | 'MANAGER' | 'ADMIN';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  company?: string;
}

export interface Material {
  id: string;
  name: string;
  thicknessMm: number;
  costPerFtCents: number;
  costMultiplier: number;
  sheetWidthMm: number;
  sheetHeightMm: number;
  perSheetCostCents: number;
  active: boolean;
}

export interface Drawing {
  id: string;
  filename: string;
  sizeBytes: number;
  cutLengthMm: number;
  bboxWidthMm: number;
  bboxHeightMm: number;
  entityCount: number;
  skippedEntities: number;
  uploadedAt: string;
  /** Flattened outline in part-local millimetres, used by the canvas renderer. */
  polylines: number[][][];
}

export type BendDirection = 'up' | 'down';

export interface BendLine {
  id: string;
  drawingId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  angleDeg: number;
  direction: BendDirection;
}

export interface BreakdownLine {
  key: string;
  label: string;
  detail: string;
  amountCents: number;
}

export interface Placement {
  x: number;
  y: number;
  rotated: boolean;
  sheet: number;
}

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

export type QuoteStatus = 'draft' | 'quoted' | 'ordered' | 'expired';

export interface Quote {
  id: string;
  reference: string;
  drawingName: string;
  materialName: string;
  thicknessMm: number;
  quantity: number;
  bendCount: number;
  sheetCount: number;
  utilisation: number;
  cutLengthMm: number;
  totalCents: number;
  status: QuoteStatus;
  createdAt: string;
}

export interface ShippingMethod {
  id: string;
  name: string;
  kind: 'flat' | 'per_sheet';
  costCents: number;
  etaDays: number;
  active: boolean;
}

export type OrderStatus = 'paid' | 'in_production' | 'shipped' | 'cancelled';

export interface Order {
  id: string;
  orderNumber: string;
  quoteRef: string;
  customerName: string;
  customerEmail: string;
  materialName: string;
  quantity: number;
  shippingMethod: string;
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  status: OrderStatus;
  placedAt: string;
  emailError: string | null;
}

export interface ServiceCredential {
  id: string;
  service: string;
  key: string;
  description: string;
  maskedValue: string | null;
  configured: boolean;
  kind: 'backing-service' | 'integration';
}

export interface PricingSettings {
  costPerFtCents: number;
  setupFeeCents: number;
  handlingCents: number;
  minimumOrderCents: number;
  costPerBendCents: number;
}

export interface MachineSettings {
  bedWidthMm: number;
  bedHeightMm: number;
  partSpacingMm: number;
  sheetMarginMm: number;
  animationSpeedMmPerSec: number;
}

export interface UploadSettings {
  allowedExtensions: string;
  maxUploadMb: number;
  quantityMin: number;
  quantityMax: number;
}
