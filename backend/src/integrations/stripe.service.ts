import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { AppConfigService } from '../config/config.service';
import { SettingsService } from '../settings/settings.service';
import {
  ServiceUnconfiguredError,
  UpstreamError,
  ValidationError,
} from '../common/errors';

/** Label used in the 503 envelope; matches SERVICE_KEYS so the admin UI lines up. */
const SERVICE = 'Stripe SDK (Python)';
const CREDENTIAL_KEY = 'STRIPE_SDK_PYTHON_API_KEY';
const WEBHOOK_SECRET_KEY = 'STRIPE_WEBHOOK_SECRET';

/**
 * Pinned rather than left to the SDK default so an `npm update` cannot silently
 * change response shapes under a running deployment. The installed `stripe`
 * package's types only accept its own `LatestApiVersion`, so this constant must
 * be bumped together with the dependency.
 */
const API_VERSION: Stripe.LatestApiVersion = '2025-02-24.acacia';

/** Input for a one-off parts + shipping checkout. All money is integer cents. */
export interface CheckoutSessionInput {
  quoteReference: string;
  description: string;
  subtotalCents: number;
  shippingCents: number;
  shippingLabel: string;
  currency: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
}

export interface CheckoutSessionResult {
  sessionId: string;
  url: string;
}

/**
 * Thin wrapper over the Stripe SDK.
 *
 * Two behaviours matter more than the API surface:
 *
 *  1. Credentials are resolved per call — admin-entered settings first, then the
 *     deployment env — and the client is cached *by key string*, so rotating a
 *     key under Admin → Settings takes effect on the next request instead of
 *     needing a restart.
 *  2. No raw Stripe error ever escapes. Every failure is translated into the
 *     app's error envelope (503 unconfigured / 502 upstream / 422 validation)
 *     so the SPA can render one message without sniffing SDK internals.
 */
@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly clients = new Map<string, Stripe>();

  constructor(
    private readonly config: AppConfigService,
    private readonly settings: SettingsService,
  ) {}

  /** True when a usable secret key is available (settings first, then env). */
  async isConfigured(): Promise<boolean> {
    return (await this.resolveSecretKey()) !== null;
  }

  async createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSessionResult> {
    const stripe = await this.client();
    const currency = input.currency.toLowerCase();

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      {
        quantity: 1,
        price_data: {
          currency,
          unit_amount: input.subtotalCents,
          product_data: { name: input.description },
        },
      },
    ];

    // A zero-amount shipping line is rejected by Stripe on some currencies and
    // is noise on the receipt either way — drop it rather than send a $0 row.
    if (input.shippingCents > 0) {
      lineItems.push({
        quantity: 1,
        price_data: {
          currency,
          unit_amount: input.shippingCents,
          product_data: { name: input.shippingLabel },
        },
      });
    }

    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: lineItems,
        customer_email: input.customerEmail,
        client_reference_id: input.quoteReference,
        metadata: input.metadata,
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
      });

      if (!session.url) {
        // Only happens for non-hosted checkout modes; treat as upstream trouble
        // rather than handing the SPA a session it cannot redirect to.
        throw new UpstreamError('Stripe', 'no checkout URL returned');
      }

      return { sessionId: session.id, url: session.url };
    } catch (error) {
      throw this.translate(error);
    }
  }

  /**
   * Verifies against the RAW request body. Deliberately has no unverified-parse
   * fallback: an unsigned body could mark an unpaid quote as paid.
   */
  async constructEvent(rawBody: Buffer, signature: string): Promise<Stripe.Event> {
    const stripe = await this.client();
    const webhookSecret = await this.requireWebhookSecret();

    try {
      return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (error) {
      this.logger.warn(`webhook signature rejected: ${describe(error)}`);
      throw new ValidationError(
        'Webhook signature verification failed.',
        null,
        'invalid_signature',
      );
    }
  }

  /** Admin-entered key wins over the deployment env so rotation needs no redeploy. */
  private async resolveSecretKey(): Promise<string | null> {
    const fromSettings = await this.settings.paymentSecret('stripeSecretKey');
    if (fromSettings) return fromSettings;
    return this.config.resolveConfig(CREDENTIAL_KEY);
  }

  private async resolveWebhookSecret(): Promise<string | null> {
    const fromSettings = await this.settings.paymentSecret('stripeWebhookSecret');
    if (fromSettings) return fromSettings;
    return this.config.resolveConfig(WEBHOOK_SECRET_KEY);
  }

  private async requireWebhookSecret(): Promise<string> {
    const secret = await this.resolveWebhookSecret();
    if (secret === null) throw new ServiceUnconfiguredError(SERVICE, WEBHOOK_SECRET_KEY);
    return secret;
  }

  /** Cached per key string: a rotated key produces a fresh client, same key reuses one. */
  private async client(): Promise<Stripe> {
    const key = await this.resolveSecretKey();
    if (key === null) throw new ServiceUnconfiguredError(SERVICE, CREDENTIAL_KEY);

    const existing = this.clients.get(key);
    if (existing) return existing;

    const created = new Stripe(key, { apiVersion: API_VERSION });
    this.clients.set(key, created);
    return created;
  }

  /**
   * Maps an SDK failure onto the app error envelope. Anything already an app
   * error (e.g. the no-URL guard above) is passed through untouched.
   */
  private translate(error: unknown): Error {
    if (
      error instanceof ServiceUnconfiguredError ||
      error instanceof UpstreamError ||
      error instanceof ValidationError
    ) {
      return error;
    }

    if (
      error instanceof Stripe.errors.StripeAuthenticationError ||
      error instanceof Stripe.errors.StripePermissionError
    ) {
      this.logger.error(`stripe rejected the configured key: ${describe(error)}`);
      return new ServiceUnconfiguredError(SERVICE, CREDENTIAL_KEY);
    }

    if (error instanceof Stripe.errors.StripeInvalidRequestError) {
      return new ValidationError(error.message);
    }

    if (error instanceof Stripe.errors.StripeConnectionError) {
      return new UpstreamError('Stripe', 'connection failed');
    }

    if (error instanceof Stripe.errors.StripeAPIError) {
      return new UpstreamError('Stripe', 'API error');
    }

    if (isTimeout(error)) {
      return new UpstreamError('Stripe', 'timed out');
    }

    this.logger.error(`unexpected Stripe failure: ${describe(error)}`);
    return new UpstreamError('Stripe', 'unexpected error');
  }
}

/** Node/undici surface timeouts as codes rather than a dedicated Stripe class. */
function isTimeout(error: unknown): boolean {
  const code =
    typeof error === 'object' && error !== null
      ? (error as { code?: unknown }).code
      : undefined;
  const message = describe(error).toLowerCase();
  return (
    code === 'ETIMEDOUT' ||
    code === 'ESOCKETTIMEDOUT' ||
    code === 'UND_ERR_CONNECT_TIMEOUT' ||
    message.includes('timed out') ||
    message.includes('timeout')
  );
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
