import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT = 'ratelimit:options';

export interface RateLimitOptions {
  /** Namespace for the counter, e.g. `quotes:create`. */
  bucket: string;
  /** Requests allowed inside one window. */
  limit: number;
  /** Fixed window length in seconds. */
  windowSeconds: number;
}

/** Applies a fixed-window rate limit, keyed by user id when signed in, else IP. */
export const RateLimit = (options: RateLimitOptions): MethodDecorator & ClassDecorator =>
  SetMetadata(RATE_LIMIT, options);
