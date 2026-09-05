import { Injectable } from '@nestjs/common';
import { AppConfigService, SERVICE_KEYS } from '../config/config.service';
import { mask } from '../common/crypto';
import { ValidationError } from '../common/errors';

export interface CredentialRow {
  id: string;
  service: string;
  key: string;
  description: string;
  maskedValue: string | null;
  configured: boolean;
  kind: 'backing-service' | 'integration';
}

interface CredentialSpec {
  id: string;
  service: string;
  key: string;
  description: string;
  kind: 'backing-service' | 'integration';
}

/**
 * Catalogue behind Admin → Settings: one row per backing service and per
 * declared integration, so an operator can see exactly what is live and what is
 * still waiting on a credential.
 */
const CATALOGUE: CredentialSpec[] = [
  {
    id: 'svc_pg',
    service: 'PostgreSQL',
    key: 'DATABASE_URL',
    description: 'Primary datastore connection string.',
    kind: 'backing-service',
  },
  {
    id: 'svc_minio',
    service: 'MinIO',
    key: 'MINIO_ENDPOINT',
    description: 'Object storage endpoint for drawings and receipts.',
    kind: 'backing-service',
  },
  {
    id: 'svc_redis',
    service: 'Redis',
    key: 'REDIS_URL',
    description: 'Backs the API rate-limit counters across instances.',
    kind: 'backing-service',
  },
  {
    id: 'int_minio',
    service: SERVICE_KEYS.MINIO_S3_API_BOTO3_API_KEY,
    key: 'MINIO_S3_API_BOTO3_API_KEY',
    description: 'Reads and writes CAD drawings and PDF receipts.',
    kind: 'integration',
  },
  {
    id: 'int_pg',
    service: SERVICE_KEYS.POSTGRESQL_API_KEY,
    key: 'POSTGRESQL_API_KEY',
    description: 'Database credential used by the API service.',
    kind: 'integration',
  },
  {
    id: 'int_redis',
    service: SERVICE_KEYS.REDIS_API_KEY,
    key: 'REDIS_API_KEY',
    description: 'Backs the API rate-limit counters.',
    kind: 'integration',
  },
  {
    id: 'int_resend',
    service: SERVICE_KEYS.RESEND_API_PYTHON_SDK_API_KEY,
    key: 'RESEND_API_PYTHON_SDK_API_KEY',
    description: 'Sends the order confirmation email with the PDF receipt.',
    kind: 'integration',
  },
  {
    id: 'int_stripe',
    service: SERVICE_KEYS.STRIPE_SDK_PYTHON_API_KEY,
    key: 'STRIPE_SDK_PYTHON_API_KEY',
    description: 'Creates hosted Checkout sessions and verifies payment webhooks.',
    kind: 'integration',
  },
];

const ALLOWED_KEYS = new Set(CATALOGUE.map((entry) => entry.key));

@Injectable()
export class AdminSettingsService {
  constructor(private readonly config: AppConfigService) {}

  async list(): Promise<CredentialRow[]> {
    return Promise.all(
      CATALOGUE.map(async (spec) => {
        const value = await this.config.resolveConfig(spec.key);
        return {
          ...spec,
          configured: value !== null,
          maskedValue: mask(value),
        };
      }),
    );
  }

  async save(key: string, value: string): Promise<void> {
    if (!ALLOWED_KEYS.has(key)) {
      throw new ValidationError('That is not a configurable credential.', 'key');
    }
    await this.config.setConfig(key, value.trim());
  }
}
