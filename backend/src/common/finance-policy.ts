import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma, PrismaClient, Role } from '@prisma/client';
import { D } from './finance';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Approval thresholds (INR). Source of truth is the Founder's Business Settings (`SystemSetting` key `approval.limits`, edited at
 * PUT /settings/approval-limits); the values below are only the fallbacks.
 *  - vendorPayment: a vendor payment / vendor bill above this needs the FOUNDER (Finance may approve at or below it, never their own).
 *  - extraExpense : expenses at or above this are also raised in the Approvals Centre.
 *  - clientDiscount, vendorContract: used by invoices / procurement.
 */
export const DEFAULT_LIMITS = { vendorPayment: 100000, extraExpense: 50000, clientDiscount: 25000, vendorContract: 500000, clientRefund: 0 };
export type FinanceLimits = typeof DEFAULT_LIMITS;

export async function financeLimits(db: Db): Promise<FinanceLimits> {
  const row = await db.systemSetting.findUnique({ where: { key: 'approval.limits' } }).catch(() => null);
  const stored = (row?.value ?? {}) as Partial<Record<keyof FinanceLimits, unknown>>;
  const out = { ...DEFAULT_LIMITS };
  for (const k of Object.keys(out) as (keyof FinanceLimits)[]) {
    const v = stored[k];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out[k] = v;
  }
  return out;
}

export const above = (amount: Prisma.Decimal.Value, limit: number) => D(amount).gt(limit);

/** Maker-checker: the same person may not both make and check. Always a 403 with a message that names the rule. */
export function assertDifferentPerson(actorId: string, otherId: string | null | undefined, message: string) {
  if (otherId && otherId === actorId) throw new ForbiddenException(`Maker-checker: ${message}`);
}

/** Stage separation for large amounts (verify != submit, approve != submit/verify, pay != approve). 409 because the record is fine, the actor is not. */
export function assertIndependent(actorId: string, prior: { label: string; userId?: string | null }[], action: string) {
  const clash = prior.find((p) => p.userId && p.userId === actorId);
  if (clash) throw new ConflictException(`Maker-checker: you ${clash.label} this record, so someone else must ${action} it`);
}

/** Who first created a record, from the append-only audit trail (null for seeded / legacy rows). */
export async function creatorOf(db: Db, entity: string, entityId: string, action = 'create'): Promise<string | null> {
  const row = await db.activityLog.findFirst({ where: { entity, entityId, action }, orderBy: { createdAt: 'asc' }, select: { actorId: true } });
  return row?.actorId ?? null;
}

export const isFounder = (role: Role) => role === 'FOUNDER';
