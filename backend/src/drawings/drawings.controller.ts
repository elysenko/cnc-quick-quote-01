import {
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import type { Drawing } from '@prisma/client';
import { DrawingsService, UploadedFile as DrawingFile } from './drawings.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { RateLimit } from '../common/ratelimit/ratelimit.decorator';

/**
 * Multipart upload lives on REST rather than the JSON API because a DXF is a
 * binary stream, not a serialisable payload.
 */
@ApiTags('drawings')
@Controller('drawings')
export class DrawingsController {
  constructor(private readonly drawings: DrawingsService) {}

  @Post()
  @RateLimit({ bucket: 'drawings:upload', limit: 30, windowSeconds: 300 })
  // 64 MB is a hard transport ceiling; the real, admin-configured limit is
  // enforced in the service so the operator can tighten it without a redeploy.
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 64 * 1024 * 1024 } }))
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: DrawingFile | undefined,
  ): Promise<Drawing> {
    return this.drawings.upload(user.id, file);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<Drawing[]> {
    return this.drawings.list(user.id);
  }

  @Get(':id')
  byId(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<Drawing> {
    return this.drawings.byIdForUser(id, user.id, isStaff(user));
  }

  @Get(':id/file')
  async file(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ url: string }> {
    return { url: await this.drawings.fileUrl(id, user.id, isStaff(user)) };
  }
}

function isStaff(user: AuthenticatedUser): boolean {
  return user.role === 'ADMIN' || user.role === 'MANAGER';
}
