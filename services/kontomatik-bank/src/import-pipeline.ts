import type { SupabaseClient } from '@supabase/supabase-js';
import type { ClassifyContext } from '../../../lib/classify-import-category.ts';
import { normalizeMerchantKey } from '../../../lib/normalize-merchant-key.ts';
import { applyDedupeDecisions, type ExistingTx } from './dedupe/match';
import type { MappedBankRow } from './map/transactions';
import { mapAisAccountsToRows, type AisAccount } from './map/transactions';
import { OutboundError, withTimeout } from './http';

/** ±3 dny kolem AIS batch (fuzzy dedupe ±2). */
export const DEDUPE_DATE_PADDING_DAYS = 3;
const DEDUPE_PAGE_SIZE = 1000;

const EXISTING_TX_SELECT =
  'id, date, amount, type, description, counterparty_account, merchant_key, category, category_source, kontomatik_tx_id, source';

function addUtcDays(ymd: string, delta: number): string {
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number);
  const t = Date.UTC(y!, m! - 1, d!);
  const next = new Date(t + delta * 86_400_000);
  return next.toISOString().slice(0, 10);
}

/** Okno pro načtení existujících řádků k dedupe (min/max AIS date ± padding). */
export function computeDedupeDateWindow(
  dates: string[],
  paddingDays = DEDUPE_DATE_PADDING_DAYS,
): { from: string; to: string } | null {
  if (!dates.length) return null;
  let min = dates[0]!.slice(0, 10);
  let max = min;
  for (const d of dates) {
    const day = d.slice(0, 10);
    if (day < min) min = day;
    if (day > max) max = day;
  }
  return {
    from: addUtcDays(min, -paddingDays),
    to: addUtcDays(max, paddingDays),
  };
}

/**
 * Existující PDF/CSV/AIS řádky pro dedupe — filtr data + stránkování (.range).
 */
export async function fetchExistingForDedupe(
  service: SupabaseClient,
  userId: string,
  bank: string,
  dateFrom: string,
  dateTo: string,
): Promise<ExistingTx[]> {
  const out: ExistingTx[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await withTimeout(
      `supabase.transactions.select.${offset}`,
      service
        .from('transactions')
        .select(EXISTING_TX_SELECT)
        .eq('user_id', userId)
        .eq('source', bank)
        .gte('date', dateFrom)
        .lte('date', dateTo)
        .order('date', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + DEDUPE_PAGE_SIZE - 1),
    );
    if (error) {
      throw new OutboundError('supabase.transactions.select', error.message);
    }
    const chunk = (data ?? []) as ExistingTx[];
    out.push(...chunk);
    if (chunk.length < DEDUPE_PAGE_SIZE) break;
    offset += DEDUPE_PAGE_SIZE;
  }

  return out;
}

/** owner_bank_accounts.account_number (+ normalized) pro detekci Převod. */
export async function fetchOwnerAccounts(
  service: SupabaseClient,
  userId: string,
): Promise<string[]> {
  const { data, error } = await withTimeout(
    'supabase.owner_bank_accounts.select',
    service
      .from('owner_bank_accounts')
      .select('account_number, account_number_normalized')
      .eq('user_id', userId),
  );
  if (error) {
    throw new OutboundError('supabase.owner_bank_accounts.select', error.message);
  }
  const out: string[] = [];
  for (const row of data ?? []) {
    if (row.account_number) out.push(String(row.account_number));
    if (row.account_number_normalized) {
      out.push(String(row.account_number_normalized));
    }
  }
  return out;
}

export async function fetchClassifyContext(
  service: SupabaseClient,
  userId: string,
): Promise<ClassifyContext> {
  const userRules = new Map<string, string>();
  const globalCache = new Map<string, string>();

  const [rulesRes, crowdRes] = await Promise.all([
    withTimeout(
      'supabase.user_category_rules.select',
      service
        .from('user_category_rules')
        .select('merchant_key, category')
        .eq('user_id', userId),
    ),
    withTimeout(
      'supabase.merchant_categories.select',
      service
        .from('merchant_categories')
        .select('merchant_key, category')
        .eq('source', 'crowd')
        .limit(10000),
    ),
  ]);

  if (rulesRes.error) {
    const legacy = await withTimeout(
      'supabase.user_merchant_categories.select',
      service
        .from('user_merchant_categories')
        .select('merchant_key, category_id')
        .eq('user_id', userId),
    );
    if (!legacy.error) {
      for (const row of legacy.data ?? []) {
        if (!row.merchant_key || !row.category_id) continue;
        const key = normalizeMerchantKey(row.merchant_key) || row.merchant_key;
        userRules.set(key, row.category_id);
      }
    }
  } else {
    for (const row of rulesRes.data ?? []) {
      if (!row.merchant_key || !row.category) continue;
      const key = normalizeMerchantKey(row.merchant_key) || row.merchant_key;
      userRules.set(key, row.category);
    }
  }

  if (!crowdRes.error) {
    for (const row of crowdRes.data ?? []) {
      if (row.merchant_key && row.category) {
        globalCache.set(String(row.merchant_key), String(row.category));
      }
    }
  }

  return { userRules, globalCache };
}

export async function persistAisImport(params: {
  service: SupabaseClient;
  userId: string;
  target: string | null;
  officialName: string | null;
  accounts: AisAccount[];
}): Promise<{
  bank: string;
  ibans: string[];
  inserted: number;
  enriched: number;
  review: number;
}> {
  const [ownerAccounts, classifyCtx] = await Promise.all([
    fetchOwnerAccounts(params.service, params.userId),
    fetchClassifyContext(params.service, params.userId),
  ]);

  const { rows, bank, ibans } = mapAisAccountsToRows({
    userId: params.userId,
    target: params.target,
    officialName: params.officialName,
    accounts: params.accounts,
    ownerAccounts,
    classifyCtx,
  });

  const window = computeDedupeDateWindow(rows.map((r) => r.date));
  const existing = window
    ? await fetchExistingForDedupe(
        params.service,
        params.userId,
        bank,
        window.from,
        window.to,
      )
    : [];

  const { toInsert, enrichments } = applyDedupeDecisions(rows, existing);

  let inserted = 0;
  if (toInsert.length) {
    const { data, error } = await withTimeout(
      'supabase.import_bank_transactions_for_user',
      params.service.rpc('import_bank_transactions_for_user', {
        p_user_id: params.userId,
        p_rows: toInsert,
      }),
    );
    if (error) {
      throw new OutboundError(
        'supabase.import_bank_transactions_for_user',
        error.message,
      );
    }
    inserted = Array.isArray(data) ? data.length : toInsert.length;
  }

  let enriched = 0;
  for (const e of enrichments) {
    const patch: Record<string, unknown> = {
      kontomatik_tx_id: e.kontomatik_tx_id,
    };
    for (const [k, v] of Object.entries(e.patch)) {
      if (v != null) patch[k] = v;
    }
    const { error } = await withTimeout(
      'supabase.transactions.enrich',
      params.service
        .from('transactions')
        .update(patch)
        .eq('id', e.id)
        .eq('user_id', params.userId),
    );
    if (error) {
      throw new OutboundError('supabase.transactions.enrich', error.message);
    }
    enriched += 1;
  }

  const review = toInsert.filter((r) => r.import_needs_review).length;
  return { bank, ibans, inserted, enriched, review };
}

/** Pure pipeline for selftests (no DB). */
export function dryRunAisImport(
  userId: string,
  target: string | null,
  officialName: string | null,
  accounts: AisAccount[],
  existing: ExistingTx[],
  opts?: {
    ownerAccounts?: string[];
    classifyCtx?: ClassifyContext;
  },
): {
  rows: MappedBankRow[];
  toInsert: MappedBankRow[];
  enrichments: ReturnType<typeof applyDedupeDecisions>['enrichments'];
  bank: string;
} {
  const { rows, bank } = mapAisAccountsToRows({
    userId,
    target,
    officialName,
    accounts,
    ownerAccounts: opts?.ownerAccounts,
    classifyCtx: opts?.classifyCtx,
  });
  const { toInsert, enrichments } = applyDedupeDecisions(rows, existing);
  return { rows, toInsert, enrichments, bank };
}
