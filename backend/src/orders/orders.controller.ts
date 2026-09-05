import { Controller, Get, Param, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { OrdersService, OrderView } from './orders.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<OrderView[]> {
    return this.orders.listForUser(user.id);
  }

  @Get(':id')
  byId(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<OrderView> {
    return this.orders.byId(id, user);
  }

  @Get(':id/receipt')
  async receipt(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Res() response: Response,
  ): Promise<void> {
    const { buffer, filename } = await this.orders.receiptPdf(id, user);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    response.send(buffer);
  }
}
