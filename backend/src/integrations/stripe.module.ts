import { Module } from '@nestjs/common';
import { StripeService } from './stripe.service';

/**
 * `AppConfigService` and `SettingsService` are both provided by @Global modules,
 * so this module only has to own the Stripe wrapper itself.
 */
@Module({
  providers: [StripeService],
  exports: [StripeService],
})
export class StripeModule {}
