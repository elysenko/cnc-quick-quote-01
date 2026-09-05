import { Module } from '@nestjs/common';
import { ShippingService } from './shipping.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [ShippingService],
  exports: [ShippingService],
})
export class ShippingModule {}
