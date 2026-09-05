import type { Prisma } from '@prisma/client';

/**
 * Bridge between the app's closed domain interfaces and Prisma's `InputJsonValue`,
 * which demands an index signature. Our settings/breakdown/nesting types are
 * structurally plain JSON, so this cast is sound — keep it as the single
 * sanctioned place it happens rather than sprinkling casts at call sites.
 */
export function asJson<T>(value: T): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}
