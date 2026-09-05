import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { UnauthorizedError } from '../common/errors';
import { AuthedRequest, AuthenticatedUser } from './auth.types';

/** Injects the authenticated user. Guarded routes always have one. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (!request.user) throw new UnauthorizedError();
    return request.user;
  },
);

/** Injects the user when present, null on public routes with no session. */
export const OptionalUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser | null =>
    ctx.switchToHttp().getRequest<AuthedRequest>().user ?? null,
);
