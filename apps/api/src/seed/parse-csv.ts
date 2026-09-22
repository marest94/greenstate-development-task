import { parse } from 'csv-parse/sync';
export function parseCsv(text: string, columns: readonly string[]): Record<string, string>[] {
  const rows: Record<string, string>[] = parse(text, {
    bom: true, skip_empty_lines: true, max_record_size: 64_000,
    columns: (header: string[]) => {
      if (header.length !== columns.length || new Set(header).size !== header.length || header.some(column => !columns.includes(column))) {
        throw new Error('Unexpected or duplicate CSV columns.');
      }
      return header;
    },
  });
  if (rows.length === 0) throw new Error('The CSV contains no records.');
  return rows;
}
