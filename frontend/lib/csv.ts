/** Small RFC-4180-ish CSV parser (quotes, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some((x) => x.trim() !== '')) rows.push(row); row = []; }
    else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

export interface GuestCsvRow { name: string; phone?: string; email?: string; groupName?: string; category?: string; rsvp?: string; plusOnes?: number; dietary?: string; accommodationNeeded?: boolean }

const ALIASES: Record<string, keyof GuestCsvRow> = { name: 'name', guest: 'name', 'guest name': 'name', phone: 'phone', mobile: 'phone', email: 'email', group: 'groupName', family: 'groupName', 'family/group': 'groupName', groupname: 'groupName', category: 'category', rsvp: 'rsvp', 'plus ones': 'plusOnes', plusones: 'plusOnes', accompanying: 'plusOnes', dietary: 'dietary', diet: 'dietary', accommodation: 'accommodationNeeded' };

export function csvToGuests(text: string): { rows: GuestCsvRow[]; errors: string[] } {
  const [head, ...body] = parseCsv(text);
  if (!head) return { rows: [], errors: ['File is empty'] };
  const map = head.map((h) => ALIASES[h.trim().toLowerCase()]);
  if (!map.includes('name')) return { rows: [], errors: ['A “name” column is required'] };
  const errors: string[] = [];
  const rows: GuestCsvRow[] = [];
  body.forEach((r, idx) => {
    const o: GuestCsvRow = { name: '' };
    map.forEach((k, i) => {
      const v = (r[i] ?? '').trim();
      if (!k || !v) return;
      if (k === 'plusOnes') o.plusOnes = Math.max(0, parseInt(v, 10) || 0);
      else if (k === 'accommodationNeeded') o.accommodationNeeded = /^(y|yes|true|1)$/i.test(v);
      else if (k === 'rsvp') o.rsvp = v.toUpperCase();
      else (o as unknown as Record<string, string>)[k] = v;
    });
    if (!o.name) errors.push(`Row ${idx + 2}: missing name`); else rows.push(o);
  });
  return { rows, errors };
}
