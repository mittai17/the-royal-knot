import { progress } from './checklists.service';

describe('checklist progress', () => {
  it('is zero for an empty list', () => expect(progress([])).toEqual({ total: 0, done: 0, pct: 0 }));
  it('rounds the percentage', () => expect(progress([{ done: true }, { done: false }, { done: false }])).toEqual({ total: 3, done: 1, pct: 33 }));
});
