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

function unescapePdfString(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "\\") {
      const next = s[i + 1];
      if (next === "n") { out += "\n"; i++; continue; }
      if (next === "r") { out += "\r"; i++; continue; }
      if (next === "t") { out += "\t"; i++; continue; }
      if (next === "b") { out += "\b"; i++; continue; }
      if (next === "f") { out += "\f"; i++; continue; }
      if (next === "\\" || next === "(" || next === ")") { out += next; i++; continue; }
      out += next; i++; continue;
    }
    out += ch;
  }
  return out;
}

function extractTextFromPdfRaw(raw: string): string {
  try {
    const parts: string[] = [];
    const tjRe = /\((?:\\.|[^\\])*?\)\s*Tj/gm;
    const tjArrayRe = /\[((?:\s*\((?:\\.|[^\\])*?\)\s*|\s*-?\d+\s*)+)\]\s*TJ/gm;

    let m: RegExpExecArray | null;
    while ((m = tjRe.exec(raw)) !== null) {
      const inner = m[0].replace(/\)\s*Tj$/, "").slice(1);
      parts.push(unescapePdfString(inner));
    }
    while ((m = tjArrayRe.exec(raw)) !== null) {
      const arr = m[1];
      const sub = [...arr.matchAll(/\((?:\\.|[^\\])*?\)/gm)].map(s => unescapePdfString(s[0].slice(1, -1))).join("");
      parts.push(sub);
    }

    const text = parts.join("\n");
    return text;
  } catch (e) {
    console.error('extractTextFromPdfRaw error', e);
    return "";
  }
}

export async function readPdfText(uri: string): Promise<string> {
  try {
    if (Platform.OS === 'web') {
      const res = await fetch(uri);
      const buf = await res.arrayBuffer();
      const raw = new TextDecoder('latin1').decode(new Uint8Array(buf));
      const text = extractTextFromPdfRaw(raw);
      return text;
    } else {
      const FS = await import('expo-file-system');
      const b64 = await FS.readAsStringAsync(uri, { encoding: FS.EncodingType.Base64 });
      const binary = decodeBase64Latin1(b64);
      const text = extractTextFromPdfRaw(binary);
      return text;
    }
  } catch (e) {
    console.error('readPdfText error', e);
    throw e;
  }
}

function decodeBase64Latin1(b64: string): string {
  try {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let output = '';
    let buffer = 0;
    let bits = 0;
    for (let i = 0; i < b64.length; i++) {
      const c = chars.indexOf(b64[i]);
      if (c < 0) continue;
      buffer = (buffer << 6) | c;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        const byte = (buffer >> bits) & 0xff;
        output += String.fromCharCode(byte);
      }
    }
    return output;
  } catch (e) {
    console.error('decodeBase64Latin1 error', e);
    return '';
  }
}

export function parseBankPdfTextToTransactions(text: string): ParsedTxn[] {
  try {
    const lines = text.split(/\r?\n+/).map(l => l.trim()).filter(l => l.length > 0);
    const out: ParsedTxn[] = [];
    const dateRe = /(\d{1,2}[\.\/-]\d{1,2}[\.\/-]\d{2,4})/;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!dateRe.test(line)) continue;
      const dateStr = (line.match(dateRe)?.[1]) ?? '';
      const date = parseDateFlexible(dateStr) ?? null;
      const amtMatch = line.match(/([+-]?\s?\d{1,3}(?:[\s\u00A0]?\d{3})*(?:[\.,]\d{1,2})?)\s?(Kč|CZK|EUR|USD)?/i);
      const amtNum = toNum(amtMatch?.[1] ?? '');
      if (!date || amtNum == null) continue;
      const title = line.replace(dateRe, '').replace(amtMatch?.[0] ?? '', '').replace(/\s{2,}/g, ' ').trim() || 'Transakce';
      const type: 'income' | 'expense' = (amtNum ?? 0) < 0 ? 'expense' : 'income';
      const amount = Math.abs(amtNum ?? 0);
      const category = guessCategory(title.toLowerCase(), type);
      out.push({ type, amount, title, category, date });
    }
    return out;
  } catch (e) {
    console.error('parseBankPdfTextToTransactions error', e);
    return [];
  }
}
