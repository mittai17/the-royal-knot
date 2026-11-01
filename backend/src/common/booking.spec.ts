import { BookingStatus } from '@prisma/client';
import { completedWeddingWhere, confirmationBlockers, confirmedWeddingWhere, DRAFT_BOOKING_STATUSES, draftWeddingWhere, deriveBookingStatus, isConfirmedBooking, legacyStatusFor, stageForLegacyStatus } from './booking';

const f = (o: Partial<Parameters<typeof deriveBookingStatus>[1]> = {}) => ({ agreementSent: false, agreementSigned: false, proposalAccepted: false, depositVerified: false, ...o });

describe('confirmedWeddingWhere', () => {
  it('matches CONFIRMED only, never drafts or cancelled', () => {
    expect(confirmedWeddingWhere()).toEqual({ bookingStatus: 'CONFIRMED' });
    expect(DRAFT_BOOKING_STATUSES).not.toContain('CONFIRMED');
    expect(DRAFT_BOOKING_STATUSES).not.toContain('CANCELLED');
    expect(draftWeddingWhere()).toEqual({ bookingStatus: { in: ['DRAFT', 'AGREEMENT_PENDING', 'PROPOSAL_PENDING', 'DEPOSIT_PENDING'] } });
    expect(completedWeddingWhere()).toMatchObject({ bookingStatus: 'CONFIRMED' });
    expect(isConfirmedBooking({ bookingStatus: 'DEPOSIT_PENDING' })).toBe(false);
    expect(isConfirmedBooking({ bookingStatus: 'CONFIRMED' })).toBe(true);
  });
});

describe('deriveBookingStatus', () => {
  it('DRAFT -> AGREEMENT_PENDING -> PROPOSAL_PENDING -> DEPOSIT_PENDING as the facts arrive', () => {
    expect(deriveBookingStatus('DRAFT', f())).toBe('DRAFT');
    expect(deriveBookingStatus('DRAFT', f({ agreementSent: true }))).toBe('AGREEMENT_PENDING');
    expect(deriveBookingStatus('AGREEMENT_PENDING', f({ agreementSent: true, agreementSigned: true }))).toBe('PROPOSAL_PENDING');
    expect(deriveBookingStatus('PROPOSAL_PENDING', f({ agreementSent: true, agreementSigned: true, proposalAccepted: true }))).toBe('DEPOSIT_PENDING');
  });
  it('never confirms by itself (only confirm() does) even when every fact is true', () => {
    expect(deriveBookingStatus('DEPOSIT_PENDING', f({ agreementSent: true, agreementSigned: true, proposalAccepted: true, depositVerified: true }))).toBe('DEPOSIT_PENDING');
  });
  it('CONFIRMED and CANCELLED are sticky', () => {
    for (const s of ['CONFIRMED', 'CANCELLED'] as BookingStatus[]) expect(deriveBookingStatus(s, f())).toBe(s);
  });
});

describe('confirmationBlockers', () => {
  it('lists exactly what is missing', () => {
    expect(confirmationBlockers(f())).toEqual(['AGREEMENT_NOT_SIGNED', 'PROPOSAL_NOT_ACCEPTED', 'DEPOSIT_NOT_VERIFIED']);
    expect(confirmationBlockers(f({ agreementSigned: true, proposalAccepted: true }))).toEqual(['DEPOSIT_NOT_VERIFIED']);
    expect(confirmationBlockers(f({ agreementSigned: true, proposalAccepted: true, depositVerified: true }))).toEqual([]);
  });
});

describe('legacy status sync', () => {
  it('maps stage + booking onto the legacy Wedding.status', () => {
    expect(legalStatus('CONFIRMED', 'VENDOR_BOOKING')).toBe('VENDOR_BOOKING');
    expect(legalStatus('CONFIRMED', 'EVENT_DAY')).toBe('EVENT_DAY');
    expect(legalStatus('CONFIRMED', 'FINANCIAL_CLOSEOUT')).toBe('EVENT_DAY');
    expect(legalStatus('CONFIRMED', 'COMPLETED')).toBe('COMPLETED');
    expect(legalStatus('DRAFT', 'INITIAL_PHASE')).toBe('PLANNING');
    expect(legalStatus('CANCELLED', 'PLANNING')).toBe('CANCELLED');
    expect(stageForLegacyStatus('VENDOR_BOOKING')).toBe('VENDOR_BOOKING');
    expect(stageForLegacyStatus('CANCELLED')).toBeNull();
  });
});
function legalStatus(b: BookingStatus, s: Parameters<typeof legacyStatusFor>[1]) { return legacyStatusFor(b, s); }
