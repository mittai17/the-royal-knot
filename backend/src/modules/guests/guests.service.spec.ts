import { parseCsv } from './guests.service';

describe('parseCsv', () => {
  it('parses quoted fields, escaped quotes and embedded commas/newlines', () => {
    const rows = parseCsv('name,group\n"Mehta, Rohan","Say ""hi"""\r\n"Line\nBreak",x\n');
    expect(rows).toEqual([['name', 'group'], ['Mehta, Rohan', 'Say "hi"'], ['Line\nBreak', 'x']]);
  });
  it('skips blank lines and handles a missing trailing newline', () => {
    expect(parseCsv('a,b\n\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('keeps empty cells', () => expect(parseCsv('a,b,c\n1,,3\n')[1]).toEqual(['1', '', '3']));
});
