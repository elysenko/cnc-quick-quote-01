import { Injectable } from '@nestjs/common';
import type { Material } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundError, ValidationError } from '../common/errors';

export interface MaterialInput {
  name: string;
  thicknessMm: number;
  costPerFtCents: number;
  costMultiplier: number;
  sheetWidthMm: number;
  sheetHeightMm: number;
  perSheetCostCents: number;
  active: boolean;
}

@Injectable()
export class MaterialsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Customer-facing catalogue: retiring a material hides it here immediately. */
  listActive(): Promise<Material[]> {
    return this.prisma.material.findMany({
      where: { active: true },
      orderBy: [{ name: 'asc' }],
    });
  }

  /** Admin view — includes retired materials so they can be brought back. */
  listAll(): Promise<Material[]> {
    return this.prisma.material.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] });
  }

  async byId(id: string): Promise<Material> {
    const material = await this.prisma.material.findUnique({ where: { id } });
    if (!material) throw new NotFoundError('That material no longer exists.');
    return material;
  }

  /** Resolves a material for quoting, refusing retired stock explicitly. */
  async forQuote(id: string): Promise<Material> {
    const material = await this.prisma.material.findUnique({ where: { id } });
    if (!material) {
      throw new ValidationError('Choose a material from the list.', 'materialId');
    }
    if (!material.active) {
      throw new ValidationError(
        `${material.name} is no longer offered. Choose another material.`,
        'materialId',
      );
    }
    return material;
  }

  create(input: MaterialInput): Promise<Material> {
    return this.prisma.material.create({ data: input });
  }

  async update(id: string, patch: Partial<MaterialInput>): Promise<Material> {
    await this.byId(id);
    return this.prisma.material.update({ where: { id }, data: patch });
  }

  async setActive(id: string, active: boolean): Promise<Material> {
    await this.byId(id);
    return this.prisma.material.update({ where: { id }, data: { active } });
  }
}
