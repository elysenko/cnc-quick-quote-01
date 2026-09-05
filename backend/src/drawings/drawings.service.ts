import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Drawing } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { SettingsService } from '../settings/settings.service';
import { DxfService } from '../dxf/dxf.service';
import { DxfParseError } from '../dxf/dxf.parser';
import { asJson } from '../common/json';
import { ForbiddenError, NotFoundError, ValidationError } from '../common/errors';

export interface UploadedFile {
  originalname: string;
  buffer: Buffer;
  size: number;
  mimetype: string;
}

@Injectable()
export class DrawingsService {
  private readonly logger = new Logger(DrawingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly settings: SettingsService,
    private readonly dxf: DxfService,
  ) {}

  /**
   * Validates, parses, then stores — in that order.
   *
   * The limits are checked BEFORE anything is streamed to object storage, and a
   * drawing that fails to parse leaves no object behind: a rejected upload must
   * not leave orphaned bytes in the bucket.
   */
  async upload(userId: string, file: UploadedFile | undefined): Promise<Drawing> {
    if (!file || !file.buffer?.length) {
      throw new ValidationError('Choose a drawing file to upload.', 'file');
    }

    const { upload } = await this.settings.get();
    const allowed = parseExtensions(upload.allowedExtensions);
    const extension = extensionOf(file.originalname);

    if (!allowed.includes(extension)) {
      throw new ValidationError(
        `${extension || 'That file type'} is not accepted. Allowed: ${allowed.join(', ')}.`,
        'file',
      );
    }

    const maxBytes = Math.round(upload.maxUploadMb * 1024 * 1024);
    if (file.size > maxBytes) {
      throw new ValidationError(
        `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${upload.maxUploadMb} MB.`,
        'file',
      );
    }

    let geometry;
    try {
      geometry = this.dxf.parse(file.buffer);
    } catch (error) {
      if (error instanceof DxfParseError) {
        throw new ValidationError(error.message, 'file', 'dxf_parse_failed');
      }
      throw error;
    }

    const objectKey = `drawings/${userId}/${randomUUID()}-${safeName(file.originalname)}`;
    await this.storage.putObject(objectKey, file.buffer, 'application/dxf');

    return this.prisma.drawing.create({
      data: {
        userId,
        filename: file.originalname,
        objectKey,
        sizeBytes: file.size,
        cutLengthMm: geometry.cutLengthMm,
        bboxWidthMm: geometry.bboxWidthMm,
        bboxHeightMm: geometry.bboxHeightMm,
        entityCount: geometry.entityCount,
        skippedEntities: geometry.skippedEntities,
        polylines: asJson(geometry.polylines),
      },
    });
  }

  /** Ownership-scoped read: another customer's drawing is 403, not 404. */
  async byIdForUser(id: string, userId: string, isAdmin: boolean): Promise<Drawing> {
    const drawing = await this.prisma.drawing.findUnique({ where: { id } });
    if (!drawing) throw new NotFoundError('That drawing no longer exists.');
    if (drawing.userId !== userId && !isAdmin) {
      throw new ForbiddenError('That drawing belongs to another account.');
    }
    return drawing;
  }

  list(userId: string): Promise<Drawing[]> {
    return this.prisma.drawing.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async fileUrl(id: string, userId: string, isAdmin: boolean): Promise<string> {
    const drawing = await this.byIdForUser(id, userId, isAdmin);
    return this.storage.presignedGetUrl(drawing.objectKey);
  }
}

/** `.dxf, .dwg` → `['.dxf', '.dwg']`, tolerant of missing dots and spacing. */
function parseExtensions(raw: string): string[] {
  return raw
    .split(/[,\s]+/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .map((part) => (part.startsWith('.') ? part : `.${part}`));
}

function extensionOf(filename: string): string {
  const index = filename.lastIndexOf('.');
  return index === -1 ? '' : filename.slice(index).toLowerCase();
}

function safeName(filename: string): string {
  return filename.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80);
}
