import { ConflictException } from '@nestjs/common';
import { AgreementStatus, ArrivalStatus, BookingStatus, EnquiryStage, IncidentStatus, QuotationStatus, RoomAllocationStatus, RSVP, TaskStatus } from '@prisma/client';
import {
  AGREEMENT_TRANSITIONS, ARRIVAL_TRANSITIONS, assertTransition, BOOKING_TRANSITIONS, canTransition, ENQUIRY_TRANSITIONS, INCIDENT_TRANSITIONS, isTaskOverdue,
  PROPOSAL_TRANSITIONS, QUOTATION_EXPIRABLE, QUOTATION_TRANSITIONS, ROOM_ALLOCATION_TRANSITIONS, RSVP_TRANSITIONS, TASK_TRANSITIONS, TransitionTable,
} from './state-machines';

/** Every enum value must appear as a key, and every target must be a known state. */
function complete<S extends string>(table: TransitionTable<S>, enumValues: Record<string, S>) {
  const all = Object.values(enumValues);
  expect(Object.keys(table).sort()).toEqual([...all].sort());
  for (const [from, tos] of Object.entries(table) as [S, readonly S[]][]) for (const to of tos) { expect(all).toContain(to); expect(to).not.toBe(from); }
}
const legal = <S extends string>(t: TransitionTable<S>, pairs: [S, S][]) => pairs.forEach(([a, b]) => expect([a, b, canTransition(t, a, b)]).toEqual([a, b, true]));
const illegal = <S extends string>(t: TransitionTable<S>, pairs: [S, S][]) => pairs.forEach(([a, b]) => expect([a, b, canTransition(t, a, b)]).toEqual([a, b, false]));

describe('assertTransition', () => {
  it('throws a 409 with a machine-readable body for an illegal move', () => {
    try { assertTransition('Task', TASK_TRANSITIONS, 'BLOCKED', 'DONE'); fail('should throw'); } catch (e) {
      expect(e).toBeInstanceOf(ConflictException);
      expect((e as ConflictException).getStatus()).toBe(409);
      expect((e as ConflictException).getResponse()).toMatchObject({ code: 'ILLEGAL_TRANSITION', from: 'BLOCKED', to: 'DONE', entity: 'Task' });
    }
  });
  it('same-state is rejected unless allowSame, and then reports "no change"', () => {
    expect(() => assertTransition('Task', TASK_TRANSITIONS, 'DONE', 'DONE')).toThrow(ConflictException);
    expect(assertTransition('Task', TASK_TRANSITIONS, 'DONE', 'DONE', { allowSame: true })).toBe(false);
    expect(assertTransition('Task', TASK_TRANSITIONS, 'TO_PLAN', 'DONE')).toBe(true);
  });
});

describe('enquiry / lead', () => {
  it('covers every stage', () => complete(ENQUIRY_TRANSITIONS, EnquiryStage));
  it('moves forward, back one step, to LOST and can be reopened', () => {
    legal(ENQUIRY_TRANSITIONS, [['NEW', 'INITIAL_CONSULTATION'], ['INITIAL_CONSULTATION', 'PROPOSAL_SENT'], ['PROPOSAL_SENT', 'NEGOTIATION'], ['NEGOTIATION', 'PROPOSAL_SENT'], ['NEGOTIATION', 'LOST'], ['LOST', 'NEW']]);
  });
  it('CONVERTED is only reachable through convert (terminal here); LOST cannot jump to a proposal', () => {
    illegal(ENQUIRY_TRANSITIONS, [['NEW', 'CONVERTED'], ['NEGOTIATION', 'CONVERTED'], ['CONVERTED', 'NEW'], ['CONVERTED', 'LOST'], ['LOST', 'PROPOSAL_SENT'], ['LOST', 'NEGOTIATION']]);
  });
});

describe('agreement', () => {
  it('covers every status', () => complete(AGREEMENT_TRANSITIONS, AgreementStatus));
  it('DRAFT -> SENT -> SIGNED | REJECTED | EXPIRED', () => {
    legal(AGREEMENT_TRANSITIONS, [['DRAFT', 'SENT'], ['SENT', 'SIGNED'], ['SENT', 'REJECTED'], ['SENT', 'EXPIRED'], ['DRAFT', 'EXPIRED']]);
  });
  it('a draft cannot be signed and finished agreements never reopen', () => {
    illegal(AGREEMENT_TRANSITIONS, [['DRAFT', 'SIGNED'], ['SIGNED', 'REJECTED'], ['SIGNED', 'SENT'], ['REJECTED', 'SENT'], ['EXPIRED', 'SIGNED'], ['REJECTED', 'SIGNED']]);
  });
});

describe('proposal', () => {
  it('DRAFT -> SENT -> ACCEPTED | DECLINED, nothing skips SENT', () => {
    legal(PROPOSAL_TRANSITIONS, [['DRAFT', 'SENT'], ['SENT', 'ACCEPTED'], ['SENT', 'DECLINED'], ['VIEWED', 'ACCEPTED']]);
    illegal(PROPOSAL_TRANSITIONS, [['DRAFT', 'ACCEPTED'], ['ACCEPTED', 'DECLINED'], ['DECLINED', 'ACCEPTED']]);
  });
});

describe('quotation / RFQ', () => {
  it('covers every status', () => complete(QUOTATION_TRANSITIONS, QuotationStatus));
  it('follows DRAFT -> SENT -> RECEIVED -> UNDER_REVIEW -> COMPARED -> SELECTED', () => {
    legal(QUOTATION_TRANSITIONS, [['DRAFT', 'SENT'], ['SENT', 'RECEIVED'], ['RECEIVED', 'UNDER_REVIEW'], ['UNDER_REVIEW', 'COMPARED'], ['COMPARED', 'SELECTED'], ['RECEIVED', 'SELECTED'], ['COMPARED', 'REJECTED'], ['SENT', 'CLOSED'], ['DRAFT', 'CLOSED']]);
  });
  it('an unsent RFQ cannot be answered, selected or compared', () => {
    illegal(QUOTATION_TRANSITIONS, [['DRAFT', 'RECEIVED'], ['DRAFT', 'SELECTED'], ['DRAFT', 'COMPARED'], ['SENT', 'SELECTED'], ['SENT', 'COMPARED']]);
  });
  it('decided / closed / expired quotes are final', () => {
    illegal(QUOTATION_TRANSITIONS, [['SELECTED', 'REJECTED'], ['SELECTED', 'RECEIVED'], ['REJECTED', 'SELECTED'], ['CLOSED', 'SELECTED'], ['CLOSED', 'SENT'], ['EXPIRED', 'SELECTED'], ['EXPIRED', 'RECEIVED']]);
  });
  it('the expiry job can only touch open states and never a decision', () => {
    for (const s of QUOTATION_EXPIRABLE) expect(canTransition(QUOTATION_TRANSITIONS, s, 'EXPIRED')).toBe(true);
    for (const s of ['SELECTED', 'REJECTED', 'CLOSED', 'EXPIRED'] as QuotationStatus[]) expect(QUOTATION_EXPIRABLE).not.toContain(s);
  });
});

describe('task', () => {
  it('covers every status', () => complete(TASK_TRANSITIONS, TaskStatus));
  it('allows TO_PLAN/IN_PROGRESS/BLOCKED/DONE moves, reopening and unblocking', () => {
    legal(TASK_TRANSITIONS, [['TO_PLAN', 'IN_PROGRESS'], ['IN_PROGRESS', 'DONE'], ['TO_PLAN', 'DONE'], ['IN_PROGRESS', 'BLOCKED'], ['BLOCKED', 'IN_PROGRESS'], ['DONE', 'IN_PROGRESS']]);
  });
  it('a blocked task must be unblocked before it can be completed', () => illegal(TASK_TRANSITIONS, [['BLOCKED', 'DONE']]));
  it('overdue is derived: past due and not DONE', () => {
    const past = new Date(Date.now() - 864e5), future = new Date(Date.now() + 864e5);
    expect(isTaskOverdue({ status: 'TO_PLAN', dueDate: past })).toBe(true);
    expect(isTaskOverdue({ status: 'BLOCKED', dueDate: past })).toBe(true);
    expect(isTaskOverdue({ status: 'DONE', dueDate: past })).toBe(false);
    expect(isTaskOverdue({ status: 'IN_PROGRESS', dueDate: future })).toBe(false);
    expect(Object.keys(TASK_TRANSITIONS)).not.toContain('OVERDUE');
  });
});

describe('vendor arrival', () => {
  it('covers every status', () => complete(ARRIVAL_TRANSITIONS, ArrivalStatus));
  it('EXPECTED -> ON_THE_WAY -> ARRIVED | DELAYED -> COMPLETED', () => {
    legal(ARRIVAL_TRANSITIONS, [['EXPECTED', 'ON_THE_WAY'], ['ON_THE_WAY', 'ARRIVED'], ['ON_THE_WAY', 'DELAYED'], ['DELAYED', 'ARRIVED'], ['ARRIVED', 'COMPLETED'], ['EXPECTED', 'DELAYED'], ['DELAYED', 'COMPLETED']]);
  });
  it('cannot complete before arriving or go back after completion', () => {
    illegal(ARRIVAL_TRANSITIONS, [['EXPECTED', 'COMPLETED'], ['ON_THE_WAY', 'COMPLETED'], ['COMPLETED', 'ARRIVED'], ['ARRIVED', 'EXPECTED'], ['ARRIVED', 'DELAYED']]);
  });
});

describe('room allocation', () => {
  it('covers every status', () => complete(ROOM_ALLOCATION_TRANSITIONS, RoomAllocationStatus));
  it('PENDING -> CONFIRMED -> CHECKED_IN -> CHECKED_OUT, cancellable before check-out', () => {
    legal(ROOM_ALLOCATION_TRANSITIONS, [['PENDING', 'CONFIRMED'], ['CONFIRMED', 'CHECKED_IN'], ['CHECKED_IN', 'CHECKED_OUT'], ['CONFIRMED', 'CANCELLED'], ['PENDING', 'CANCELLED'], ['CHECKED_IN', 'CANCELLED']]);
  });
  it('cannot check in twice, skip check-in or revive a finished stay', () => {
    illegal(ROOM_ALLOCATION_TRANSITIONS, [['PENDING', 'CHECKED_IN'], ['CONFIRMED', 'CHECKED_OUT'], ['CHECKED_OUT', 'CHECKED_IN'], ['CANCELLED', 'CONFIRMED'], ['CHECKED_IN', 'CONFIRMED']]);
  });
});

describe('incident', () => {
  it('covers every status', () => complete(INCIDENT_TRANSITIONS, IncidentStatus));
  it('REPORTED -> TRIAGED -> ASSIGNED -> IN_PROGRESS -> RESOLVED -> CLOSED', () => {
    legal(INCIDENT_TRANSITIONS, [['REPORTED', 'TRIAGED'], ['TRIAGED', 'ASSIGNED'], ['ASSIGNED', 'IN_PROGRESS'], ['IN_PROGRESS', 'RESOLVED'], ['RESOLVED', 'CLOSED'], ['RESOLVED', 'IN_PROGRESS']]);
  });
  it('no skipping steps and a closed incident stays closed', () => {
    illegal(INCIDENT_TRANSITIONS, [['REPORTED', 'RESOLVED'], ['REPORTED', 'CLOSED'], ['TRIAGED', 'IN_PROGRESS'], ['ASSIGNED', 'RESOLVED'], ['CLOSED', 'IN_PROGRESS'], ['IN_PROGRESS', 'CLOSED']]);
  });
});

describe('RSVP', () => {
  it('covers every status', () => complete(RSVP_TRANSITIONS, RSVP));
  it('guests can change their answer', () => legal(RSVP_TRANSITIONS, [['PENDING', 'CONFIRMED'], ['PENDING', 'DECLINED'], ['CONFIRMED', 'DECLINED'], ['DECLINED', 'CONFIRMED'], ['CONFIRMED', 'PENDING']]));
});

describe('wedding booking status', () => {
  it('covers every status', () => complete(BOOKING_TRANSITIONS, BookingStatus));
  it('a confirmed booking can only be cancelled; a cancelled one is final', () => {
    legal(BOOKING_TRANSITIONS, [['CONFIRMED', 'CANCELLED'], ['DRAFT', 'CONFIRMED'], ['DEPOSIT_PENDING', 'CONFIRMED']]);
    illegal(BOOKING_TRANSITIONS, [['CONFIRMED', 'DRAFT'], ['CONFIRMED', 'DEPOSIT_PENDING'], ['CANCELLED', 'DRAFT'], ['CANCELLED', 'CONFIRMED']]);
  });
});
