import { Module } from '@nestjs/common';
import { PricingService } from './pricing.service';

/** Exports {@link PricingService} so quoting/checkout price from one engine. */
@Module({
  providers: [PricingService],
  exports: [PricingService],
})
export class PricingModule {}
