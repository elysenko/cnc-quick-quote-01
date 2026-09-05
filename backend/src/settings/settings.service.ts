import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/config.service';
import { decryptSecret, encryptSecret } from '../common/crypto';
import { asJson } from '../common/json';
import {
  AppSettingsBundle,
  DEFAULT_SETTINGS,
  PaymentSettings,
} from './settings.types';

const SINGLETON_ID = 1;

type Group = keyof AppSettingsBundle;

/**
 * Read/write access to the `app_settings` singleton.
 *
 * Cached in-process because the quote path reads it on every request; every
 * write clears the cache so a machine/upload change applies to the very next
 * quote submission rather than after a restart.
 */
@Injectable()
export class SettingsService {
  private cached: AppSettingsBundle | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  invalidate(): void {
    this.cached = null;
  }

  /** Returns the bundle, creating the row from defaults on first ever read. */
  async get(): Promise<AppSettingsBundle> {
    if (this.cached) return this.cached;

    const row = await this.prisma.appSettings.upsert({
      where: { id: SINGLETON_ID },
      update: {},
      create: {
        id: SINGLETON_ID,
        pricing: asJson(DEFAULT_SETTINGS.pricing),
        machine: asJson(DEFAULT_SETTINGS.machine),
        upload: asJson(DEFAULT_SETTINGS.upload),
        branding: asJson(DEFAULT_SETTINGS.branding),
        contact: asJson(DEFAULT_SETTINGS.contact),
        payment: asJson(DEFAULT_SETTINGS.payment),
        shippingConfig: asJson(DEFAULT_SETTINGS.shippingConfig),
      },
    });

    // Merge over defaults so a group added in a later release is populated for
    // rows written by an earlier one, without a data migration.
    const bundle: AppSettingsBundle = {
      pricing: { ...DEFAULT_SETTINGS.pricing, ...asObject(row.pricing) },
      machine: { ...DEFAULT_SETTINGS.machine, ...asObject(row.machine) },
      upload: { ...DEFAULT_SETTINGS.upload, ...asObject(row.upload) },
      branding: { ...DEFAULT_SETTINGS.branding, ...asObject(row.branding) },
      contact: { ...DEFAULT_SETTINGS.contact, ...asObject(row.contact) },
      payment: { ...DEFAULT_SETTINGS.payment, ...asObject(row.payment) },
      shippingConfig: {
        ...DEFAULT_SETTINGS.shippingConfig,
        ...asObject(row.shippingConfig),
      },
    };

    this.cached = bundle;
    return bundle;
  }

  async update<K extends Group>(group: K, value: AppSettingsBundle[K]): Promise<AppSettingsBundle> {
    await this.get(); // guarantees the row exists
    await this.prisma.appSettings.update({
      where: { id: SINGLETON_ID },
      data: { [group]: asJson(value) },
    });
    this.invalidate();
    return this.get();
  }

  /**
   * Writes Stripe credentials encrypted at rest. `null` on a field means "leave
   * the stored value alone" so an admin can replace one key without re-typing
   * the others; empty string clears it.
   */
  async updatePayment(patch: {
    stripeSecretKey?: string | null;
    stripeWebhookSecret?: string | null;
    stripePublishableKey?: string | null;
    currency?: string;
  }): Promise<AppSettingsBundle> {
    const current = (await this.get()).payment;
    const key = this.config.encryptionKey;

    const next: PaymentSettings = {
      stripeSecretKey: mergeSecret(current.stripeSecretKey, patch.stripeSecretKey, key),
      stripeWebhookSecret: mergeSecret(current.stripeWebhookSecret, patch.stripeWebhookSecret, key),
      // Publishable keys are safe to expose; stored as-is so the SPA can read them.
      stripePublishableKey:
        patch.stripePublishableKey === undefined
          ? current.stripePublishableKey
          : patch.stripePublishableKey || null,
      currency: patch.currency ?? current.currency,
    };

    return this.update('payment', next);
  }

  /** Decrypts a stored Stripe credential, or null when unset/undecryptable. */
  async paymentSecret(field: 'stripeSecretKey' | 'stripeWebhookSecret'): Promise<string | null> {
    const stored = (await this.get()).payment[field];
    if (!stored) return null;
    return decryptSecret(stored, this.config.encryptionKey);
  }
}

function mergeSecret(current: string | null, patch: string | null | undefined, key: string): string | null {
  if (patch === undefined) return current;
  if (patch === null || patch.trim() === '') return null;
  return encryptSecret(patch.trim(), key);
}

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

