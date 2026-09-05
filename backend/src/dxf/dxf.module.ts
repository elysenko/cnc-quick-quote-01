import { Module } from '@nestjs/common';
import { DxfService } from './dxf.service';

/** Exports {@link DxfService} so quoting/upload modules can measure cut paths. */
@Module({
  providers: [DxfService],
  exports: [DxfService],
})
export class DxfModule {}
