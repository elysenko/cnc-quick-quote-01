import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { ReceiptService } from './receipt.service';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../integrations/email.module';

@Module({
  imports: [PrismaModule, EmailModule],
  providers: [OrdersService, ReceiptService],
  controllers: [OrdersController],
  exports: [OrdersService, ReceiptService],
})
export class OrdersModule {}
