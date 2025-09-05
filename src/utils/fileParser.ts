import { read, utils } from 'xlsx';

export type ParsedTable = Array<Record<string, string | undefined>>;

export async function parseXlsxArrayBuffer(buf: ArrayBuffer, sheetName?: string): Promise<ParsedTable> {
  const workbook = read(buf);
  const name = sheetName && workbook.SheetNames.includes(sheetName) ? sheetName : workbook.SheetNames[0];
  const sheet = workbook.Sheets[name];
  const rows = utils.sheet_to_json<Record<string, string | undefined>>(sheet);
  return rows;
}

export function parseCsvText(text: string): ParsedTable {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (!lines.length) return [];
  const headers = lines[0].split(',').map(h => h.replace(/\uFEFF/g, '').trim());
  const out: ParsedTable = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = [] as string[];
    let cur = '';
    let inQ = false;
    const row = lines[i];
    for (let j = 0; j < row.length; j++) {
      const ch = row[j];
      const next = row[j + 1];
      if (inQ) {
        if (ch === '"' && next === '"') { cur += '"'; j++; continue; }
        if (ch === '"') { inQ = false; continue; }
        cur += ch; continue;
      } else {
        if (ch === '"') { inQ = true; continue; }
        if (ch === ',') { cols.push(cur); cur = ''; continue; }
        cur += ch; continue;
      }
    }
    cols.push(cur);
    const rec: Record<string, string | undefined> = {};
    for (let ci = 0; ci < headers.length; ci++) {
      rec[headers[ci]] = (cols[ci] ?? '').trim();
    }
    out.push(rec);
  }
  return out;
}
