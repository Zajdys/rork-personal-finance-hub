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
  
  // Detekce oddělovače (čárka, středník, tabulátor)
  const firstLine = lines[0];
  let delimiter = ',';
  if (firstLine.split(';').length > firstLine.split(',').length) {
    delimiter = ';';
  } else if (firstLine.split('\t').length > firstLine.split(',').length) {
    delimiter = '\t';
  }
  
  const headers = parseCSVLine(lines[0], delimiter).map(h => h.replace(/\uFEFF/g, '').trim());
  const out: ParsedTable = [];
  
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i], delimiter);
    const rec: Record<string, string | undefined> = {};
    for (let ci = 0; ci < headers.length; ci++) {
      rec[headers[ci]] = (cols[ci] ?? '').trim();
    }
    out.push(rec);
  }
  return out;
}

function parseCSVLine(line: string, delimiter: string): string[] {
  const cols: string[] = [];
  let cur = '';
  let inQuotes = false;
  
  for (let j = 0; j < line.length; j++) {
    const ch = line[j];
    const next = line[j + 1];
    
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cur += '"';
        j++; // skip next quote
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        cols.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
  }
  cols.push(cur);
  return cols;
}
