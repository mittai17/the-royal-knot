import { MilestoneType, Prisma } from '@prisma/client';
import { D, money } from './finance';

export const MILESTONE_SPLIT = { BOOKING: 20, ADVANCE: 40 } as const; // FINAL takes the remainder

/** (Re)creates the three staged milestones. Booking/advance are fixed shares of the contract; FINAL absorbs approved extras. Due dates: booking +3d, advance −30d, final +7d after wedding. */
export async function syncMilestones(tx: Prisma.TransactionClient, wedding: { id: string; startDate: Date; endDate: Date }, contractValue: Prisma.Decimal.Value, approvedExtras: Prisma.Decimal.Value = 0) {
  const t = D(contractValue);
  const booking = money(t.times(MILESTONE_SPLIT.BOOKING).div(100));
  const advance = money(t.times(MILESTONE_SPLIT.ADVANCE).div(100));
  const final = money(t.plus(D(approvedExtras)).minus(booking).minus(advance));
  const day = 864e5;
  const rows: [MilestoneType, Date, Prisma.Decimal][] = [
    ['BOOKING', new Date(Date.now() + 3 * day), booking],
    ['ADVANCE', new Date(wedding.startDate.getTime() - 30 * day), advance],
    ['FINAL', new Date(wedding.endDate.getTime() + 7 * day), final],
  ];
  for (const [type, dueDate, expectedAmount] of rows) {
    await tx.paymentMilestone.upsert({
      where: { weddingId_type: { weddingId: wedding.id, type } },
      create: { weddingId: wedding.id, type, dueDate, expectedAmount },
      update: { expectedAmount, ...(type === 'ADVANCE' || type === 'FINAL' ? { dueDate } : {}) },
    });
  }
}
