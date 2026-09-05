import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';

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
 * Applies public branding to CSS custom properties. In production this is fed by
 * the public `branding` tRPC query via an APP_INITIALIZER; here it starts from
 * the seeded defaults so the preview renders the real branded shell.
 */
@Injectable({ providedIn: 'root' })
export class BrandingService {
  private readonly doc = inject(DOCUMENT);

  readonly branding = signal<Branding>({
    companyName: 'Meridian Fabrication',
    tagline: 'Laser-cut sheet metal, quoted instantly',
    logoMark: 'MF',
    primaryColor: '#1668d6',
    accentColor: '#f5820b',
    supportEmail: 'quotes@meridianfab.com',
    supportPhone: '+1 (503) 555-0142',
    addressLines: ['2140 SE Foundry Way', 'Portland, OR 97214', 'United States'],
  });

  apply(next: Partial<Branding>): void {
    const merged = { ...this.branding(), ...next };
    this.branding.set(merged);
    const root = this.doc.documentElement;
    root.style.setProperty('--color-primary', merged.primaryColor);
    root.style.setProperty('--color-accent', merged.accentColor);
    root.style.setProperty('--color-cut', merged.primaryColor);
    root.style.setProperty('--color-bend', merged.accentColor);
  }
}
