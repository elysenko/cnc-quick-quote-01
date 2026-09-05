import { Module } from '@nestjs/common';
import { DrawingsService } from './drawings.service';
import { DrawingsController } from './drawings.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { DxfModule } from '../dxf/dxf.module';

@Module({
  imports: [PrismaModule, DxfModule],
  providers: [DrawingsService],
  controllers: [DrawingsController],
  exports: [DrawingsService],
})
export class DrawingsModule {}
