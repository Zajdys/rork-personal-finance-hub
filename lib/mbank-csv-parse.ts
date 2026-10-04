/**
 * mBank CZ CSV výpis (Windows-1250, středník, ~30 řádků hlavičky před tabulkou).
 */
import type { ImportBucket, ParsedImportRow, BankFormat } from '@/lib/bank-statement-parser';
import {
  parseAmount,
  parseTransactionDate,
  classifyDescription,
  bucketToStoreCategory,
} from '@/lib/bank-statement-parser';
import { toYyyyMmDd } from '@/lib/transaction-date';
import { normalizeOwnerAccountList } from '@/lib/owner-account-match';
import { normalizeAccount, isOwnCounterpartyAccount } from '@/utils/normalizeAccount';
import { normalizeMerchantKey } from '@/lib/normalize-merchant-key';
import { lookupMerchantDictionary } from '@/lib/merchant-dictionary';
import Papa from 'papaparse';

export const MBANK_FORMAT: BankFormat = {
  id: 'mbank',
  label: 'mBank',
  dateCol: '#Datum zaúčtování transakce',
  amountCol: '#Částka transakce',
  descCol: '#Popis transakce',
};

const COL = {
  date: '#Datum zaúčtování transakce',
  booking: '#Datum uskutečnění transakce',
  opType: '#Popis transakce',
  message: '#Zpráva pro příjemce',
  counterpartyName: '#Plátce/Příjemce',
  counterpartyAccount: '#Číslo účtu plátce/příjemce',
  amount: '#Částka transakce',
} as const;

const TABLE_HEADER_MARKER = '#Datum zaúčtování transakce';
const TABLE_END_MARKERS = [/^#Konečný zůstatek/i, /^Prosíme Vás o kontrolu/i];

export type MbankStatementMeta = {
  openingBalance: number | null;
  closingBalance: number | null;
  credited: number | null;
  debited: number | null;
  /** Počet z řádku Součet (včetně nulových řádků typu ZŘÍZENÍ ÚČTU). */
  declaredRowCount: number | null;
  declaredClosing: number | null;
};

export type MbankParseValidation = {
  ok: boolean;
  parsed: number;
  balanceOk: boolean;
  totalsOk: boolean;
  incomeSum: number;
  expenseSum: number;
  netDelta: number;
  balanceDelta: number | null;
};

/** Detekce českého mBank výpisu (ne polský export s Data operacji). */
export function isMbankCzCsvText(text: string): boolean {
  const sample = text.slice(0, 8_000);
  if (/mBank\s+S\.A\./i.test(sample)) return true;
  if (/mLinka\s*:/i.test(sample)) return true;
  if (/VÝPIS\s+Z\s+ÚČTU\s+ZA\s+ZVOLENÉ\s+OBDOBÍ/i.test(sample)) return true;
  if (sample.includes(TABLE_HEADER_MARKER) && /#Číslo účtu plátce\/příjemce/i.test(sample)) {
    return true;
  }
  return false;
}

function moneyFromLabeled(text: string, label: RegExp): number | null {
  const m = text.match(label);
  if (!m) return null;
  const raw = m[1] ?? m[0];
  const cleaned = String(raw).replace(/\s*CZK\s*$/i, '').trim();
  const n = parseAmount(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function extractMbankStatementMeta(text: string): MbankStatementMeta {
  const opening = moneyFromLabeled(
    text,
    /#Počáteční zůstatek:\s*;?\s*(-?[\d\s]+,\d{2})\s*(?:CZK)?/i,
  );
  // i když je na řádku s prázdnými sloupečky: ;;;;;;#Počáteční zůstatek:;0,00 CZK;
  const openingAlt =
    opening ??
    moneyFromLabeled(text, /#Počáteční zůstatek:\s*(-?[\d\s]+,\d{2})\s*(?:CZK)?/i);

  const closing =
    moneyFromLabeled(text, /#Konečný zůstatek:\s*;?\s*(-?[\d\s]+,\d{2})\s*(?:CZK)?/i) ??
    moneyFromLabeled(text, /#Konečný zůstatek:\s*(-?[\d\s]+,\d{2})\s*(?:CZK)?/i);

  let credited: number | null = null;
  let debited: number | null = null;
  const kredit = text.match(/Kreditní položky;\d+;(-?[\d\s]+,\d{2})\s*CZK/i);
  const debet = text.match(/Debetní položky;\d+;(-?[\d\s]+,\d{2})\s*CZK/i);
  if (kredit?.[1]) credited = Math.abs(parseAmount(kredit[1]));
  if (debet?.[1]) debited = Math.abs(parseAmount(debet[1]));

  let declaredRowCount: number | null = null;
  let declaredClosing: number | null = null;
  const sum = text.match(/Součet;(\d+);(-?[\d\s]+,\d{2})\s*CZK/i);
  if (sum) {
    declaredRowCount = Number(sum[1]);
    declaredClosing = parseAmount(sum[2]!);
  }

  return {
    openingBalance: openingAlt,
    closingBalance: closing,
    credited,
    debited,
    declaredRowCount,
    declaredClosing,
  };
}

export function validateMbankParse(
  rows: { type: 'income' | 'expense'; amount: number }[],
  meta: MbankStatementMeta,
): MbankParseValidation {
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
  if (meta.declaredClosing != null && meta.closingBalance != null) {
    totalsOk = totalsOk && Math.abs(meta.declaredClosing - meta.closingBalance) < 0.025;
  }

  return {
    ok: balanceOk && totalsOk,
    parsed,
    balanceOk,
    totalsOk,
    incomeSum,
    expenseSum,
    netDelta,
    balanceDelta,
  };
}

/**
 * Ořízne hlavičku/patičku — vrátí jen CSV tabulku transakcí (včetně header řádku).
 */
export function extractMbankTransactionTable(text: string): string | null {
  const lines = text.split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.includes(TABLE_HEADER_MARKER)) {
      start = i;
      break;
    }
  }
  if (start < 0) return null;

  const out: string[] = [];
  for (let i = start; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();
    if (i > start && (trimmed === '' || TABLE_END_MARKERS.some((re) => re.test(trimmed)))) {
      break;
    }
    // řádek „;;;;;;#Konečný zůstatek:…“
    if (i > start && /#Konečný zůstatek/i.test(line)) break;
    out.push(line);
  }
  return out.length >= 2 ? out.join('\n') : null;
}

/**
 * „Trafika Kaufland   /PLZEN - JI   DATUM PROVEDENÍ TRANSAKCE: 2026-07-21“
 * → merchant před lomítkem + volitelné booking ISO datum.
 */
export function parseMbankMessageField(message: string): {
  merchant: string;
  bookingFromMessage: string | null;
} {
  let raw = String(message ?? '')
    .replace(/^["']|["']$/g, '')
    .trim();
  if (!raw || raw === '""') return { merchant: '', bookingFromMessage: null };

  let bookingFromMessage: string | null = null;
  const datumM = raw.match(/DATUM\s+PROVEDEN[ÍI]\s+TRANSAKCE:\s*(\d{4}-\d{2}-\d{2})/i);
  if (datumM?.[1]) {
    bookingFromMessage = datumM[1];
    raw = raw.slice(0, datumM.index).trim();
  }

  const slash = raw.indexOf('/');
  const before = (slash >= 0 ? raw.slice(0, slash) : raw).replace(/\s+/g, ' ').trim();
  return { merchant: before, bookingFromMessage };
}

/** '000000-0767628004/5500' → 767628004/5500 */
export function normalizeMbankAccount(raw: string | null | undefined): string | undefined {
  if (raw == null) return undefined;
  let s = String(raw).trim();
  // apostrofy / uvozovky kolem hodnoty
  s = s.replace(/^['"]+|['"]+$/g, '').trim();
  if (!s || s === "''" || s === '""') return undefined;
  return normalizeAccount(s) ?? undefined;
}

function cleanName(raw: string | undefined): string | undefined {
  const s = String(raw ?? '')
    .replace(/^["']|["']$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return s || undefined;
}

function ymdFromRaw(raw: string): string | null {
  const d = parseTransactionDate(raw);
  return d ? toYyyyMmDd(d) : null;
}

type PapaRow = Record<string, string>;

export function parseMbankCzCsv(
  text: string,
  ownerAccounts: string[] = [],
): { bank: BankFormat; rows: ParsedImportRow[] } | { error: string } {
  if (!isMbankCzCsvText(text)) {
    return { error: 'Soubor nevypadá jako výpis mBank.' };
  }

  const table = extractMbankTransactionTable(text);
  if (!table) {
    return { error: 'V mBank CSV chybí tabulka transakcí (#Datum zaúčtování transakce).' };
  }

  const parsed = Papa.parse(table, {
    header: true,
    skipEmptyLines: 'greedy',
    delimiter: ';',
    transformHeader: (h: string) => h.replace(/^\uFEFF/, '').trim(),
  }) as {
    data: PapaRow[];
    errors?: { type?: string; message?: string }[];
  };

  if (parsed.errors?.length) {
    const fatal = parsed.errors.find(
      (e: { type?: string; message?: string }) => e.type === 'Quotes' || e.type === 'Delimiter',
    );
    if (fatal) {
      return { error: fatal.message || 'Chyba při čtení mBank CSV.' };
    }
  }

  const ownerNorm = normalizeOwnerAccountList(ownerAccounts);
  const rows: ParsedImportRow[] = [];

  for (const rec of parsed.data || []) {
    const dateRaw = (rec[COL.date] ?? '').trim();
    const amountRaw = rec[COL.amount] ?? '';
    const opType = cleanName(rec[COL.opType]) ?? '';
    const messageRaw = rec[COL.message] ?? '';
    const cpNameRaw = rec[COL.counterpartyName];
    const cpAccRaw = rec[COL.counterpartyAccount];

    if (!dateRaw && !amountRaw && !opType) continue;

    const date = ymdFromRaw(dateRaw);
    if (!date) continue;

    const rawAmount = parseAmount(amountRaw);
    // ZŘÍZENÍ ÚČTU / nulové řádky — nejsou transakce
    if (Math.abs(rawAmount) < 0.005) continue;
    if (/z[řr][íi]zen[íi]\s+[úu][čc]tu/i.test(opType)) continue;

    const { merchant, bookingFromMessage } = parseMbankMessageField(messageRaw);
    const bookingCol = ymdFromRaw((rec[COL.booking] ?? '').trim());
    const bookingDate = bookingFromMessage ?? bookingCol ?? null;

    const counterpartyAccount = normalizeMbankAccount(cpAccRaw);
    const counterpartyName = cleanName(cpNameRaw);

    const isCard = /platba\s+kartou/i.test(opType);
    const isTransfer =
      Boolean(counterpartyAccount) ||
      /p[řr][íi]choz[íi]|odchoz[íi]|okam[žz]it[áa]\s+platba|p[řr]evod/i.test(opType);

    const merchantOrName = merchant || (!isCard ? counterpartyName : undefined) || '';
    const description =
      merchantOrName && opType
        ? `${opType} · ${merchantOrName}`
        : merchantOrName || opType || 'Bez popisu';

    const type: 'income' | 'expense' = rawAmount >= 0 ? 'income' : 'expense';
    const amount = Math.abs(rawAmount);

    const isOwn = isOwnCounterpartyAccount(counterpartyAccount, ownerNorm);
    const treatAsTransfer = isOwn || (Boolean(counterpartyAccount) && isTransfer);

    let category: string;
    let bucket: ImportBucket;
    if (treatAsTransfer) {
      bucket = 'Převod';
      category = 'Převod';
    } else {
      const mk = normalizeMerchantKey(merchantOrName || description);
      const fromDict = mk ? lookupMerchantDictionary(mk) : null;
      if (fromDict) {
        category = fromDict;
        bucket = classifyDescription(merchantOrName || description);
      } else {
        bucket = classifyDescription(merchantOrName || description);
        category = bucketToStoreCategory(bucket, type);
      }
    }

    rows.push({
      date,
      bookingDate,
      rawAmount,
      description: isOwn ? 'Převod mezi účty' : description,
      type,
      amount,
      bucket,
      category,
      source: 'mbank',
      ...(counterpartyAccount ? { counterpartyAccount } : {}),
      ...(counterpartyName && !isCard ? { counterpartyName } : {}),
    });
  }

  if (rows.length === 0) {
    return { error: 'V mBank CSV nebyly nalezeny žádné platné transakce.' };
  }

  const meta = extractMbankStatementMeta(text);
  const check = validateMbankParse(rows, meta);
  if (!check.ok) {
    return {
      error: `Výpis mBank se nepodařilo načíst celý (načteno ${check.parsed} transakcí, příjmy ${check.incomeSum.toFixed(2)} / výdaje ${check.expenseSum.toFixed(2)}, očekáváno příjmy ${meta.credited ?? '?'} / výdaje ${meta.debited ?? '?'}).`,
    };
  }

  return { bank: MBANK_FORMAT, rows };
}
