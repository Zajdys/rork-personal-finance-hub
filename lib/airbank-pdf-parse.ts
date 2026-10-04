/**
 * Air Bank výpis z plain textu PDF (sloupcový formát po extrakci pdfjs).
 *
 * Layout řádku: Zaúčtování / Provedení / Typ / Kód / Název / Číslo účtu|karty / Detaily / Částka / Poplatky.
 * U „Platba kartou“ je v Názvu držitel karty (ignorovat) a obchodník je v Detailech (často 2 řádky).
 */
import type { ImportBucket, ParsedImportRow } from '@/lib/bank-statement-parser';
import { bucketToStoreCategory } from '@/lib/bank-statement-parser';
import { classifyCsob } from '@/lib/csob-pdf-parse';
import { normalizeAccount, isOwnCounterpartyAccount } from '@/utils/normalizeAccount';

export type ParsedTransaction = {
  date: string;
  /** Datum valuty / provedení → DB booking_date */
  bookingDate?: string | null;
  amount: number;
  type: 'income' | 'expense';
  description: string;
  /** Obchodník / protiúčet — u karty první řádek Detailů (ne držitel). */
  merchant: string;
  txType: string;
  accountNumber: string;
  bankCode: string;
  transactionId: string;
  currency: string;
};

export type AirBankStatementMeta = {
  openingBalance: number | null;
  closingBalance: number | null;
  credited: number | null;
  debited: number | null;
};

export type AirBankParseValidation = {
  ok: boolean;
  parsed: number;
  balanceOk: boolean;
  totalsOk: boolean;
  netDelta: number;
  balanceDelta: number | null;
  incomeSum: number;
  expenseSum: number;
};

const TRANSACTION_TYPES = [
  'Příchozí úhrada',
  'Odchozí úhrada',
  'Platba kartou',
  'Přidání peněz kartou',
  'Odměna',
  'Výběr z bankomatu',
  'Poplatek',
] as const;

const dateRegex = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
const amountRegex = /^[+-]?[\d\s]+,\d{2}$/;
const TX_CODE_RE = /^\d{10,}$/;
const MASKED_CARD_RE = /(?:\d{4,6}\*{3,}\d{3,4}|VISA\*+\d{2,4}|\*{4,}\d{3,4})/i;
const TABLE_HEADER_RE =
  /^(Zaúčtování|Provedení|Typ|Kód transakce|Název|Číslo účtu|Detaily|Částka|Poplatky)/i;
const FOOTER_RE =
  /^(Pokračování na straně|Air Bank a\.s\.|Vklad\b|1048\/|Společnost zapsaná|\d+\/\d+$)/i;

/** Detekce Air Bank výpisu — po KB, Fio, ČSOB, Raiffeisenbank. */
export function isAirBankPdfText(text: string): boolean {
  return (
    text.includes('Air Bank') ||
    text.includes('AIRACZPP') ||
    (text.includes('3030') && text.includes('Výpis z'))
  );
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Částka včetně 0,00 (pro zůstatky v hlavičce). */
function parseMoneyLine(line: string, allowZero = false): number | null {
  const trimmed = line.trim();
  if (!trimmed.includes(',') && !/CZK/i.test(trimmed)) return null;

  let candidate = trimmed.replace(/CZK/gi, '').trim();
  if (!amountRegex.test(candidate) && !/^[+-]?\d[\d\s]*,\d{2}$/.test(candidate)) {
    const m = trimmed.match(/([+-]?\d{1,3}(?:\s\d{3})*,\d{2}|\d+)\s*CZK/i);
    if (!m) return null;
    candidate = m[1]!;
  }

  const normalized = candidate.replace(/\s/g, '').replace(',', '.');
  const num = parseFloat(normalized);
  if (!Number.isFinite(num)) return null;
  if (!allowZero && Math.abs(num) < 0.01) return null;
  return num;
}

function mapTypeFromTxAndAmount(txType: string, amount: number): 'income' | 'expense' {
  if (amount > 0) return 'income';
  if (amount < 0) return 'expense';
  if (/příchozí|přidání peněz|odměna/i.test(txType)) return 'income';
  return 'expense';
}

function extractAccount(line: string): { accountNumber: string; bankCode: string } {
  // Air Bank: „363468155 / 0300“ (mezery kolem lomítka)
  const m = line.match(/\b(\d{1,6}-)?(\d{2,})\s*\/\s*(\d{4})\b/);
  return m
    ? { accountNumber: `${m[1] ?? ''}${m[2]}`, bankCode: m[3]! }
    : { accountNumber: '', bankCode: '' };
}

function isCardOrAtm(txType: string): boolean {
  return /platba kartou|výběr z bankomatu|přidání peněz kartou/i.test(txType);
}

function isCardPurchase(txType: string): boolean {
  return /platba kartou|výběr z bankomatu/i.test(txType);
}

function matchTxType(line: string): string | null {
  return TRANSACTION_TYPES.find((t) => line === t || line.startsWith(t)) ?? null;
}

function isTxnStart(lines: string[], i: number): boolean {
  if (!dateRegex.test(lines[i] ?? '')) return false;
  if (!dateRegex.test(lines[i + 1] ?? '')) return false;
  return !!matchTxType(lines[i + 2] ?? '');
}

function ymdFromDateLine(line: string): string | null {
  const m = line.match(dateRegex);
  if (!m) return null;
  return `${m[3]}-${pad2(Number(m[2]))}-${pad2(Number(m[1]))}`;
}

/** Hodnota za labelem na vlastním řádku (Air Bank: „Počáteční zůstatek:“ / další řádek „1 086,00“). */
function moneyAfterLabel(lines: string[], label: RegExp): number | null {
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!.replace(/:$/, '').trim();
    if (!label.test(l) && !label.test(lines[i]!)) continue;
    for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
      const n = parseMoneyLine(lines[j]!, true);
      if (n != null) return n;
      if (TABLE_HEADER_RE.test(lines[j]!) || isTxnStart(lines, j)) break;
    }
  }
  return null;
}

export function extractAirBankStatementMeta(text: string): AirBankStatementMeta {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  return {
    openingBalance: moneyAfterLabel(lines, /^Počáteční zůstatek$/i),
    closingBalance: moneyAfterLabel(lines, /^Konečný zůstatek$/i),
    credited: moneyAfterLabel(lines, /^Připsáno na účet$/i),
    debited: moneyAfterLabel(lines, /^Odepsáno z účtu$/i),
  };
}

/** Prázdný výpis: žádná tabulka pohybů / 0 kredit i debet. */
export function isAirBankEmptyStatement(text: string, parsedCount: number): boolean {
  if (parsedCount > 0) return false;
  const meta = extractAirBankStatementMeta(text);
  const zeroMoves =
    (meta.credited == null || Math.abs(meta.credited) < 0.01) &&
    (meta.debited == null || Math.abs(meta.debited) < 0.01);
  const hasTable = /Zaúčtování/i.test(text) && TRANSACTION_TYPES.some((t) => text.includes(t));
  if (zeroMoves && meta.openingBalance != null && meta.closingBalance != null) {
    return Math.abs(meta.openingBalance - meta.closingBalance) < 0.025;
  }
  return !hasTable && zeroMoves;
}

export function validateAirBankParse(
  rows: { type: 'income' | 'expense'; amount: number }[],
  meta: AirBankStatementMeta,
): AirBankParseValidation {
  const parsed = rows.length;
  const incomeSum = rows.filter((r) => r.type === 'income').reduce((s, r) => s + r.amount, 0);
  const expenseSum = rows.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
  const netDelta = incomeSum - expenseSum;
  const balanceDelta =
    meta.openingBalance != null && meta.closingBalance != null
      ? meta.closingBalance - meta.openingBalance
      : null;
  const balanceOk =
    balanceDelta == null ? true : Math.abs(netDelta - balanceDelta) < 0.025;

  let totalsOk = true;
  if (meta.credited != null) {
    totalsOk = totalsOk && Math.abs(incomeSum - meta.credited) < 0.025;
  }
  if (meta.debited != null) {
    totalsOk = totalsOk && Math.abs(expenseSum - meta.debited) < 0.025;
  }

  return {
    ok: balanceOk && totalsOk,
    parsed,
    balanceOk,
    totalsOk,
    netDelta,
    balanceDelta,
    incomeSum,
    expenseSum,
  };
}

/**
 * Z těla mezi typem a částkou vytáhni obchodníka / účet.
 * Platba kartou: přeskoč držitele + masku karty, merchant = 1. řádek Detailů.
 */
function parseBodyFields(
  txType: string,
  body: string[],
): {
  merchant: string;
  accountNumber: string;
  bankCode: string;
  transactionId: string;
} {
  let i = 0;
  let transactionId = '';
  if (body[i] && TX_CODE_RE.test(body[i]!)) {
    transactionId = body[i]!;
    i += 1;
  }

  if (isCardPurchase(txType)) {
    // Název = držitel karty — NIKDY jako protistrana
    if (body[i] && !MASKED_CARD_RE.test(body[i]!) && !extractAccount(body[i]!).accountNumber) {
      i += 1; // Jan Hájek
    }
    if (body[i] && MASKED_CARD_RE.test(body[i]!)) {
      i += 1; // 516844******3303
    }
    const detailLines = body.slice(i).filter((l) => l && !TABLE_HEADER_RE.test(l));
    const merchant = detailLines[0]?.trim() || txType;
    return { merchant, accountNumber: '', bankCode: '', transactionId };
  }

  if (/přidání peněz kartou/i.test(txType)) {
    // VISA****3561 + VS… — merchant z karty / VS, kategorie Převod později
    const cardOrVs = body.slice(i).find((l) => MASKED_CARD_RE.test(l) || /^VS/i.test(l)) ?? body[i] ?? txType;
    return { merchant: cardOrVs, accountNumber: '', bankCode: '', transactionId };
  }

  if (/odměna/i.test(txType)) {
    const rest = body.slice(i).join(' ').trim();
    return {
      merchant: rest || 'Air Bank',
      accountNumber: '',
      bankCode: '',
      transactionId,
    };
  }

  // Úhrady: jméno + účet / jen účet
  let accountNumber = '';
  let bankCode = '';
  let name = '';
  for (const l of body.slice(i)) {
    const acc = extractAccount(l);
    if (acc.accountNumber) {
      accountNumber = acc.accountNumber;
      bankCode = acc.bankCode;
      continue;
    }
    if (!name && l && !TX_CODE_RE.test(l)) name = l;
  }
  return {
    merchant: name || (accountNumber ? `${accountNumber}/${bankCode}` : txType),
    accountNumber,
    bankCode,
    transactionId,
  };
}

/** Parsuje Air Bank transakce z plain textu PDF (všechny stránky — hlavička tabulky se opakuje). */
export function parseAirBank(text: string): ParsedTransaction[] {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => {
      if (!l) return false;
      // page markers / opakovaná hlavička tabulky — přeskočit, ať neruší sken
      if (/^---PAGE\b/i.test(l)) return false;
      if (/^Pokračování na straně/i.test(l)) return false;
      return true;
    });

  const transactions: ParsedTransaction[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (!isTxnStart(lines, i)) continue;

    const matchedType = matchTxType(lines[i + 2]!)!;
    const date = ymdFromDateLine(lines[i]!);
    const bookingDate = ymdFromDateLine(lines[i + 1]!);
    if (!date) continue;

    // Najdi částku: první nenulová částka před dalším txn startem / patičkou
    let amount: number | null = null;
    let amountLineIdx = -1;
    for (let j = i + 3; j < Math.min(i + 20, lines.length); j++) {
      if (isTxnStart(lines, j)) break;
      const l = lines[j]!;
      if (TABLE_HEADER_RE.test(l) && j > i + 3) {
        // opakovaná hlavička na další straně — přeskoč, hledej dál
        continue;
      }
      if (FOOTER_RE.test(l) && !parseMoneyLine(l)) break;
      const num = parseMoneyLine(l, false);
      if (num != null) {
        amount = num;
        amountLineIdx = j;
        break;
      }
    }

    if (amount === null || amountLineIdx < 0) continue;

    const body = lines.slice(i + 3, amountLineIdx).filter((l) => !TABLE_HEADER_RE.test(l));
    const fields = parseBodyFields(matchedType, body);
    const type = mapTypeFromTxAndAmount(matchedType, amount);
    const description = fields.merchant
      ? `${matchedType} · ${fields.merchant}`
      : matchedType;

    transactions.push({
      date,
      bookingDate,
      amount: Math.abs(amount),
      type,
      description,
      merchant: fields.merchant || matchedType,
      txType: matchedType,
      accountNumber: fields.accountNumber,
      bankCode: fields.bankCode,
      transactionId: fields.transactionId,
      currency: 'CZK',
    });

    i = amountLineIdx;
  }

  return transactions;
}

export function parseAirBankPdfPlainText(text: string): ParsedTransaction[] {
  return parseAirBank(text);
}

export function airBankTransactionsToImportRows(
  transactions: ParsedTransaction[],
  ownerAccounts: string[] = [],
): ParsedImportRow[] {
  return transactions.map((t) => {
    const rawAmount = t.type === 'income' ? t.amount : -t.amount;
    let counterpartyAccount: string | undefined;
    if (t.accountNumber && t.bankCode) {
      const raw = t.accountNumber.includes('/')
        ? t.accountNumber
        : `${t.accountNumber}/${t.bankCode}`;
      counterpartyAccount = normalizeAccount(raw) ?? undefined;
    }

    // Držitel karty / VISA maska — nikdy jako protistrana u kartových plateb
    const counterpartyName =
      !isCardOrAtm(t.txType) && t.merchant && t.merchant !== t.txType
        ? t.merchant.replace(/\b(\d{1,6}-)?\d{2,}\/\d{4}\b/, '').trim() || undefined
        : undefined;

    const isSelfTransfer = isOwnCounterpartyAccount(counterpartyAccount, ownerAccounts);
    const isCardTopUp = /přidání peněz kartou/i.test(t.txType);
    const isReward = /odměna/i.test(t.txType);

    let bucket: ImportBucket;
    if (isSelfTransfer || isCardTopUp) {
      bucket = 'Převod';
    } else if (isReward) {
      bucket = 'Ostatní';
    } else {
      // merchant_key / klasifikace z Detailů (ne z Názvu držitele)
      bucket = classifyCsob(t.description, t.merchant);
    }

    return {
      date: t.date,
      bookingDate: t.bookingDate ?? null,
      rawAmount,
      description:
        isSelfTransfer || isCardTopUp
          ? isCardTopUp
            ? `Přidání peněz kartou · ${t.merchant}`
            : 'Převod mezi účty'
          : t.description,
      type: t.type,
      amount: t.amount,
      bucket,
      category:
        isSelfTransfer || isCardTopUp
          ? 'Převod'
          : isReward
            ? 'Ostatní'
            : bucketToStoreCategory(bucket, t.type),
      source: 'airbank',
      bankTransactionId: t.transactionId || undefined,
      ...(counterpartyAccount ? { counterpartyAccount } : {}),
      ...(counterpartyName ? { counterpartyName } : {}),
    };
  });
}

function extractPrintableTextFromPdf(pdfData: ArrayBuffer): string {
  const u8 = new Uint8Array(pdfData);
  let out = '';
  for (let i = 0; i < u8.length; i++) {
    const b = u8[i]!;
    if (b === 10 || b === 13) out += '\n';
    else if ((b >= 32 && b <= 126) || b >= 160) out += String.fromCharCode(b);
    else if (out.length > 0 && out[out.length - 1] !== '\n') out += '\n';
  }
  return out.replace(/\n{3,}/g, '\n\n');
}

export async function parseAirBankPdf(pdfData: ArrayBuffer): Promise<ParsedTransaction[]> {
  const text = extractPrintableTextFromPdf(pdfData);
  const rows = parseAirBank(text);
  if (rows.length > 0) return rows;
  try {
    return parseAirBank(new TextDecoder('latin1').decode(pdfData));
  } catch {
    return [];
  }
}

export function parseAirBankPdfPlainTextToImportRows(text: string): ParsedImportRow[] {
  return airBankTransactionsToImportRows(parseAirBank(text), []);
}
