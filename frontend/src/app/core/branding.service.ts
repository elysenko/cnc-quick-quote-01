import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';
import { ApiClient } from './api';

export interface Branding {
  companyName: string;
  tagline: string;
  logoMark: string;
  primaryColor: string;
  accentColor: string;
  supportEmail: string;
  supportPhone: string;
  addressLines: string[];
}

/**
 * Publishes the workshop's branding onto CSS custom properties.
 *
 * The values come from the public `GET /api/branding` endpoint, resolved during
 * app initialisation so the sign-in screen is already branded on first paint.
 * The literals below are only the pre-fetch placeholder for that one frame.
 */
@Injectable({ providedIn: 'root' })
export class BrandingService {
  private readonly doc = inject(DOCUMENT);
  private readonly api = inject(ApiClient);

  readonly branding = signal<Branding>({
    companyName: 'CNC Quick Quote',
    tagline: 'Laser-cut sheet metal, quoted instantly',
    logoMark: 'CQ',
    primaryColor: '#1668d6',
    accentColor: '#f5820b',
    supportEmail: '',
    supportPhone: '',
    addressLines: [],
  });

  /** Resolved by APP_INITIALIZER; a failure leaves the neutral defaults up. */
  async load(): Promise<void> {
    try {
      const branding = await this.api.get<Partial<Branding>>('/branding');
      this.apply(branding);
    } catch {
      this.apply({});
    }
  }

  apply(next: Partial<Branding>): void {
    const merged = { ...this.branding(), ...stripEmpty(next) };
    this.branding.set(merged);
    const root = this.doc.documentElement;
    root.style.setProperty('--color-primary', merged.primaryColor);
    root.style.setProperty('--color-accent', merged.accentColor);
    root.style.setProperty('--color-cut', merged.primaryColor);
    root.style.setProperty('--color-bend', merged.accentColor);
  }

  /** Persists branding (admin only) and re-applies it across the shell. */
  async save(next: Partial<Branding>): Promise<void> {
    const merged = { ...this.branding(), ...next };
    await this.api.put('/admin/settings/branding', {
      companyName: merged.companyName,
      tagline: merged.tagline,
      logoMark: merged.logoMark,
      primaryColor: merged.primaryColor,
      accentColor: merged.accentColor,
    });
    this.apply(merged);
  }

  async saveContact(next: Partial<Branding>): Promise<void> {
    const merged = { ...this.branding(), ...next };
    await this.api.put('/admin/settings/contact', {
      supportEmail: merged.supportEmail,
      supportPhone: merged.supportPhone,
      addressLines: merged.addressLines,
    });
    this.apply(merged);
  }
}

/** Ignores blank/absent fields so a partial payload cannot wipe the palette. */
function stripEmpty(value: Partial<Branding>): Partial<Branding> {
  const result: Partial<Branding> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined || entry === null || entry === '') continue;
    Object.assign(result, { [key]: entry });
  }
  return result;
}
