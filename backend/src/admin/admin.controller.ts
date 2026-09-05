import { Body, Controller, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Material, ShippingMethod } from '@prisma/client';
import { z } from 'zod';
import { AdminOnly } from '../auth/auth.guard';
import { parseBody } from '../common/validation';
import { MaterialsService } from '../materials/materials.service';
import { ShippingService } from '../shipping/shipping.service';
import { SettingsService } from '../settings/settings.service';
import { OrdersService, OrderView } from '../orders/orders.service';
import { AdminSettingsService, CredentialRow } from './admin-settings.service';
import { mask } from '../common/crypto';
import {
  AppSettingsBundle,
  BrandingSettings,
  ContactSettings,
  MachineSettings,
  PricingSettings,
  UploadSettings,
} from '../settings/settings.types';

const materialSchema = z.object({
  name: z.string().min(1, 'Give the material a name.'),
  thicknessMm: z.coerce.number().positive('Thickness must be greater than zero.'),
  costPerFtCents: z.coerce.number().int().min(0),
  costMultiplier: z.coerce.number().min(0),
  sheetWidthMm: z.coerce.number().positive(),
  sheetHeightMm: z.coerce.number().positive(),
  perSheetCostCents: z.coerce.number().int().min(0),
  active: z.boolean().default(true),
});

const shippingSchema = z.object({
  name: z.string().min(1, 'Give the delivery method a name.'),
  kind: z.enum(['flat', 'per_sheet']),
  costCents: z.coerce.number().int().min(0),
  etaDays: z.coerce.number().int().min(0),
  active: z.boolean().default(true),
});

const pricingSchema = z.object({
  costPerFtCents: z.coerce.number().int().min(0),
  setupFeeCents: z.coerce.number().int().min(0),
  handlingCents: z.coerce.number().int().min(0),
  minimumOrderCents: z.coerce.number().int().min(0),
  costPerBendCents: z.coerce.number().int().min(0),
});

const machineSchema = z.object({
  bedWidthMm: z.coerce.number().positive(),
  bedHeightMm: z.coerce.number().positive(),
  partSpacingMm: z.coerce.number().min(0),
  sheetMarginMm: z.coerce.number().min(0),
  animationSpeedMmPerSec: z.coerce.number().positive(),
});

const uploadSchema = z
  .object({
    allowedExtensions: z.string().min(1),
    maxUploadMb: z.coerce.number().positive(),
    quantityMin: z.coerce.number().int().min(1),
    quantityMax: z.coerce.number().int().min(1),
  })
  .refine((value) => value.quantityMax >= value.quantityMin, {
    message: 'Maximum quantity must be at least the minimum.',
    path: ['quantityMax'],
  });

const brandingSchema = z.object({
  companyName: z.string().min(1),
  tagline: z.string(),
  logoMark: z.string(),
  primaryColor: z.string(),
  accentColor: z.string(),
});

const contactSchema = z.object({
  supportEmail: z.string(),
  supportPhone: z.string(),
  addressLines: z.array(z.string()).default([]),
});

const paymentSchema = z.object({
  stripeSecretKey: z.string().nullable().optional(),
  stripeWebhookSecret: z.string().nullable().optional(),
  stripePublishableKey: z.string().nullable().optional(),
  currency: z.string().optional(),
});

const orderNoteSchema = z.object({
  internalNote: z.string().max(2000, 'Notes are limited to 2000 characters.'),
});

const credentialSchema = z.object({
  key: z.string().min(1),
  value: z.string().min(1, 'Enter a value before saving.'),
});

/** Every route here is staff-only: 401 for anonymous, 403 for a customer. */
@ApiTags('admin')
@AdminOnly()
@Controller('admin')
export class AdminController {
  constructor(
    private readonly materials: MaterialsService,
    private readonly shipping: ShippingService,
    private readonly settings: SettingsService,
    private readonly orders: OrdersService,
    private readonly credentials: AdminSettingsService,
  ) {}

  // ── Materials ─────────────────────────────────────────────────────────────
  @Get('materials')
  listMaterials(): Promise<Material[]> {
    return this.materials.listAll();
  }

  @Post('materials')
  createMaterial(@Body() body: unknown): Promise<Material> {
    return this.materials.create(parseBody(materialSchema, body));
  }

  @Patch('materials/:id')
  updateMaterial(@Param('id') id: string, @Body() body: unknown): Promise<Material> {
    return this.materials.update(id, parseBody(materialSchema.partial(), body));
  }

  // ── Shipping methods ──────────────────────────────────────────────────────
  @Get('shipping-methods')
  listShipping(): Promise<ShippingMethod[]> {
    return this.shipping.listAll();
  }

  @Post('shipping-methods')
  createShipping(@Body() body: unknown): Promise<ShippingMethod> {
    return this.shipping.create(parseBody(shippingSchema, body));
  }

  @Patch('shipping-methods/:id')
  updateShipping(@Param('id') id: string, @Body() body: unknown): Promise<ShippingMethod> {
    return this.shipping.update(id, parseBody(shippingSchema.partial(), body));
  }

  // ── Settings groups ───────────────────────────────────────────────────────
  /** Stripe secrets are never returned in the clear — only their masked form. */
  @Get('settings')
  async getSettings(): Promise<Omit<AppSettingsBundle, 'payment'> & {
    payment: { stripeSecretKey: string | null; stripeWebhookSecret: string | null; stripePublishableKey: string | null; currency: string };
  }> {
    const bundle = await this.settings.get();
    const [secret, webhook] = await Promise.all([
      this.settings.paymentSecret('stripeSecretKey'),
      this.settings.paymentSecret('stripeWebhookSecret'),
    ]);
    return {
      ...bundle,
      payment: {
        stripeSecretKey: mask(secret),
        stripeWebhookSecret: mask(webhook),
        stripePublishableKey: bundle.payment.stripePublishableKey,
        currency: bundle.payment.currency,
      },
    };
  }

  @Put('settings/pricing')
  updatePricing(@Body() body: unknown): Promise<AppSettingsBundle> {
    return this.settings.update('pricing', parseBody(pricingSchema, body) as PricingSettings);
  }

  @Put('settings/machine')
  updateMachine(@Body() body: unknown): Promise<AppSettingsBundle> {
    return this.settings.update('machine', parseBody(machineSchema, body) as MachineSettings);
  }

  @Put('settings/upload')
  updateUpload(@Body() body: unknown): Promise<AppSettingsBundle> {
    return this.settings.update('upload', parseBody(uploadSchema, body) as UploadSettings);
  }

  @Put('settings/branding')
  updateBranding(@Body() body: unknown): Promise<AppSettingsBundle> {
    return this.settings.update('branding', parseBody(brandingSchema, body) as BrandingSettings);
  }

  @Put('settings/contact')
  updateContact(@Body() body: unknown): Promise<AppSettingsBundle> {
    return this.settings.update('contact', parseBody(contactSchema, body) as ContactSettings);
  }

  @Put('settings/payment')
  async updatePayment(@Body() body: unknown): Promise<{ ok: true }> {
    await this.settings.updatePayment(parseBody(paymentSchema, body));
    return { ok: true };
  }

  // ── Orders ────────────────────────────────────────────────────────────────
  @Get('orders')
  listOrders(): Promise<OrderView[]> {
    return this.orders.listAll();
  }

  /** Staff-only fulfilment note, never shown to the customer. */
  @Patch('orders/:id')
  updateOrderNote(@Param('id') id: string, @Body() body: unknown): Promise<OrderView> {
    const { internalNote } = parseBody(orderNoteSchema, body);
    return this.orders.setInternalNote(id, internalNote);
  }

  // ── Runtime service credentials ───────────────────────────────────────────
  @Get('credentials')
  listCredentials(): Promise<CredentialRow[]> {
    return this.credentials.list();
  }

  @Patch('credentials')
  async saveCredential(@Body() body: unknown): Promise<CredentialRow[]> {
    const { key, value } = parseBody(credentialSchema, body);
    await this.credentials.save(key, value);
    return this.credentials.list();
  }
}
