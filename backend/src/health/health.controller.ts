import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { SettingsService } from '../settings/settings.service';
import { AppConfigService } from '../config/config.service';
import { RateLimitService } from '../common/ratelimit/ratelimit.service';

interface DependencyReport {
  ok: boolean;
  detail: string;
}

interface DeepHealth {
  status: 'ok' | 'degraded';
  checks: Record<string, DependencyReport>;
}

/**
 * The only unauthenticated infrastructure routes.
 * `/api/health` is liveness (is the process up); `/api/health/deep` is readiness
 * (can it actually reach the datastore, cache, object store, and decrypt the
 * payment credentials — the failure mode that would otherwise break checkout
 * silently).
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly settings: SettingsService,
    private readonly config: AppConfigService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @Public()
  @Get()
  live(): { status: string; uptimeSeconds: number } {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }

  @Public()
  @Get('deep')
  async deep(): Promise<DeepHealth> {
    const [database, storage, cache, payment] = await Promise.all([
      this.checkDatabase(),
      this.storage.check(),
      this.checkCache(),
      this.checkPayment(),
    ]);

    const checks = { database, storage, cache, payment };
    const allOk = Object.values(checks).every((check) => check.ok);
    return { status: allOk ? 'ok' : 'degraded', checks };
  }

  private async checkDatabase(): Promise<DependencyReport> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ok: true, detail: 'reachable' };
    } catch (error) {
      return { ok: false, detail: (error as Error).message };
    }
  }

  private async checkCache(): Promise<DependencyReport> {
    if (!this.config.redisUrl) {
      // No Redis in this namespace: rate limiting runs per-process. That is a
      // supported configuration, so it is reported rather than failed.
      return { ok: true, detail: 'no REDIS_URL — rate limiting is per-instance' };
    }
    try {
      const verdict = await this.rateLimit.hit('rl:health:probe', 1_000_000, 60);
      return { ok: verdict.allowed, detail: 'reachable' };
    } catch (error) {
      return { ok: false, detail: (error as Error).message };
    }
  }

  /**
   * Asserts the stored Stripe credential still decrypts. A rotated or lost
   * APP_ENCRYPTION_KEY would otherwise only surface as a failed checkout.
   */
  private async checkPayment(): Promise<DependencyReport> {
    try {
      const bundle = await this.settings.get();
      if (!bundle.payment.stripeSecretKey) {
        const fromEnv = await this.config.isConfigured('STRIPE_SDK_PYTHON_API_KEY');
        return {
          ok: true,
          detail: fromEnv ? 'using STRIPE_SDK_PYTHON_API_KEY' : 'not configured — checkout is disabled',
        };
      }
      const decrypted = await this.settings.paymentSecret('stripeSecretKey');
      return decrypted
        ? { ok: true, detail: 'stored credential decrypts' }
        : { ok: false, detail: 'stored Stripe key cannot be decrypted — check APP_ENCRYPTION_KEY' };
    } catch (error) {
      return { ok: false, detail: (error as Error).message };
    }
  }
}
