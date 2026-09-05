import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QuotesService } from '../quotes/quotes.service';
import { ShippingService, PricedShippingMethod } from '../shipping/shipping.service';
import { StripeService } from '../integrations/stripe.service';
import { SettingsService } from '../settings/settings.service';
import { AppConfigService } from '../config/config.service';
import { ValidationError } from '../common/errors';
import { AuthenticatedUser } from '../auth/auth.types';

export interface CheckoutOptions {
  methods: PricedShippingMethod[];
  /** True when the workshop has configured no active delivery method at all. */
  blocked: boolean;
  blockedReason: string | null;
  subtotalCents: number;
  currency: string;
}

export interface CheckoutSession {
  sessionId: string;
  url: string;
}

@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quotes: QuotesService,
    private readonly shipping: ShippingService,
    private readonly stripe: StripeService,
    private readonly settings: SettingsService,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Delivery options for a specific quote, priced against its sheet count.
   * With nothing configured the caller is blocked with a contact-us message
   * rather than being allowed to place an unpriced order.
   */
  async options(quoteId: string, user: AuthenticatedUser): Promise<CheckoutOptions> {
    const quote = await this.quotes.byId(quoteId, user);
    const bundle = await this.settings.get();
    const methods = await this.shipping.listActivePriced(quote.sheetCount);

    return {
      methods,
      blocked: methods.length === 0,
      blockedReason: methods.length === 0 ? bundle.shippingConfig.note : null,
      subtotalCents: quote.totalCents,
      currency: bundle.payment.currency,
    };
  }

  /**
   * Creates a hosted Stripe Checkout session. Nothing is persisted here — the
   * order is created only when the payment webhook confirms the charge, so a
   * declined card leaves the quote untouched and creates nothing.
   */
  async createSession(
    input: { quoteId: string; shippingMethodId: string },
    user: AuthenticatedUser,
  ): Promise<CheckoutSession> {
    // Ownership is enforced by quotes.byId — a quote belonging to someone else
    // never reaches the payment step.
    const quote = await this.quotes.byId(input.quoteId, user);
    const method = await this.shipping.forCheckout(input.shippingMethodId);
    const shippingCents = this.shipping.computeCost(method, quote.sheetCount);
    const bundle = await this.settings.get();

    const base = this.config.publicBaseUrl;
    const session = await this.stripe.createCheckoutSession({
      quoteReference: quote.reference,
      description: `${quote.quantity} × ${quote.materialName} — ${quote.drawingName}`,
      subtotalCents: quote.totalCents,
      shippingCents,
      shippingLabel: method.name,
      currency: bundle.payment.currency,
      customerEmail: user.email,
      successUrl: `${base}/orders/confirmation?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${base}/checkout/${quote.id}/payment?state=cancelled`,
      metadata: {
        quoteId: quote.id,
        userId: user.id,
        shippingMethodId: method.id,
        shippingCents: String(shippingCents),
        subtotalCents: String(quote.totalCents),
      },
    });

    return session;
  }

  /**
   * Confirmation-page poll. Returns null while the webhook has not landed yet;
   * the browser and the webhook can arrive in either order and both converge on
   * the single order the unique session id guarantees.
   */
  async orderBySessionId(sessionId: string, user: AuthenticatedUser) {
    if (!sessionId) throw new ValidationError('A checkout session is required.', 'sessionId');
    const order = await this.prisma.order.findUnique({
      where: { stripeSessionId: sessionId },
      include: { quote: { include: { material: true } }, shippingMethod: true },
    });
    if (!order) return null;
    if (order.userId !== user.id && !isStaff(user)) return null;
    return order;
  }
}

function isStaff(user: AuthenticatedUser): boolean {
  return user.role === 'ADMIN' || user.role === 'MANAGER';
}
