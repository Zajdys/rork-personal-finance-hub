/**
 * Pravidelné platby (přehled) — NEMĚNÍ kategorie transakcí.
 * ≥2 platby, odstup 28–31 dní, rozdíl částky do 5 %.
 */
import { normalizeMerchantKey } from '@/lib/normalize-merchant-key';
import {
  compareTxBillingDateAsc,
  dayOfMonthFromYmd,
  transactionBookingOrDateYmd,
  transactionToLocalDateNoon,
} from '@/lib/transaction-date';
import { resolveSubscriptionBrand, subscriptionDisplayName } from '@/lib/subscription-brands';

export const REGULAR_PAYMENT_AMOUNT_TOLERANCE = 0.05;
export const REGULAR_PAYMENT_MIN_COUNT = 2;
/** Kalendářní měsíc: 28–31 ideálně; 26–35 pokrývá i 30→31 a víkendy. */
export const REGULAR_GAP_MIN = 26;
export const REGULAR_GAP_MAX = 35;

export type RegularPaymentTx = {
  id?: string;
  type?: string;
  amount: number;
  title?: string;
  description?: string;
  category?: string;
  date: string | Date;
  bookingDate?: string | null;
  counterpartyAccount?: string | null;
  counterpartyName?: string | null;
};

export type RegularPaymentItem = {
  id: string;
  name: string;
  amount: number;
  category: string;
  dayOfMonth: number;
  count: number;
};

export type RegularPaymentGroup = {
  category: string;
  total: number;
  items: RegularPaymentItem[];
};

function txLabel(t: RegularPaymentTx): string {
  return (t.title || t.description || t.counterpartyName || '').trim();
}

function amountsClose(a: number, b: number, tol = REGULAR_PAYMENT_AMOUNT_TOLERANCE): boolean {
  const avg = (Math.abs(a) + Math.abs(b)) / 2;
  if (avg <= 0) return Math.abs(a - b) < 0.01;
  return Math.abs(Math.abs(a) - Math.abs(b)) / avg <= tol;
}

function daysBetween(a: RegularPaymentTx, b: RegularPaymentTx): number {
  const d1 = transactionToLocalDateNoon(transactionBookingOrDateYmd(a));
  const d2 = transactionToLocalDateNoon(transactionBookingOrDateYmd(b));
  return Math.round(Math.abs(+d2 - +d1) / 86400000);
}

function groupKey(t: RegularPaymentTx): string {
  const label = txLabel(t);
  const mk = normalizeMerchantKey(label);
  const brand = resolveSubscriptionBrand(mk || label);
  if (brand) return `brand:${brand.key}`;
  if (mk && mk.length >= 2) return `m:${mk}`;
  const acc = (t.counterpartyAccount || '').trim();
  if (acc) return `a:${acc}`;
  return `c:${(t.category || 'Ostatní').trim()}|${label.slice(0, 40)}`;
}

function findRuns<T extends RegularPaymentTx>(sorted: T[]): T[][] {
  if (sorted.length < REGULAR_PAYMENT_MIN_COUNT) return [];
  const runs: T[][] = [];
  let run: T[] = [sorted[0]!];
  for (let i = 1; i < sorted.length; i++) {
    const prev = run[run.length - 1]!;
    const cur = sorted[i]!;
    const days = daysBetween(prev, cur);
    if (
      amountsClose(prev.amount, cur.amount) &&
      days >= REGULAR_GAP_MIN &&
      days <= REGULAR_GAP_MAX
    ) {
      run.push(cur);
    } else {
      if (run.length >= REGULAR_PAYMENT_MIN_COUNT) runs.push(run);
      run = [cur];
    }
  }
  if (run.length >= REGULAR_PAYMENT_MIN_COUNT) runs.push(run);
  return runs;
}

/**
 * Najde pravidelné výdaje (včetně převodů/splátek s protiúčtem).
 * Pouze pro UI přehled — neupravuje transakce.
 */
export function detectRegularPayments(
  transactions: RegularPaymentTx[],
  opts?: { sinceYmd?: string },
): RegularPaymentItem[] {
  const since = opts?.sinceYmd;
  const eligible = transactions.filter((t) => {
    if (t.type === 'income') return false;
    if (since && transactionBookingOrDateYmd(t) < since) return false;
    const amt = Math.abs(Number(t.amount) || 0);
    return amt > 0;
  });

  const groups = new Map<string, RegularPaymentTx[]>();
  for (const t of eligible) {
    const key = groupKey(t);
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }

  const out: RegularPaymentItem[] = [];
  for (const [key, txs] of groups) {
    const sorted = [...txs].sort(compareTxBillingDateAsc);
    const runs = findRuns(sorted);
    for (const run of runs) {
      const avg = run.reduce((s, t) => s + Math.abs(t.amount), 0) / run.length;
      const amount = Math.round(avg * 100) / 100;
      const last = run[run.length - 1]!;
      const label = txLabel(last);
      const mk = normalizeMerchantKey(label);
      const brand = resolveSubscriptionBrand(mk || label);
      const name = brand
        ? brand.brand.displayName
        : subscriptionDisplayName(label || key);
      const category = (last.category || 'Ostatní').trim() || 'Ostatní';
      out.push({
        id: `regular-${key}-${amount}-${run.length}`,
        name,
        amount,
        category,
        dayOfMonth: dayOfMonthFromYmd(transactionBookingOrDateYmd(last)),
        count: run.length,
      });
    }
  }

  out.sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, 'cs'));
  return out;
}

/** Seskupení podle kategorie + celkový součet. */
export function groupRegularPaymentsByCategory(
  items: RegularPaymentItem[],
): { total: number; groups: RegularPaymentGroup[] } {
  const byCat = new Map<string, RegularPaymentItem[]>();
  for (const it of items) {
    const list = byCat.get(it.category) ?? [];
    list.push(it);
    byCat.set(it.category, list);
  }
  const groups: RegularPaymentGroup[] = [];
  let total = 0;
  for (const [category, list] of byCat) {
    const catTotal = list.reduce((s, x) => s + x.amount, 0);
    total += catTotal;
    groups.push({
      category,
      total: Math.round(catTotal * 100) / 100,
      items: list,
    });
  }
  groups.sort((a, b) => b.total - a.total || a.category.localeCompare(b.category, 'cs'));
  return { total: Math.round(total * 100) / 100, groups };
}
