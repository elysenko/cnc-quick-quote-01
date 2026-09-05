import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CheckoutService, CheckoutOptions, CheckoutSession } from './checkout.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { parseBody } from '../common/validation';
import { RateLimit } from '../common/ratelimit/ratelimit.decorator';

const sessionSchema = z.object({
  quoteId: z.string().min(1),
  shippingMethodId: z.string().min(1, 'Choose a delivery method to continue.'),
});

@ApiTags('checkout')
@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  @Get('quotes/:quoteId/options')
  options(
    @CurrentUser() user: AuthenticatedUser,
    @Param('quoteId') quoteId: string,
  ): Promise<CheckoutOptions> {
    return this.checkout.options(quoteId, user);
  }

  @Post('sessions')
  @RateLimit({ bucket: 'checkout:session', limit: 20, windowSeconds: 300 })
  createSession(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ): Promise<CheckoutSession> {
    return this.checkout.createSession(parseBody(sessionSchema, body), user);
  }

  /** Confirmation-page poll; `order: null` means the webhook has not landed yet. */
  @Get('sessions/order')
  async orderBySession(
    @CurrentUser() user: AuthenticatedUser,
    @Query('session_id') sessionId: string,
  ): Promise<{ order: unknown | null }> {
    const order = await this.checkout.orderBySessionId(sessionId, user);
    if (!order) return { order: null };
    return {
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        quoteRef: order.quote.reference,
        materialName: order.quote.material.name,
        quantity: order.quote.quantity,
        shippingMethod: order.shippingLabel,
        subtotalCents: order.subtotalCents,
        shippingCents: order.shippingCents,
        totalCents: order.totalCents,
        status: order.status,
        placedAt: order.createdAt.toISOString(),
        emailError: order.emailError,
      },
    };
  }
}
