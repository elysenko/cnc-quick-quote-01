/**
 * Shapes of the JSON groups on the `app_settings` singleton. These mirror the
 * Angular `core/models.ts` interfaces exactly — the admin forms round-trip them
 * verbatim, so any drift here shows up immediately as a broken settings screen.
 */

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

export interface BrandingSettings {
  companyName: string;
  tagline: string;
  logoMark: string;
  primaryColor: string;
  accentColor: string;
}

export interface ContactSettings {
  supportEmail: string;
  supportPhone: string;
  addressLines: string[];
}

/** Stripe credentials live here encrypted; they are never returned in the clear. */
export interface PaymentSettings {
  stripeSecretKey: string | null;
  stripeWebhookSecret: string | null;
  stripePublishableKey: string | null;
  currency: string;
}

export interface ShippingConfigSettings {
  /** Free-text guidance shown when no active method is configured. */
  note: string;
}

export interface AppSettingsBundle {
  pricing: PricingSettings;
  machine: MachineSettings;
  upload: UploadSettings;
  branding: BrandingSettings;
  contact: ContactSettings;
  payment: PaymentSettings;
  shippingConfig: ShippingConfigSettings;
}

/**
 * Cold-start defaults. These are application configuration, not sample business
 * data: they make quoting work the moment the app boots, and every value is
 * editable under Admin. No materials or shipping methods are invented here —
 * those are real business records and are created by an admin through the UI.
 */
export const DEFAULT_SETTINGS: AppSettingsBundle = {
  pricing: {
    costPerFtCents: 240,
    setupFeeCents: 4500,
    handlingCents: 1200,
    minimumOrderCents: 7500,
    costPerBendCents: 175,
  },
  machine: {
    bedWidthMm: 3000,
    bedHeightMm: 1500,
    partSpacingMm: 8,
    sheetMarginMm: 12,
    animationSpeedMmPerSec: 900,
  },
  upload: {
    allowedExtensions: '.dxf',
    maxUploadMb: 10,
    quantityMin: 1,
    quantityMax: 500,
  },
  branding: {
    companyName: 'CNC Quick Quote',
    tagline: 'Laser-cut sheet metal, quoted instantly',
    logoMark: 'CQ',
    primaryColor: '#1668d6',
    accentColor: '#f5820b',
  },
  contact: {
    supportEmail: '',
    supportPhone: '',
    addressLines: [],
  },
  payment: {
    stripeSecretKey: null,
    stripeWebhookSecret: null,
    stripePublishableKey: null,
    currency: 'usd',
  },
  shippingConfig: {
    note: 'No delivery methods are configured yet. Please contact us to complete your order.',
  },
};
