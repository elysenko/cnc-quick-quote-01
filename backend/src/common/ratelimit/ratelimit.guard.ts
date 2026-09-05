import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RATE_LIMIT, RateLimitOptions } from './ratelimit.decorator';
import { RateLimitService } from './ratelimit.service';
import { RateLimitError } from '../errors';
import type { AuthedRequest } from '../../auth/auth.types';

/**
 * Global guard that applies whatever `@RateLimit` metadata a route declares.
 * Runs after `AuthGuard` so a signed-in caller is counted per account rather
 * than per shared NAT address.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!options) return true;

    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const identity = request.user?.id ?? clientIp(request);
    const key = `rl:${options.bucket}:${identity}:${Math.floor(Date.now() / (options.windowSeconds * 1000))}`;

    const verdict = await this.limiter.hit(key, options.limit, options.windowSeconds);
    if (!verdict.allowed) throw new RateLimitError(verdict.retryAfterSeconds);
    return true;
  }
}

function clientIp(request: AuthedRequest): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length) {
    return forwarded.split(',')[0].trim();
  }
  return request.ip ?? request.socket?.remoteAddress ?? 'unknown';
}
