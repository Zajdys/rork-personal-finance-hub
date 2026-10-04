/**
 * Czech bank CSV parsing: detection, amounts, dates, UTF-8 + Windows-1250.
 */
import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import Papa from 'papaparse';
import { toYyyyMmDd } from '@/lib/transaction-date';
import { normalizeOwnerAccountList } from '@/lib/owner-account-match';
import { normalizeAccount, isOwnCounterpartyAccount } from '@/utils/normalizeAccount';

type CsvParseMeta = { fields?: string[] };
type CsvParseErrorRow = { type?: string; message?: string; code?: string };
type CsvParseResult = {
  data: Record<string, string>[];
  meta: CsvParseMeta;
  errors: CsvParseErrorRow[];
};

/** Keyword buckets → mapped to finance-store category names */
export type ImportBucket =
  | 'Jídlo'
  | 'Auto/Benzín'
  | 'Restaurace'
  | 'Bydlení'
  | 'Sport'
  | 'Zdraví'
  | 'Investice'
  | 'Předplatné'
  | 'Převod'
  | 'Ostatní';

export const BUCKET_TO_EXPENSE_CATEGORY: Record<ImportBucket, string> = {
  Jídlo: 'Jídlo a nápoje',
  'Auto/Benzín': 'Doprava',
  Restaurace: 'Jídlo a nápoje',
  Bydlení: 'Bydlení',
  Sport: 'Sport a zdraví',
  Zdraví: 'Zdraví',
  Investice: 'Investice',
  Předplatné: 'Předplatné',
  Převod: 'Převod',
  Ostatní: 'Ostatní',
};

export const DEFAULT_INCOME_CATEGORY = 'Ostatní';

const KEYWORD_RULES: { bucket: ImportBucket; patterns: RegExp[] }[] = [
  {
    bucket: 'Předplatné',
    patterns: [
      new RegExp(
        'youtube|spotify|netflix|apple.*music|apple.*tv|disney|hbo|dazn|amazon.*prime|prime.*video|twitch|adobe|microsoft.*365|office.*365|dropbox|google.*one|icloud|tidal|deezer|crunchyroll|pandora|peacock|paramount|apple\\.com/bill|applepay.*apple|google\\*|apple\\*',
        'i',
      ),
    ],
  },
  {
    bucket: 'Investice',
    patterns: [
      /trading|xtb|anycoin|etoro|degiro|revolut|coinbase|binance|bitpanda|portu|fondee|broker|invest/i,
    ],
  },
  {
    bucket: 'Jídlo',
    patterns: [
      /\balbert\b/i,
      /\blidl\b/i,
      /\bkaufland\b/i,
      /\bbilla\b/i,
      /\btesco\b/i,
      /\bpenny\b/i,
      /\bglobus\b/i,
      /\brohlik\b/i,
      /\brohl[íi]k\b/i,
      /\bkosik\b/i,
      /\bkošík\b/i,
      /\bmakro\b/i,
      /\bcba\b/i,
      /\bnorma\b/i,
      /\bzelenina\b/i,
      /\bpek[áa]rna\b/i,
      /\bpotraviny\b/i,
      /\bcoop\b/i,
      /\bjednota\b/i,
      /\bhru[sš]ka\b/i,
      /\bfresh\b/i,
      /\bgrocery\b/i,
      /\bspar\b/i,
      /\baldi\b/i,
      /\bkraj\b/i,
      /\bve[čc]erka\b/i,
      /\bovoce\b/i,
      /\bml[ée]k[áa]rna\b/i,
      /\b[řr]eznictv[íi]\b/i,
    ],
  },
  {
    bucket: 'Restaurace',
    patterns: [
      /\bmc ?donald/i,
      /\bkfc\b/i,
      /\bburger\s*king\b/i,
      /\bburger\b/i,
      /\bpizza\b/i,
      /\bpizzeria\b/i,
      /\bpiazza\b/i,
      /\bstarbucks\b/i,
      /\bcafe\b/i,
      /\bkav[áa]rna\b/i,
      /\bkavárna\b/i,
      /\bsushi\b/i,
      /\bkebab\b/i,
      /\bsubway\b/i,
      /\bdominos\b/i,
      /\bpizza\s*hut\b/i,
      /\bpapa\s*johns\b/i,
      /\bwolt\b/i,
      /\bbolt\s*food\b/i,
      /\bd[áa]me\s+j[íi]dlo\b/i,
      /\bjust\s*eat\b/i,
      /\bfoodora\b/i,
      /\brud\b/i,
      /\bbistro\b/i,
      /\bsnack\b/i,
      /\bbufet\b/i,
    ],
  },
  {
    bucket: 'Auto/Benzín',
    patterns: [
      /\bshell\b/i,
      /\bomv\b/i,
      /\bbenziina\b/i,
      /\beurooil\b/i,
      /\bmol\b/i,
      /\bčerpac/i,
      /\bparkov[áa]n[íi]\b/i,
      /\bparking\b/i,
      /\bparkovi[sš]t[ěe]\b/i,
      /\bd[áa]ln[ií][cč]n[íi]\b/i,
      /\btoll\b/i,
      /\bmyt[íi]\s+auta\b/i,
      /\bpneu\b/i,
      /\bautoservis\b/i,
      /\barriva\b/i,
      /\bstudent\s+agency\b/i,
      /\bflixbus\b/i,
      /\bregiojet\b/i,
      /cd\.cz/i,
      /\b[čc]esk[ée]\s+dr[áa]hy\b/i,
      /\bidos\b/i,
      /\bautobus\b/i,
      /\bbus\b/i,
      /\btrain\b/i,
      /\bvlak\b/i,
      /\bdp\s+praha\b/i,
      /\bdpmo\b/i,
      /\bdpmb\b/i,
      /\bmhd\b/i,
      /\btaxi\b/i,
      /\bbolt\b/i,
      /\buber\b/i,
      /\bliftago\b/i,
      /\bpmdp\b/i,
      /\bdpp\b/i,
      /\bdpb\b/i,
      /\bflixbus\b/i,
      /\bregiojet\b/i,
      /\b[čc]esk[ée]\s+dr[áa]hy\b/i,
      /cd\.cz/i,
    ],
  },
  {
    bucket: 'Bydlení',
    patterns: [
      /\bn[áa]jem\b/i,
      /\belekt[řr]ina\b/i,
      /\bplyn\b/i,
      /\bvoda\b/i,
      /\binternet\b/i,
      /\bpoji[sš]t[ěe]n[íi]\b/i,
      /\bikea\b/i,
      /\bbaumax\b/i,
      /\bobi\b/i,
      /\bhornbach\b/i,
      /\bdatart\b/i,
      /\balza\b/i,
    ],
  },
  {
    bucket: 'Sport',
    patterns: [
      /\bbaz[ée]n\b/i,
      /\baquapark\b/i,
      /\bplav[áa]n[íi]\b/i,
      /\bswim\b/i,
      /\bfitness\b/i,
      /\bfitko\b/i,
      /\bgym\b/i,
      /\bsport\b/i,
      /\bsquash\b/i,
      /\btenis\b/i,
      /\bfotbal\b/i,
      /\bhockey\b/i,
      /\bhokej\b/i,
      /\brunning\b/i,
      /\bcyklo\b/i,
      /\bspinning\b/i,
      /\byoga\b/i,
      /\bpilates\b/i,
      /\bcrossfit\b/i,
    ],
  },
  {
    bucket: 'Zdraví',
    patterns: [
      /\bl[ée]k[áa]rna\b/i,
      /\bdoktor\b/i,
      /\bnemocnice\b/i,
      /\bpharmacy\b/i,
      /\boptika\b/i,
      /\bo[čc]n[íi]\b/i,
      /\bzuba[rř]\b/i,
      /\bfyzio\b/i,
    ],
  },
];

export interface BankFormat {
  id: string;
  label: string;
  dateCol: string;
  amountCol: string;
  descCol: string;
}

export const BANK_FORMATS: BankFormat[] = [
  { id: 'fio', label: 'Fio banka', dateCol: 'Datum', amountCol: 'Objem', descCol: 'Zpráva pro příjemce' },
  { id: 'csob', label: 'ČSOB', dateCol: 'Datum pohybu', amountCol: 'Částka', descCol: 'Popis' },
  { id: 'cs', label: 'Česká spořitelna', dateCol: 'Datum', amountCol: 'Částka', descCol: 'Poznámka' },
  { id: 'kb', label: 'Komerční banka', dateCol: 'Datum splatnosti', amountCol: 'Částka', descCol: 'Popis transakce' },
  { id: 'rb', label: 'Raiffeisenbank', dateCol: 'Datum', amountCol: 'Množství', descCol: 'Popis' },
  { id: 'moneta', label: 'MONETA Money Bank', dateCol: 'Datum', amountCol: 'Částka', descCol: 'Popis' },
  { id: 'mbank', label: 'mBank', dateCol: '#Datum zaúčtování transakce', amountCol: '#Částka transakce', descCol: '#Popis transakce' },
  { id: 'revolut', label: 'Revolut', dateCol: 'Completed Date', amountCol: 'Amount', descCol: 'Description' },
];

/** CP1250 bytes 0x80–0xFF → single Unicode chars (subset used in Czech/Polish CSV) */
const CP1250_EXTRA: Record<number, string> = {
  0x80: '\u20AC',
  0x82: '\u201A',
  0x83: '\u0192',
  0x84: '\u201E',
  0x85: '\u2026',
  0x86: '\u2020',
  0x87: '\u2021',
  0x88: '\u02C6',
  0x89: '\u2030',
  0x8a: '\u0160',
  0x8b: '\u2039',
  0x8c: '\u015A',
  0x8d: '\u0164',
  0x8e: '\u017D',
  0x8f: '\u0179',
  0x90: '\u2018',
  0x91: '\u2019',
  0x92: '\u201C',
  0x93: '\u201D',
  0x94: '\u2022',
  0x95: '\u2013',
  0x96: '\u2014',
  0x97: '\u02DC',
  0x98: '\u2122',
  0x99: '\u0161',
  0x9a: '\u203A',
  0x9b: '\u015B',
  0x9c: '\u0165',
  0x9d: '\u017E',
  0x9e: '\u017A',
  0x9f: '\u017A',
  0xa0: '\u00A0',
  0xa1: '\u02C7',
  0xa2: '\u02D8',
  0xa3: '\u0141',
  0xa4: '\u00A4',
  0xa5: '\u0104',
  0xa6: '\u00A6',
  0xa7: '\u00A7',
  0xa8: '\u00A8',
  0xa9: '\u00A9',
  0xaa: '\u015E',
  0xab: '\u00AB',
  0xac: '\u00AC',
  0xad: '\u00AD',
  0xae: '\u00AE',
  0xaf: '\u017B',
  0xb0: '\u00B0',
  0xb1: '\u00B1',
  0xb2: '\u02DB',
  0xb3: '\u0142',
  0xb4: '\u00B4',
  0xb5: '\u00B5',
  0xb6: '\u00B6',
  0xb7: '\u00B7',
  0xb8: '\u00B8',
  0xb9: '\u0105',
  0xba: '\u015F',
  0xbb: '\u00BB',
  0xbc: '\u013D',
  0xbd: '\u02DD',
  0xbe: '\u013E',
  0xbf: '\u017C',
  0xc0: '\u0154',
  0xc1: '\u00C1',
  0xc2: '\u00C2',
  0xc3: '\u0102',
  0xc4: '\u00C4',
  0xc5: '\u0139',
  0xc6: '\u0106',
  0xc7: '\u00C7',
  0xc8: '\u010C',
  0xc9: '\u00C9',
  0xca: '\u0118',
  0xcb: '\u00CB',
  0xcc: '\u011A',
  0xcd: '\u00CD',
  0xce: '\u00CE',
  0xcf: '\u010E',
  0xd0: '\u0110',
  0xd1: '\u0143',
  0xd2: '\u0147',
  0xd3: '\u00D3',
  0xd4: '\u00D4',
  0xd5: '\u0150',
  0xd6: '\u00D6',
  0xd7: '\u00D7',
  0xd8: '\u0158',
  0xd9: '\u016E',
  0xda: '\u00DA',
  0xdb: '\u0170',
  0xdc: '\u00DC',
  0xdd: '\u00DD',
  0xde: '\u0162',
  0xdf: '\u00DF',
  0xe0: '\u0155',
  0xe1: '\u00E1',
  0xe2: '\u00E2',
  0xe3: '\u0103',
  0xe4: '\u00E4',
  0xe5: '\u013A',
  0xe6: '\u0107',
  0xe7: '\u00E7',
  0xe8: '\u010D',
  0xe9: '\u00E9',
  0xea: '\u0119',
  0xeb: '\u00EB',
  0xec: '\u011B',
  0xed: '\u00ED',
  0xee: '\u00EE',
  0xef: '\u010F',
  0xf0: '\u0111',
  0xf1: '\u0144',
  0xf2: '\u0148',
  0xf3: '\u00F3',
  0xf4: '\u00F4',
  0xf5: '\u0151',
  0xf6: '\u00F6',
  0xf7: '\u00F7',
  0xf8: '\u0159',
  0xf9: '\u016F',
  0xfa: '\u00FA',
  0xfb: '\u0171',
  0xfc: '\u00FC',
  0xfd: '\u00FD',
  0xfe: '\u0163',
  0xff: '\u02D9',
};

function decodeWindows1250(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b < 0x80) {
      out += String.fromCharCode(b);
    } else {
      out += CP1250_EXTRA[b] ?? String.fromCharCode(b);
    }
  }
  return out;
}

/** Decode base64 to bytes (Expo / RN). */
function atobToBytes(b64: string): Uint8Array {
  if (typeof atob === 'function') {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Buffer } = require('buffer');
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

export async function readCsvTextFromUri(uri: string): Promise<string> {
  const b64 = await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
  const bytes = atobToBytes(b64);
  return decodeCsvBytes(bytes);
}

/** UTF-8 vs Windows-1250 — vybere dekódování podle shody s bankovními hlavičkami. */
export function decodeCsvBytes(bytes: Uint8Array): string {
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  const win1250 = decodeWindows1250(bytes);

  const score = (text: string) => scoreBankHeaderMatch(text);
  const sUtf = score(utf8);
  const s1250 = score(win1250);

  if (s1250 > sUtf + 1) return win1250;
  if (sUtf > 0) return utf8;
  if (s1250 > 0) return win1250;
  return utf8.includes('\ufffd') && !win1250.includes('\ufffd') ? win1250 : utf8;
}

function scoreBankHeaderMatch(text: string): number {
  const first = text.split(/\r?\n/).slice(0, 40).join('\n');
  let best = 0;
  // mBank CZ — ASCII markery + bonus za správnou diakritiku (odliší CP1250 od rozbitého UTF-8)
  if (/mBank\s+S\.A\./i.test(first) || /mLinka\s*:/i.test(first) || /www\.mBank\.cz/i.test(first)) {
    best = Math.max(best, 2);
    if (
      /VÝPIS\s+Z\s+ÚČTU/i.test(first) ||
      /zaúčtování/i.test(first) ||
      /organizační/i.test(first) ||
      /#Počáteční zůstatek/i.test(first)
    ) {
      best = Math.max(best, 5);
    }
  }
  if (first.includes('#Datum zaúčtování transakce')) {
    best = Math.max(best, 5);
  }
  for (const b of BANK_FORMATS) {
    const has =
      (first.includes(b.dateCol) ? 1 : 0) +
      (first.includes(b.amountCol) ? 1 : 0) +
      (first.includes(b.descCol) ? 1 : 0);
    if (has > best) best = has;
  }
  return best;
}

export function detectBankFormat(headers: string[]): BankFormat | null {
  const norm = (h: string) =>
    h
      .replace(/^\uFEFF/, '')
      .trim()
      .replace(/^["']|["']$/g, '');
  const set = new Set(headers.map(norm));
  for (const b of BANK_FORMATS) {
    if (set.has(b.dateCol) && set.has(b.amountCol) && set.has(b.descCol)) {
      return b;
    }
  }
  return null;
}

export function parseAmount(raw: string): number {
  let s = String(raw ?? '')
    .trim()
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, '');
  s = s.replace(/[^\d,.+-]/g, '');
  if (!s || s === '+' || s === '-') return 0;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (lastComma >= 0) {
    const parts = s.split(',');
    if (parts.length === 2 && parts[1].length <= 2) {
      s = parts[0].replace(/[^\d+-]/g, '') + '.' + parts[1];
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (lastDot >= 0) {
    const parts = s.split('.');
    if (parts.length === 2 && parts[1].length <= 2) {
      s = parts.join('.');
    } else {
      s = s.replace(/\./g, '');
    }
  }

  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

export function parseTransactionDate(raw: string): Date | null {
  const t = String(raw ?? '').trim();
  if (!t) return null;

  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]);

  const dmy = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (dmy) return new Date(+dmy[3], +dmy[2] - 1, +dmy[1]);

  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function classifyDescription(description: string): ImportBucket {
  const desc = description || '';
  for (const { bucket, patterns } of KEYWORD_RULES) {
    for (const re of patterns) {
      if (re.test(desc)) return bucket;
    }
  }
  return 'Ostatní';
}

export function bucketToStoreCategory(bucket: ImportBucket, type: 'income' | 'expense'): string {
  if (bucket === 'Převod') return 'Převod';
  if (bucket === 'Předplatné') return 'Předplatné';
  if (type === 'income') return DEFAULT_INCOME_CATEGORY;
  return BUCKET_TO_EXPENSE_CATEGORY[bucket];
}

export interface ParsedImportRow {
  /** YYYY-MM-DD — datum zaúčtování (pro měsíční součty) */
  date: string;
  /**
   * YYYY-MM-DD — datum valuty (value date), pokud výpis rozlišuje.
   * Mapuje se na DB sloupec `booking_date`.
   */
  bookingDate?: string | null;
  rawAmount: number;
  description: string;
  type: 'income' | 'expense';
  amount: number;
  bucket: ImportBucket;
  category: string;
  /** Zdroj pro `Transaction.source` (raiffeisenbank, csob, kb, …) — doplní import */
  source?: string;
  /**
   * Bankovní identifikátor pohybu (RB/KB „Kód transakce“, …).
   * Použije se pro stabilní `unique_key` / `external_id`.
   */
  bankTransactionId?: string;
  /** Číslo protiúčtu (pro návrh vlastních účtů) — pokud parser zná */
  counterpartyAccount?: string;
  /** Jméno protiúčtu / majitele protiúčtu */
  counterpartyName?: string;
  /** Kartová vratka — type income, v reportech snižuje výdaje kategorie */
  isRefund?: boolean;
  /** Odkud kategorie pochází (po classify / ruční úpravě) */
  categorySource?: 'user' | 'crowd' | 'dictionary' | 'keyword' | 'transfer' | 'import';
  /**
   * Cizí měna: původní částka + ISO kód.
   * Při ukládání se `amount` přepočte kurzem ČNB na CZK.
   */
  originalAmount?: number | null;
  originalCurrency?: string | null;
  exchangeRate?: number | null;
}

export interface ParseBankStatementResult {
  bank: BankFormat;
  rows: ParsedImportRow[];
}

export interface ParseBankStatementError {
  error: string;
}

export function parseBankStatementCsv(
  text: string,
  ownerAccounts: string[] = [],
  ownerNames?: string | string[] | null,
): ParseBankStatementResult | ParseBankStatementError {
  // Revolut EN CSV — přesná hlavička Type,Product,…
  if (
    text
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)[0]
      ?.trim() ===
    'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance'
  ) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { parseRevolutCsv } = require('@/lib/revolut-csv-parse') as typeof import('@/lib/revolut-csv-parse');
    return parseRevolutCsv(text, ownerAccounts, ownerNames);
  }

  // mBank CZ — speciální layout (hlavička + středník); lazy import kvůli cyklické závislosti
  if (
    /mBank\s+S\.A\./i.test(text.slice(0, 8_000)) ||
    /mLinka\s*:/i.test(text.slice(0, 8_000)) ||
    /VÝPIS\s+Z\s+ÚČTU\s+ZA\s+ZVOLENÉ\s+OBDOBÍ/i.test(text.slice(0, 8_000)) ||
    text.includes('#Datum zaúčtování transakce')
  ) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { parseMbankCzCsv } = require('@/lib/mbank-csv-parse') as typeof import('@/lib/mbank-csv-parse');
    return parseMbankCzCsv(text, ownerAccounts);
  }

  const parsed = Papa.parse(text, {
    header: true,
    skipEmptyLines: 'greedy',
    delimiter: '',
    delimitersToGuess: [';', ',', '\t'],
    transformHeader: (h: string) => h.replace(/^\uFEFF/, '').trim(),
  }) as CsvParseResult;

  if (parsed.errors?.length) {
    const fatal = parsed.errors.find((e) => e.type === 'Quotes' || e.type === 'Delimiter');
    if (fatal) {
      return { error: fatal.message || 'Chyba při čtení CSV.' };
    }
  }

  const fields = parsed.meta.fields?.filter(Boolean) as string[] | undefined;
  if (!fields?.length) {
    return { error: 'Soubor neobsahuje hlavičku CSV.' };
  }

  const bank = detectBankFormat(fields);
  if (!bank) {
    return {
      error:
        'Nepodařilo se rozpoznat banku. Zkontroluj, že export obsahuje sloupce podle Fio, ČSOB, ČS, KB, Raiffeisen, Moneta, mBank nebo Revolut.',
    };
  }

  const ownerNorm = normalizeOwnerAccountList(ownerAccounts);
  const rows: ParsedImportRow[] = [];
  const data = parsed.data || [];

  for (const rec of data) {
    const dateRaw = rec[bank.dateCol]?.trim() ?? '';
    const amountRaw = rec[bank.amountCol] ?? '';
    const descRaw = rec[bank.descCol]?.trim() ?? '';

    if (!dateRaw && !amountRaw && !descRaw) continue;

    const d = parseTransactionDate(dateRaw);
    if (!d) continue;

    const rawAmount = parseAmount(amountRaw);
    if (rawAmount === 0 && !descRaw) continue;

    const type: 'income' | 'expense' = rawAmount >= 0 ? 'income' : 'expense';
    const amount = Math.abs(rawAmount);

    // Protiúčet z textu (pokud CSV nemá samostatný sloupec) — jen číslo účtu.
    const accMatch = descRaw.match(/\b(\d{1,6}-)?\d{2,10}\/\d{4}\b/);
    const counterpartyAccount = normalizeAccount(accMatch?.[0] ?? null) ?? undefined;
    const isOwnTransfer = isOwnCounterpartyAccount(counterpartyAccount, ownerNorm);
    const bucket: ImportBucket = isOwnTransfer ? 'Převod' : classifyDescription(descRaw);
    const category = bucketToStoreCategory(bucket, type);

    rows.push({
      date: toYyyyMmDd(d),
      rawAmount,
      description: descRaw || 'Bez popisu',
      type,
      amount,
      bucket,
      category,
      ...(counterpartyAccount ? { counterpartyAccount } : {}),
    });
  }

  if (rows.length === 0) {
    return { error: 'V souboru nebyly nalezeny žádné platné transakce.' };
  }

  return { bank, rows };
}
