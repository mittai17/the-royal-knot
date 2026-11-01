import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

/**
 * Agreement gate (master spec decision 2): a CLIENT sees the vendor shortlist, vendor comparison data and FLOOR_PLAN documents only after
 * the wedding's service agreement is SIGNED. Until then the API answers with an explicit locked state (NOT an error):
 *   { locked: true, reason: 'AGREEMENT_NOT_SIGNED' }
 * Staff are never gated.
 */
export const AGREEMENT_NOT_SIGNED = 'AGREEMENT_NOT_SIGNED' as const;
export const LOCKED_STATE = { locked: true as const, reason: AGREEMENT_NOT_SIGNED };
export type LockedState = typeof LOCKED_STATE;

type Db = PrismaService | Prisma.TransactionClient;

export async function isAgreementSigned(db: Db, weddingId: string): Promise<boolean> {
  return (await db.agreement.count({ where: { weddingId, status: 'SIGNED' } })) > 0;
}

/** Subset of `weddingIds` whose agreement is signed. */
export async function signedWeddingIds(db: Db, weddingIds: string[]): Promise<Set<string>> {
  if (!weddingIds.length) return new Set();
  const rows = await db.agreement.findMany({ where: { weddingId: { in: weddingIds }, status: 'SIGNED' }, select: { weddingId: true }, distinct: ['weddingId'] });
  return new Set(rows.map((r) => r.weddingId));
}
