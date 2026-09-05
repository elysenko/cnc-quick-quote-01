import { Injectable, Logger } from '@nestjs/common';
import type { Order } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { StorageService } from '../storage/storage.service';
import { ReceiptService } from './receipt.service';
import { EmailService } from '../integrations/resend.service';
import { ForbiddenError, NotFoundError } from '../common/errors';
import { AuthenticatedUser } from '../auth/auth.types';
import type { PriceResult } from '../pricing/pricing.service';

export interface OrderView {
  id: string;
  orderNumber: string;
  quoteRef: string;
  /** Shown on the admin order detail so a charge can be traced in Stripe. */
  stripeSessionId: string;
  customerName: string;
  customerEmail: string;
  customerCompany: string | null;
  materialName: string;
  drawingName: string;
  quantity: number;
  shippingMethod: string;
  shippingEtaDays: number | null;
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  status: string;
  placedAt: string;
  emailError: string | null;
  internalNote: string | null;
  /** The frozen breakdown the customer was charged from. */
  breakdown: PriceResult | null;
  /** Minimum-order floor in force when the quote was generated. */
  minimumOrderCents: number;
}

interface OrderWithRelations extends Order {
  user: { name: string | null; email: string; company: string | null };
  quote: {
    reference: string;
    quantity: number;
    breakdown: unknown;
    pricingSnapshot: unknown;
    material: { name: string };
    drawing: { filename: string };
  };
  shippingMethod: { etaDays: number } | null;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly storage: StorageService,
    private readonly receipts: ReceiptService,
    private readonly email: EmailService,
  ) {}

  async listForUser(userId: string): Promise<OrderView[]> {
    const orders = await this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: this.relations(),
      take: 200,
    });
    return orders.map(toView);
  }

  async listAll(): Promise<OrderView[]> {
    const orders = await this.prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      include: this.relations(),
      take: 500,
    });
    return orders.map(toView);
  }

  async byId(id: string, user: AuthenticatedUser): Promise<OrderView> {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: this.relations(),
    });
    if (!order) throw new NotFoundError('That order no longer exists.');
    if (order.userId !== user.id && !isStaff(user)) {
      throw new ForbiddenError('That order belongs to another account.');
    }
    return toView(order);
  }

  /** Streams the stored receipt, regenerating it if the object is missing. */
  async receiptPdf(id: string, user: AuthenticatedUser): Promise<{ buffer: Buffer; filename: string }> {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: this.relations(),
    });
    if (!order) throw new NotFoundError('That order no longer exists.');
    if (order.userId !== user.id && !isStaff(user)) {
      throw new ForbiddenError('That order belongs to another account.');
    }

    const filename = `receipt-${order.orderNumber}.pdf`;

    if (order.receiptObjectKey) {
      try {
        return { buffer: await this.storage.getObject(order.receiptObjectKey), filename };
      } catch (error) {
        this.logger.warn(`stored receipt unreadable, regenerating: ${(error as Error).message}`);
      }
    }

    const { buffer } = await this.buildReceipt(order);
    return { buffer, filename };
  }

  /** Renders the receipt from the order's frozen breakdown. */
  async buildReceipt(order: OrderWithRelations): Promise<{ buffer: Buffer }> {
    const { branding, contact, payment } = await this.settings.get();
    const breakdown = order.quote.breakdown as unknown as PriceResult;

    const buffer = await this.receipts.render({
      orderNumber: order.orderNumber,
      placedAt: order.createdAt,
      companyName: branding.companyName,
      supportEmail: contact.supportEmail,
      supportPhone: contact.supportPhone,
      addressLines: contact.addressLines,
      customerName: order.user.name ?? order.user.email,
      customerEmail: order.user.email,
      quoteReference: order.quote.reference,
      materialName: order.quote.material.name,
      quantity: order.quote.quantity,
      lines: breakdown?.lines ?? [],
      subtotalCents: order.subtotalCents,
      shippingLabel: order.shippingLabel,
      shippingCents: order.shippingCents,
      totalCents: order.totalCents,
      currency: payment.currency,
    });

    return { buffer };
  }

  /**
   * Generates + stores the receipt, then emails it. Runs after the webhook has
   * already responded 200 to Stripe: a storage or mail failure is recorded on
   * the order and never blocks it or the customer's confirmation page.
   */
  async finaliseOrder(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: this.relations(),
    });
    if (!order) return;

    let receiptBuffer: Buffer | null = null;
    let receiptKey: string | null = null;

    try {
      const { buffer } = await this.buildReceipt(order);
      receiptBuffer = buffer;
      receiptKey = `receipts/${order.userId}/${order.orderNumber}.pdf`;
      await this.storage.putObject(receiptKey, buffer, 'application/pdf');
    } catch (error) {
      receiptKey = null;
      this.logger.error(`receipt generation failed for ${order.orderNumber}: ${(error as Error).message}`);
    }

    const { branding, payment } = await this.settings.get();
    const breakdown = order.quote.breakdown as unknown as PriceResult;

    const result = await this.email.sendOrderConfirmation({
      to: order.user.email,
      orderNumber: order.orderNumber,
      companyName: branding.companyName,
      totalCents: order.totalCents,
      currency: payment.currency,
      lines: [
        ...(breakdown?.lines ?? []).map((line) => ({
          label: line.label,
          amountCents: line.amountCents,
        })),
        { label: order.shippingLabel, amountCents: order.shippingCents },
      ],
      receiptPdf: receiptBuffer,
    });

    await this.prisma.order.update({
      where: { id: order.id },
      data: {
        receiptObjectKey: receiptKey,
        emailError: result.sent ? null : result.error,
      },
    });
  }

  private relations() {
    return {
      user: { select: { name: true, email: true, company: true } },
      shippingMethod: { select: { etaDays: true } },
      quote: {
        select: {
          reference: true,
          quantity: true,
          breakdown: true,
          pricingSnapshot: true,
          material: { select: { name: true } },
          drawing: { select: { filename: true } },
        },
      },
    } as const;
  }

  /** Staff-only fulfilment note. */
  async setInternalNote(id: string, internalNote: string): Promise<OrderView> {
    const existing = await this.prisma.order.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('That order no longer exists.');
    await this.prisma.order.update({
      where: { id },
      data: { internalNote: internalNote.trim() || null },
    });
    const updated = await this.prisma.order.findUniqueOrThrow({
      where: { id },
      include: this.relations(),
    });
    return toView(updated);
  }
}

function toView(order: OrderWithRelations): OrderView {
  const snapshot = order.quote.pricingSnapshot as { pricing?: { minimumOrderCents?: number } } | null;
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    quoteRef: order.quote.reference,
    stripeSessionId: order.stripeSessionId,
    customerName: order.user.name ?? order.user.email,
    customerEmail: order.user.email,
    customerCompany: order.user.company,
    materialName: order.quote.material.name,
    drawingName: order.quote.drawing.filename,
    quantity: order.quote.quantity,
    shippingMethod: order.shippingLabel,
    shippingEtaDays: order.shippingMethod?.etaDays ?? null,
    subtotalCents: order.subtotalCents,
    shippingCents: order.shippingCents,
    totalCents: order.totalCents,
    status: order.status,
    placedAt: order.createdAt.toISOString(),
    emailError: order.emailError,
    internalNote: order.internalNote,
    breakdown: (order.quote.breakdown as unknown as PriceResult) ?? null,
    minimumOrderCents: snapshot?.pricing?.minimumOrderCents ?? 0,
  };
}

function isStaff(user: AuthenticatedUser): boolean {
  return user.role === 'ADMIN' || user.role === 'MANAGER';
}
