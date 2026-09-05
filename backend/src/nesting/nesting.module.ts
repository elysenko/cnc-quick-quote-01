import { Module } from '@nestjs/common';
import { NestingService } from './nesting.service';

/** Exports {@link NestingService} so quoting can turn part size into sheet count. */
@Module({
  providers: [NestingService],
  exports: [NestingService],
})
export class NestingModule {}
