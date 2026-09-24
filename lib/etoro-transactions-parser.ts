import * as XLSX from 'xlsx';
import {
  classifyBrokerPaymentStatus,
  textLooksLikeFailedBrokerPayment,
} from './broker-failed-payment';
import { textLooksLikePromoBrokerDeposit } from './broker-promo-deposit';

export type InvestmentTransactionType =
  | 'buy'
  | 'sell'
  | 'dividend'
  | 'deposit'
  | 'withdrawal'
  | 'fee'
  | 'promo'
  | 'transfer_out'
  | 'gift';

export type ParsedEtoroTransaction = {
  type: InvestmentTransactionType;
  ticker: string | null;
  isin: string | null;
  units: number | null;
  price_per_unit: number | null;
  amount: number;
  fee: number;
  original_currency: string;
  date: string;
  external_id: string;
  source?: 'import' | 'manual';
  note?: string | null;
};

export type EtoroTransactionParseResult = {
  transactions: ParsedEtoroTransaction[];
  skipped: number;
  warnings: string[];
  summary: Record<
    InvestmentTransactionType,
    { count: number; amountSum: number }
  >;
  /** Součet „Změna realizovaného kapitálu“ u sell řádků (≈ Přehled „Zisk“). */
  sellRealizedCapitalChangeSum: number;
};

const EMPTY_SUMMARY = (): EtoroTransactionParseResult['summary'] => ({
  buy: { count: 0, amountSum: 0 },
  sell: { count: 0, amountSum: 0 },
  dividend: { count: 0, amountSum: 0 },
  deposit: { count: 0, amountSum: 0 },
  withdrawal: { count: 0, amountSum: 0 },
  fee: { count: 0, amountSum: 0 },
  promo: { count: 0, amountSum: 0 },
  transfer_out: { count: 0, amountSum: 0 },
  gift: { count: 0, amountSum: 0 },
});

const ETORO_TYPE_MAP: Record<string, InvestmentTransactionType | 'skip' | null> = {
  'Otevřená pozice': 'buy',
  'Otevrena pozice': 'buy',
  'Open position': 'buy',
  'Zisk/ztráta z obchodu': 'sell',
  'Zisk/ztrata z obchodu': 'sell',
  Dividenda: 'dividend',
  Dividend: 'dividend',
  Vklad: 'deposit',
  Deposit: 'deposit',
  Výběr: 'withdrawal',
  Vyber: 'withdrawal',
  Withdrawal: 'withdrawal',
  'Žádost o výběr': 'withdrawal',
  'Zadost o vyber': 'withdrawal',
  'Withdrawal request': 'withdrawal',
  Refund: 'withdrawal',
  'Refund from eToro': 'withdrawal',
  'Vrácení vkladu': 'withdrawal',
  'Vraceni vkladu': 'withdrawal',
  'Deposit refund': 'withdrawal',
  'Poplatek za výběr': 'fee',
  'Poplatek za vyber': 'fee',
  'Poplatek za směnu měny při výběru': 'fee',
  'Poplatek za smenu meny pri vyberu': 'fee',
  'Withdrawal fee': 'fee',
  'Currency conversion fee on withdrawal': 'fee',
  'Začít kopírovat': 'skip',
  'Zacit kopirovat': 'skip',
  'Start copying': 'skip',
  SDRT: 'fee',
  'Account balance to mirror': 'skip',
};

function readWorkbook(fileContent: string | ArrayBuffer): XLSX.WorkBook {
  if (fileContent instanceof ArrayBuffer) {
    return XLSX.read(fileContent, { type: 'array', cellDates: true });
  }
  return XLSX.read(fileContent, { type: 'base64', cellDates: true });
}

function findSheet(workbook: XLSX.WorkBook, matchers: RegExp[]): XLSX.WorkSheet | null {
  for (const name of workbook.SheetNames) {
    if (matchers.some((re) => re.test(name))) {
      const sheet = workbook.Sheets[name];
      if (sheet) return sheet;
    }
  }
  return null;
}

function rowString(row: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const v = row[key];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

export function parseEtoroNumeric(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const s = String(raw ?? '')
    .trim()
    .replace(/\s/g, '')
    .replace(',', '.');
  if (!s || s === '-') return null;
  const neg = s.startsWith('(') && s.endsWith(')');
  const n = parseFloat(neg ? s.slice(1, -1) : s);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

function parseEtoroDateOnly(raw: unknown): string | null {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString().slice(0, 10);
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const d = new Date(Math.round((raw - 25569) * 86400 * 1000));
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const str = String(raw ?? '').trim();
  if (!str) return null;
  const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    return `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  }
  const d = new Date(str);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function parseTickerAndCurrency(details: string): { ticker: string | null; currency: string } {
  const trimmed = details.trim();
  if (!trimmed || trimmed === '-') return { ticker: null, currency: 'USD' };

  if (trimmed.includes('/')) {
    const [rawTicker, rawCurrency] = trimmed.split('/');
    const ticker = (rawTicker ?? '').trim().toUpperCase() || null;
    const currency = (rawCurrency ?? 'USD').trim().toUpperCase() || 'USD';
    return { ticker, currency };
  }

  const currencyMatch = trimmed.match(/\b([A-Z]{3})\b/);
  return { ticker: null, currency: currencyMatch?.[1] ?? 'USD' };
}

export function mapEtoroType(rawType: string): InvestmentTransactionType | 'skip' | null {
  const normalized = rawType.trim();
  if (ETORO_TYPE_MAP[normalized] != null) return ETORO_TYPE_MAP[normalized]!;
  for (const [key, value] of Object.entries(ETORO_TYPE_MAP)) {
    if (normalized.toLowerCase() === key.toLowerCase()) return value;
  }
  // Soft match: refund / vrácení → withdrawal
  const lower = normalized.toLowerCase();
  if (lower.includes('refund') || lower.includes('vrácen') || lower.includes('vracen')) {
    return 'withdrawal';
  }
  return null;
}

/** Selhaná platba — není reálný vklad/výběr. */
export function isFailedEtoroPaymentRow(row: Record<string, unknown>, details: string): boolean {
  const status = rowString(row, 'Status', 'Stav', 'Payment status', 'Payment Status');
  const byStatus = classifyBrokerPaymentStatus(status);
  if (byStatus != null) return byStatus;

  const hay = [
    details,
    rowString(row, 'Napište', 'Type'),
    rowString(row, 'Podrobnosti', 'Details', 'Instrument'),
    rowString(row, 'Poznámka', 'Note', 'Notes', 'Comment'),
  ]
    .filter(Boolean)
    .join(' ');
  return textLooksLikeFailedBrokerPayment(hay);
}

function buildIsinLookup(workbook: XLSX.WorkBook): Map<string, string> {
  const map = new Map<string, string>();

  const ingest = (sheet: XLSX.WorkSheet | null) => {
    if (!sheet) return;
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    for (const row of rows) {
      const positionId = rowString(row, 'ID pozice', 'Position ID', 'PositionId');
      const isin = rowString(row, 'ISIN', 'Isin');
      if (positionId && isin) map.set(positionId, isin);
    }
  };

  ingest(findSheet(workbook, [/Zavřen/i, /Closed/i]));
  ingest(findSheet(workbook, [/Dividend/i]));

  return map;
}

function buildExternalId(params: {
  positionId: string;
  type: InvestmentTransactionType;
  date: string;
  amount: number;
  currency: string;
  details: string;
  occurrence: number;
}): string {
  const amountKey = Math.abs(params.amount).toFixed(6);
  // promo vzniká z deposit řádku — v ID drž 'deposit', ať re-import nepřidá duplicitu.
  const idType = params.type === 'promo' ? 'deposit' : params.type;
  if (params.positionId && params.positionId !== '-') {
    return `etoro:${params.positionId}:${params.date}:${idType}:${amountKey}`;
  }
  // Deposit/withdrawal často bez Position ID — unikátní klíč z obsahu + pořadí.
  const detailsSlug = params.details.trim().replace(/\s+/g, '_').slice(0, 40);
  return [
    'etoro',
    idType,
    params.date,
    amountKey,
    (params.currency || 'USD').toUpperCase(),
    detailsSlug || 'na',
    String(params.occurrence),
  ].join(':');
}

/** Ponech poslední výskyt při kolizi external_id (bezpečnost před upsert batch duplicitám). */
export function dedupeInvestmentTransactionsByExternalId(
  transactions: ParsedEtoroTransaction[],
): ParsedEtoroTransaction[] {
  const byId = new Map<string, ParsedEtoroTransaction>();
  for (const tx of transactions) {
    byId.set(tx.external_id, tx);
  }
  return [...byId.values()];
}

function parseUnits(raw: unknown): number | null {
  const n = parseEtoroNumeric(raw);
  if (n == null || n === 0) return null;
  return Math.round(n * 1_000_000) / 1_000_000;
}

export function parseEtoroTransactionsXlsx(
  fileContent: string | ArrayBuffer,
): EtoroTransactionParseResult {
  const workbook = readWorkbook(fileContent);
  const activitySheet =
    findSheet(workbook, [/Aktivita/i, /Account activity/i, /Account/i]) ??
    (workbook.SheetNames[2] ? workbook.Sheets[workbook.SheetNames[2]!] : null);

  if (!activitySheet) {
    throw new Error('eToro XLSX: list „Aktivita na účtu“ nebyl nalezen.');
  }

  const isinByPositionId = buildIsinLookup(workbook);
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(activitySheet, {
    defval: '',
    raw: false,
    cellDates: true,
  });

  const transactions: ParsedEtoroTransaction[] = [];
  const warnings: string[] = [];
  let skipped = 0;
  let sellRealizedCapitalChangeSum = 0;
  const summary = EMPTY_SUMMARY();
  const occurrenceByKey = new Map<string, number>();

  for (let rowIndex = 0; rowIndex < rawRows.length; rowIndex += 1) {
    const row = rawRows[rowIndex]!;
    const rawType = rowString(row, 'Napište', 'Napište ', 'Type', 'type');
    if (!rawType) continue;

    const mapped = mapEtoroType(rawType);
    if (mapped === 'skip') {
      skipped += 1;
      continue;
    }
    if (mapped == null) {
      warnings.push(`Neznámý typ „${rawType}“ — řádek přeskočen.`);
      continue;
    }

    const date = parseEtoroDateOnly(row.Datum ?? row.Date ?? row.date);
    if (!date) {
      warnings.push(`Nepodařilo se parsovat datum u typu „${rawType}“.`);
      continue;
    }

    const amountRaw = parseEtoroNumeric(row.Částka ?? row.Castka ?? row.Amount ?? row.amount);
    if (amountRaw == null) {
      warnings.push(`Nepodařilo se parsovat částku u typu „${rawType}“ (${date}).`);
      continue;
    }

    const details = rowString(row, 'Podrobnosti', 'Details', 'Instrument');

    if (mapped === 'deposit' || mapped === 'withdrawal') {
      if (isFailedEtoroPaymentRow(row, details)) {
        const statusHint =
          rowString(row, 'Status', 'Stav', 'Payment status', 'Payment Status') || details || rawType;
        console.log(
          `[etoro-import] přeskočen neúspěšný vklad ${date} ${amountRaw} ${statusHint}`,
        );
        skipped += 1;
        continue;
      }
    }

    let effectiveType: InvestmentTransactionType = mapped;
    if (mapped === 'deposit') {
      const promoHay = [
        details,
        rawType,
        rowString(row, 'Poznámka', 'Note', 'Notes', 'Comment'),
      ]
        .filter(Boolean)
        .join(' ');
      if (textLooksLikePromoBrokerDeposit(promoHay)) {
        effectiveType = 'promo';
        console.log(`[etoro-import] promo vklad ${date} ${amountRaw} → type=promo`);
      }
    }

    // Withdrawals/refunds vždy záporně (deterministicky); deposits/promo kladně.
    const amount =
      effectiveType === 'withdrawal'
        ? -Math.abs(amountRaw)
        : effectiveType === 'deposit' || effectiveType === 'promo'
          ? Math.abs(amountRaw)
          : amountRaw;

    const positionId = rowString(row, 'ID pozice', 'Position ID', 'PositionId') || '-';
    const { ticker, currency } = parseTickerAndCurrency(details);
    const resolvedTicker =
      effectiveType === 'deposit' ||
      effectiveType === 'withdrawal' ||
      effectiveType === 'fee' ||
      effectiveType === 'promo'
        ? null
        : ticker;

    const unitsRaw = row.Jednotky ?? row.Units ?? row.Quantity ?? '';
    const units = parseUnits(unitsRaw);
    const pricePerUnit =
      units != null && units !== 0
        ? Math.round((Math.abs(amount) / Math.abs(units)) * 1_000_000) / 1_000_000
        : null;

    const isin = positionId !== '-' ? isinByPositionId.get(positionId) ?? null : null;

    const contentKey = [
      effectiveType,
      date,
      Math.abs(amount).toFixed(6),
      currency.toUpperCase(),
      details.trim().toLowerCase().slice(0, 40) || '-',
      positionId,
    ].join('|');
    const occurrence = (occurrenceByKey.get(contentKey) ?? 0) + 1;
    occurrenceByKey.set(contentKey, occurrence);

    const external_id = buildExternalId({
      positionId,
      type: effectiveType,
      date,
      amount,
      currency,
      details,
      occurrence,
    });

    if (effectiveType === 'sell') {
      const capitalChange = parseEtoroNumeric(
        row['Změna realizovaného kapitálu'] ??
          row['Zmena realizovaneho kapitalu'] ??
          row['Realized equity change'],
      );
      if (capitalChange != null) sellRealizedCapitalChangeSum += capitalChange;
    }

    transactions.push({
      type: effectiveType,
      ticker: resolvedTicker,
      isin,
      units,
      price_per_unit: pricePerUnit,
      amount,
      fee: 0,
      original_currency: currency,
      date,
      external_id,
    });

    summary[effectiveType].count += 1;
    summary[effectiveType].amountSum += amount;
  }

  return {
    transactions: dedupeInvestmentTransactionsByExternalId(transactions),
    skipped,
    warnings,
    summary,
    sellRealizedCapitalChangeSum: Math.round(sellRealizedCapitalChangeSum * 100) / 100,
  };
}

/** Parsuje více eToro XLSX a sloučí transakce (dedupe přes external_id). */
export function parseEtoroTransactionsXlsxFiles(
  fileContents: Array<string | ArrayBuffer>,
): EtoroTransactionParseResult {
  const all: ParsedEtoroTransaction[] = [];
  const warnings: string[] = [];
  let skipped = 0;
  let sellRealizedCapitalChangeSum = 0;
  const summary = EMPTY_SUMMARY();

  for (const content of fileContents) {
    const part = parseEtoroTransactionsXlsx(content);
    all.push(...part.transactions);
    warnings.push(...part.warnings);
    skipped += part.skipped;
    sellRealizedCapitalChangeSum += part.sellRealizedCapitalChangeSum;
    for (const type of Object.keys(summary) as InvestmentTransactionType[]) {
      summary[type].count += part.summary[type].count;
      summary[type].amountSum += part.summary[type].amountSum;
    }
  }

  return {
    transactions: dedupeInvestmentTransactionsByExternalId(all),
    skipped,
    warnings,
    summary,
    sellRealizedCapitalChangeSum: Math.round(sellRealizedCapitalChangeSum * 100) / 100,
  };
}

export function logEtoroTransactionParseSummary(result: EtoroTransactionParseResult): void {
  const { summary, transactions, skipped, warnings, sellRealizedCapitalChangeSum } = result;

  console.log(`[eToro tx parser] Parsed ${transactions.length} transactions (skipped ${skipped}).`);
  for (const type of Object.keys(summary) as InvestmentTransactionType[]) {
    const row = summary[type];
    if (row.count === 0) continue;
    console.log(
      `  ${type}: ${row.count} rows, sum amount (Částka) = ${row.amountSum.toFixed(2)}`,
    );
  }

  console.log('[eToro tx parser] Overview check (Přehled účtu):');
  console.log(`  Vklady (deposit): ${summary.deposit.amountSum.toFixed(2)} USD`);
  console.log(`  Promo / free shares: ${summary.promo.amountSum.toFixed(2)} USD`);
  console.log(`  Výběry (withdrawal): ${summary.withdrawal.amountSum.toFixed(2)} USD`);
  console.log(
    `  Vložené vlastní peníze (deposit − withdrawal): ${(summary.deposit.amountSum - Math.abs(summary.withdrawal.amountSum)).toFixed(2)} USD`,
  );
  console.log(`  Dividendy (dividend): ${summary.dividend.amountSum.toFixed(2)} USD`);
  console.log(
    `  Zisk uzavřených pozic (sell, Změna RK): ${sellRealizedCapitalChangeSum.toFixed(2)} USD`,
  );
  console.log(
    `  Sell sum (Částka): ${summary.sell.amountSum.toFixed(2)} USD — jiná metrika než Přehled „Zisk“`,
  );

  if (warnings.length) {
    console.log(`[eToro tx parser] Warnings (${warnings.length}):`);
    for (const w of warnings.slice(0, 10)) console.log(`  - ${w}`);
    if (warnings.length > 10) console.log(`  … +${warnings.length - 10} more`);
  }
}
