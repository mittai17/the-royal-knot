import { DEFAULT_TEMPLATES } from './default-templates';

describe('default task templates', () => {
  for (const t of DEFAULT_TEMPLATES) {
    describe(t.name, () => {
      it('generates more than 25 tasks', () => expect(t.items.length).toBeGreaterThan(25));
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
});
