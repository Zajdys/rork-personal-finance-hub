import { toNum } from "../../lib/num";
import { Platform } from "react-native";

export type BankCsvRecord = Record<string, string | undefined>;

const DATE_KEYS = ["Date", "Datum", "Posted Date", "Booking Date", "Transaction Date"] as const;
const DESC_KEYS = ["Description", "Popis", "Merchant", "Narrative", "Details"] as const;
const AMOUNT_KEYS = ["Amount", "Částka", "Amount (CZK)", "Transaction Amount"] as const;
const CURRENCY_KEYS = ["Currency", "Měna"] as const;
const CATEGORY_KEYS = ["Category", "Kategorie"] as const;

const EXPENSE_KEYWORDS: Array<[string, string]> = [
  ["lidl|kaufland|tesco|billa|penny|albert|iglou|rohlik", "Jídlo a nápoje"],
  ["ubereats|boltfood|wolt|pizza|kfc|mcdonald|starbucks|coffee", "Jídlo a nápoje"],
  ["nájem|pronajem|rent|hypoteka|mortgage|energie|electric|gas|water|internet|o2|vodafone|tmobile|sazba", "Nájem a bydlení"],
  ["zara|hm|aboutyou|zalando|footshop|nike|adidas|ccc|answear", "Oblečení"],
  ["dp|doprav|mhd|ids|pid|lítačka|litacka|metro|tram|bus|benzina|shell|omv|molu|tank|uber|bolt", "Doprava"],
  ["netflix|spotify|hbomax|disney|steam|xbox|playstation|cinema|kino", "Zábava"],
  ["lekarn|drmax|benu|hospital|clinic|dent|zuba|gym|fitness|decathlon", "Zdraví"],
  ["kurz|course|udemy|coursera|knih|book|school|univerz|isic", "Vzdělání"],
  ["alza|mall|czc|datart|electro|amazon|eshop|e-shop", "Nákupy"],
  ["služba|service|údržba|oprava|cleaning|subscription|subs", "Služby"],
];

const INCOME_KEYWORDS: Array<[string, string]> = [
  ["vyplata|mzda|salary|payroll|hr", "Mzda"],
  ["freelance|invoice|factura|faktura|contract|contractor", "Freelance"],
  ["dividend|úrok|urok|interest|coupon|staking", "Investice"],
  ["dar|gift|present|donation", "Dary"],
];

function normalizeHeader(h: string): string {
  return h.replace(/\uFEFF/g, "").trim();
}

export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let i = 0;
  const len = text.length;
  let field = "";
  let current: string[] = [];
  let inQuotes = false;

  function pushField() {
    current.push(field);
    field = "";
  }
  function pushRow() {
    rows.push([...current]);
  }

  while (i < len) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 2;
        continue;
      }
      if (ch === '"') {
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    if (ch === '"') { inQuotes = true; i++; continue; }

    if (ch === ";" || ch === ",") {
      pushField();
      i++;
      continue;
    }

    if (ch === "\n") {
      pushField();
      pushRow();
      current = [];
      i++;
      continue;
    }

    if (ch === "\r") { i++; continue; }

    field += ch;
    i++;
  }
  if (field.length || current.length) {
    pushField();
    pushRow();
  }

  return rows.filter(r => r.some(c => c && c.trim().length));
}

function toRecords(rows: string[][]): BankCsvRecord[] {
  if (!rows.length) return [];
  const headers = rows[0].map(normalizeHeader);
  const out: BankCsvRecord[] = [];
  for (let ri = 1; ri < rows.length; ri++) {
    const row = rows[ri];
    const rec: BankCsvRecord = {};
    for (let ci = 0; ci < headers.length; ci++) {
      rec[headers[ci]] = (row[ci] ?? "").trim();
    }
    out.push(rec);
  }
  return out;
}

function pick(r: BankCsvRecord, keys: readonly string[]): string | undefined {
  for (const k of keys) {
    if (r[k] != null && String(r[k]).trim() !== "") return r[k];
  }
  return undefined;
}

function parseDateFlexible(raw: string | undefined): Date | null {
  if (!raw) return null;
  const s = raw.trim();
  const iso = Date.parse(s);
  if (!Number.isNaN(iso)) return new Date(iso);

  const m = s.match(/^(\d{1,2})[\.\/\-](\d{1,2})[\.\/\-](\d{2,4})/);
  if (m) {
    const d = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10) - 1;
    const y = parseInt(m[3].length === 2 ? (Number(m[3]) + 2000).toString() : m[3], 10);
    const dt = new Date(y, mo, d);
    return isNaN(dt.getTime()) ? null : dt;
  }
  return null;
}

export type ParsedTxn = {
  type: 'income' | 'expense';
  amount: number;
  title: string;
  category: string;
  date: Date;
};

function guessCategory(titleLower: string, type: 'income' | 'expense'): string {
  const list = type === 'expense' ? EXPENSE_KEYWORDS : INCOME_KEYWORDS;
  for (const [re, cat] of list) {
    if (new RegExp(re, 'i').test(titleLower)) return cat;
  }
  return type === 'expense' ? 'Ostatní' : 'Ostatní';
}

export function mapBankRecord(r: BankCsvRecord): ParsedTxn | null {
  const dateRaw = pick(r, DATE_KEYS);
  const desc = pick(r, DESC_KEYS) ?? "";
  const amtRaw = pick(r, AMOUNT_KEYS);
  const ccy = pick(r, CURRENCY_KEYS);
  const catRaw = pick(r, CATEGORY_KEYS);

  const amount0 = toNum(amtRaw);
  if (amount0 == null) return null;
  const type: 'income' | 'expense' = amount0 < 0 ? 'expense' : 'income';
  const amount = Math.abs(amount0);
  const date = parseDateFlexible(dateRaw) ?? new Date();
  const title = desc || (ccy ? `Transakce (${ccy})` : 'Transakce');
  const category = (catRaw && catRaw.trim()) || guessCategory(title.toLowerCase(), type);

  return { type, amount, title, category, date };
}

export function parseBankCsvToTransactions(text: string): ParsedTxn[] {
  try {
    const rows = parseCSV(text);
    const recs = toRecords(rows);
    const txns = recs.map(mapBankRecord).filter((x): x is ParsedTxn => !!x);
    return txns;
  } catch (e) {
    console.error('parseBankCsvToTransactions error', e);
    return [];
  }
}

export async function readUriText(uri: string): Promise<string> {
  try {
    if (Platform.OS === 'web') {
      const res = await fetch(uri);
      const txt = await res.text();
      return txt;
    } else {
      const FS = await import('expo-file-system');
      const txt = await FS.readAsStringAsync(uri, { encoding: FS.EncodingType.UTF8 });
      return txt;
    }
  } catch (e) {
    console.error('readUriText error', e);
    throw e;
  }
}
