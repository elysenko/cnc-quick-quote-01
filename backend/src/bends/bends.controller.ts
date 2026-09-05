import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { BendLine } from '@prisma/client';
import { z } from 'zod';
import { BendsService } from './bends.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { parseBody } from '../common/validation';

const coordinate = z.number().finite();

const createSchema = z.object({
  drawingId: z.string().min(1),
  x1: coordinate,
  y1: coordinate,
  x2: coordinate,
  y2: coordinate,
  angleDeg: z.number().optional(),
  direction: z.string().optional(),
});

const updateSchema = z.object({
  x1: coordinate.optional(),
  y1: coordinate.optional(),
  x2: coordinate.optional(),
  y2: coordinate.optional(),
  angleDeg: z.number().optional(),
  direction: z.string().optional(),
});

@ApiTags('bends')
@Controller('bends')
export class BendsController {
  constructor(private readonly bends: BendsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('drawingId') drawingId: string,
  ): Promise<BendLine[]> {
    return this.bends.list(drawingId, user);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown): Promise<BendLine> {
    return this.bends.create(parseBody(createSchema, body), user);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<BendLine> {
    return this.bends.update(id, parseBody(updateSchema, body), user);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    return this.bends.remove(id, user);
  }
}
