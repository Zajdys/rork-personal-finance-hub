import type { SupabaseClient } from '@supabase/supabase-js';
import { applyDedupeDecisions, type ExistingTx } from './dedupe/match';
import type { MappedBankRow } from './map/transactions';
import { mapAisAccountsToRows, type AisAccount } from './map/transactions';

export async function fetchExistingForBanks(
  service: SupabaseClient,
  userId: string,
  bank: string,
): Promise<ExistingTx[]> {
  const { data, error } = await service
    .from('transactions')
    .select(
      'id, date, amount, type, description, counterparty_account, merchant_key, category, category_source, kontomatik_tx_id, source',
    )
    .eq('user_id', userId)
    .eq('source', bank);
  if (error) throw new Error(`fetch existing txs: ${error.message}`);
  return (data ?? []) as ExistingTx[];
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
  const { rows, bank, ibans } = mapAisAccountsToRows({
    userId: params.userId,
    target: params.target,
    officialName: params.officialName,
    accounts: params.accounts,
  });

  const existing = await fetchExistingForBanks(params.service, params.userId, bank);
  const { toInsert, enrichments } = applyDedupeDecisions(rows, existing);

  let inserted = 0;
  if (toInsert.length) {
    const { data, error } = await params.service.rpc(
      'import_bank_transactions_for_user',
      {
        p_user_id: params.userId,
        p_rows: toInsert,
      },
    );
    if (error) throw new Error(`import_bank_transactions_for_user: ${error.message}`);
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
    // Never touch category / category_source
    const { error } = await params.service
      .from('transactions')
      .update(patch)
      .eq('id', e.id)
      .eq('user_id', params.userId);
    if (error) throw new Error(`enrich tx ${e.id}: ${error.message}`);
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
  });
  const { toInsert, enrichments } = applyDedupeDecisions(rows, existing);
  return { rows, toInsert, enrichments, bank };
}
