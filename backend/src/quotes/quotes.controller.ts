import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { QuotesService, QuoteView } from './quotes.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { parseBody } from '../common/validation';
import { RateLimit } from '../common/ratelimit/ratelimit.decorator';

const createSchema = z.object({
  drawingId: z.string().min(1, 'Upload a drawing first.'),
  materialId: z.string().min(1, 'Choose a material from the list.'),
  // Coerced, then range-checked against the admin limits in the service so the
  // rejection message can state the configured minimum and maximum.
  quantity: z.coerce.number(),
});

@ApiTags('quotes')
@Controller('quotes')
export class QuotesController {
  constructor(private readonly quotes: QuotesService) {}

  @Post()
  @RateLimit({ bucket: 'quotes:create', limit: 60, windowSeconds: 300 })
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown): Promise<QuoteView> {
    return this.quotes.create(parseBody(createSchema, body), user);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<QuoteView[]> {
    return this.quotes.list(user.id);
  }

  @Get(':id')
  byId(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<QuoteView> {
    return this.quotes.byId(id, user);
  }
}
