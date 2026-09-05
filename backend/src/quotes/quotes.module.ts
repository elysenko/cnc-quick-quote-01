import { Module } from '@nestjs/common';
import { QuotesService } from './quotes.service';
import { QuotesController } from './quotes.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { MaterialsModule } from '../materials/materials.module';
import { DrawingsModule } from '../drawings/drawings.module';
import { NestingModule } from '../nesting/nesting.module';
import { PricingModule } from '../pricing/pricing.module';

@Module({
  imports: [PrismaModule, MaterialsModule, DrawingsModule, NestingModule, PricingModule],
  providers: [QuotesService],
  controllers: [QuotesController],
  exports: [QuotesService],
})
export class QuotesModule {}
