import { DAY_OF_ITEMS, DEFAULT_TEMPLATES, FULL_SERVICE_ITEMS, PARTIAL_ITEMS } from './default-templates';

describe('default task templates', () => {
  for (const t of DEFAULT_TEMPLATES) {
    describe(t.name, () => {
      if (t.packageType === 'FULL_SERVICE') it('generates at least 26 tasks', () => expect(t.items.length).toBeGreaterThanOrEqual(26));
      it('has unique keys', () => expect(new Set(t.items.map((i) => i.key)).size).toBe(t.items.length));
      it('only depends on keys that exist, and never on itself', () => {
        const keys = new Set(t.items.map((i) => i.key));
        for (const i of t.items) if (i.dependsOnKey) { expect(keys.has(i.dependsOnKey)).toBe(true); expect(i.dependsOnKey).not.toBe(i.key); }
      });
      it('schedules every dependency earlier than its dependent (no impossible ordering)', () => {
        const off = new Map(t.items.map((i) => [i.key, i.offsetDays]));
        for (const i of t.items) if (i.dependsOnKey) expect(off.get(i.dependsOnKey)!).toBeGreaterThanOrEqual(i.offsetDays);
      });
    });
  }
  it('covers all 15 required categories in the full-service checklist', () => {
    expect(new Set(DEFAULT_TEMPLATES[0].items.map((i) => i.category)).size).toBe(15);
  });
  it('Partial is a reduced, scoped set; Day-of is a strict subset of Partial', () => {
    expect(PARTIAL_ITEMS.length).toBeGreaterThan(0);
    expect(PARTIAL_ITEMS.length).toBeLessThan(FULL_SERVICE_ITEMS.length);
    expect(PARTIAL_ITEMS.length).toBeLessThan(26);
    const partial = new Set(PARTIAL_ITEMS.map((i) => i.key));
    expect(DAY_OF_ITEMS.length).toBeGreaterThan(0);
    expect(DAY_OF_ITEMS.length).toBeLessThan(PARTIAL_ITEMS.length);
    for (const i of DAY_OF_ITEMS) expect(partial.has(i.key)).toBe(true);
    // scoped: no sourcing tasks for venue / decoration / catering selection in the partial package
    for (const k of ['venue-book', 'deco-book', 'cater-rfq', 'cater-book']) expect(partial.has(k)).toBe(false);
  });
  it('the only package types are FULL_SERVICE and PARTIAL (Day-of is not a third package)', () => {
    expect(DEFAULT_TEMPLATES.map((t) => t.packageType)).toEqual(['FULL_SERVICE', 'PARTIAL']);
  });
});
