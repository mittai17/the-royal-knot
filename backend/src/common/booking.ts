import { BookingStatus, ExecutionStage, Prisma, WeddingStatus } from '@prisma/client';

/**
 * Draft vs confirmed wedding (master spec decision 3).
 *
 * A wedding is a *booking* only once bookingStatus = CONFIRMED (agreement SIGNED + final proposal ACCEPTED + booking deposit verified).
 * Everything before that is an internal draft workspace and MUST NOT be counted in revenue, profitability, cash flow,
 * "completed weddings" or any other business statistic. Analytics / finance code imports these helpers:
 *
 *   where: { ...confirmedWeddingWhere(), startDate: { gte } }          // on Wedding
 *   where: { wedding: confirmedWeddingWhere() }                        // on any model with a `wedding` relation
 *   where: { wedding: { is: confirmedWeddingWhere() } }                // optional relation
 */
export const DRAFT_BOOKING_STATUSES: BookingStatus[] = [BookingStatus.DRAFT, BookingStatus.AGREEMENT_PENDING, BookingStatus.PROPOSAL_PENDING, BookingStatus.DEPOSIT_PENDING];

/** Prisma `where` for the Wedding model that matches confirmed bookings only (cancelled and every draft stage excluded). */
export function confirmedWeddingWhere(): Prisma.WeddingWhereInput {
  return { bookingStatus: BookingStatus.CONFIRMED };
}

/** Prisma `where` for draft workspaces (any stage before confirmation). */
export function draftWeddingWhere(): Prisma.WeddingWhereInput {
  return { bookingStatus: { in: DRAFT_BOOKING_STATUSES } };
}

/** Confirmed bookings that have finished (revenue-recognisable "completed weddings"). */
export function completedWeddingWhere(): Prisma.WeddingWhereInput {
  return { bookingStatus: BookingStatus.CONFIRMED, OR: [{ executionStage: ExecutionStage.COMPLETED }, { status: WeddingStatus.COMPLETED }] };
}

export const isConfirmedBooking = (w: { bookingStatus: BookingStatus }) => w.bookingStatus === BookingStatus.CONFIRMED;
export const isDraftBooking = (w: { bookingStatus: BookingStatus }) => DRAFT_BOOKING_STATUSES.includes(w.bookingStatus);

export interface BookingFacts {
  /** An agreement has been generated / sent (any version in DRAFT, SENT or SIGNED). */
  agreementSent: boolean;
  agreementSigned: boolean;
  proposalAccepted: boolean;
  depositVerified: boolean;
}

/**
 * Pure derivation of the booking status from the underlying facts:
 * DRAFT -> AGREEMENT_PENDING -> PROPOSAL_PENDING -> DEPOSIT_PENDING -> CONFIRMED.
 * CANCELLED and CONFIRMED are sticky: only `WeddingsService.confirm` moves a wedding to CONFIRMED and facts never demote it.
 */
export function deriveBookingStatus(current: BookingStatus, f: BookingFacts): BookingStatus {
  if (current === BookingStatus.CANCELLED || current === BookingStatus.CONFIRMED) return current;
  if (!f.agreementSigned) return f.agreementSent ? BookingStatus.AGREEMENT_PENDING : BookingStatus.DRAFT;
  if (!f.proposalAccepted) return BookingStatus.PROPOSAL_PENDING;
  return BookingStatus.DEPOSIT_PENDING; // everything but the verified deposit; confirm() promotes to CONFIRMED
}

/** What is still missing before a wedding can be confirmed (empty = ready). */
export function confirmationBlockers(f: BookingFacts): string[] {
  const out: string[] = [];
  if (!f.agreementSigned) out.push('AGREEMENT_NOT_SIGNED');
  if (!f.proposalAccepted) out.push('PROPOSAL_NOT_ACCEPTED');
  if (!f.depositVerified) out.push('DEPOSIT_NOT_VERIFIED');
  return out;
}

/** Legacy combined Wedding.status kept in step with bookingStatus + executionStage. */
export function legacyStatusFor(booking: BookingStatus, stage: ExecutionStage): WeddingStatus {
  if (booking === BookingStatus.CANCELLED) return WeddingStatus.CANCELLED;
  switch (stage) {
    case ExecutionStage.VENDOR_BOOKING: return WeddingStatus.VENDOR_BOOKING;
    case ExecutionStage.EVENT_DAY: case ExecutionStage.FINANCIAL_CLOSEOUT: return WeddingStatus.EVENT_DAY;
    case ExecutionStage.COMPLETED: return WeddingStatus.COMPLETED;
    default: return WeddingStatus.PLANNING;
  }
}

/** Inverse mapping used when the legacy status endpoint is called. */
export function stageForLegacyStatus(s: WeddingStatus): ExecutionStage | null {
  switch (s) {
    case WeddingStatus.PLANNING: return ExecutionStage.PLANNING;
    case WeddingStatus.VENDOR_BOOKING: return ExecutionStage.VENDOR_BOOKING;
    case WeddingStatus.EVENT_DAY: return ExecutionStage.EVENT_DAY;
    case WeddingStatus.COMPLETED: return ExecutionStage.COMPLETED;
    default: return null;
  }
}
