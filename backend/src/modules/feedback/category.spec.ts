import { decodeSubject, encodeSubject } from './category';

describe('feedback category encoding', () => {
  it('round-trips', () => expect(decodeSubject(encodeSubject('Payments', 'Receipt missing'))).toEqual({ category: 'Payments', subject: 'Receipt missing' }));
  it('handles no category and stray brackets', () => {
    expect(decodeSubject(encodeSubject(undefined, 'Hello'))).toEqual({ category: null, subject: 'Hello' });
    expect(decodeSubject(encodeSubject('A[B]', 'x'))).toEqual({ category: 'AB', subject: 'x' });
  });
});
