import { Injectable, Logger } from '@nestjs/common';
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'node:stream';
import { AppConfigService } from '../config/config.service';
import { ServiceUnconfiguredError } from '../common/errors';

const SERVICE = 'MinIO / S3 API (boto3)';
const CREDENTIAL_KEY = 'MINIO_S3_API_BOTO3_API_KEY';

/**
 * Object storage for CAD drawings and PDF receipts.
 *
 * Every connection detail is read from the environment (single-namespace runtime
 * contract) — no hostname, port or credential is hardcoded. The bucket is
 * created on first use so a fresh namespace needs no manual setup.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private client: S3Client | null = null;
  private bucketReady = false;

  constructor(private readonly config: AppConfigService) {}

  get bucket(): string {
    return process.env.S3_BUCKET ?? process.env.MINIO_BUCKET ?? 'cnc-quick-quote';
  }

  private get endpoint(): string | null {
    return (
      process.env.S3_ENDPOINT ??
      process.env.MINIO_ENDPOINT ??
      null
    );
  }

  /**
   * Credentials come from the standard MinIO env vars; the declared integration
   * key is honoured too so an admin can supply an access key from Admin →
   * Settings without a redeploy.
   */
  private async credentials(): Promise<{ accessKeyId: string; secretAccessKey: string }> {
    const accessKeyId =
      process.env.S3_ACCESS_KEY ?? process.env.MINIO_ROOT_USER ?? null;
    const secretAccessKey =
      process.env.S3_SECRET_KEY ??
      process.env.MINIO_ROOT_PASSWORD ??
      (await this.config.resolveConfig(CREDENTIAL_KEY));

    if (!accessKeyId || !secretAccessKey) {
      throw new ServiceUnconfiguredError(SERVICE, CREDENTIAL_KEY);
    }
    return { accessKeyId, secretAccessKey };
  }

  private async getClient(): Promise<S3Client> {
    if (this.client) return this.client;

    const endpoint = this.endpoint;
    if (!endpoint) throw new ServiceUnconfiguredError(SERVICE, 'MINIO_ENDPOINT');

    this.client = new S3Client({
      endpoint,
      region: process.env.S3_REGION ?? 'us-east-1',
      credentials: await this.credentials(),
      // MinIO serves buckets as a path segment, not a DNS prefix.
      forcePathStyle: true,
    });
    return this.client;
  }

  private async ensureBucket(): Promise<void> {
    if (this.bucketReady) return;
    const client = await this.getClient();
    try {
      await client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      } catch (error) {
        // A concurrent creator winning the race is fine; anything else surfaces
        // on the next operation with a clearer message.
        this.logger.warn(`bucket create skipped: ${(error as Error).message}`);
      }
    }
    this.bucketReady = true;
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<string> {
    await this.ensureBucket();
    const client = await this.getClient();
    await client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return key;
  }

  async getObject(key: string): Promise<Buffer> {
    const client = await this.getClient();
    const result = await client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const stream = result.Body as Readable;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
    }
    return Buffer.concat(chunks);
  }

  async presignedGetUrl(key: string, expiresInSeconds = 300): Promise<string> {
    const client = await this.getClient();
    return getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }

  /** Used by `/api/health/deep`. Never throws — reports the reason instead. */
  async check(): Promise<{ ok: boolean; detail: string }> {
    try {
      await this.ensureBucket();
      return { ok: true, detail: `bucket ${this.bucket}` };
    } catch (error) {
      return { ok: false, detail: (error as Error).message };
    }
  }
}
