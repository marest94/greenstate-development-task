import { describe, expect, it } from 'vitest';
import { parseCsv } from './parse-csv.js';
describe('CSV parsing', () => {
  it('handles CRLF, quoted commas, escaped quotes, and empty fields', () => {
    expect(parseCsv('id,title,rating\r\n1,"A quiet, ""city"" home",\r\n', ['id', 'title', 'rating']))
      .toEqual([{ id: '1', title: 'A quiet, "city" home', rating: '' }]);
  });
  it('allows correctly quoted newlines without splitting a record', () => {
    expect(parseCsv('id,title\n1,"First line\nSecond line"\n', ['id', 'title'])).toEqual([{ id: '1', title: 'First line\nSecond line' }]);
  });
  it.each(['id,id\n1,2', 'id,title,extra\n1,A,B', 'id,title\n1', 'id,title\n1,"unfinished'])('rejects malformed rows and headers', text => {
    expect(() => parseCsv(text, ['id', 'title'])).toThrow();
  });
});
