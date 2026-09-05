import type { ZodError, ZodType, output as ZodOutput } from 'zod';
import { ValidationError } from './errors';

/**
 * Parses a request body with a zod schema and converts the first issue into the
 * API's `{ code, message, field }` envelope, so the SPA can attach the message
 * to the offending input without parsing zod's own error shape.
 */
export function parseBody<S extends ZodType>(schema: S, body: unknown): ZodOutput<S> {
  const result = schema.safeParse(body);
  if (result.success) return result.data as ZodOutput<S>;
  throw firstIssue(result.error);
}

function firstIssue(error: ZodError): ValidationError {
  const issue = error.issues[0];
  const field = issue?.path.length ? issue.path.join('.') : null;
  const message = issue?.message ?? 'That request could not be processed.';
  return new ValidationError(message, field);
}
