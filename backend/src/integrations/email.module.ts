import { Module } from '@nestjs/common';
import { EmailService } from './resend.service';

/** Kept separate from StripeModule so a mail-only consumer pulls in no payments code. */
@Module({
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
