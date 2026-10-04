/**
 * MONETA Money Bank PDF výpis (CS i EN layout — stejná struktura).
 *
 * Blok 3–4 řádků: zpracování (vlevo) → typ/protiúčet → kód → částka
 * (sloupce Debet / Kredit) → popis → zaúčtování / odepsání.
 * date = zaúčtování, booking_date = zpracování.
 */
import type { ImportBucket, ParsedImportRow } from '@/lib/bank-statement-parser';
import { bucketToStoreCategory } from '@/lib/bank-statement-parser';
import { classifyCsob } from '@/lib/csob-pdf-parse';
import { normalizeAccount, isOwnCounterpartyAccount } from '@/utils/normalizeAccount';

export type MonetaParsedTransaction = {
  date: string;
  bookingDate: string | null;
  amount: number;
  type: 'income' | 'expense';
  description: string;
  merchant: string;
  txType: string;
  accountNumber: string;
  bankCode: string;
  transactionId: string;
  currency: string;
};

export type MonetaStatementMeta = {
  openingBalance: number | null;
  closingBalance: number | null;
  credited: number | null;
  debited: number | null;
  declaredTxnCount: number | null;
};

export type MonetaParseValidation = {
  ok: boolean;
  parsed: number;
  expected: number | null;
  balanceOk: boolean;
  totalsOk: boolean;
  countOk: boolean;
  netDelta: number;
  balanceDelta: number | null;
  incomeSum: number;
  expenseSum: number;
};

const DATE_RE = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
const ACCOUNT_RE = /^(\d{1,6}-)?(\d{2,16})\s*\/\s*(\d{4})$/;
/** Kód transakce Moneta (čísla, případně písmeno V u karet). */
const TX_CODE_RE = /^[0-9]{10,}[0-9A-Z]*$|^[0-9]+V[0-9A-Z]+$/i;
const AMOUNT_RE = /^-?\s*\d{1,3}(?:[\s\u00a0]\d{3})*,\d{2}$/;
const DI_RE = /^DI:\s*/i;
const END_TABLE_RE =
  /^(Total number of transactions|Celkový počet transakcí|Total of transactions|Součet transakcí|Closing balance|Konečný zůstatek|Please make sure|Prosím, zkontrolujte)/i;

const CARD_OP_RE = /platba\s+kartou|výběr\s+z\s+bankomatu|card\s+payment|atm\s+withdrawal/i;

/** Detekce MONETA Money Bank (AGBACZPP / 0600 / moneta.cz). */
export function isMonetaPdfText(text: string): boolean {
  const sample = text.slice(0, 25_000);
  if (/MONETA\s+Money\s+Bank/i.test(sample)) return true;
  if (sample.includes('AGBACZPP')) return true;
  if (/www\.moneta\.cz/i.test(sample)) return true;
  if (
    /\/\s*0600\b/.test(sample) &&
    (/Výpis\s+z\s+běžného\s+účtu/i.test(sample) || /Statement\s+of\s+current\s+account/i.test(sample))
  ) {
    return true;
  }
  return false;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function ymdFromDateLine(line: string): string | null {
  const m = line.trim().match(DATE_RE);
  if (!m) return null;
  return `${m[3]}-${pad2(Number(m[2]))}-${pad2(Number(m[1]))}`;
}

function parseMoneyToken(raw: string, allowZero = false): number | null {
  const trimmed = raw.trim().replace(/\u00a0/g, ' ');
  if (!AMOUNT_RE.test(trimmed) && !/^-?\s*\d+,\d{2}$/.test(trimmed)) return null;
  const negative = /^\s*-/.test(trimmed);
  const normalized = trimmed.replace(/-/g, '').replace(/\s/g, '').replace(',', '.');
  const num = parseFloat(normalized);
  if (!Number.isFinite(num)) return null;
  if (!allowZero && Math.abs(num) < 0.01) return null;
  return negative ? -Math.abs(num) : Math.abs(num);
}

function isAmountLine(line: string): boolean {
  return parseMoneyToken(line, true) != null && AMOUNT_RE.test(line.trim().replace(/\u00a0/g, ' '));
}

function isAccountLine(line: string): boolean {
  return ACCOUNT_RE.test(line.trim());
}

function parseAccount(line: string): { accountNumber: string; bankCode: string } | null {
  const m = line.trim().match(ACCOUNT_RE);
  if (!m) return null;
  return { accountNumber: `${m[1] ?? ''}${m[2]}`, bankCode: m[3]! };
}

function isTxCodeLine(line: string): boolean {
  const t = line.trim();
  if (!TX_CODE_RE.test(t)) return false;
  // VS / CS jsou krátká čísla bez desetinné čárky — ne kód transakce
  if (/^\d{1,10}$/.test(t) && t.length < 12) return false;
  return true;
}

function isVsOrCsLine(line: string): boolean {
  const t = line.trim();
  return /^\d{1,10}$/.test(t) && !isTxCodeLine(t);
}

function toLines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.replace(/\u00a0/g, ' ').trim())
    .filter((l) => {
      if (!l) return false;
      if (/^---PAGE\b/i.test(l)) return false;
      return true;
    });
}

function findOverviewStart(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    if (/^(Overview of transactions|Přehled transakcí)$/i.test(lines[i]!)) return i;
  }
  // fallback: první „Debit transaction“ / „Debetní obrat“ v hlavičce tabulky
  for (let i = 0; i < lines.length; i++) {
    if (/^(Debit transaction|Debetní obrat|Debetní transakce)$/i.test(lines[i]!)) return i;
  }
  return 0;
}

/** Blok labelů → následující N peněžních hodnot (Moneta seskupuje labely i hodnoty). */
function moneyValuesAfterLabels(lines: string[], labelRes: RegExp[], count: number): number[] {
  for (let i = 0; i < lines.length; i++) {
    if (!labelRes[0]!.test(lines[i]!)) continue;
    let j = i;
    let matchedLabels = 0;
    for (const re of labelRes) {
      while (j < lines.length && !re.test(lines[j]!)) {
        // přeskoč prázdné / interpunkci mezi labely
        if (isAmountLine(lines[j]!) || DATE_RE.test(lines[j]!)) break;
        j += 1;
      }
      if (j >= lines.length || !re.test(lines[j]!)) break;
      matchedLabels += 1;
      j += 1;
    }
    if (matchedLabels < labelRes.length) continue;

    const values: number[] = [];
    for (; j < lines.length && values.length < count; j++) {
      const n = parseMoneyToken(lines[j]!, true);
      if (n != null) values.push(n);
      else if (values.length > 0) break;
    }
    if (values.length >= count) return values.slice(0, count);
  }
  return [];
}

export function extractMonetaStatementMeta(text: string): MonetaStatementMeta {
  const lines = toLines(text);

  const bal = moneyValuesAfterLabels(
    lines,
    [
      /^(Initial balance|Počáteční zůstatek)\s*:?$/i,
      /^(Closing balance|Konečný zůstatek)\s*:?$/i,
    ],
    2,
  );

  let credited: number | null = null;
  let debited: number | null = null;
  const turnover = moneyValuesAfterLabels(
    lines,
    [
      /^(Credit T\/O|Obrat kredit|Kreditní obrat)\s*:?$/i,
      /^(Debit T\/O|Obrat debet|Debetní obrat)\s*:?$/i,
    ],
    2,
  );
  if (turnover.length >= 2) {
    credited = Math.abs(turnover[0]!);
    debited = Math.abs(turnover[1]!);
  }

  // Fallback: řádek „Credit T/O: 50,00“ na jednom řádku (kdyby layout byl jiný)
  if (credited == null) {
    const m = text.match(/(?:Credit T\/O|Obrat kredit|Kreditní obrat)\s*:?\s*(-?[\d\s]+,\d{2})/i);
    if (m) credited = Math.abs(parseMoneyToken(m[1]!, true) ?? 0);
  }
  if (debited == null) {
    const m = text.match(/(?:Debit T\/O|Obrat debet|Debetní obrat)\s*:?\s*(-?[\d\s]+,\d{2})/i);
    if (m) debited = Math.abs(parseMoneyToken(m[1]!, true) ?? 0);
  }

  let declaredTxnCount: number | null = null;
  const countM = text.match(
    /(?:Total number of transactions|Celkový počet transakcí)\s*:?\s*(\d+)/i,
  );
  if (countM) declaredTxnCount = Number(countM[1]);

  return {
    openingBalance: bal[0] ?? null,
    closingBalance: bal[1] ?? null,
    credited,
    debited,
    declaredTxnCount,
  };
}

export function validateMonetaParse(
  rows: { type: 'income' | 'expense'; amount: number }[],
  meta: MonetaStatementMeta,
): MonetaParseValidation {
  const parsed = rows.length;
  const incomeSum = rows.filter((r) => r.type === 'income').reduce((s, r) => s + r.amount, 0);
  const expenseSum = rows.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
  const netDelta = incomeSum - expenseSum;
  const balanceDelta =
    meta.openingBalance != null && meta.closingBalance != null
      ? meta.closingBalance - meta.openingBalance
      : null;
  const balanceOk = balanceDelta == null ? true : Math.abs(netDelta - balanceDelta) < 0.025;

  let totalsOk = true;
  if (meta.credited != null) totalsOk = totalsOk && Math.abs(incomeSum - meta.credited) < 0.025;
  if (meta.debited != null) totalsOk = totalsOk && Math.abs(expenseSum - meta.debited) < 0.025;

  const countOk = meta.declaredTxnCount == null || meta.declaredTxnCount === parsed;

  return {
    ok: balanceOk && totalsOk && countOk,
    parsed,
    expected: meta.declaredTxnCount,
    balanceOk,
    totalsOk,
    countOk,
    netDelta,
    balanceDelta,
    incomeSum,
    expenseSum,
  };
}

export function isMonetaEmptyStatement(text: string, parsedCount: number): boolean {
  if (parsedCount > 0) return false;
  const meta = extractMonetaStatementMeta(text);
  if (meta.declaredTxnCount === 0) return true;
  const zeroMoves =
    (meta.credited == null || Math.abs(meta.credited) < 0.01) &&
    (meta.debited == null || Math.abs(meta.debited) < 0.01);
  if (zeroMoves && meta.openingBalance != null && meta.closingBalance != null) {
    return Math.abs(meta.openingBalance - meta.closingBalance) < 0.025;
  }
  return false;
}

function isTxnStart(lines: string[], i: number, tableStart: number): boolean {
  if (i < tableStart) return false;
  if (!DATE_RE.test(lines[i]!)) return false;
  if (DI_RE.test(lines[i]!)) return false;
  // Hlavičkové datum (Statement date) — za ním není účet ani typ operace + kód
  const next = lines[i + 1] ?? '';
  if (isAccountLine(next)) return true;
  if (DATE_RE.test(next) || DI_RE.test(next) || isAmountLine(next) || END_TABLE_RE.test(next)) {
    return false;
  }
  // Typ operace + někde v následujících řádcích kód transakce a částka
  let hasCode = false;
  let hasAmount = false;
  for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
    const l = lines[j]!;
    if (END_TABLE_RE.test(l)) break;
    if (DATE_RE.test(l) && j > i + 1) break;
    if (isTxCodeLine(l)) hasCode = true;
    if (isAmountLine(l) && Math.abs(parseMoneyToken(l, true) ?? 0) >= 0.01) hasAmount = true;
  }
  return hasCode && hasAmount;
}

function isCardOp(txType: string): boolean {
  return CARD_OP_RE.test(txType);
}

/**
 * Moneta u karty dává „JMÉNO PŘÍJMENÍ MĚSTO CZ“ / „KAUFLAND CZ 1510 …“.
 * Ořízni zemi; u jména+příjmení (-ová/…) zahodť i město → merchant_key pro user rules.
 */
function cleanMonetaMerchant(raw: string, txType: string): string {
  let s = raw.trim().replace(/\s+/g, ' ');
  if (!s) return s;
  s = s.replace(/\s+(CZ|CZE|SK|SVK|DE|DEU|AT|AUT)\s*$/i, '').trim();
  if (!isCardOp(txType)) return s;
  const parts = s.split(/\s+/);
  if (
    parts.length >= 3 &&
    parts[0]!.length >= 2 &&
    /(?:OVA|SKA|CKA|EK|IK|NY|NA)$/i.test(parts[1]!) &&
    !/^\d/.test(parts[1]!)
  ) {
    return `${parts[0]} ${parts[1]}`;
  }
  return s;
}

/** Parsuje transakce z plain textu PDF (pdfjs). */
export function parseMoneta(text: string): MonetaParsedTransaction[] {
  const lines = toLines(text);
  const tableStart = findOverviewStart(lines);
  const transactions: MonetaParsedTransaction[] = [];

  for (let i = tableStart; i < lines.length; i++) {
    if (END_TABLE_RE.test(lines[i]!)) break;
    if (!isTxnStart(lines, i, tableStart)) continue;

    const bookingDate = ymdFromDateLine(lines[i]!);
    if (!bookingDate) continue;

    let cursor = i + 1;
    let accountNumber = '';
    let bankCode = '';
    let txType = '';
    let transactionId = '';
    let amountSigned: number | null = null;
    let merchant = '';
    let postingDate: string | null = null;

    const next = lines[cursor] ?? '';
    if (isAccountLine(next)) {
      const acc = parseAccount(next)!;
      accountNumber = acc.accountNumber;
      bankCode = acc.bankCode;
      txType = 'Převod';
      cursor += 1;
    } else if (next && !DATE_RE.test(next) && !DI_RE.test(next) && !isAmountLine(next)) {
      txType = next;
      cursor += 1;
    } else {
      continue;
    }

    // Kód transakce
    while (cursor < lines.length && !isTxCodeLine(lines[cursor]!) && !isAmountLine(lines[cursor]!)) {
      if (END_TABLE_RE.test(lines[cursor]!) || DI_RE.test(lines[cursor]!)) break;
      if (DATE_RE.test(lines[cursor]!)) break;
      cursor += 1;
    }
    if (cursor < lines.length && isTxCodeLine(lines[cursor]!)) {
      transactionId = lines[cursor]!.trim();
      cursor += 1;
    }

    // Volitelný VS
    if (cursor < lines.length && isVsOrCsLine(lines[cursor]!)) {
      cursor += 1;
    }

    // Částka (Debet má „- “, Kredit bez znaménka — typ podle sloupce / znaménka)
    if (cursor < lines.length && isAmountLine(lines[cursor]!)) {
      amountSigned = parseMoneyToken(lines[cursor]!, false);
      cursor += 1;
    }
    if (amountSigned == null || Math.abs(amountSigned) < 0.01 || !transactionId) {
      continue;
    }

    // Popis / jméno protiúčtu (ne DI:, ne datum)
    while (
      cursor < lines.length &&
      (DI_RE.test(lines[cursor]!) || !lines[cursor])
    ) {
      cursor += 1;
    }
    if (
      cursor < lines.length &&
      !DATE_RE.test(lines[cursor]!) &&
      !isAmountLine(lines[cursor]!) &&
      !END_TABLE_RE.test(lines[cursor]!) &&
      !isTxnStart(lines, cursor, tableStart)
    ) {
      merchant = cleanMonetaMerchant(lines[cursor]!.trim(), txType);
      cursor += 1;
    }

    // Datum zaúčtování (posting) — první datum pod kódem/popisem
    if (cursor < lines.length && DATE_RE.test(lines[cursor]!)) {
      postingDate = ymdFromDateLine(lines[cursor]!);
      cursor += 1;
    }
    // CS + write-off date — přeskočit
    if (cursor < lines.length && isVsOrCsLine(lines[cursor]!)) cursor += 1;
    if (cursor < lines.length && DATE_RE.test(lines[cursor]!)) cursor += 1;
    // DI: doplňková info — přeskočit (nevytváří transakci)
    if (cursor < lines.length && DI_RE.test(lines[cursor]!)) cursor += 1;

    const type: 'income' | 'expense' = amountSigned < 0 ? 'expense' : 'income';
    const amount = Math.abs(amountSigned);
    const date = postingDate ?? bookingDate;

    const description =
      merchant && txType && merchant !== txType
        ? `${txType} · ${merchant}`
        : merchant || txType || 'Moneta';

    transactions.push({
      date,
      bookingDate,
      amount,
      type,
      description,
      merchant: merchant || txType || 'Moneta',
      txType: txType || 'Moneta',
      accountNumber,
      bankCode,
      transactionId,
      currency: 'CZK',
    });

    i = cursor - 1;
  }

  return transactions;
}

export function parseMonetaPdfPlainText(text: string): MonetaParsedTransaction[] {
  return parseMoneta(text);
}

export function monetaTransactionsToImportRows(
  transactions: MonetaParsedTransaction[],
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

    const isTransfer = Boolean(counterpartyAccount) || /^převod$/i.test(t.txType);
    const isCard = isCardOp(t.txType);
    const counterpartyName =
      !isCard && t.merchant && !/^převod$/i.test(t.merchant)
        ? t.merchant.replace(/\b(\d{1,6}-)?\d{2,}\/\d{4}\b/, '').trim() || undefined
        : undefined;

    const isSelfTransfer = isOwnCounterpartyAccount(counterpartyAccount, ownerAccounts);

    let bucket: ImportBucket;
    if (isSelfTransfer || isTransfer) {
      bucket = 'Převod';
    } else {
      // merchant_key / klasifikace z 2. řádku popisu (obchodník), ne z typu operace
      bucket = classifyCsob(t.description, t.merchant);
    }

    return {
      date: t.date,
      bookingDate: t.bookingDate,
      rawAmount,
      description: isSelfTransfer ? 'Převod mezi účty' : t.description,
      type: t.type,
      amount: t.amount,
      bucket,
      category:
        isSelfTransfer || isTransfer
          ? 'Převod'
          : bucketToStoreCategory(bucket, t.type),
      source: 'moneta',
      bankTransactionId: t.transactionId || undefined,
      ...(counterpartyAccount ? { counterpartyAccount } : {}),
      ...(counterpartyName ? { counterpartyName } : {}),
    };
  });
}

export function parseMonetaPdfPlainTextToImportRows(
  text: string,
  ownerAccounts: string[] = [],
): ParsedImportRow[] {
  return monetaTransactionsToImportRows(parseMoneta(text), ownerAccounts);
}
