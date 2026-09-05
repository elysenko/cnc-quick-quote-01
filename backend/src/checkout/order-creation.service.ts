import { Injectable, Logger } from '@nestjs/common';
import type Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';

/**
 * Turns a verified `checkout.session.completed` event into exactly one order.
 *
 * Two independent guards make that "exactly one" hold under retries, duplicate
 * deliveries and the browser/webhook race: the `webhook_events` primary key on
 * the Stripe event id, and the unique `orders.stripeSessionId`.
 */
@Injectable()
export class OrderCreationService {
  private readonly logger = new Logger(OrderCreationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
  ) {}

  async handleEvent(event: Stripe.Event): Promise<void> {
    // Claim the event id first. A duplicate delivery loses the race here and
    // returns without touching anything.
    try {
      await this.prisma.webhookEvent.create({
        data: { stripeEventId: event.id, type: event.type },
      });
    } catch {
      this.logger.log(`ignored replayed Stripe event ${event.id}`);
      return;
    }

    if (event.type !== 'checkout.session.completed') return;

    const session = event.data.object as Stripe.Checkout.Session;
    if (session.payment_status !== 'paid') {
      this.logger.log(`session ${session.id} completed unpaid — no order created`);
      return;
    }

    const orderId = await this.createOrder(session);
    if (!orderId) return;

    // Receipt + email happen after the order exists so neither can block it.
    try {
      await this.orders.finaliseOrder(orderId);
    } catch (error) {
      this.logger.error(`post-order finalisation failed: ${(error as Error).message}`);
    }
  }

  private async createOrder(session: Stripe.Checkout.Session): Promise<string | null> {
    const existing = await this.prisma.order.findUnique({
      where: { stripeSessionId: session.id },
    });
    if (existing) return existing.id;

    const metadata = session.metadata ?? {};
    const quoteId = metadata['quoteId'];
    if (!quoteId) {
      this.logger.error(`session ${session.id} carried no quoteId metadata`);
      return null;
    }

    const quote = await this.prisma.quote.findUnique({ where: { id: quoteId } });
    if (!quote) {
      this.logger.error(`session ${session.id} referenced unknown quote ${quoteId}`);
      return null;
    }

    const shippingMethodId = metadata['shippingMethodId'] || null;
    const shippingMethod = shippingMethodId
      ? await this.prisma.shippingMethod.findUnique({ where: { id: shippingMethodId } })
      : null;

    const subtotalCents = Number(metadata['subtotalCents'] ?? quote.totalCents);
    const shippingCents = Number(metadata['shippingCents'] ?? 0);

    try {
      const order = await this.prisma.order.create({
        data: {
          orderNumber: await this.nextOrderNumber(),
          userId: quote.userId,
          quoteId: quote.id,
          shippingMethodId: shippingMethod?.id ?? null,
          shippingLabel: shippingMethod?.name ?? 'Delivery',
          stripeSessionId: session.id,
          subtotalCents,
          shippingCents,
          totalCents: session.amount_total ?? subtotalCents + shippingCents,
          status: 'paid',
        },
      });

      await this.prisma.quote.update({
        where: { id: quote.id },
        data: { status: 'ordered' },
      });

      return order.id;
    } catch (error) {
      // The unique constraint firing means a concurrent delivery already made
      // the order — converge on it rather than failing the webhook.
      const raced = await this.prisma.order.findUnique({
        where: { stripeSessionId: session.id },
      });
      if (raced) return raced.id;
      this.logger.error(`order creation failed: ${(error as Error).message}`);
      return null;
    }
  }

  private async nextOrderNumber(): Promise<string> {
    const year = new Date().getUTCFullYear();
    const count = await this.prisma.order.count({
      where: { orderNumber: { startsWith: `ORD-${year}-` } },
    });
    return `ORD-${year}-${String(count + 1).padStart(4, '0')}`;
  }
}
