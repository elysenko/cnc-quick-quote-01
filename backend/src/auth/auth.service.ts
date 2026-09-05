import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import type { Role, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/config.service';
import { ConflictError, UnauthorizedError, ValidationError } from '../common/errors';
import { AuthenticatedUser, SessionResponse } from './auth.types';

const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;
const BCRYPT_ROUNDS = 10;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Uniform failure for both "unknown email" and "wrong password" — a distinct
 *  message would let an attacker enumerate registered addresses. */
const BAD_CREDENTIALS = 'Email or password is incorrect.';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
  ) {}

  async register(input: { name: string; email: string; password: string; company?: string }): Promise<SessionResponse> {
    const email = normaliseEmail(input.email);
    const name = input.name.trim();

    if (!name) throw new ValidationError('Enter your name.', 'name');
    if (!EMAIL_RE.test(email)) throw new ValidationError('Enter a valid email address.', 'email');
    if (input.password.length < 8) {
      throw new ValidationError('Passwords are at least 8 characters.', 'password');
    }

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictError('An account with that email already exists.', 'email');
    }

    // The very first person to register owns the workshop. Once any account
    // exists — including the platform-provisioned ones — later signups are
    // customers, so a public signup form can never mint an administrator.
    const isFirstUser = (await this.prisma.user.count()) === 0;

    const user = await this.prisma.user.create({
      data: {
        email,
        name,
        company: input.company?.trim() || null,
        role: isFirstUser ? 'ADMIN' : 'USER',
        passwordHash: await bcrypt.hash(input.password, BCRYPT_ROUNDS),
      },
    });

    return this.issueSession(user);
  }

  async login(rawEmail: string, password: string): Promise<SessionResponse> {
    const email = normaliseEmail(rawEmail);
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      // Spend comparable time on the unknown-email path so response timing does
      // not distinguish it from a wrong password.
      await bcrypt.compare(password, '$2a$10$abcdefghijklmnopqrstuvCJ0Z0k7yQ8QpJj7uKf5mQ0m6JYwLmC');
      throw new UnauthorizedError(BAD_CREDENTIALS, 'invalid_credentials');
    }

    if (!(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedError(BAD_CREDENTIALS, 'invalid_credentials');
    }

    return this.issueSession(user);
  }

  /** Rotates the refresh token: the presented jti is revoked and a new one issued. */
  async refresh(refreshToken: string): Promise<SessionResponse> {
    let payload: { sub: string; jti: string; typ?: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, { secret: this.config.jwtSecret });
    } catch {
      throw new UnauthorizedError('Your session has expired. Please sign in again.', 'session_expired');
    }
    if (payload.typ !== 'refresh') {
      throw new UnauthorizedError('Your session has expired. Please sign in again.', 'session_expired');
    }

    const stored = await this.prisma.refreshToken.findUnique({ where: { jti: payload.jti } });
    if (!stored || stored.revokedAt || stored.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedError('Your session has expired. Please sign in again.', 'session_expired');
    }

    const user = await this.prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user) {
      throw new UnauthorizedError('Your session has expired. Please sign in again.', 'session_expired');
    }

    await this.prisma.refreshToken.update({
      where: { jti: payload.jti },
      data: { revokedAt: new Date() },
    });

    return this.issueSession(user);
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    try {
      const payload = await this.jwt.verifyAsync<{ jti: string }>(refreshToken, {
        secret: this.config.jwtSecret,
      });
      await this.prisma.refreshToken.updateMany({
        where: { jti: payload.jti, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } catch {
      // A logout with an already-invalid token is still a successful logout.
      this.logger.debug('logout presented an unverifiable refresh token');
    }
  }

  async verifyAccessToken(token: string): Promise<AuthenticatedUser> {
    let payload: { sub: string; typ?: string };
    try {
      payload = await this.jwt.verifyAsync(token, { secret: this.config.jwtSecret });
    } catch {
      throw new UnauthorizedError('Your session has expired. Please sign in again.', 'session_expired');
    }
    if (payload.typ !== 'access') throw new UnauthorizedError();

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedError();
    return toPublicUser(user);
  }

  private async issueSession(user: User): Promise<SessionResponse> {
    const jti = randomUUID();
    const expiresAt = new Date(Date.now() + REFRESH_TTL_SECONDS * 1000);

    await this.prisma.refreshToken.create({
      data: { jti, userId: user.id, expiresAt },
    });

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(
        { sub: user.id, role: user.role, typ: 'access' },
        { secret: this.config.jwtSecret, expiresIn: ACCESS_TTL_SECONDS },
      ),
      this.jwt.signAsync(
        { sub: user.id, jti, typ: 'refresh' },
        { secret: this.config.jwtSecret, expiresIn: REFRESH_TTL_SECONDS },
      ),
    ]);

    return {
      accessToken,
      refreshToken,
      expiresIn: ACCESS_TTL_SECONDS,
      user: toPublicUser(user),
    };
  }
}

export function toPublicUser(user: {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  company: string | null;
}): AuthenticatedUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    company: user.company,
  };
}

function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}
