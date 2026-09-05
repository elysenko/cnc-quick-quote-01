import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import {
  MachineSettings,
  PricingSettings,
  UploadSettings,
} from './settings.types';

export interface PublicSettings {
  pricing: PricingSettings;
  machine: MachineSettings;
  upload: UploadSettings;
}

/**
 * The subset of admin configuration a signed-in customer needs to quote: the
 * price book (already itemised on every breakdown), the machine bed the work-bed
 * canvas draws, and the upload/quantity limits the wizard enforces inline.
 * Credentials and branding are deliberately not here.
 */
@ApiTags('settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('public')
  async publicSettings(): Promise<PublicSettings> {
    const { pricing, machine, upload } = await this.settings.get();
    return { pricing, machine, upload };
  }
}
