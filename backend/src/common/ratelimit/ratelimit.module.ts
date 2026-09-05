import { Global, Module } from '@nestjs/common';
import { RateLimitService } from './ratelimit.service';

@Global()
@Module({
  providers: [RateLimitService],
  exports: [RateLimitService],
})
export class RateLimitModule {}
