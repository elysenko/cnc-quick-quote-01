import {
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import type Stripe from 'stripe';
import { Public } from '../auth/auth.guard';
import { StripeService } from '../integrations/stripe.service';
import { OrderCreationService } from './order-creation.service';
import { ValidationError } from '../common/errors';

/**
 * Stripe payment webhook — the ONLY creator of orders.
 *
 * Signature verification runs against the untouched raw body (Nest is started
 * with `rawBody: true`, so no body-parsing middleware has rewritten it). A bad
 * signature is logged and rejected with no state change whatsoever.
 */
@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly stripe: StripeService,
    private readonly orders: OrderCreationService,
  ) {}

  @Public()
  @Post('stripe')
  @HttpCode(200)
  async stripeWebhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ): Promise<{ received: boolean }> {
    const rawBody = request.rawBody;
    if (!rawBody || !signature) {
      this.logger.warn('rejected Stripe webhook with no raw body or signature');
      throw new ValidationError('Webhook signature verification failed.', null, 'invalid_signature');
    }

    let event: Stripe.Event;
    try {
      event = await this.stripe.constructEvent(rawBody, signature);
    } catch (error) {
      this.logger.warn(`rejected Stripe webhook: ${(error as Error).message}`);
      throw error;
    }

    await this.orders.handleEvent(event);
    return { received: true };
  }
}
