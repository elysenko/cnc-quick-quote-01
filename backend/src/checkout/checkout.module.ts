import { Module } from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import { CheckoutController } from './checkout.controller';
import { WebhooksController } from './webhooks.controller';
import { OrderCreationService } from './order-creation.service';
import { PrismaModule } from '../prisma/prisma.module';
import { QuotesModule } from '../quotes/quotes.module';
import { ShippingModule } from '../shipping/shipping.module';
import { StripeModule } from '../integrations/stripe.module';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [PrismaModule, QuotesModule, ShippingModule, StripeModule, OrdersModule],
  providers: [CheckoutService, OrderCreationService],
  controllers: [CheckoutController, WebhooksController],
})
export class CheckoutModule {}
