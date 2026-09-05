import type { Role } from '@prisma/client';
import type { Request } from 'express';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  company: string | null;
}

/** Express request after `AuthGuard` has run. */
export interface AuthedRequest extends Request {
  user?: AuthenticatedUser;
}

export interface SessionResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthenticatedUser;
}
