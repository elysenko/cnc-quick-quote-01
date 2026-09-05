import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * Uniform error envelope: every failure leaves the API as
 * `{ code, message, field }` so the SPA can render one inline message per
 * field without sniffing status codes or Nest's default shapes.
 */
export interface ErrorEnvelope {
  code: string;
  message: string;
  field: string | null;
}

/** Base class for every error this API raises deliberately. */
export class AppError extends HttpException {
  constructor(
    status: number,
    readonly code: string,
    message: string,
    readonly field: string | null = null,
  ) {
    super({ code, message, field } satisfies ErrorEnvelope, status);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, field: string | null = null, code = 'validation_error') {
    super(HttpStatus.UNPROCESSABLE_ENTITY, code, message, field);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Sign in to continue.', code = 'unauthorized') {
    super(HttpStatus.UNAUTHORIZED, code, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have access to this area.', code = 'forbidden') {
    super(HttpStatus.FORBIDDEN, code, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found.', code = 'not_found') {
    super(HttpStatus.NOT_FOUND, code, message);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, field: string | null = null, code = 'conflict') {
    super(HttpStatus.CONFLICT, code, message, field);
  }
}

export class RateLimitError extends AppError {
  constructor(readonly retryAfterSeconds: number) {
    super(
      HttpStatus.TOO_MANY_REQUESTS,
      'rate_limited',
      `Too many requests. Try again in ${retryAfterSeconds} seconds.`,
    );
  }
}

/**
 * Raised when an integration has no credential configured (neither env var nor
 * SystemSetting row). 503 rather than 500: the feature is switched off, not broken.
 */
export class ServiceUnconfiguredError extends AppError {
  constructor(readonly service: string, readonly key: string) {
    super(
      HttpStatus.SERVICE_UNAVAILABLE,
      'service_unconfigured',
      `${service} is not configured yet. An administrator can add its credentials under Admin → Settings.`,
    );
  }
}

/** Upstream provider unreachable / timed out — nothing was persisted. */
export class UpstreamError extends AppError {
  constructor(service: string, detail?: string) {
    super(
      HttpStatus.BAD_GATEWAY,
      'upstream_unavailable',
      `${service} could not be reached${detail ? ` (${detail})` : ''}. Nothing was charged — please try again.`,
    );
  }
}

@Catch()
export class ErrorEnvelopeFilter implements ExceptionFilter {
  private readonly logger = new Logger('Api');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: ErrorEnvelope = {
      code: 'internal_error',
      message: 'Something went wrong on our side.',
      field: null,
    };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const payload = exception.getResponse();
      if (typeof payload === 'object' && payload !== null && 'code' in payload) {
        body = payload as ErrorEnvelope;
      } else {
        const message =
          typeof payload === 'string'
            ? payload
            : ((payload as { message?: string | string[] }).message ?? exception.message);
        body = {
          code: statusCode(status),
          message: Array.isArray(message) ? message[0] : message,
          field: null,
        };
      }
    }

    if (exception instanceof RateLimitError) {
      response.setHeader('Retry-After', String(exception.retryAfterSeconds));
    }

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json(body);
  }
}

function statusCode(status: number): string {
  switch (status) {
    case 400: return 'bad_request';
    case 401: return 'unauthorized';
    case 403: return 'forbidden';
    case 404: return 'not_found';
    case 409: return 'conflict';
    case 422: return 'validation_error';
    case 429: return 'rate_limited';
    case 502: return 'upstream_unavailable';
    case 503: return 'service_unconfigured';
    default: return 'internal_error';
  }
}
