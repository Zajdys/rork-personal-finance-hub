/**
 * Detekce předplatného z bankovních transakcí.
 *
 * Podmínky (všechny):
 * 1) stejná částka ±2 %
 * 2) alespoň 3 výskyty v souvislém běhu
 * 3) rozestup 28–31 dní (měsíční) nebo 364–366 dní (roční), odchylka max 3 dny
 * 4) jen kartové platby s merchant_key; bez counterparty_account
 * 5) částka ≤ 5 000 Kč
 *
 * Předplatné dostanou POUZE transakce ve shluku — ne celý obchodník.
 */
import { normalizeMerchantKey } from '@/lib/normalize-merchant-key';
import {
  resolveSubscriptionBrand,
  subscriptionDisplayName,
  SUBSCRIPTION_CATEGORY,
} from '@/lib/subscription-brands';
import {
  compareTxBillingDateAsc,
  dayOfMonthFromYmd,
  transactionBookingOrDateYmd,
  transactionToLocalDateNoon,
} from '@/lib/transaction-date';

export const SUBSCRIPTION_AMOUNT_TOLERANCE = 0.02;
export const SUBSCRIPTION_MIN_OCCURRENCES = 3;
export const SUBSCRIPTION_MAX_AMOUNT = 5000;
export const SUBSCRIPTION_GAP_MONTHLY_MIN = 28;
export const SUBSCRIPTION_GAP_MONTHLY_MAX = 31;
export const SUBSCRIPTION_GAP_YEARLY_MIN = 364;
export const SUBSCRIPTION_GAP_YEARLY_MAX = 366;
/** Rozšíření oken gapů o max. 3 dny. */
export const SUBSCRIPTION_GAP_DEVIATION_DAYS = 3;

export type DetectableTx = {
  id?: string;
  type?: string;
  amount: number;
  title?: string;
  description?: string;
  merchant?: string;
  name?: string;
  category?: string;
  date: string | Date;
  bookingDate?: string | null;
  counterpartyAccount?: string | null;
  counterpartyName?: string | null;
};

export type DetectedSubscriptionCandidate = {
  groupKey: string;
  name: string;
  amount: number;
  category: string;
  dayOfMonth: number;
  sampleTxIds: string[];
};

function txLabel(t: DetectableTx): string {
  return (t.title || t.description || t.merchant || t.name || '').trim();
}

/** Generické bankovní popisy bez obchodníka (převody / okamžité úhrady). */
export function isGenericBankPaymentLabel(raw: string): boolean {
  const s = String(raw ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
  if (!s) return true;
  return (
    /odchozi/.test(s) ||
    /prichozi/.test(s) ||
    /okamzita\s+uhrada/.test(s) ||
    /bezhotovostni/.test(s) ||
    /platba\s+na\s+ucet/.test(s) ||
    /^prevod\b/.test(s) ||
    /^uhrada\b/.test(s)
  );
}

/**
 * Kartová platba s merchant_key — bez protiúčtu (převody / platby lidem).
 */
export function isCardMerchantSubscriptionEligible(t: DetectableTx): boolean {
  if (t.type === 'income') return false;
  if (t.category === 'Převod' || t.category === 'Platby lidem') return false;
  const acc = String(t.counterpartyAccount ?? '').trim();
  if (acc) return false;

  const amt = Math.abs(Number(t.amount) || 0);
  if (!(amt > 0) || amt > SUBSCRIPTION_MAX_AMOUNT) return false;

  const label = txLabel(t);
  if (!label || isGenericBankPaymentLabel(label)) return false;

  const mk = normalizeMerchantKey(label);
  if (!mk || mk.length < 2) return false;
  if (/^(ODCHOZI|PRICHOZI|UHRADA|PLATBA|PREVOD|OKAMZITA)\b/.test(mk)) return false;

  return true;
}

export function subscriptionMerchantGroupKey(t: DetectableTx): string {
  const label = txLabel(t);
  const mk = normalizeMerchantKey(label);
  const brand = resolveSubscriptionBrand(mk || label);
  if (brand) return brand.key;
  return mk || 'unknown';
}

export function amountsWithinTolerance(
  a: number,
  b: number,
  tol = SUBSCRIPTION_AMOUNT_TOLERANCE,
): boolean {
  const avg = (Math.abs(a) + Math.abs(b)) / 2;
  if (avg <= 0) return Math.abs(a - b) < 0.01;
  return Math.abs(Math.abs(a) - Math.abs(b)) / avg <= tol;
}

export function isValidSubscriptionGap(days: number): boolean {
  const d = SUBSCRIPTION_GAP_DEVIATION_DAYS;
  const monthly =
    days >= SUBSCRIPTION_GAP_MONTHLY_MIN - d && days <= SUBSCRIPTION_GAP_MONTHLY_MAX + d;
  const yearly =
    days >= SUBSCRIPTION_GAP_YEARLY_MIN - d && days <= SUBSCRIPTION_GAP_YEARLY_MAX + d;
  return monthly || yearly;
}

function daysBetweenBilling(a: DetectableTx, b: DetectableTx): number {
  const d1 = transactionToLocalDateNoon(transactionBookingOrDateYmd(a));
  const d2 = transactionToLocalDateNoon(transactionBookingOrDateYmd(b));
  return Math.round(Math.abs(+d2 - +d1) / 86400000);
}

/**
 * Nejdelší souvislý běh se stejnou částkou (±2 %) a platným gapem.
 * Min. 3 platby.
 */
export function findConsecutiveSubscriptionRun<T extends DetectableTx>(
  txsSortedAsc: T[],
): T[] | null {
  if (txsSortedAsc.length < SUBSCRIPTION_MIN_OCCURRENCES) return null;

  let best: T[] = [];
  let run: T[] = [txsSortedAsc[0]!];

  for (let i = 1; i < txsSortedAsc.length; i++) {
    const prev = run[run.length - 1]!;
    const cur = txsSortedAsc[i]!;
    const days = daysBetweenBilling(prev, cur);
    if (amountsWithinTolerance(prev.amount, cur.amount) && isValidSubscriptionGap(days)) {
      run.push(cur);
    } else {
      if (run.length > best.length) best = run;
      run = [cur];
    }
  }
  if (run.length > best.length) best = run;

  return best.length >= SUBSCRIPTION_MIN_OCCURRENCES ? best : null;
}

/**
 * ID transakcí, které patří do platného shruku předplatného.
 * (Jen konkrétní transakce — ne celý merchant.)
 */
export function collectSubscriptionClusterTxIds(transactions: DetectableTx[]): Set<string> {
  const ids = new Set<string>();
  for (const c of detectSubscriptionCandidates(transactions)) {
    for (const id of c.sampleTxIds) ids.add(id);
  }
  return ids;
}

export function detectSubscriptionCandidates(
  transactions: DetectableTx[],
  opts?: { sinceYmd?: string },
): DetectedSubscriptionCandidate[] {
  const since = opts?.sinceYmd;
  const eligible = transactions.filter((t) => {
    if (!isCardMerchantSubscriptionEligible(t)) return false;
    if (since && transactionBookingOrDateYmd(t) < since) return false;
    return true;
  });

  const groups = new Map<string, DetectableTx[]>();
  for (const t of eligible) {
    const key = subscriptionMerchantGroupKey(t);
    if (key === 'unknown') continue;
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }

  const out: DetectedSubscriptionCandidate[] = [];
  for (const [groupKey, txs] of groups) {
    const sorted = [...txs].sort(compareTxBillingDateAsc);
    const run = findConsecutiveSubscriptionRun(sorted);
    if (!run) continue;

    const avg = run.reduce((s, t) => s + Math.abs(t.amount), 0) / run.length;
    const amount = Math.round(avg * 100) / 100;
    if (amount > SUBSCRIPTION_MAX_AMOUNT) continue;

    const last = run[run.length - 1]!;
    const brand = resolveSubscriptionBrand(groupKey);
    const name = brand
      ? brand.brand.displayName
      : subscriptionDisplayName(txLabel(last) || groupKey);

    out.push({
      groupKey,
      name,
      amount,
      category: SUBSCRIPTION_CATEGORY,
      dayOfMonth: dayOfMonthFromYmd(transactionBookingOrDateYmd(last)),
      sampleTxIds: run.map((t) => t.id).filter((id): id is string => !!id),
    });
  }

  return out;
}
