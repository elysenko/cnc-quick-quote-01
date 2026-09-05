import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/auth.guard';
import { SettingsService } from '../settings/settings.service';
import { BrandingSettings, ContactSettings } from '../settings/settings.types';

export type PublicBranding = BrandingSettings & ContactSettings;

/**
 * Public branding + contact details. Unauthenticated on purpose: the sign-in
 * screen is branded before anyone has a session, and the SPA resolves this
 * during app initialisation to set its CSS custom properties.
 */
@ApiTags('branding')
@Controller('branding')
export class BrandingController {
  constructor(private readonly settings: SettingsService) {}

  @Public()
  @Get()
  async get(): Promise<PublicBranding> {
    const { branding, contact } = await this.settings.get();
    return { ...branding, ...contact };
  }
}
