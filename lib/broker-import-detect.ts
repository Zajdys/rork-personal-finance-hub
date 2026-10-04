import * as XLSX from 'xlsx';
import { readXlsxWorkbook } from '@/lib/xlsx-read';

export type BrokerXlsxFormat = 'etoro' | 'xtb' | null;

const XTB_CASH_SHEET_RE = /cash\s*operations?/i;
const XTB_OPEN_POSITION_SHEET_RE = /^open\s+positions?/i;
const XTB_CLOSED_POSITION_SHEET_RE = /^closed\s+positions?/i;
const ETORO_SHEET_RE = /aktivita|account/i;

function sheetHasCashOperationHeaders(sheet: XLSX.WorkSheet): boolean {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' }) as unknown[][];
  for (const row of rows.slice(0, 40)) {
    if (!Array.isArray(row)) continue;
    const cells = row.map((c) => String(c ?? '').trim().toUpperCase());
    if (cells.includes('ID') && cells.includes('TYPE') && cells.includes('AMOUNT')) {
      return true;
    }
  }
  return false;
}

function sheetHasEtoroActivityHeaders(sheet: XLSX.WorkSheet): boolean {
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    range: 0,
  });
  const first = rows[0];
  if (!first) return false;
  const keys = Object.keys(first).map((k) => k.trim().toLowerCase());
  return (
    keys.some((k) => k.includes('napište') || k === 'type') &&
    keys.some((k) => k.includes('podrobnosti') || k.includes('details')) &&
    keys.some((k) => k.includes('datum') || k === 'date')
  );
}

/** Detekce brokera z XLSX workbooku (list nebo hlavičky sloupců). */
export function detectBrokerFromXlsxWorkbook(workbook: XLSX.WorkBook): BrokerXlsxFormat {
  for (const name of workbook.SheetNames) {
    if (
      XTB_CASH_SHEET_RE.test(name) ||
      XTB_OPEN_POSITION_SHEET_RE.test(name.trim()) ||
      XTB_CLOSED_POSITION_SHEET_RE.test(name.trim())
    ) {
      return 'xtb';
    }
  }
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (sheet && sheetHasCashOperationHeaders(sheet)) return 'xtb';
  }
  for (const name of workbook.SheetNames) {
    if (ETORO_SHEET_RE.test(name)) return 'etoro';
  }
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (sheet && sheetHasEtoroActivityHeaders(sheet)) return 'etoro';
  }
  return null;
}

export function detectBrokerFromXlsxBytes(fileContent: string | ArrayBuffer): BrokerXlsxFormat {
  return detectBrokerFromXlsxWorkbook(readXlsxWorkbook(fileContent));
}
