import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminSettingsService } from './admin-settings.service';
import { MaterialsModule } from '../materials/materials.module';
import { ShippingModule } from '../shipping/shipping.module';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [MaterialsModule, ShippingModule, OrdersModule],
  providers: [AdminSettingsService],
  controllers: [AdminController],
})
export class AdminModule {}
