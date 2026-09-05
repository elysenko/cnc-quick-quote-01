import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AppConfigModule } from './config/config.module';
import { SettingsModule } from './settings/settings.module';
import { StorageModule } from './storage/storage.module';
import { AuthModule } from './auth/auth.module';
import { AuthGuard } from './auth/auth.guard';
import { RateLimitModule } from './common/ratelimit/ratelimit.module';
import { RateLimitGuard } from './common/ratelimit/ratelimit.guard';
import { ErrorEnvelopeFilter } from './common/errors';
import { HealthModule } from './health/health.module';
import { BrandingModule } from './branding/branding.module';
import { MaterialsModule } from './materials/materials.module';
import { DrawingsModule } from './drawings/drawings.module';
import { BendsModule } from './bends/bends.module';
import { QuotesModule } from './quotes/quotes.module';
import { ShippingModule } from './shipping/shipping.module';
import { OrdersModule } from './orders/orders.module';
import { CheckoutModule } from './checkout/checkout.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AppConfigModule,
    SettingsModule,
    StorageModule,
    RateLimitModule,
    AuthModule,
    HealthModule,
    BrandingModule,
    MaterialsModule,
    DrawingsModule,
    BendsModule,
    QuotesModule,
    ShippingModule,
    OrdersModule,
    CheckoutModule,
    AdminModule,
  ],
  providers: [
    // Order matters: authentication resolves the caller first so the rate
    // limiter can key counters per account rather than per shared IP.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_FILTER, useClass: ErrorEnvelopeFilter },
  ],
})
export class AppModule {}
