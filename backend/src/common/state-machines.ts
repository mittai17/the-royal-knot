import { ConflictException } from '@nestjs/common';
import type { AgreementStatus, ArrivalStatus, BookingStatus, EnquiryStage, IncidentStatus, ProposalStatus, QuotationStatus, RoomAllocationStatus, RSVP, TaskStatus } from '@prisma/client';

/**
 * Canonical state machines (master spec decision 9). Transition tables are the single source of truth; services call
 * `assertTransition` and illegal moves become 409 Conflict. Same-state "transitions" are rejected unless `allowSame` is set.
 */
export type TransitionTable<S extends string> = Readonly<Record<S, readonly S[]>>;

export function canTransition<S extends string>(table: TransitionTable<S>, from: S, to: S): boolean {
  return (table[from] ?? []).includes(to);
}

export class IllegalTransitionException extends ConflictException {
  constructor(entity: string, from: string, to: string, allowed: readonly string[]) {
    super({ message: `${entity}: cannot move from ${from} to ${to}`, code: 'ILLEGAL_TRANSITION', entity, from, to, allowed: [...allowed] });
  }
}

/** Throws a 409 for an illegal transition. Returns false for an allowed same-state no-op, true for a real move. */
export function assertTransition<S extends string>(entity: string, table: TransitionTable<S>, from: S, to: S, opts: { allowSame?: boolean } = {}): boolean {
  if (from === to) {
    if (opts.allowSame) return false;
    throw new IllegalTransitionException(entity, from, to, table[from] ?? []);
  }
  if (!canTransition(table, from, to)) throw new IllegalTransitionException(entity, from, to, table[from] ?? []);
  return true;
}

export const ENQUIRY_TRANSITIONS: TransitionTable<EnquiryStage> = {
  NEW: ['INITIAL_CONSULTATION', 'PROPOSAL_SENT', 'NEGOTIATION', 'LOST'],
  INITIAL_CONSULTATION: ['NEW', 'PROPOSAL_SENT', 'NEGOTIATION', 'LOST'],
  PROPOSAL_SENT: ['INITIAL_CONSULTATION', 'NEGOTIATION', 'LOST'],
  NEGOTIATION: ['PROPOSAL_SENT', 'LOST'],
  CONVERTED: [], // only through the convert action (creates the draft wedding)
  LOST: ['NEW', 'INITIAL_CONSULTATION'], // reopen
};

export const AGREEMENT_TRANSITIONS: TransitionTable<AgreementStatus> = {
  DRAFT: ['SENT', 'EXPIRED'],
  SENT: ['SIGNED', 'REJECTED', 'EXPIRED'],
  SIGNED: [],
  REJECTED: [],
  EXPIRED: [],
};

export const PROPOSAL_TRANSITIONS: TransitionTable<ProposalStatus> = {
  DRAFT: ['SENT'],
  SENT: ['VIEWED', 'ACCEPTED', 'DECLINED'],
  VIEWED: ['ACCEPTED', 'DECLINED'],
  ACCEPTED: [],
  DECLINED: [],
};

/** Applies to both QuotationRequest.status (the RFQ sent to a vendor) and Quotation.status (the vendor's answer). */
export const QUOTATION_TRANSITIONS: TransitionTable<QuotationStatus> = {
  DRAFT: ['SENT', 'CLOSED', 'EXPIRED'],
  SENT: ['RECEIVED', 'CLOSED', 'EXPIRED'],
  RECEIVED: ['UNDER_REVIEW', 'COMPARED', 'SELECTED', 'REJECTED', 'CLOSED', 'EXPIRED'],
  UNDER_REVIEW: ['COMPARED', 'SELECTED', 'REJECTED', 'CLOSED', 'EXPIRED'],
  COMPARED: ['UNDER_REVIEW', 'SELECTED', 'REJECTED', 'CLOSED', 'EXPIRED'],
  SELECTED: ['CLOSED'],
  REJECTED: ['CLOSED'],
  CLOSED: [],
  EXPIRED: [],
};
/** States an expiry job may move to EXPIRED (never SELECTED / REJECTED / CLOSED). */
export const QUOTATION_EXPIRABLE: QuotationStatus[] = ['DRAFT', 'SENT', 'RECEIVED', 'UNDER_REVIEW', 'COMPARED'];

export const TASK_TRANSITIONS: TransitionTable<TaskStatus> = {
  TO_PLAN: ['IN_PROGRESS', 'DONE', 'BLOCKED'],
  IN_PROGRESS: ['TO_PLAN', 'DONE', 'BLOCKED'],
  BLOCKED: ['TO_PLAN', 'IN_PROGRESS'],
  DONE: ['IN_PROGRESS', 'TO_PLAN'], // reopen
};
/** "Overdue" is derived, never stored. */
export const isTaskOverdue = (t: { status: TaskStatus; dueDate: Date }, now = new Date()) => t.status !== 'DONE' && t.dueDate.getTime() < now.getTime();

export const ARRIVAL_TRANSITIONS: TransitionTable<ArrivalStatus> = {
  EXPECTED: ['ON_THE_WAY', 'ARRIVED', 'DELAYED'],
  ON_THE_WAY: ['ARRIVED', 'DELAYED'],
  DELAYED: ['ON_THE_WAY', 'ARRIVED', 'COMPLETED'],
  ARRIVED: ['COMPLETED'],
  COMPLETED: [],
};

export const ROOM_ALLOCATION_TRANSITIONS: TransitionTable<RoomAllocationStatus> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PENDING', 'CHECKED_IN', 'CANCELLED'],
  CHECKED_IN: ['CHECKED_OUT', 'CANCELLED'],
  CHECKED_OUT: [],
  CANCELLED: [],
};

export const INCIDENT_TRANSITIONS: TransitionTable<IncidentStatus> = {
  REPORTED: ['TRIAGED'],
  TRIAGED: ['ASSIGNED'],
  ASSIGNED: ['IN_PROGRESS'],
  IN_PROGRESS: ['RESOLVED'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS'], // reopen
  CLOSED: [],
};

export const RSVP_TRANSITIONS: TransitionTable<RSVP> = {
  PENDING: ['CONFIRMED', 'DECLINED'],
  CONFIRMED: ['DECLINED', 'PENDING'],
  DECLINED: ['CONFIRMED', 'PENDING'],
};

/** Booking status moves forward automatically (see deriveBookingStatus); CANCELLED is reachable from every open state. */
export const BOOKING_TRANSITIONS: TransitionTable<BookingStatus> = {
  DRAFT: ['AGREEMENT_PENDING', 'PROPOSAL_PENDING', 'DEPOSIT_PENDING', 'CONFIRMED', 'CANCELLED'],
  AGREEMENT_PENDING: ['DRAFT', 'PROPOSAL_PENDING', 'DEPOSIT_PENDING', 'CONFIRMED', 'CANCELLED'],
  PROPOSAL_PENDING: ['AGREEMENT_PENDING', 'DEPOSIT_PENDING', 'CONFIRMED', 'CANCELLED'],
  DEPOSIT_PENDING: ['AGREEMENT_PENDING', 'PROPOSAL_PENDING', 'CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['CANCELLED'],
  CANCELLED: [],
};
