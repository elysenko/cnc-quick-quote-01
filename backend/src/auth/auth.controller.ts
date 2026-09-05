import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AuthService } from './auth.service';
import { Public } from './auth.guard';
import { CurrentUser } from './current-user.decorator';
import { AuthenticatedUser, SessionResponse } from './auth.types';
import { parseBody } from '../common/validation';
import { RateLimit } from '../common/ratelimit/ratelimit.decorator';

const credentialsSchema = z.object({
  email: z.string(),
  password: z.string(),
});

const registerSchema = credentialsSchema.extend({
  name: z.string(),
  company: z.string().optional(),
});

const refreshSchema = z.object({ refreshToken: z.string().optional() });

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  @RateLimit({ bucket: 'auth:register', limit: 10, windowSeconds: 300 })
  async register(@Body() body: unknown): Promise<SessionResponse> {
    const input = parseBody(registerSchema, body);
    return this.auth.register(input);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @RateLimit({ bucket: 'auth:login', limit: 15, windowSeconds: 300 })
  async login(@Body() body: unknown): Promise<SessionResponse> {
    const input = parseBody(credentialsSchema, body);
    return this.auth.login(input.email, input.password);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body() body: unknown): Promise<SessionResponse> {
    const { refreshToken } = parseBody(refreshSchema, body);
    if (!refreshToken) {
      return this.auth.refresh('');
    }
    return this.auth.refresh(refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Body() body: unknown): Promise<void> {
    const { refreshToken } = parseBody(refreshSchema, body);
    await this.auth.logout(refreshToken);
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}
