import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ServiceUnconfiguredError } from '../common/errors';

/**
 * Value the provisioner writes into the pod env for an integration whose real
 * credential has not been supplied yet. Treated as "absent" so the SystemSetting
 * fallback (Admin → Settings) can take over without a redeploy.
 */
export const PLACEHOLDER = 'PLACEHOLDER_CONFIGURE_IN_SETTINGS';

/** Human labels for the keys surfaced on Admin → Settings. */
export const SERVICE_KEYS = {
  MINIO_S3_API_BOTO3_API_KEY: 'MinIO / S3 API (boto3)',
  POSTGRESQL_API_KEY: 'PostgreSQL',
  REDIS_API_KEY: 'Redis',
  RESEND_API_PYTHON_SDK_API_KEY: 'Resend API (Python SDK)',
  STRIPE_SDK_PYTHON_API_KEY: 'Stripe SDK (Python)',
} as const;

export type ServiceKey = keyof typeof SERVICE_KEYS;

function usable(value: string | undefined | null): value is string {
  return typeof value === 'string' && value.trim() !== '' && value.trim() !== PLACEHOLDER;
}

/**
 * Runtime credential resolution with a deliberate precedence:
 *   1. process.env[key]        — what the deployer injected
 *   2. SystemSetting row       — what an admin typed into Admin → Settings
 *   3. null                    — unconfigured; callers raise 503, never crash
 *
 * Reads are cached because they sit on hot paths (every upload, every checkout);
 * `invalidate()` is called on every settings write so a newly saved credential
 * takes effect on the next request rather than the next deploy.
 */
@Injectable()
export class AppConfigService {
  private readonly logger = new Logger(AppConfigService.name);
  private cache = new Map<string, string | null>();

  constructor(private readonly prisma: PrismaService) {}

  invalidate(key?: string): void {
    if (key) this.cache.delete(key);
    else this.cache.clear();
  }

  async resolveConfig(key: string): Promise<string | null> {
    if (this.cache.has(key)) return this.cache.get(key) ?? null;

    const fromEnv = process.env[key];
    if (usable(fromEnv)) {
      this.cache.set(key, fromEnv.trim());
      return fromEnv.trim();
    }

    let resolved: string | null = null;
    try {
      const row = await this.prisma.systemSetting.findUnique({ where: { key } });
      resolved = usable(row?.value) ? row!.value.trim() : null;
    } catch (error) {
      // A settings-table read failure must not take the whole request down —
      // the caller's 503 path is the correct, visible outcome.
      this.logger.warn(`could not read SystemSetting "${key}": ${(error as Error).message}`);
    }

    this.cache.set(key, resolved);
    return resolved;
  }

  /** Same as resolveConfig but raises the 503 the API contract specifies. */
  async requireConfig(key: string, service: string): Promise<string> {
    const value = await this.resolveConfig(key);
    if (value === null) throw new ServiceUnconfiguredError(service, key);
    return value;
  }

  async isConfigured(key: string): Promise<boolean> {
    return (await this.resolveConfig(key)) !== null;
  }

  async setConfig(key: string, value: string): Promise<void> {
    await this.prisma.systemSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
    this.invalidate(key);
  }

  /** Non-secret environment values with sane local defaults. */
  get publicBaseUrl(): string {
    return (process.env.PUBLIC_BASE_URL ?? 'http://localhost:4200').replace(/\/+$/, '');
  }

  get fromEmail(): string {
    return process.env.FROM_EMAIL ?? 'orders@example.invalid';
  }

  get jwtSecret(): string {
    return process.env.JWT_SECRET ?? 'development-only-insecure-jwt-secret';
  }

  get encryptionKey(): string {
    return process.env.APP_ENCRYPTION_KEY ?? this.jwtSecret;
  }

  get redisUrl(): string | null {
    const url = process.env.REDIS_URL;
    return usable(url) ? url.trim() : null;
  }
}
