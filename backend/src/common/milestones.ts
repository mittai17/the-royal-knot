import { MilestoneType, Prisma } from '@prisma/client';
import { D, money } from './finance';

/** One milestone share of a contract. FINAL always takes the remainder (plus approved extras), so its percent is informational. */
export interface MilestoneShare { type: MilestoneType; percent: number }

/** Fallback template only when neither the contract nor Business Settings define one (demo configuration, not a rule). */
export const FALLBACK_MILESTONE_TEMPLATE: MilestoneShare[] = [{ type: 'BOOKING', percent: 20 }, { type: 'ADVANCE', percent: 40 }, { type: 'FINAL', percent: 40 }];
export const contractMilestoneKey = (weddingId: string) => `payment.milestones.${weddingId}`;

const TYPES: MilestoneType[] = ['BOOKING', 'ADVANCE', 'FINAL'];
function parse(v: unknown): MilestoneShare[] | null {
  if (!Array.isArray(v)) return null;
  const out: MilestoneShare[] = [];
  for (const x of v as { type?: string; percent?: unknown }[]) {
    const pct = Number(x?.percent);
    if (!x?.type || !TYPES.includes(x.type as MilestoneType) || !Number.isFinite(pct) || pct < 0 || pct > 100) return null;
    out.push({ type: x.type as MilestoneType, percent: pct });
  }
  return TYPES.every((t) => out.some((o) => o.type === t)) ? out : null;
}

type Db = Pick<Prisma.TransactionClient, 'systemSetting'>;

/** The plan for one contract: its own override (SystemSetting `payment.milestones.<weddingId>`), else the Business Settings template (`payment.milestones`), else the fallback. */
export async function milestonePlan(db: Db, weddingId?: string): Promise<{ plan: MilestoneShare[]; source: 'contract' | 'business-settings' | 'fallback' }> {
  if (weddingId) {
    const own = parse((await db.systemSetting.findUnique({ where: { key: contractMilestoneKey(weddingId) } }))?.value);
    if (own) return { plan: own, source: 'contract' };
  }
  const tpl = parse((await db.systemSetting.findUnique({ where: { key: 'payment.milestones' } }))?.value);
  return tpl ? { plan: tpl, source: 'business-settings' } : { plan: FALLBACK_MILESTONE_TEMPLATE, source: 'fallback' };
}

/** Splits a contract into BOOKING / ADVANCE amounts by the plan; FINAL = contract + approved extras - the other two (so the three always add up exactly). */
export function splitContract(plan: MilestoneShare[], contractValue: Prisma.Decimal.Value, approvedExtras: Prisma.Decimal.Value = 0) {
  const t = D(contractValue);
  const pct = (type: MilestoneType) => D(plan.find((p) => p.type === type)?.percent ?? 0);
  const booking = money(t.times(pct('BOOKING')).div(100));
  const advance = money(t.times(pct('ADVANCE')).div(100));
  const final = money(t.plus(D(approvedExtras)).minus(booking).minus(advance));
  return { BOOKING: booking, ADVANCE: advance, FINAL: final };
}

/** (Re)creates the three staged milestones from the contract's plan. FINAL absorbs approved extras. Due dates: booking +3d, advance -30d, final +7d after the wedding. */
export async function syncMilestones(tx: Prisma.TransactionClient, wedding: { id: string; startDate: Date; endDate: Date }, contractValue: Prisma.Decimal.Value, approvedExtras: Prisma.Decimal.Value = 0) {
  const { plan } = await milestonePlan(tx, wedding.id);
  const amounts = splitContract(plan, contractValue, approvedExtras);
  const day = 864e5;
  const rows: [MilestoneType, Date, Prisma.Decimal][] = [
    ['BOOKING', new Date(Date.now() + 3 * day), amounts.BOOKING],
    ['ADVANCE', new Date(wedding.startDate.getTime() - 30 * day), amounts.ADVANCE],
    ['FINAL', new Date(wedding.endDate.getTime() + 7 * day), amounts.FINAL],
  ];
  for (const [type, dueDate, expectedAmount] of rows) {
    await tx.paymentMilestone.upsert({
      where: { weddingId_type: { weddingId: wedding.id, type } },
      create: { weddingId: wedding.id, type, dueDate, expectedAmount },
      update: { expectedAmount, ...(type === 'ADVANCE' || type === 'FINAL' ? { dueDate } : {}) },
    });
  }
}
