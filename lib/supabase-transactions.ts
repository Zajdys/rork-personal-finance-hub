import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  buildBankExternalId,
  buildTransactionUniqueKey,
} from '@/lib/bank-import-unique-key';
import { supabase } from '@/lib/supabase';
import type { Transaction } from '@/store/finance-store';
import { compareTxDateDesc, transactionDateYmd } from '@/lib/transaction-date';
import { normalizeAccount } from '@/utils/normalizeAccount';

const FINANCE_TX_KEY = 'finance_transactions';

/** PostgREST default max-rows — stránkování musí být deterministické (order + range). */
const TX_PAGE_SIZE = 1000;

export { buildTransactionUniqueKey } from '@/lib/bank-import-unique-key';

function categorySourceOrNull(
  v: unknown,
): 'user' | 'crowd' | 'dictionary' | 'keyword' | 'transfer' | 'import' | null {
  if (
    v === 'user' ||
    v === 'crowd' ||
    v === 'dictionary' ||
    v === 'keyword' ||
    v === 'transfer' ||
    v === 'import'
  ) {
    return v;
  }
  return null;
}

function dedupeTransactionRowsByUniqueKey(
  rows: Record<string, unknown>[],
): Record<string, unknown>[] {
  const byKey = new Map<string, Record<string, unknown>>();
  const withoutKey: Record<string, unknown>[] = [];

  for (const row of rows) {
    const keyRaw = row.unique_key;
    if (typeof keyRaw !== 'string' || !keyRaw.trim()) {
      withoutKey.push(row);
      continue;
    }
    const key = keyRaw.trim();
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, row);
      continue;
    }
    const existingCreated = String(existing.created_at ?? '');
    const rowCreated = String(row.created_at ?? '');
    if (rowCreated > existingCreated) {
      byKey.set(key, row);
    }
  }

  return [...byKey.values(), ...withoutKey];
}

export async function getAuthUserId(): Promise<string | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.id) return null;
  return data.user.id;
}

export function transactionToRow(t: Transaction, userId: string) {
  const description = t.title;
  const source = t.source ?? 'manual';
  const bankTransactionId = t.bankTransactionId?.trim() || null;
  const externalId =
    t.externalId?.trim() || buildBankExternalId(source, bankTransactionId);
  const counterpartyAccount = normalizeAccount(t.counterpartyAccount) || null;
  const counterpartyName = t.counterpartyName?.trim() || null;
  const categorySource = categorySourceOrNull(t.categorySource);
  const merchantKey =
    typeof t.merchantKey === 'string' && t.merchantKey.trim()
      ? t.merchantKey.trim()
      : null;
  const originalCurrency =
    typeof t.originalCurrency === 'string' && t.originalCurrency.trim()
      ? t.originalCurrency.trim().toUpperCase()
      : null;
  const originalAmount =
    originalCurrency && originalCurrency !== 'CZK' && t.originalAmount != null
      ? Number(t.originalAmount)
      : null;
  const exchangeRate =
    originalAmount != null && t.exchangeRate != null ? Number(t.exchangeRate) : null;
  return {
    id: t.id,
    user_id: userId,
    date: t.date,
    booking_date: t.bookingDate ?? null,
    amount: t.amount,
    type: t.type,
    category: t.category,
    description,
    source,
    import_batch_id: t.importBatchId ?? null,
    receipt_url: t.receiptUrl ?? null,
    is_refund: !!t.isRefund,
    counterparty_account: counterpartyAccount,
    counterparty_name: counterpartyName,
    merchant_key: merchantKey,
    original_amount: originalAmount,
    original_currency: originalAmount != null ? originalCurrency : null,
    exchange_rate: exchangeRate,
    ...(categorySource ? { category_source: categorySource } : {}),
    ...(externalId ? { external_id: externalId } : {}),
    unique_key: buildTransactionUniqueKey({
      userId,
      bank: source,
      date: t.date,
      amount: t.amount,
      description,
      bankTransactionId,
    }),
  };
}

/** Řádek pro RPC `import_bank_transactions` — bez `id` i bez `user_id` (RPC doplní auth.uid()). */
export function bankImportTransactionToInsertRow(t: Transaction, userId: string) {
  const description = (t.title || '').trim() || 'Bez názvu';
  const source = t.source?.trim() ? t.source.trim() : 'bank_import';
  const bankTransactionId = t.bankTransactionId?.trim() || null;
  const externalId =
    t.externalId?.trim() || buildBankExternalId(source, bankTransactionId);
  const counterpartyAccount = normalizeAccount(t.counterpartyAccount) || null;
  const counterpartyName = t.counterpartyName?.trim() || null;
  const categorySource = categorySourceOrNull(t.categorySource);
  const merchantKey =
    typeof t.merchantKey === 'string' && t.merchantKey.trim()
      ? t.merchantKey.trim()
      : null;
  const originalCurrency =
    typeof t.originalCurrency === 'string' && t.originalCurrency.trim()
      ? t.originalCurrency.trim().toUpperCase()
      : null;
  const originalAmount =
    originalCurrency && originalCurrency !== 'CZK' && t.originalAmount != null
      ? Number(t.originalAmount)
      : null;
  const exchangeRate =
    originalAmount != null && t.exchangeRate != null ? Number(t.exchangeRate) : null;
  return {
    date: t.date,
    booking_date: t.bookingDate ?? null,
    amount: t.amount,
    type: t.type,
    category: t.category?.trim() ? t.category : 'Ostatní',
    description,
    source,
    import_batch_id: t.importBatchId ?? null,
    receipt_url: t.receiptUrl ?? null,
    is_refund: !!t.isRefund,
    counterparty_account: counterpartyAccount,
    counterparty_name: counterpartyName,
    merchant_key: merchantKey,
    original_amount: originalAmount,
    original_currency: originalAmount != null ? originalCurrency : null,
    exchange_rate: exchangeRate,
    category_source: categorySource ?? 'import',
    ...(externalId ? { external_id: externalId } : {}),
    unique_key: buildTransactionUniqueKey({
      userId,
      bank: source,
      // `date` = zaúčtování (ne valuta / booking_date)
      date: t.date,
      amount: t.amount,
      description,
      bankTransactionId,
    }),
  };
}

export function rowToTransaction(row: Record<string, unknown>): Transaction {
  const rawDate = row.date;
  const dateStr =
    typeof rawDate === 'string'
      ? rawDate.slice(0, 10)
      : rawDate instanceof Date
        ? transactionDateYmd(rawDate)
        : String(rawDate ?? '').slice(0, 10);

  const rawBooking = row.booking_date;
  const bookingDate =
    typeof rawBooking === 'string' && rawBooking.length > 0
      ? rawBooking.slice(0, 10)
      : rawBooking instanceof Date
        ? transactionDateYmd(rawBooking)
        : null;

  const cpAcc =
    typeof row.counterparty_account === 'string' && row.counterparty_account.trim()
      ? row.counterparty_account.trim()
      : undefined;
  const cpName =
    typeof row.counterparty_name === 'string' && row.counterparty_name.trim()
      ? row.counterparty_name.trim()
      : undefined;
  const categorySource = categorySourceOrNull(row.category_source);
  const merchantKey =
    typeof row.merchant_key === 'string' && row.merchant_key.trim()
      ? row.merchant_key.trim()
      : null;

  const originalCurrency =
    typeof row.original_currency === 'string' && row.original_currency.trim()
      ? row.original_currency.trim().toUpperCase()
      : null;
  const originalAmount =
    originalCurrency && row.original_amount != null && Number.isFinite(Number(row.original_amount))
      ? Number(row.original_amount)
      : null;
  const exchangeRate =
    originalAmount != null && row.exchange_rate != null && Number.isFinite(Number(row.exchange_rate))
      ? Number(row.exchange_rate)
      : null;

  return {
    id: String(row.id),
    type: row.type === 'income' ? 'income' : 'expense',
    amount: Number(row.amount),
    title: String(row.description ?? ''),
    category: String(row.category ?? 'Ostatní'),
    date: dateStr || transactionDateYmd(new Date()),
    bookingDate: bookingDate,
    source: (typeof row.source === 'string' ? row.source : 'manual') as string | undefined,
    importBatchId: row.import_batch_id ? String(row.import_batch_id) : undefined,
    receiptUrl:
      typeof row.receipt_url === 'string' && row.receipt_url.length > 0
        ? row.receipt_url
        : undefined,
    uniqueKey:
      typeof row.unique_key === 'string' && row.unique_key.length > 0
        ? row.unique_key
        : undefined,
    externalId:
      typeof row.external_id === 'string' && row.external_id.length > 0
        ? row.external_id
        : undefined,
    bankTransactionId: undefined,
    isRefund: row.is_refund === true,
    merchantKey,
    originalAmount,
    originalCurrency: originalAmount != null ? originalCurrency : null,
    exchangeRate,
    ...(categorySource ? { categorySource } : {}),
    ...(cpAcc ? { counterpartyAccount: cpAcc } : {}),
    ...(cpName ? { counterpartyName: cpName } : {}),
  };
}

const UPSERT_CHUNK = 250;

export async function upsertTransactionsRemote(
  transactions: Transaction[],
  userId: string,
): Promise<{ error: Error | null }> {
  if (!transactions.length) return { error: null };
  const rows = transactions.map((t) => transactionToRow(t, userId));
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK);
    const { error } = await supabase.from('transactions').upsert(chunk, { onConflict: 'id' });
    if (error) return { error: new Error(error.message) };
  }
  return { error: null };
}

/**
 * Bankovní import: insert bez lokálního `id` (DB vygeneruje UUID).
 * Deduplikace + backfill protiúčtů: jedno RPC `import_bank_transactions`
 * (ON CONFLICT (user_id, unique_key) DO NOTHING + NULL-only counterparty backfill).
 * Limit: max 10_000 řádků na volání (stejně jako funkce v DB).
 */
export async function insertBankImportTransactionsRemote(
  transactions: Transaction[],
  userId: string,
): Promise<{
  transactions: Transaction[] | null;
  error: Error | null;
  skippedDuplicates: number;
  backfilledCounterparties: number;
}> {
  console.log('[import] krok 5a insert start', { count: transactions.length, userId });
  if (!transactions.length) {
    return { transactions: [], error: null, skippedDuplicates: 0, backfilledCounterparties: 0 };
  }

  const rows = transactions.map((t) => bankImportTransactionToInsertRow(t, userId));

  // Deduplikace uvnitř dávky (stejný klíč 2× v jednom PDF/CSV)
  const byKey = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const k = row.unique_key.trim();
    if (!byKey.has(k)) byKey.set(k, row);
  }
  const dedupedRows = [...byKey.values()];
  const intraBatchSkipped = rows.length - dedupedRows.length;
  console.log('[import] krok 5b dedupe', {
    rows: rows.length,
    unique: dedupedRows.length,
    intraBatchSkipped,
  });

  if (!dedupedRows.length) {
    return {
      transactions: [],
      error: null,
      skippedDuplicates: intraBatchSkipped,
      backfilledCounterparties: 0,
    };
  }

  if (dedupedRows.length > 10_000) {
    console.error('[import] krok 5c too many rows', { count: dedupedRows.length });
    return {
      transactions: null,
      error: new Error(
        `Příliš mnoho transakcí k importu (${dedupedRows.length}). Maximum je 10 000 — rozdělte výpis.`,
      ),
      skippedDuplicates: intraBatchSkipped,
      backfilledCounterparties: 0,
    };
  }

  console.log('[import] krok 5c rpc import_bank_transactions', { rows: dedupedRows.length });
  const { data, error } = await supabase.rpc('import_bank_transactions', {
    p_rows: dedupedRows,
  });
  if (error) {
    console.error('[import] krok 5c rpc failed', error);
    return {
      transactions: null,
      error: new Error(error.message),
      skippedDuplicates: intraBatchSkipped,
      backfilledCounterparties: 0,
    };
  }

  const payload = (data ?? {}) as {
    inserted?: unknown;
    backfilled_counterparties?: number;
  };
  const insertedRaw = Array.isArray(payload.inserted) ? payload.inserted : [];
  const inserted: Transaction[] = [];
  for (const row of insertedRaw) {
    if (row && typeof row === 'object') {
      inserted.push(rowToTransaction(row as Record<string, unknown>));
    }
  }
  const backfilledCounterparties =
    typeof payload.backfilled_counterparties === 'number'
      ? payload.backfilled_counterparties
      : 0;

  const skippedDuplicates = intraBatchSkipped + (dedupedRows.length - inserted.length);
  console.log('[import] krok 5e insert+backfill complete', {
    inserted: inserted.length,
    skippedDuplicates,
    backfilledCounterparties,
  });

  return {
    transactions: inserted,
    error: null,
    skippedDuplicates,
    backfilledCounterparties,
  };
}

/** Přepočet kategorie Převod podle normalizovaných protiúčtů (RPC). */
export async function reclassifyTransfersByAccountsRemote(
  normalizedAccounts: string[],
): Promise<{
  updatedCount: number;
  missingCounterpartyCount: number;
  error: Error | null;
}> {
  const accounts = [...new Set(normalizedAccounts.map((a) => a.trim()).filter(Boolean))];
  if (!accounts.length) {
    return { updatedCount: 0, missingCounterpartyCount: 0, error: null };
  }
  const { data, error } = await supabase.rpc('reclassify_transfers_by_accounts', {
    p_accounts: accounts,
  });
  if (error) return { updatedCount: 0, missingCounterpartyCount: 0, error: new Error(error.message) };
  const obj = (data ?? {}) as { updated_count?: number; missing_counterparty_count?: number };
  return {
    updatedCount: Number(obj.updated_count ?? 0),
    missingCounterpartyCount: Number(obj.missing_counterparty_count ?? 0),
    error: null,
  };
}

/** Přepočet kategorie Převod podle vlastních účtů v DB (RPC bez parametru). */
export async function reclassifyOwnAccountTransfersRemote(): Promise<{
  updatedCount: number;
  error: Error | null;
}> {
  const { data, error } = await supabase.rpc('reclassify_own_account_transfers');
  if (error) return { updatedCount: 0, error: new Error(error.message) };
  return { updatedCount: Number(data ?? 0) || 0, error: null };
}

export async function deleteTransactionRemote(id: string, userId: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('transactions').delete().eq('id', id).eq('user_id', userId);
  if (error) return { error: new Error(error.message) };
  return { error: null };
}

export async function deleteTransactionsRemote(ids: string[], userId: string): Promise<{ error: Error | null }> {
  if (!ids.length) return { error: null };
  for (let i = 0; i < ids.length; i += UPSERT_CHUNK) {
    const chunk = ids.slice(i, i + UPSERT_CHUNK);
    const { error } = await supabase.from('transactions').delete().eq('user_id', userId).in('id', chunk);
    if (error) return { error: new Error(error.message) };
  }
  return { error: null };
}

export async function fetchTransactionSourcesRemote(userId: string): Promise<{
  sources: string[];
  error: Error | null;
}> {
  const unique = new Set<string>();
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('transactions')
      .select('source')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + TX_PAGE_SIZE - 1);

    if (error) return { sources: [], error: new Error(error.message) };

    const page = data ?? [];
    for (const row of page) {
      const s = String((row as { source?: string }).source ?? 'manual').trim() || 'manual';
      unique.add(s);
    }
    if (page.length < TX_PAGE_SIZE) break;
    from += TX_PAGE_SIZE;
  }

  return { sources: [...unique].sort((a, b) => a.localeCompare(b)), error: null };
}

export async function fetchTransactionsRemote(
  userId: string,
  options?: { sources?: string[] },
): Promise<{
  transactions: Transaction[] | null;
  error: Error | null;
}> {
  try {
    const sources = options?.sources?.filter(Boolean);
    const allRows: Record<string, unknown>[] = [];
    let from = 0;

    for (;;) {
      let query = supabase.from('transactions').select('*').eq('user_id', userId);
      if (sources && sources.length > 0) {
        query = query.in('source', sources);
      }

      const { data, error } = await query
        .order('date', { ascending: false })
        .order('id', { ascending: false })
        .range(from, from + TX_PAGE_SIZE - 1);

      if (error) return { transactions: null, error: new Error(error.message) };

      const page = (data ?? []) as Record<string, unknown>[];
      allRows.push(...page);
      if (page.length < TX_PAGE_SIZE) break;
      from += TX_PAGE_SIZE;
    }

    const dedupedRows = dedupeTransactionRowsByUniqueKey(allRows);
    const missingUniqueKeyCount = dedupedRows.filter(
      (row) => typeof row.unique_key !== 'string' || !row.unique_key.trim(),
    ).length;
    console.log('Transactions without unique_key:', missingUniqueKeyCount);

    const list = dedupedRows.map((row) => rowToTransaction(row));
    list.sort(compareTxDateDesc);
    console.log('[fetchTransactionsRemote] loaded', {
      pages: Math.ceil(allRows.length / TX_PAGE_SIZE) || (allRows.length ? 1 : 0),
      rawRows: allRows.length,
      afterDedupe: list.length,
    });
    return { transactions: list, error: null };
  } catch (e) {
    console.warn('[fetchTransactionsRemote] threw', e);
    return {
      transactions: null,
      error: e instanceof Error ? e : new Error(String(e ?? 'Network request failed')),
    };
  }
}

/** Transakce z AsyncStorage (JSON pole). */
export async function loadTransactionsFromAsyncStorage(): Promise<Transaction[]> {
  const raw = await AsyncStorage.getItem(FINANCE_TX_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((t: any) => ({
      ...t,
      date: transactionDateYmd(t.date),
      isRefund: t.isRefund === true || t.is_refund === true,
    })) as Transaction[];
  } catch {
    return [];
  }
}

export { FINANCE_TX_KEY };
