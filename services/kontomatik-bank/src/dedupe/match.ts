import { normalizeAccount, normalizeMerchantKey } from '../map/merchant';
import type { MappedBankRow } from '../map/transactions';

export type ExistingTx = {
  id: string;
  date: string;
  amount: number;
  type: 'income' | 'expense' | string;
  description?: string | null;
  counterparty_account?: string | null;
  merchant_key?: string | null;
  category?: string | null;
  category_source?: string | null;
  kontomatik_tx_id?: string | null;
  source?: string | null;
};

export type DedupeDecision =
  | { action: 'insert'; row: MappedBankRow }
  | {
      action: 'enrich';
      existingId: string;
      kontomatik_tx_id: string;
      /** Fields to set only when existing is null */
      patch: Partial<{
        counterparty_account: string | null;
        counterparty_name: string | null;
        merchant_key: string | null;
      }>;
      preserveUserCategory: boolean;
    }
  | { action: 'insert_review'; row: MappedBankRow };

function ymdToUtc(d: string): number {
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  return Date.UTC(y!, m! - 1, day!);
}

function daysApart(a: string, b: string): number {
  return Math.abs(ymdToUtc(a) - ymdToUtc(b)) / 86_400_000;
}

function amountsEqual(a: number, b: number): boolean {
  return Math.abs(Number(a) - Number(b)) <= 0.01;
}

function sameDirection(
  existingType: string,
  row: MappedBankRow,
): boolean {
  const t = existingType === 'income' || existingType === 'expense' ? existingType : null;
  if (!t) return true;
  return t === row.type;
}

function merchantLooseEqual(a: string, b: string): boolean {
  if (a === b) return true;
  // PDF „KAFE“ vs AIS „KAFE S.R.O.“
  return a.includes(b) || b.includes(a);
}

function counterpartyOrMerchantMatch(
  existing: ExistingTx,
  row: MappedBankRow,
): boolean {
  const exAcc = normalizeAccount(existing.counterparty_account);
  const rowAcc = normalizeAccount(row.counterparty_account);
  if (exAcc && rowAcc) return exAcc === rowAcc;

  const exMk =
    (existing.merchant_key && String(existing.merchant_key).trim()) ||
    normalizeMerchantKey(existing.description || '');
  const rowMk = row.merchant_key || normalizeMerchantKey(row.description);
  if (exMk && rowMk) return merchantLooseEqual(exMk, rowMk);

  // Neither / one-sided party → date+amount+direction stačí
  return true;
}

export function findFuzzyCandidates(
  existing: ExistingTx[],
  row: MappedBankRow,
  dateToleranceDays = 2,
): ExistingTx[] {
  return existing.filter((e) => {
    // Fuzzy jen proti PDF/CSV (bez AIS id). Dva AIS řádky se stejným
    // datem/částkou (2× káva) musí zůstat oddělené přes kontomatik_tx_id.
    if (e.kontomatik_tx_id) return false;
    if (e.source && row.source && e.source !== row.source) return false;
    if (!amountsEqual(e.amount, row.amount)) return false;
    if (!sameDirection(e.type, row)) return false;
    if (daysApart(e.date.slice(0, 10), row.date) > dateToleranceDays) return false;
    return counterpartyOrMerchantMatch(e, row);
  });
}

/**
 * Decide insert vs enrich vs insert_review for one AIS row against existing txs.
 * Never mutates category when category_source === 'user'.
 */
export function decideAisRow(
  row: MappedBankRow,
  existing: ExistingTx[],
): DedupeDecision {
  // Exact kontomatik id already present → enrich (no insert)
  const byId = existing.find((e) => e.kontomatik_tx_id === row.kontomatik_tx_id);
  if (byId) {
    return {
      action: 'enrich',
      existingId: byId.id,
      kontomatik_tx_id: row.kontomatik_tx_id,
      patch: {
        counterparty_account: byId.counterparty_account ? null : row.counterparty_account,
        counterparty_name: null,
        merchant_key: byId.merchant_key ? null : row.merchant_key,
      },
      preserveUserCategory: byId.category_source === 'user',
    };
  }

  const candidates = findFuzzyCandidates(existing, row);
  if (candidates.length === 0) {
    return { action: 'insert', row };
  }
  if (candidates.length >= 2) {
    return {
      action: 'insert_review',
      row: { ...row, import_needs_review: true },
    };
  }

  const hit = candidates[0]!;
  return {
    action: 'enrich',
    existingId: hit.id,
    kontomatik_tx_id: row.kontomatik_tx_id,
    patch: {
      counterparty_account: hit.counterparty_account
        ? null
        : row.counterparty_account,
      counterparty_name: null,
      merchant_key: hit.merchant_key ? null : row.merchant_key,
    },
    preserveUserCategory: hit.category_source === 'user',
  };
}

export type ApplyResult = {
  toInsert: MappedBankRow[];
  enrichments: Array<{
    id: string;
    kontomatik_tx_id: string;
    patch: Record<string, string | null>;
    category_source: string | null | undefined;
  }>;
};

/** Apply decisions; track newly "claimed" kontomatik ids within the batch. */
export function applyDedupeDecisions(
  rows: MappedBankRow[],
  existing: ExistingTx[],
): ApplyResult {
  const working = [...existing];
  const toInsert: MappedBankRow[] = [];
  const enrichments: ApplyResult['enrichments'] = [];

  for (const row of rows) {
    const decision = decideAisRow(row, working);
    if (decision.action === 'insert' || decision.action === 'insert_review') {
      toInsert.push(decision.row);
      working.push({
        id: `pending:${decision.row.kontomatik_tx_id}`,
        date: decision.row.date,
        amount: decision.row.amount,
        type: decision.row.type,
        description: decision.row.description,
        counterparty_account: decision.row.counterparty_account,
        merchant_key: decision.row.merchant_key,
        category_source: decision.row.category_source,
        kontomatik_tx_id: decision.row.kontomatik_tx_id,
        source: decision.row.source,
      });
      continue;
    }

    enrichments.push({
      id: decision.existingId,
      kontomatik_tx_id: decision.kontomatik_tx_id,
      patch: Object.fromEntries(
        Object.entries(decision.patch).filter(([, v]) => v != null),
      ) as Record<string, string | null>,
      category_source: decision.preserveUserCategory ? 'user' : undefined,
    });
    const idx = working.findIndex((e) => e.id === decision.existingId);
    if (idx >= 0) {
      working[idx] = {
        ...working[idx]!,
        kontomatik_tx_id: decision.kontomatik_tx_id,
      };
    }
  }

  return { toInsert, enrichments };
}
