/**
 * Česká spořitelna (ČS) — Edge Function parser (samostatný modul).
 * Nesdílí parsovací logiku s ČSOB, KB, Raiffeisenbank, Air Bank ani Fio.
 * Držet v sync s lib/cs-pdf-parse.ts
 */

import { normalizeAccount, isOwnCounterpartyAccount } from "./normalize-account.ts";

type ImportBucket =
  | "Jídlo"
  | "Auto/Benzín"
  | "Restaurace"
  | "Bydlení"
  | "Sport"
  | "Zdraví"
  | "Investice"
  | "Předplatné"
  | "Převod"
  | "Ostatní";

export interface CsParsedImportRow {
  date: string;
  bookingDate?: string | null;
  rawAmount: number;
  description: string;
  type: "income" | "expense";
  amount: number;
  bucket: ImportBucket;
  category: string;
  source?: string;
  bankTransactionId?: string;
  counterpartyAccount?: string;
  counterpartyName?: string;
}

export type CsParseDeps = {
  classifyCsob: (desc: string, misto?: string) => ImportBucket;
  bucketToStoreCategory: (bucket: ImportBucket, type: "income" | "expense") => string;
};

export type CsParsedTransaction = {
  date: string;
  bookingDate?: string | null;
  amount: number;
  type: 'income' | 'expense';
  description: string;
  merchant: string;
  txType: string;
  accountNumber: string;
  bankCode: string;
  currency: string;
  rawAmount: number;
  counterpartyName?: string;
  /** Stabilní ID pro deduplikaci (včetně pořadí v rámci dne). */
  bankTransactionId?: string;
};

export type CsStatementBalances = {
  opening: number | null;
  totalIn: number | null;
  totalOut: number | null;
  closing: number | null;
  reservedFunds: number | null;
  availableBalance: number | null;
  periodFrom: string | null;
  periodTo: string | null;
  accountNumber: string | null;
};

const CS_TX_TYPES = [
  'Výběr hotovosti z bankomatu ČS',
  'Výběr hotovosti z bankomatu',
  'Tuzemská odchozí úhrada',
  'Příchozí úhrada',
  'Platba kartou',
  'Trvalý příkaz',
  'Inkaso úvěru',
  'Založení účtu',
  'Ceny za služby',
  'Cena za vedení účtu',
] as const;

const DATE_RE = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
const AMOUNT_TOKEN_RE = /^([+-])\s*(\d{1,3}(?:\s\d{3})*(?:\.\d{2})?|\d+(?:\.\d{2})?)$/;
const AMOUNT_BARE_RE = /^(\d{1,3}(?:\s\d{3})*\.\d{2}|\d+\.\d{2})$/;
const AMOUNT_INLINE_RE = /([+-])\s*(\d{1,3}(?:\s\d{3})*\.\d{2}|\d+\.\d{2})\b/;
const CASTKA_V_KC_RE = /částka\s+v\s+Kč:\s*([+-]?\d{1,3}(?:\s\d{3})*(?:\.\d{2})?|\d+(?:\.\d{2})?)/i;
const D_TRAN_RE = /d\.tran\.(\d{1,2})\.(\d{1,2})\.(\d{4})/i;
/** Zaúčtování karty na řádku s částkou: `176.50 d.zúč. 26.09.2026` */
const D_ZUC_RE = /d\.zúč\.?\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/i;
const ACCOUNT_RE = /\b(\d{1,6}-)?(\d{2,10})\/(\d{4})\b/;
const ACCOUNT_LINE_RE = /^\d{1,6}-\d{2,10}\/\d{4}$|^\d{2,10}\/\d{4}$/;
const MAX_TX_CZK = 5_000_000;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function ymd(day: number, month: number, year: number): string | null {
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** Odstraní mezery tisíců a parsuje CS číslo (tečka = desetinná). */
export function parseCsMoney(raw: string): number | null {
  const cleaned = String(raw)
    .replace(/[−\u2212]/g, '-')
    .replace(/\s/g, '')
    .trim();
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n)) return null;
  return n;
}

export function csPlainTextToLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/** Detekce Česká spořitelna výpisu — po KB/Fio/RB/ČSOB/Air Bank. */
export function isCsPdfText(text: string): boolean {
  const sample = text.slice(0, 25_000);
  if (/GIBACZP[PX]/i.test(sample)) return true;
  if (/Standard\s+účet\s+České\s+spořitelny/i.test(sample)) return true;
  if (/Česká\s+spořitelna/i.test(sample) && /\/0800\b/.test(sample)) return true;
  if (/Ceska\s+sporitelna/i.test(sample) && /\/0800\b/.test(sample)) return true;
  if (/Číslo\s+účtu\/kód\s+banky:/i.test(sample) && /\/0800\b/.test(sample)) return true;
  if (
    /Standard\s+účet/i.test(sample) &&
    /\/0800\b/.test(sample) &&
    /Zaúčtováno|Provedeno|PŘEHLED\s+POHYBŮ/i.test(sample)
  ) {
    return true;
  }
  return false;
}

export function extractCsStatementBalances(text: string): CsStatementBalances {
  const lines = csPlainTextToLines(text);
  const joined = lines.join('\n');

  const pickBalance = (label: RegExp): number | null => {
    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx]!;
      if (!label.test(line)) continue;
      const onLine =
        line.match(AMOUNT_INLINE_RE) ??
        line.match(/([+-]?\d{1,3}(?:\s\d{3})*\.\d{2})/) ??
        line.match(AMOUNT_BARE_RE);
      if (onLine) return parseCsMoney(onLine[0]!);
      for (let k = idx + 1; k < Math.min(idx + 3, lines.length); k++) {
        const next =
          lines[k]!.match(AMOUNT_INLINE_RE) ??
          lines[k]!.match(/^([+-]?\d{1,3}(?:\s\d{3})*\.\d{2})$/) ??
          lines[k]!.match(AMOUNT_BARE_RE);
        if (next) return parseCsMoney(next[0]!);
      }
    }
    const block = joined.match(
      new RegExp(`${label.source}[^\\d+-]{0,40}([+-]?\\d{1,3}(?:\\s\\d{3})*\\.\\d{2})`, 'i'),
    );
    return block ? parseCsMoney(block[1]!) : null;
  };

  const period =
    joined.match(/(\d{1,2}\.\d{1,2}\.\d{4})\s*[-–—]\s*(\d{1,2}\.\d{1,2}\.\d{4})/) ??
    null;

  const accLabel = joined.match(/Číslo\s+účtu\/kód\s+banky:\s*(\d{2,10}\/\d{4})/i);
  const acc = accLabel?.[1] ? accLabel[1].match(ACCOUNT_RE) : joined.match(ACCOUNT_RE);
  const accountNumber = acc
    ? `${acc[1] ?? ''}${acc[2]}/${acc[3]}`
    : null;

  return {
    opening: pickBalance(/Počáteční\s+zůstatek/i),
    totalIn: pickBalance(/Celkem\s+přišlo/i),
    totalOut: pickBalance(/Celkem\s+odešlo/i),
    closing: pickBalance(/Konečný\s+zůstatek/i),
    reservedFunds: pickBalance(/Rezervace\s+prostředků/i),
    availableBalance: pickBalance(/Disponibilní\s+zůstatek/i),
    periodFrom: period?.[1] ?? null,
    periodTo: period?.[2] ?? null,
    accountNumber,
  };
}

function isNoiseLine(line: string): boolean {
  const l = line.trim();
  if (!l) return true;
  if (/\|/.test(l)) return true;
  if (/^Česká\s+spořitelna|^Ceska\s+sporitelna/i.test(l)) return true;
  if (/^GIBACZPP|^GIBACZPX/i.test(l)) return true;
  if (/^Výpis\s+z\s+účtu/i.test(l)) return true;
  if (/^Standard\s+účet/i.test(l)) return true;
  if (/^ZÁKLADNÍ\s+ÚDAJE\s+ÚČTU|^Základní\s+údaje\s+účtu/i.test(l)) return true;
  if (/^PŘEHLED\s+POHYBŮ\s+NA\s+ÚČTU|^Přehled\s+pohybů\s+na\s+účtu/i.test(l)) return true;
  if (
    /^Počáteční\s+zůstatek|^Celkem\s+přišlo|^Celkem\s+odešlo|^Konečný\s+zůstatek|^Rezervace\s+prostředků|^Disponibilní\s+zůstatek/i.test(
      l,
    )
  ) {
    return true;
  }
  if (
    /^Zaúčtováno|^Provedeno|^Položka|^Číslo\s+protiúčtu|^Název\s+protiúčtu|^Variabilní|^Konstantní|^Specifický|^Částka$|^Popis$|^Kurz\s+měny/i.test(
      l,
    )
  ) {
    return true;
  }
  if (/^Částka\s+obratu/i.test(l)) return true;
  // jen „1/3“ / „12/15“ — NE účet 6610060833/0800
  if (/^Strana\s+\d+/i.test(l) || /^strana$/i.test(l) || /^\d{1,2}\/\d{1,2}$/.test(l)) return true;
  if (/^Pokračování\s+na\s+další\s+straně/i.test(l)) return true;
  if (/^Období:/i.test(l)) return true;
  if (/^Číslo\s+účtu\/kód\s+banky:/i.test(l)) return true;
  if (/^Číslo\s+výpisu:|^Majitel\s+účtu:|^Měna\s+účtu:/i.test(l)) return true;
  if (/^Pro\s+úhrady\s+v\s+cizí|^Číslo\s+účtu\s*\(IBAN\)|^Kód\s+banky\s*\(BIC\)/i.test(l))
    return true;
  if (/^SBV|^M\|EL\|/i.test(l)) return true;
  if (/^SLUŽBY\s+K\s+ÚČTU/i.test(l)) return true;
  if (/^zapsaná\s+v\s+obchodním/i.test(l)) return true;
  return false;
}

function isTrailingClosingBalanceLine(line: string, pastMovementsHeader: boolean): boolean {
  if (!pastMovementsHeader) return false;
  return /^Konečný\s+zůstatek/i.test(line.trim());
}

function matchTxType(line: string): string | null {
  const t = line.trim();
  if (/^Inkaso$/i.test(t) || /^Inkaso\s+úvěru\b/i.test(t)) return 'Inkaso úvěru';
  for (const type of CS_TX_TYPES) {
    if (t === type || t.startsWith(type)) return type;
  }
  if (/Tuzemská\s+odchozí\s+úhrada/i.test(t)) return 'Tuzemská odchozí úhrada';
  if (/Výběr\s+hotovosti\s+z\s+bankomatu/i.test(t)) return 'Výběr hotovosti z bankomatu ČS';
  if (/^Založení\s+účtu/i.test(t)) return 'Založení účtu';
  return null;
}

function isCzechAccountLine(line: string): boolean {
  const t = line.trim();
  return ACCOUNT_LINE_RE.test(t) || ACCOUNT_RE.test(t);
}

function isSymbolOrVsLine(line: string): boolean {
  const t = line.trim();
  return (
    /^VS\s*:?\s*\d+/i.test(t) ||
    /^KS\s*:?\s*\d+/i.test(t) ||
    /^SS\s*:?\s*\d+/i.test(t) ||
    /^\d{1,10}\s*\/\s*\d{0,10}\s*\/\s*\d{0,10}$/.test(t) ||
    /^\d{1,10}$/.test(t)
  );
}

/**
 * Částka ze sloupce Částka — celý řádek, signed amount, nebo holé `0.00` / `176.50`.
 */
function parseAmountToken(line: string): number | null {
  const t = line.trim();
  const whole = t.match(AMOUNT_TOKEN_RE);
  if (whole) {
    const sign = whole[1] === '-' ? -1 : 1;
    const n = parseCsMoney(whole[2]!);
    return n == null ? null : sign * Math.abs(n);
  }
  const bare = t.match(AMOUNT_BARE_RE);
  if (bare) {
    const n = parseCsMoney(bare[1]!);
    return n == null ? null : n;
  }
  const end = t.match(/([+-])\s*(\d{1,3}(?:\s\d{3})*\.\d{2}|\d+\.\d{2})\s*$/);
  if (end) {
    const sign = end[1] === '-' ? -1 : 1;
    const n = parseCsMoney(end[2]!);
    return n == null ? null : sign * Math.abs(n);
  }
  return null;
}

function findTxTypeInBlock(lines: string[]): string | null {
  for (let i = 0; i < lines.length; i++) {
    const t = matchTxType(lines[i]!);
    if (t) return t;
    const joined = `${lines[i]!.trim()} ${lines[i + 1]?.trim() ?? ''}`.replace(/\s+/g, ' ');
    if (/^Inkaso\s+úvěru\b/i.test(joined)) return 'Inkaso úvěru';
  }
  return null;
}

function extractAccountFromLines(lines: string[]): { accountNumber: string; bankCode: string } {
  for (const line of lines) {
    // Ignoruj vlastní účet z hlavičky opakované v patičce stránky
    if (/Číslo\s+účtu\/kód\s+banky:/i.test(line)) continue;
    const m = line.match(ACCOUNT_RE);
    if (m) {
      return {
        accountNumber: `${m[1] ?? ''}${m[2]}`,
        bankCode: m[3]!,
      };
    }
  }
  return { accountNumber: '', bankCode: '' };
}

function extractCastkaVKc(lines: string[]): number | null {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const m = line.match(CASTKA_V_KC_RE);
    if (m) {
      const n = parseCsMoney(m[1]!);
      if (n != null) return Math.abs(n);
    }
    if (/^částka\s+v\s+Kč:\s*$/i.test(line) || /^částka\s+v\s+Kč:$/i.test(line)) {
      const next = lines[i + 1] ? parseAmountToken(lines[i + 1]!) : null;
      if (next != null) return Math.abs(next);
    }
  }
  return null;
}

function extractDTranDate(lines: string[]): string | null {
  for (const line of lines) {
    const m = line.match(D_TRAN_RE);
    if (m) return ymd(Number(m[1]), Number(m[2]), Number(m[3]));
  }
  return null;
}

function extractDZucDate(lines: string[]): string | null {
  for (const line of lines) {
    const m = line.match(D_ZUC_RE);
    if (m) return ymd(Number(m[1]), Number(m[2]), Number(m[3]));
  }
  return null;
}

/** `CZ PLZEN ALBERT…` / `CZ Plzen 1 Bistro…` → merchant za městem. */
const CZ_CITY_MERCHANT_RE =
  /^CZ\s+([A-Za-zÁ-ž][A-Za-zÁ-ž.\-]*(?:\s+\d+)?)\s+(.+)$/i;
const CZ_CITY_ONLY_RE = /^CZ\s+([A-Za-zÁ-ž][A-Za-zÁ-ž.\-]*(?:\s+\d+)?)$/i;

function cleanCardMerchant(raw: string): string {
  return raw
    .replace(/\s+CZK\b.*$/i, '')
    .replace(/\s+d\.zúč\..*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function merchantFromCzLine(line: string): string | null {
  const t = line.trim();
  const withMerchant = t.match(CZ_CITY_MERCHANT_RE);
  if (withMerchant) {
    const merchant = cleanCardMerchant(withMerchant[2]!);
    return merchant.length >= 2 ? merchant : null;
  }
  return null;
}

function extractMerchantForCard(lines: string[]): string {
  let seenCity = false;

  // 1) Stejný řádek: "… d.tran.… CZ PLZEN ALBERT VAM DEK" nebo "CZ PLZEN ALBERT…"
  for (const line of lines) {
    const t = line.trim();
    const fromCz = merchantFromCzLine(t);
    if (fromCz) return fromCz;
    const afterTran = t.match(
      /d\.tran\.\d{1,2}\.\d{1,2}\.\d{4}\s+(.+)$/i,
    );
    if (afterTran) {
      const fromTail = merchantFromCzLine(afterTran[1]!.trim()) ??
        merchantFromCzLine(`CZ ${afterTran[1]!.trim()}`);
      if (fromTail) return fromTail;
    }
  }

  // 2) pdfjs split: "CZ PLZEN" / další řádek "ALBERT VAM DEK"
  for (const line of lines) {
    const t = line.trim();
    if (DATE_RE.test(t)) continue;
    if (matchTxType(t)) continue;
    if (AMOUNT_TOKEN_RE.test(t) || parseAmountToken(t) != null) continue;
    if (/^XXXXXXXXXXXX\d{4}/i.test(t) || /^\d{6}\*{2,}\d{4}$/.test(t) || /^X{8,}\d{4}/i.test(t)) {
      // celý řádek je karta+d.tran(+město+merchant) — merchant už řeší krok 1
      continue;
    }
    if (D_TRAN_RE.test(t) && !CZ_CITY_MERCHANT_RE.test(t)) continue;
    if (/d\.zúč/i.test(t)) continue;
    if (CASTKA_V_KC_RE.test(t) || /^částka\s+v\s+Kč/i.test(t)) continue;
    if (/^Číslo\s+instrukce:/i.test(t)) continue;
    if (/^VS:|^KS:|^SS:/i.test(t)) continue;
    if (/^CZK$/i.test(t) || (/^CZK\s+/i.test(t) && /d\.zúč/i.test(t))) continue;
    if (/^\d{8}$/.test(t)) continue;
    if (isNoiseLine(t)) continue;
    if (CZ_CITY_ONLY_RE.test(t) || (/^CZ\s+/i.test(t) && !CZ_CITY_MERCHANT_RE.test(t))) {
      seenCity = true;
      continue;
    }
    if (seenCity && /[A-Za-zÁ-ž]/.test(t) && t.length >= 2 && !/^CZ\s+/i.test(t)) {
      return cleanCardMerchant(t);
    }
  }

  // 3) fallback: name-like mimo město / CZ
  for (const line of lines) {
    const t = line.trim();
    if (DATE_RE.test(t) || matchTxType(t)) continue;
    if (parseAmountToken(t) != null) continue;
    if (/^XXXXXXXXXXXX/i.test(t) || D_TRAN_RE.test(t) || /^CZ\s+/i.test(t)) continue;
    if (isNoiseLine(t) || /^CZK$/i.test(t)) continue;
    if (/[A-Za-zÁ-ž]/.test(t) && t.length >= 3) return cleanCardMerchant(t);
  }
  return '';
}

function extractUserNote(lines: string[], txType: string): string {
  const candidates: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (DATE_RE.test(t)) continue;
    if (matchTxType(t)) continue;
    if (t === 'okamžitá' || /^okamžitá$/i.test(t)) continue;
    if (/^Číslo\s+instrukce:/i.test(t)) continue;
    if (isCzechAccountLine(t)) continue;
    if (parseAmountToken(t) != null && !/[A-Za-zÁ-ž]{3,}/.test(t)) continue;
    if (CASTKA_V_KC_RE.test(t)) continue;
    if (D_TRAN_RE.test(t) || /d\.zúč\./i.test(t)) continue;
    if (/^XXXXXXXXXXXX\d{4}$/i.test(t) || /^\d{6}\*{2,}\d{4}$/.test(t)) continue;
    if (isSymbolOrVsLine(t)) continue;
    if (isNoiseLine(t)) continue;
    if (/^CZK\s+/i.test(t) || /^CZ\s+/i.test(t)) continue;

    if (
      txType === 'Tuzemská odchozí úhrada' ||
      txType === 'Trvalý příkaz' ||
      txType === 'Příchozí úhrada' ||
      txType === 'Inkaso úvěru'
    ) {
      if (/[A-Za-zÁ-ž]/.test(t) && t.length <= 80) candidates.push(t);
    }
  }
  return candidates.length ? candidates[candidates.length - 1]! : '';
}

function extractCounterpartyName(lines: string[]): string {
  for (const line of lines) {
    const t = line.trim();
    if (DATE_RE.test(t)) continue;
    if (matchTxType(t)) continue;
    if (isCzechAccountLine(t)) continue;
    if (parseAmountToken(t) != null && !/[A-Za-zÁ-ž]{3,}/.test(t)) continue;
    if (/^Číslo\s+instrukce:/i.test(t)) continue;
    if (isSymbolOrVsLine(t)) continue;
    if (isNoiseLine(t)) continue;
    if (/^XXXXXXXXXXXX/i.test(t) || D_TRAN_RE.test(t) || /^CZ\s+/i.test(t)) continue;
    if (/^[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/.test(t) && /[A-Za-zÁ-ž]{2,}/.test(t) && t.length <= 80) {
      return t;
    }
  }
  return '';
}

function buildDescription(
  txType: string,
  note: string,
  merchant: string,
  counterparty: string,
): string {
  if (txType === 'Platba kartou' || txType.startsWith('Výběr hotovosti')) {
    // Description = merchant (ne město, ne prefix „Platba kartou ·“)
    return merchant || counterparty || txType;
  }
  if (note) return note;
  if (counterparty) return `${txType} · ${counterparty}`;
  if (merchant) return `${txType} · ${merchant}`;
  return txType;
}

function findMovementsStart(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    if (/PŘEHLED\s+POHYBŮ\s+NA\s+ÚČTU|Přehled\s+pohybů\s+na\s+účtu/i.test(lines[i]!)) {
      return i + 1;
    }
  }
  for (let i = 0; i < lines.length; i++) {
    if (/^Zaúčtováno/i.test(lines[i]!) && /Provedeno|Položka/i.test(lines.slice(i, i + 3).join(' '))) {
      return i + 1;
    }
  }
  for (let i = 0; i < lines.length; i++) {
    if (DATE_RE.test(lines[i]!) && findTxTypeInBlock(lines.slice(i, i + 6))) {
      return i;
    }
  }
  return 0;
}

/**
 * Parsuje transakce České spořitelny z plain textu PDF.
 * Nulové poplatky / založení účtu se vynechají.
 * Duplikáty se NEdeduují — unique_key řeší bankTransactionId s pořadím v dni.
 */
export function parseCsPdfPlainText(text: string): CsParsedTransaction[] {
  const lines = csPlainTextToLines(text);
  const out: CsParsedTransaction[] = [];
  const ownAccount = extractCsStatementBalances(text).accountNumber ?? '';
  const daySeq = new Map<string, number>();

  let i = findMovementsStart(lines);
  const pastMovementsHeader = i > 0;
  while (i < lines.length) {
    const line = lines[i]!;

    if (isTrailingClosingBalanceLine(line, pastMovementsHeader)) break;
    if (/^SLUŽBY\s+K\s+ÚČTU/i.test(line)) break;
    if (isNoiseLine(line)) {
      i++;
      continue;
    }

    const dateMatch = line.match(DATE_RE);
    if (!dateMatch) {
      i++;
      continue;
    }

    const firstDateYmd = ymd(Number(dateMatch[1]), Number(dateMatch[2]), Number(dateMatch[3]));
    if (!firstDateYmd) {
      i++;
      continue;
    }

    const blockStart = i;
    let j = i + 1;
    // Až 2 datumová pole před typem (Zaúčtováno / Provedeno). pdfjs často nechá
    // na začátku řádku ještě datum z předchozí transakce — to přeskočíme níže.
    const leadingDates: string[] = [firstDateYmd];
    if (j < lines.length && DATE_RE.test(lines[j]!)) {
      const m2 = lines[j]!.match(DATE_RE);
      const d2 = m2 ? ymd(Number(m2[1]), Number(m2[2]), Number(m2[3])) : null;
      if (d2) leadingDates.push(d2);
      j++;
    }
    const prevTxDate = out.length > 0 ? out[out.length - 1]!.date : null;
    let leadIdx = 0;
    while (
      leadIdx < leadingDates.length - 1 &&
      prevTxDate != null &&
      leadingDates[leadIdx] === prevTxDate
    ) {
      leadIdx++;
    }
    const bookedYmd = leadingDates[leadIdx]!;
    const provedenoYmd = leadingDates[leadIdx + 1] ?? null;

    let foundAmount = false;
    let meaningful = 0;
    while (j < lines.length) {
      const L = lines[j]!;
      if (/^Konečný\s+zůstatek/i.test(L)) break;
      if (/^SLUŽBY\s+K\s+ÚČTU/i.test(L)) break;
      if (DATE_RE.test(L) && foundAmount) break;
      // Patičky stránky (`|`, SBV…, „Pokračování…“) nepřeruší blok ani neukrojí limit —
      // jinak se přeskočí následující transakce za zlomem stránky.
      if (isNoiseLine(L)) {
        j++;
        continue;
      }
      meaningful++;
      if (parseAmountToken(L) != null) foundAmount = true;
      if (CASTKA_V_KC_RE.test(L) || /^částka\s+v\s+Kč:/i.test(L)) foundAmount = true;
      j++;
      if (meaningful > 36) break;
    }

    const block = lines.slice(blockStart, j).filter((l) => !isNoiseLine(l));
    const txType = findTxTypeInBlock(block);
    if (!txType) {
      i++;
      continue;
    }

    let rawAmount: number | null = null;
    for (const bl of block) {
      const a = parseAmountToken(bl);
      if (a != null && (bl.trim().startsWith('+') || bl.trim().startsWith('-') || bl.trim().startsWith('−'))) {
        rawAmount = a;
        break;
      }
    }
    if (rawAmount == null) {
      for (const bl of block) {
        const a = parseAmountToken(bl);
        if (a != null) {
          rawAmount = a;
          break;
        }
      }
    }

    const castka = extractCastkaVKc(block);
    if (castka != null && (txType === 'Platba kartou' || txType.startsWith('Výběr hotovosti'))) {
      const sign = rawAmount != null ? Math.sign(rawAmount) || -1 : -1;
      rawAmount = sign * castka;
    }

    if (rawAmount == null || !Number.isFinite(rawAmount)) {
      i = Math.max(j, i + 1);
      continue;
    }
    if (Math.abs(rawAmount) < 0.005) {
      i = Math.max(j, i + 1);
      continue;
    }
    if (Math.abs(rawAmount) > MAX_TX_CZK) {
      i = Math.max(j, i + 1);
      continue;
    }

    const { accountNumber, bankCode } = extractAccountFromLines(block);
    // Vlastní účet z patičky nesmí být protiúčet
    const ownNorm = ownAccount.replace(/\s/g, '');
    const cpRaw =
      accountNumber && bankCode ? `${accountNumber}/${bankCode}`.replace(/\s/g, '') : '';
    const cpAccount =
      cpRaw && ownNorm && cpRaw === ownNorm
        ? { accountNumber: '', bankCode: '' }
        : { accountNumber, bankCode };

    const merchant = extractMerchantForCard(block);
    const note = extractUserNote(block, txType);
    const counterparty = extractCounterpartyName(block);
    const description = buildDescription(txType, note, merchant, counterparty);

    const dTran = extractDTranDate(block);
    const dZuc = extractDZucDate(block);
    const isCard = txType === 'Platba kartou' || txType.startsWith('Výběr hotovosti');
    // Karta: date = d.tran, booking_date = d.zúč. (řádek s částkou v Kč)
    // Úhrada: date = booking_date = zaúčtováno (ne „provedeno“, ne datum z předchozího řádku)
    const date = isCard ? dTran ?? bookedYmd : bookedYmd;
    const bookingDate = isCard ? dZuc ?? provedenoYmd ?? bookedYmd : bookedYmd;

    const type: 'income' | 'expense' = rawAmount >= 0 ? 'income' : 'expense';
    const amount = Math.abs(rawAmount);

    const seqKey = bookedYmd;
    const seq = (daySeq.get(seqKey) ?? 0) + 1;
    daySeq.set(seqKey, seq);

    const cpOrMerchant =
      (cpAccount.accountNumber && cpAccount.bankCode
        ? `${cpAccount.accountNumber}/${cpAccount.bankCode}`
        : '') ||
      merchant ||
      counterparty ||
      note ||
      txType;

    const bankTransactionId = [
      ownAccount || 'cs',
      bookingDate || bookedYmd,
      date,
      rawAmount.toFixed(2),
      cpOrMerchant,
      `#${seq}`,
    ].join('|');

    out.push({
      date,
      bookingDate,
      amount,
      type,
      description,
      merchant: merchant || counterparty || note || txType,
      txType,
      accountNumber: cpAccount.accountNumber,
      bankCode: cpAccount.bankCode,
      currency: 'CZK',
      rawAmount,
      bankTransactionId,
      ...(counterparty ? { counterpartyName: counterparty } : {}),
    });

    i = Math.max(j, i + 1);
  }

  return out;
}


export function csTransactionsToImportRows(
  transactions: CsParsedTransaction[],
  deps: CsParseDeps,
  ownerAccounts: string[] = [],
): CsParsedImportRow[] {
  return transactions.map((t) => {
    const isCardOrAtm =
      t.txType === "Platba kartou" || t.txType.startsWith("Výběr hotovosti");
    let counterpartyAccount: string | undefined;
    if (!isCardOrAtm && t.accountNumber && t.bankCode) {
      const raw = t.accountNumber.includes("/")
        ? t.accountNumber
        : `${t.accountNumber}/${t.bankCode}`;
      counterpartyAccount = normalizeAccount(raw) ?? undefined;
    }
    const counterpartyName = !isCardOrAtm
      ? (t.counterpartyName || undefined)
      : undefined;
    const isSelfTransfer = isOwnCounterpartyAccount(counterpartyAccount, ownerAccounts);
    const bucket: ImportBucket = isSelfTransfer
      ? "Převod"
      : deps.classifyCsob(t.description, t.merchant);
    return {
      date: t.date,
      bookingDate: t.bookingDate ?? null,
      rawAmount: t.rawAmount,
      description: isSelfTransfer ? "Převod mezi účty" : t.description,
      type: t.type,
      amount: t.amount,
      bucket,
      category: isSelfTransfer ? "Převod" : deps.bucketToStoreCategory(bucket, t.type),
      source: "cs",
      ...(t.bankTransactionId ? { bankTransactionId: t.bankTransactionId } : {}),
      ...(counterpartyAccount ? { counterpartyAccount } : {}),
      ...(counterpartyName ? { counterpartyName } : {}),
    };
  });
}

export function parseCsPdfPlainTextToImportRows(
  text: string,
  deps: CsParseDeps,
  ownerAccounts: string[] = [],
): CsParsedImportRow[] {
  return csTransactionsToImportRows(parseCsPdfPlainText(text), deps, ownerAccounts);
}

export function verifyCsStatementBalance(
  text: string,
  transactions: CsParsedTransaction[] = parseCsPdfPlainText(text),
): { ok: boolean; opening: number; closing: number; sum: number; diff: number } | null {
  const bal = extractCsStatementBalances(text);
  if (bal.opening == null || bal.closing == null) return null;
  const sum = transactions.reduce((s, t) => s + t.rawAmount, 0);
  const expected = bal.opening + sum;
  const diff = expected - bal.closing;
  return {
    ok: Math.abs(diff) < 0.05,
    opening: bal.opening,
    closing: bal.closing,
    sum,
    diff,
  };
}
