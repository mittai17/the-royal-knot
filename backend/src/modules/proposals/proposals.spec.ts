import { statusFromAgreement } from './proposals.service';

describe('proposal status sync', () => {
  it('a signed agreement accepts a sent proposal', () => {
    expect(statusFromAgreement('SENT', 'SIGNED')).toBe('ACCEPTED');
    expect(statusFromAgreement('VIEWED', 'SIGNED')).toBe('ACCEPTED');
  });
  it('does not touch drafts, declined or unsigned', () => {
    expect(statusFromAgreement('DRAFT', 'SIGNED')).toBe('DRAFT');
    expect(statusFromAgreement('DECLINED', 'SIGNED')).toBe('DECLINED');
    expect(statusFromAgreement('SENT', 'SENT')).toBe('SENT');
    expect(statusFromAgreement('SENT', null)).toBe('SENT');
  });
});
