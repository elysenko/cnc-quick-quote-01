import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@prisma/client';
import { AuthService } from './auth.service';
import { ForbiddenError, UnauthorizedError } from '../common/errors';
import { AuthedRequest, AuthenticatedUser } from './auth.types';

export const IS_PUBLIC = 'auth:public';
export const REQUIRED_ROLES = 'auth:roles';

/** Marks a route reachable without a session (login, signup, health, webhooks). */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);

/** Restricts a route to the listed roles — anonymous still yields 401, not 403. */
export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_ROLES, roles);

/** Convenience for the whole admin console. MANAGER shares the ADMIN surface. */
export const AdminOnly = (): MethodDecorator & ClassDecorator => Roles('ADMIN', 'MANAGER');

/**
 * Global guard. Resolves the bearer token into `request.user` and enforces role
 * metadata. The 401-vs-403 split is deliberate: anonymous callers are told to
 * sign in, signed-in customers are told they lack access.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets) ?? false;
    const request = context.switchToHttp().getRequest<AuthedRequest>();

    const user = await this.resolveUser(request);
    if (user) request.user = user;

    if (isPublic) return true;
    if (!user) throw new UnauthorizedError();

    const required = this.reflector.getAllAndOverride<Role[]>(REQUIRED_ROLES, targets);
    if (required?.length && !required.includes(user.role)) {
      throw new ForbiddenError();
    }

    return true;
  }

  /** Never throws: an absent or bad token simply means "no user" here, so that
   *  public routes still see an optional identity. */
  private async resolveUser(request: AuthedRequest): Promise<AuthenticatedUser | null> {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) return null;
    try {
      return await this.auth.verifyAccessToken(header.slice(7).trim());
    } catch {
      return null;
    }
  }
}
