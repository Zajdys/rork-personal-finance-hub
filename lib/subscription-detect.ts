/**
 * Detekce digitálního předplatného z bankovních transakcí.
 *
 * Podmínky:
 * 1) kategorie Předplatné NEBO známý digitální brand
 * 2) NE blokované kategorie — kromě případu, kdy je obchodník známý brand
 *    (např. PREHRAJ.TO omylem jako Bydlení)
 * 3) u merchant_key nejdřív shluky podle částky (±15 %), pravidelnost v každém zvlášť
 * 4) FX: stejná original_currency → original_amount; jinak CZK amount
 * 5) ≥2 výskyty; gap měsíční/roční; poslední platba ≤45 d / ≤400 d (aktivní)
 * 6) bez „Poplatek · …“, bez protiúčtu; CZK částka ≤ 5 000
 */
import { clusterTransactionsByAmount } from '@/lib/subscription-amount-clusters';
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

export const SUBSCRIPTION_AMOUNT_TOLERANCE = 0.15;
export const SUBSCRIPTION_MIN_OCCURRENCES = 2;
export const SUBSCRIPTION_MAX_AMOUNT = 5000;
export const SUBSCRIPTION_GAP_MONTHLY_MIN = 28;
export const SUBSCRIPTION_GAP_MONTHLY_MAX = 31;
export const SUBSCRIPTION_GAP_YEARLY_MIN = 364;
export const SUBSCRIPTION_GAP_YEARLY_MAX = 366;
export const SUBSCRIPTION_GAP_DEVIATION_DAYS = 3;
/** Poslední platba — měsíční cadence. */
export const SUBSCRIPTION_ACTIVE_MONTHLY_DAYS = 45;
/** Poslední platba — roční cadence. */
export const SUBSCRIPTION_ACTIVE_YEARLY_DAYS = 400;

export const DIGITAL_SUBSCRIPTION_CATEGORIES = new Set<string>(['Předplatné']);

export const SUBSCRIPTION_EXCLUDED_CATEGORIES = new Set<string>([
  'Splátky úvěrů',
  'Bydlení',
  'Nájem a bydlení',
  'Energie',
  'Doprava',
  'Telefon a internet',
  'Pojištění',
  'Převod',
  'Platby lidem',
  'Investice',
  'Bankovní poplatky',
]);

export type DetectableTx = {
  id?: string;
  type?: string;
  amount: number;
  title?: string;
  description?: string;
  merchant?: string;
  name?: string;
  category?: string;
  /**
   * DB `category_source` — transfer vždy vyřadit z návrhů.
   */
  categorySource?: string | null;
  date: string | Date;
  bookingDate?: string | null;
  counterpartyAccount?: string | null;
  counterpartyName?: string | null;
  /** Původní částka (Revolut FX) — DB original_amount. */
  originalAmount?: number | null;
  originalCurrency?: string | null;
  /** Banka / import source (cs, revolut, …) — aktivita vůči poslední tx této banky. */
  source?: string | null;
  merchantKey?: string | null;
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

function txCategory(t: DetectableTx): string {
  return String(t.category ?? '').trim();
}

/** Revolut FX fee řádky: „Poplatek · Cursor“. */
export function isSubscriptionFeeLabel(raw: string): boolean {
  const s = String(raw ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .toLowerCase();
  if (!s) return false;
  return /^poplatek\b/.test(s) || /^fee\b/.test(s);
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
 * Digitální předplatné: whitelist brand (i při špatné kategorii, např. Apple→Elektronika)
 * NEBO kategorie Předplatné — a zároveň ne blokovaná kategorie / transfer.
 */
export function isDigitalSubscriptionCandidate(t: DetectableTx): boolean {
  const label = txLabel(t);
  if (isSubscriptionFeeLabel(label)) return false;

  const src = String(t.categorySource ?? '')
    .trim()
    .toLowerCase();
  if (src === 'transfer') return false;

  const cat = txCategory(t);
  if (cat === 'Převod' || cat === 'Platby lidem') return false;

  const mk =
    (typeof t.merchantKey === 'string' && t.merchantKey.trim()
      ? t.merchantKey.trim()
      : '') || normalizeMerchantKey(label);
  // Whitelist digitálních služeb — i když kategorie je Elektronika / Bydlení / …
  if (resolveSubscriptionBrand(mk || label)) return true;

  if (cat && SUBSCRIPTION_EXCLUDED_CATEGORIES.has(cat)) return false;
  if (cat && DIGITAL_SUBSCRIPTION_CATEGORIES.has(cat)) return true;
  return false;
}

export function isCardMerchantSubscriptionEligible(t: DetectableTx): boolean {
  if (t.type === 'income') return false;
  if (!isDigitalSubscriptionCandidate(t)) return false;

  const cat = txCategory(t);
  if (cat === 'Převod' || cat === 'Platby lidem') return false;
  const acc = String(t.counterpartyAccount ?? '').trim();
  if (acc) return false;

  const amtCzk = Math.abs(Number(t.amount) || 0);
  // Zálohy / energie kolem 5 000 Kč — ne předplatné (striktně < MAX)
  if (!(amtCzk > 0) || amtCzk >= SUBSCRIPTION_MAX_AMOUNT) return false;

  const label = txLabel(t);
  if (!label || isGenericBankPaymentLabel(label) || isSubscriptionFeeLabel(label)) return false;

  const mk =
    (typeof t.merchantKey === 'string' && t.merchantKey.trim()
      ? t.merchantKey.trim()
      : '') || normalizeMerchantKey(label);
  if (!mk || mk.length < 2) return false;
  if (/^(ODCHOZI|PRICHOZI|UHRADA|PLATBA|PREVOD|OKAMZITA|POPLATEK|FEE)\b/.test(mk)) return false;

  return true;
}

export function subscriptionMerchantGroupKey(t: DetectableTx): string {
  const label = txLabel(t);
  const mk =
    (typeof t.merchantKey === 'string' && t.merchantKey.trim()
      ? t.merchantKey.trim()
      : '') || normalizeMerchantKey(label);
  const brand = resolveSubscriptionBrand(mk || label);
  if (brand) return brand.key;
  return mk || 'unknown';
}

/** Částka pro shlukování: original ve stejné měně, jinak CZK. */
export function subscriptionCompareAmount(
  t: DetectableTx,
  mode: 'original' | 'czk',
): number {
  if (mode === 'original') {
    const oa = t.originalAmount;
    if (oa != null && Number.isFinite(Number(oa)) && Math.abs(Number(oa)) > 0) {
      return Math.abs(Number(oa));
    }
  }
  return Math.abs(Number(t.amount) || 0);
}

/**
 * V rámci merchant skupiny: všechny mají stejnou original_currency + original_amount
 * → shlukuj v té měně; jinak (včetně USD↔EUR) v CZK.
 */
export function resolveSubscriptionAmountMode(
  txs: DetectableTx[],
): 'original' | 'czk' {
  if (txs.length === 0) return 'czk';
  const currencies = new Set<string>();
  for (const t of txs) {
    const ccy = String(t.originalCurrency ?? '')
      .trim()
      .toUpperCase();
    const oa = t.originalAmount;
    if (!ccy || oa == null || !Number.isFinite(Number(oa)) || !(Math.abs(Number(oa)) > 0)) {
      return 'czk';
    }
    currencies.add(ccy);
  }
  return currencies.size === 1 ? 'original' : 'czk';
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

export function isYearlySubscriptionGap(days: number): boolean {
  const d = SUBSCRIPTION_GAP_DEVIATION_DAYS;
  return days >= SUBSCRIPTION_GAP_YEARLY_MIN - d && days <= SUBSCRIPTION_GAP_YEARLY_MAX + d;
}

function daysBetweenBilling(a: DetectableTx, b: DetectableTx): number {
  const d1 = transactionToLocalDateNoon(transactionBookingOrDateYmd(a));
  const d2 = transactionToLocalDateNoon(transactionBookingOrDateYmd(b));
  return Math.round(Math.abs(+d2 - +d1) / 86400000);
}

function daysSinceYmd(ymd: string, asOfYmd: string): number {
  const a = transactionToLocalDateNoon(ymd);
  const b = transactionToLocalDateNoon(asOfYmd);
  return Math.round((+b - +a) / 86400000);
}

function runIsYearly(run: DetectableTx[]): boolean {
  for (let i = 1; i < run.length; i++) {
    if (isYearlySubscriptionGap(daysBetweenBilling(run[i - 1]!, run[i]!))) return true;
  }
  return false;
}

function txSourceKey(t: DetectableTx): string {
  const s = String(t.source ?? '')
    .trim()
    .toLowerCase();
  return s || 'unknown';
}

/** Poslední booking/date YMD pro každou banku (source) — ze všech transakcí. */
export function lastTransactionYmdBySource(
  transactions: DetectableTx[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const t of transactions) {
    const src = txSourceKey(t);
    const ymd = transactionBookingOrDateYmd(t);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) continue;
    const prev = map.get(src);
    if (!prev || ymd > prev) map.set(src, ymd);
  }
  return map;
}

/**
 * Aktivní vůči `asOfYmd` (= typicky datum poslední tx dané banky, ne „dnes“).
 */
export function isSubscriptionRunActive(
  run: DetectableTx[],
  asOfYmd: string,
): boolean {
  if (!run.length) return false;
  const last = run[run.length - 1]!;
  const age = daysSinceYmd(transactionBookingOrDateYmd(last), asOfYmd);
  if (age < 0) return true;
  const maxAge = runIsYearly(run)
    ? SUBSCRIPTION_ACTIVE_YEARLY_DAYS
    : SUBSCRIPTION_ACTIVE_MONTHLY_DAYS;
  return age <= maxAge;
}

/**
 * Nejdelší souvislý běh s platným gapem (částky už jsou ve shluku ±15 %).
 * Min. 2 platby.
 */
export function findConsecutiveSubscriptionRun<T extends DetectableTx>(
  txsSortedAsc: T[],
  compareAmount: (t: T) => number = (t) => Math.abs(Number(t.amount) || 0),
): T[] | null {
  if (txsSortedAsc.length < SUBSCRIPTION_MIN_OCCURRENCES) return null;

  let best: T[] = [];
  let run: T[] = [txsSortedAsc[0]!];

  for (let i = 1; i < txsSortedAsc.length; i++) {
    const prev = run[run.length - 1]!;
    const cur = txsSortedAsc[i]!;
    const days = daysBetweenBilling(prev, cur);
    if (
      amountsWithinTolerance(compareAmount(prev), compareAmount(cur)) &&
      isValidSubscriptionGap(days)
    ) {
      run.push(cur);
    } else {
      if (run.length > best.length) best = run;
      run = [cur];
    }
  }
  if (run.length > best.length) best = run;

  return best.length >= SUBSCRIPTION_MIN_OCCURRENCES ? best : null;
}

export function collectSubscriptionClusterTxIds(transactions: DetectableTx[]): Set<string> {
  const ids = new Set<string>();
  for (const c of detectSubscriptionCandidates(transactions)) {
    for (const id of c.sampleTxIds) ids.add(id);
  }
  return ids;
}

export function detectSubscriptionCandidates(
  transactions: DetectableTx[],
  opts?: {
    sinceYmd?: string;
    /**
     * Globální fallback „ke dni“, pokud u běhu chybí source / banka nemá tx.
     * Default: dnes. Aktivita běhu ale preferuje poslední tx dané banky.
     */
    asOfYmd?: string;
  },
): DetectedSubscriptionCandidate[] {
  const since = opts?.sinceYmd;
  const fallbackAsOfYmd =
    opts?.asOfYmd ??
    (() => {
      const n = new Date();
      const y = n.getFullYear();
      const m = String(n.getMonth() + 1).padStart(2, '0');
      const d = String(n.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    })();

  const lastBySource = lastTransactionYmdBySource(transactions);

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

  type ClusterTx = DetectableTx & { compareAmount: number; czkAmount: number };

  const out: DetectedSubscriptionCandidate[] = [];
  for (const [groupKey, txs] of groups) {
    const mode = resolveSubscriptionAmountMode(txs);
    const withCompare: ClusterTx[] = txs.map((t) => ({
      ...t,
      compareAmount: subscriptionCompareAmount(t, mode),
      czkAmount: Math.abs(Number(t.amount) || 0),
      // clusterTransactionsByAmount čte `.amount`
      amount: subscriptionCompareAmount(t, mode),
    }));

    const clusters = clusterTransactionsByAmount(withCompare, SUBSCRIPTION_AMOUNT_TOLERANCE);

    // Jeden návrh na merchant_key: vyber nejnovější aktivní běh, částka = poslední platba.
    let best: {
      run: ClusterTx[];
      lastYmd: string;
    } | null = null;

    for (const cluster of clusters) {
      const sorted = [...cluster].sort(compareTxBillingDateAsc);
      const run = findConsecutiveSubscriptionRun(sorted, (t) => t.compareAmount);
      if (!run) continue;

      const last = run[run.length - 1]!;
      const runSource = txSourceKey(last);
      const asOfYmd = lastBySource.get(runSource) ?? fallbackAsOfYmd;
      if (!isSubscriptionRunActive(run, asOfYmd)) continue;

      const lastYmd = transactionBookingOrDateYmd(last);
      if (!best || lastYmd > best.lastYmd) {
        best = { run, lastYmd };
      }
    }

    if (!best) continue;

    const last = best.run[best.run.length - 1]!;
    const amount = Math.round(last.czkAmount * 100) / 100;
    if (!(amount > 0) || amount >= SUBSCRIPTION_MAX_AMOUNT) continue;

    const brand = resolveSubscriptionBrand(groupKey);
    const name = brand
      ? brand.brand.displayName
      : subscriptionDisplayName(txLabel(last) || groupKey);

    out.push({
      groupKey,
      name,
      amount,
      category: SUBSCRIPTION_CATEGORY,
      dayOfMonth: dayOfMonthFromYmd(best.lastYmd),
      sampleTxIds: best.run.map((t) => t.id).filter((id): id is string => !!id),
    });
  }

  return out.sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, 'cs'));
}
