import { Module } from '@nestjs/common';
import { BendsService } from './bends.service';
import { BendsController } from './bends.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { DrawingsModule } from '../drawings/drawings.module';

@Module({
  imports: [PrismaModule, DrawingsModule],
  providers: [BendsService],
  controllers: [BendsController],
  exports: [BendsService],
})
export class BendsModule {}
