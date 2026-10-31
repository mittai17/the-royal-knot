/** FeedbackRequest has no category column yet (see docs/SCHEMA_REQUESTS.md); it is stored as a "[Category] " prefix of the subject. */
export const CATEGORIES = ['General', 'Planning', 'Payments', 'Guests', 'Vendors', 'Accommodation', 'Transport', 'Technical', 'Other'] as const;
export const encodeSubject = (category: string | undefined, subject: string) => (category ? `[${category.replace(/[\[\]]/g, '')}] ${subject.trim()}` : subject.trim());
export function decodeSubject(raw: string): { category: string | null; subject: string } {
  const m = /^\[([^\]]{1,40})\]\s*(.*)$/s.exec(raw);
  return m ? { category: m[1], subject: m[2] } : { category: null, subject: raw };
}
