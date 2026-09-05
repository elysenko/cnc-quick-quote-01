import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { AppConfigService } from '../../config/config.service';

export interface RateVerdict {
  allowed: boolean;
  retryAfterSeconds: number;
}

/**
 * Fixed-window counters.
 *
 * Redis is used when REDIS_URL is configured so the limit holds across replicas.
 * With no Redis reachable the service falls back to a per-process window: the
 * limit still applies (this is a real counter, not a no-op), it is simply scoped
 * to one instance. Failing open on a Redis outage is deliberate — losing the
 * cache must not take quoting offline.
 */
@Injectable()
export class RateLimitService implements OnModuleDestroy {
  private readonly logger = new Logger(RateLimitService.name);
  private redis: Redis | null = null;
  private redisDown = false;
  private readonly local = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly config: AppConfigService) {
    const url = this.config.redisUrl;
    if (url) {
      this.redis = new Redis(url, {
        maxRetriesPerRequest: 1,
        lazyConnect: true,
        enableOfflineQueue: false,
      });
      this.redis.on('error', (error) => {
        if (!this.redisDown) {
          this.redisDown = true;
          this.logger.warn(`Redis unavailable, rate limiting locally: ${error.message}`);
        }
      });
      this.redis.connect().catch(() => undefined);
    }
  }

  async hit(key: string, limit: number, windowSeconds: number): Promise<RateVerdict> {
    if (this.redis && !this.redisDown) {
      try {
        const count = await this.redis.incr(key);
        if (count === 1) await this.redis.expire(key, windowSeconds);
        const ttl = count > limit ? await this.redis.ttl(key) : 0;
        return {
          allowed: count <= limit,
          retryAfterSeconds: Math.max(1, ttl > 0 ? ttl : windowSeconds),
        };
      } catch (error) {
        this.redisDown = true;
        this.logger.warn(`Redis rate-limit read failed: ${(error as Error).message}`);
      }
    }
    return this.hitLocal(key, limit, windowSeconds);
  }

  private hitLocal(key: string, limit: number, windowSeconds: number): RateVerdict {
    const now = Date.now();
    const existing = this.local.get(key);

    if (!existing || existing.resetAt <= now) {
      this.local.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
      this.sweep(now);
      return { allowed: true, retryAfterSeconds: windowSeconds };
    }

    existing.count += 1;
    return {
      allowed: existing.count <= limit,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  /** Drops expired windows so the map cannot grow without bound. */
  private sweep(now: number): void {
    if (this.local.size < 2000) return;
    for (const [key, window] of this.local) {
      if (window.resetAt <= now) this.local.delete(key);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      this.redis.disconnect();
      this.redis = null;
    }
  }
}
