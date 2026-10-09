import type { MappedBankRow } from '../map/transactions';
import {
  isGenericPaymentLabel,
  normalizeAccount,
  normalizeMerchantKey,
} from '../map/merchant';

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

const DATE_TOLERANCE_DAYS = 2;

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

function amountKey(amount: number): string {
  return (Math.round(Number(amount) * 100) / 100).toFixed(2);
}

function sameDirection(
  existingType: string,
  rowType: string,
): boolean {
  const t =
    existingType === 'income' || existingType === 'expense' ? existingType : null;
  if (!t) return true;
  return t === rowType;
}

function merchantLooseEqual(a: string, b: string): boolean {
  if (a === b) return true;
  return a.includes(b) || b.includes(a);
}

/** Použitelný merchant_key — ne generické „Platba“ / TRANSFER. */
export function usableMerchantKey(
  merchantKey: string | null | undefined,
  description?: string | null,
): string | null {
  const fromKey = (merchantKey && String(merchantKey).trim()) || '';
  if (fromKey) {
    const norm = normalizeMerchantKey(fromKey) || fromKey.toUpperCase();
    if (norm && !isGenericPaymentLabel(norm) && !isGenericPaymentLabel(fromKey)) {
      return norm;
    }
  }
  const desc = (description || '').trim();
  if (!desc || isGenericPaymentLabel(desc)) return null;
  const parts = desc.split(/\s*[·•|]\s*/).map((p) => p.trim()).filter(Boolean);
  for (const part of parts.length ? parts : [desc]) {
    if (isGenericPaymentLabel(part)) continue;
    const k = normalizeMerchantKey(part);
    if (k && !isGenericPaymentLabel(k)) return k;
  }
  const whole = normalizeMerchantKey(desc);
  if (whole && !isGenericPaymentLabel(whole)) return whole;
  return null;
}

/**
 * Identita skupiny: protiúčet, jinak merchant, jinak bare.
 * (účet|merchant) + částka + směr.
 */
export function partyGroupKey(params: {
  amount: number;
  type: string;
  counterparty_account?: string | null;
  merchant_key?: string | null;
  description?: string | null;
}): string {
  const acc = normalizeAccount(params.counterparty_account);
  const mk = usableMerchantKey(params.merchant_key, params.description);
  const party = acc ? `a:${acc}` : mk ? `m:${mk}` : 'bare';
  const dir =
    params.type === 'income' || params.type === 'expense' ? params.type : 'any';
  return `${amountKey(params.amount)}|${dir}|${party}`;
}

/**
 * Shoda: (protiúčet NEBO normalizovaný merchant).
 * Když ani jedna strana nemá použitelné signály → true.
 */
export function counterpartyOrMerchantMatch(
  existing: ExistingTx,
  row: MappedBankRow,
): boolean {
  const exAcc = normalizeAccount(existing.counterparty_account);
  const rowAcc = normalizeAccount(row.counterparty_account);

  let accountMatch: boolean | null = null;
  if (exAcc && rowAcc) accountMatch = exAcc === rowAcc;

  const exMk = usableMerchantKey(existing.merchant_key, existing.description);
  const rowMk = usableMerchantKey(row.merchant_key, row.description);
  let merchantMatch: boolean | null = null;
  if (exMk && rowMk) merchantMatch = merchantLooseEqual(exMk, rowMk);

  if (accountMatch === true || merchantMatch === true) return true;
  if (accountMatch === false && merchantMatch !== true) return false;
  if (merchantMatch === false && accountMatch !== true) return false;
  return true;
}

export function findFuzzyCandidates(
  existing: ExistingTx[],
  row: MappedBankRow,
  dateToleranceDays = DATE_TOLERANCE_DAYS,
): ExistingTx[] {
  return existing.filter((e) => {
    if (e.kontomatik_tx_id) return false;
    if (e.source && row.source && e.source !== row.source) return false;
    if (!amountsEqual(e.amount, row.amount)) return false;
    if (!sameDirection(e.type, row.type)) return false;
    if (daysApart(e.date.slice(0, 10), row.date) > dateToleranceDays) return false;
    return counterpartyOrMerchantMatch(e, row);
  });
}

function enrichPatch(
  existing: ExistingTx,
  row: MappedBankRow,
): DedupeDecision & { action: 'enrich' } {
  return {
    action: 'enrich',
    existingId: existing.id,
    kontomatik_tx_id: row.kontomatik_tx_id,
    patch: {
      counterparty_account: existing.counterparty_account
        ? null
        : row.counterparty_account,
      counterparty_name: null,
      merchant_key: existing.merchant_key ? null : row.merchant_key,
    },
    preserveUserCategory: existing.category_source === 'user',
  };
}

/**
 * 1:1 párování ve skupině: seřaď podle data, každý existing jen jednou,
 * páruj nejbližší datum v ±tolerance. Přebytek AIS → insert;
 * review jen když zbývá i nepárovný existing.
 */
export function pairGroupOneToOne(
  aisRows: MappedBankRow[],
  existingRows: ExistingTx[],
  dateToleranceDays = DATE_TOLERANCE_DAYS,
): DedupeDecision[] {
  const ais = [...aisRows].sort((a, b) =>
    a.date.localeCompare(b.date) ||
    a.kontomatik_tx_id.localeCompare(b.kontomatik_tx_id),
  );
  const ex = [...existingRows].sort((a, b) =>
    a.date.slice(0, 10).localeCompare(b.date.slice(0, 10)) ||
    a.id.localeCompare(b.id),
  );

  const aisUsed = new Set<number>();
  const exUsed = new Set<number>();

  type PairCand = { ai: number; ei: number; dist: number };
  const cands: PairCand[] = [];
  for (let ai = 0; ai < ais.length; ai++) {
    for (let ei = 0; ei < ex.length; ei++) {
      const dist = daysApart(ais[ai]!.date, ex[ei]!.date.slice(0, 10));
      if (dist <= dateToleranceDays) {
        cands.push({ ai, ei, dist });
      }
    }
  }
  cands.sort(
    (a, b) =>
      a.dist - b.dist ||
      ais[a.ai]!.date.localeCompare(ais[b.ai]!.date) ||
      ex[a.ei]!.date.localeCompare(ex[b.ei]!.date) ||
      a.ai - b.ai ||
      a.ei - b.ei,
  );

  const decisions: DedupeDecision[] = [];
  for (const c of cands) {
    if (aisUsed.has(c.ai) || exUsed.has(c.ei)) continue;
    aisUsed.add(c.ai);
    exUsed.add(c.ei);
    decisions.push(enrichPatch(ex[c.ei]!, ais[c.ai]!));
  }

  const leftoverEx = ex.length - exUsed.size;
  for (let ai = 0; ai < ais.length; ai++) {
    if (aisUsed.has(ai)) continue;
    const row = ais[ai]!;
    if (leftoverEx > 0) {
      decisions.push({
        action: 'insert_review',
        row: { ...row, import_needs_review: true },
      });
    } else {
      decisions.push({ action: 'insert', row });
    }
  }

  return decisions;
}

/**
 * Decide insert vs enrich vs insert_review for one AIS row (legacy helper).
 * Prefer applyDedupeDecisions for batch 1:1 pairing.
 */
export function decideAisRow(
  row: MappedBankRow,
  existing: ExistingTx[],
): DedupeDecision {
  const byId = existing.find((e) => e.kontomatik_tx_id === row.kontomatik_tx_id);
  if (byId) return enrichPatch(byId, row);

  const result = applyDedupeDecisions([row], existing);
  if (result.enrichments.length === 1) {
    const e = result.enrichments[0]!;
    const hit = existing.find((x) => x.id === e.id)!;
    return enrichPatch(hit, row);
  }
  const inserted = result.toInsert[0];
  if (inserted?.import_needs_review) {
    return { action: 'insert_review', row: inserted };
  }
  return { action: 'insert', row: inserted ?? row };
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

/** Apply decisions; 1:1 pairing within (party, amount, direction) groups. */
export function applyDedupeDecisions(
  rows: MappedBankRow[],
  existing: ExistingTx[],
): ApplyResult {
  const toInsert: MappedBankRow[] = [];
  const enrichments: ApplyResult['enrichments'] = [];
  const claimedExisting = new Set<string>();

  const remainingAis: MappedBankRow[] = [];

  // 1) Exact kontomatik_tx_id
  for (const row of rows) {
    const byId = existing.find(
      (e) =>
        e.kontomatik_tx_id === row.kontomatik_tx_id &&
        !claimedExisting.has(e.id),
    );
    if (byId) {
      claimedExisting.add(byId.id);
      const d = enrichPatch(byId, row);
      enrichments.push({
        id: d.existingId,
        kontomatik_tx_id: d.kontomatik_tx_id,
        patch: Object.fromEntries(
          Object.entries(d.patch).filter(([, v]) => v != null),
        ) as Record<string, string | null>,
        category_source: d.preserveUserCategory ? 'user' : undefined,
      });
      continue;
    }
    remainingAis.push(row);
  }

  // 2) Group fuzzy candidates by (amount, direction, account|merchant)
  const groups = new Map<string, { ais: MappedBankRow[]; ex: ExistingTx[] }>();

  for (const row of remainingAis) {
    const key = partyGroupKey({
      amount: row.amount,
      type: row.type,
      counterparty_account: row.counterparty_account,
      merchant_key: row.merchant_key,
      description: row.description,
    });
    let g = groups.get(key);
    if (!g) {
      g = { ais: [], ex: [] };
      groups.set(key, g);
    }
    g.ais.push(row);
  }

  for (const e of existing) {
    if (claimedExisting.has(e.id)) continue;
    if (e.kontomatik_tx_id) continue;

    // Prefer exact group key; else party match (účet↔merchant) se stejným amount/směrem.
    const exactKey = partyGroupKey({
      amount: e.amount,
      type: e.type,
      counterparty_account: e.counterparty_account,
      merchant_key: e.merchant_key,
      description: e.description,
    });
    let assigned: { ais: MappedBankRow[]; ex: ExistingTx[] } | null = null;
    const exact = groups.get(exactKey);
    if (exact) {
      const ais0 = exact.ais[0];
      if (!ais0?.source || !e.source || ais0.source === e.source) {
        assigned = exact;
      }
    }
    if (!assigned) {
      for (const g of groups.values()) {
        const ais0 = g.ais[0];
        if (!ais0) continue;
        if (!amountsEqual(e.amount, ais0.amount)) continue;
        if (!sameDirection(e.type, ais0.type)) continue;
        if (ais0.source && e.source && ais0.source !== e.source) continue;
        if (g.ais.some((row) => counterpartyOrMerchantMatch(e, row))) {
          assigned = g;
          break;
        }
      }
    }
    if (assigned) assigned.ex.push(e);
  }

  for (const g of groups.values()) {
    // Filter existing that actually match party with at least one AIS row
    // (loose merchant: group key already normalized; keep all in same key)
    const decisions = pairGroupOneToOne(g.ais, g.ex);
    for (const d of decisions) {
      if (d.action === 'enrich') {
        claimedExisting.add(d.existingId);
        enrichments.push({
          id: d.existingId,
          kontomatik_tx_id: d.kontomatik_tx_id,
          patch: Object.fromEntries(
            Object.entries(d.patch).filter(([, v]) => v != null),
          ) as Record<string, string | null>,
          category_source: d.preserveUserCategory ? 'user' : undefined,
        });
      } else {
        toInsert.push(d.row);
      }
    }
  }

  return { toInsert, enrichments };
}
