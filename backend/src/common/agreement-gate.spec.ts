import { isAgreementSigned, LOCKED_STATE, signedWeddingIds } from './agreement-gate';

describe('agreement gate', () => {
  it('exposes the explicit locked state shape the client portal returns', () => {
    expect(LOCKED_STATE).toEqual({ locked: true, reason: 'AGREEMENT_NOT_SIGNED' });
  });
  it('is signed only when a SIGNED agreement exists (SENT / EXPIRED / REJECTED do not count)', async () => {
    const count = jest.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    const db = { agreement: { count } } as never;
    expect(await isAgreementSigned(db, 'w')).toBe(false);
    expect(await isAgreementSigned(db, 'w')).toBe(true);
    expect(count).toHaveBeenCalledWith({ where: { weddingId: 'w', status: 'SIGNED' } });
  });
  it('returns the signed subset of a list of weddings (and skips the query for an empty list)', async () => {
    const findMany = jest.fn().mockResolvedValue([{ weddingId: 'a' }]);
    const db = { agreement: { findMany } } as never;
    expect([...(await signedWeddingIds(db, ['a', 'b']))]).toEqual(['a']);
    expect((await signedWeddingIds(db, [])).size).toBe(0);
    expect(findMany).toHaveBeenCalledTimes(1);
  });
});
