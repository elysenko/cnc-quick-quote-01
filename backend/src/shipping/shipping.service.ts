import { Injectable } from '@nestjs/common';
import type { ShippingMethod } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundError, ValidationError } from '../common/errors';

export type ShippingKind = 'flat' | 'per_sheet';

export interface ShippingInput {
  name: string;
  kind: ShippingKind;
  costCents: number;
  etaDays: number;
  active: boolean;
}

export interface PricedShippingMethod {
  id: string;
  name: string;
  kind: string;
  costCents: number;
  etaDays: number;
  active: boolean;
  /** Cost for THIS quote: flat as-is, per_sheet multiplied by the sheet count. */
  computedCents: number;
}

@Injectable()
export class ShippingService {
  constructor(private readonly prisma: PrismaService) {}

  listActive(): Promise<ShippingMethod[]> {
    return this.prisma.shippingMethod.findMany({
      where: { active: true },
      orderBy: [{ costCents: 'asc' }],
    });
  }

  listAll(): Promise<ShippingMethod[]> {
    return this.prisma.shippingMethod.findMany({
      orderBy: [{ active: 'desc' }, { costCents: 'asc' }],
    });
  }

  /** Applies the per-sheet rule so the UI and the Stripe session agree exactly. */
  computeCost(method: ShippingMethod, sheetCount: number): number {
    return method.kind === 'per_sheet'
      ? method.costCents * Math.max(1, sheetCount)
      : method.costCents;
  }

  async listActivePriced(sheetCount: number): Promise<PricedShippingMethod[]> {
    const methods = await this.listActive();
    return methods.map((method) => ({
      id: method.id,
      name: method.name,
      kind: method.kind,
      costCents: method.costCents,
      etaDays: method.etaDays,
      active: method.active,
      computedCents: this.computeCost(method, sheetCount),
    }));
  }

  /** Resolves a chosen method for checkout, refusing anything not on offer. */
  async forCheckout(id: string): Promise<ShippingMethod> {
    const method = await this.prisma.shippingMethod.findUnique({ where: { id } });
    if (!method || !method.active) {
      throw new ValidationError('Choose a delivery method to continue.', 'shippingMethodId');
    }
    return method;
  }

  create(input: ShippingInput): Promise<ShippingMethod> {
    return this.prisma.shippingMethod.create({ data: input });
  }

  async update(id: string, patch: Partial<ShippingInput>): Promise<ShippingMethod> {
    const existing = await this.prisma.shippingMethod.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('That delivery method no longer exists.');
    return this.prisma.shippingMethod.update({ where: { id }, data: patch });
  }
}
