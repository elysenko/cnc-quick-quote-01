import { Injectable } from '@nestjs/common';
import type { BendLine } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DrawingsService } from '../drawings/drawings.service';
import { NotFoundError, ValidationError } from '../common/errors';
import { AuthenticatedUser } from '../auth/auth.types';

const DIRECTIONS = ['up', 'down'] as const;
export type BendDirection = (typeof DIRECTIONS)[number];

export interface BendInput {
  drawingId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  angleDeg?: number;
  direction?: string;
}

/**
 * Bend lines are annotations layered over a drawing. The stored DXF object is
 * never rewritten — the customer's original file stays exactly as uploaded.
 */
@Injectable()
export class BendsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly drawings: DrawingsService,
  ) {}

  async list(drawingId: string, user: AuthenticatedUser): Promise<BendLine[]> {
    if (!drawingId) throw new ValidationError('A drawing is required.', 'drawingId');
    await this.drawings.byIdForUser(drawingId, user.id, isStaff(user));
    return this.prisma.bendLine.findMany({
      where: { drawingId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(input: BendInput, user: AuthenticatedUser): Promise<BendLine> {
    await this.drawings.byIdForUser(input.drawingId, user.id, isStaff(user));

    const angleDeg = validateAngle(input.angleDeg ?? 90);
    const direction = validateDirection(input.direction ?? 'up');

    if (input.x1 === input.x2 && input.y1 === input.y2) {
      throw new ValidationError('A bend line needs a start and an end point.', 'x2');
    }

    return this.prisma.bendLine.create({
      data: {
        drawingId: input.drawingId,
        x1: input.x1,
        y1: input.y1,
        x2: input.x2,
        y2: input.y2,
        angleDeg,
        direction,
      },
    });
  }

  async update(
    id: string,
    patch: Partial<Omit<BendInput, 'drawingId'>>,
    user: AuthenticatedUser,
  ): Promise<BendLine> {
    const existing = await this.owned(id, user);

    return this.prisma.bendLine.update({
      where: { id },
      data: {
        x1: patch.x1 ?? existing.x1,
        y1: patch.y1 ?? existing.y1,
        x2: patch.x2 ?? existing.x2,
        y2: patch.y2 ?? existing.y2,
        angleDeg: patch.angleDeg === undefined ? existing.angleDeg : validateAngle(patch.angleDeg),
        direction:
          patch.direction === undefined ? existing.direction : validateDirection(patch.direction),
      },
    });
  }

  async remove(id: string, user: AuthenticatedUser): Promise<void> {
    await this.owned(id, user);
    await this.prisma.bendLine.delete({ where: { id } });
  }

  /** Resolves a bend and proves the caller owns the drawing it belongs to. */
  private async owned(id: string, user: AuthenticatedUser): Promise<BendLine> {
    const bend = await this.prisma.bendLine.findUnique({ where: { id } });
    if (!bend) throw new NotFoundError('That bend line no longer exists.');
    await this.drawings.byIdForUser(bend.drawingId, user.id, isStaff(user));
    return bend;
  }
}

function validateAngle(angleDeg: number): number {
  if (!Number.isFinite(angleDeg) || angleDeg < 0 || angleDeg > 180) {
    throw new ValidationError('Bend angle must be between 0 and 180 degrees.', 'angleDeg');
  }
  return angleDeg;
}

function validateDirection(direction: string): BendDirection {
  const value = direction.toLowerCase();
  if (!DIRECTIONS.includes(value as BendDirection)) {
    throw new ValidationError("Bend direction must be either 'up' or 'down'.", 'direction');
  }
  return value as BendDirection;
}

function isStaff(user: AuthenticatedUser): boolean {
  return user.role === 'ADMIN' || user.role === 'MANAGER';
}
