/**
 * Automatické párování výdajů s výskyty pravidelných plateb / závazků („Co tě čeká“).
 * Vazba occurrenceKey → transactionId v AsyncStorage (bez migrace DB).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { normalizeCategory, mainCategoryName } from '@/lib/category-normalize';
import {
  advanceRecurringDate,
  fetchPersonalRecurringRules,
  updatePersonalRecurringRule,
} from '@/lib/personal-recurring';
import { toYyyyMmDd } from '@/lib/transaction-date';
import { useFinanceStore, type LoanItem, type Transaction } from '@/store/finance-store';

const LINKS_KEY = (userId: string) => `plan_payment_links_v1:${userId}`;

export type PlanPaymentLinkMap = {
  /** occurrenceKey → transactionId */
  byOccurrence: Record<string, string>;
  /** transactionId → occurrenceKey (1 tx = max 1 platba) */
  byTransaction: Record<string, string>;
};

export type PlanPaymentMatch = {
  kind: 'loan' | 'recurring';
  title: string;
  amount: number;
  occurrenceKey: string;
  transactionId: string;
};

function emptyLinks(): PlanPaymentLinkMap {
  return { byOccurrence: {}, byTransaction: {} };
}

export async function loadPlanPaymentLinks(userId: string): Promise<PlanPaymentLinkMap> {
  try {
    const raw = await AsyncStorage.getItem(LINKS_KEY(userId));
    if (!raw) return emptyLinks();
    const p = JSON.parse(raw) as Partial<PlanPaymentLinkMap>;
    return {
      byOccurrence:
        p.byOccurrence && typeof p.byOccurrence === 'object' ? p.byOccurrence : {},
      byTransaction:
        p.byTransaction && typeof p.byTransaction === 'object' ? p.byTransaction : {},
    };
  } catch {
    return emptyLinks();
  }
}

async function savePlanPaymentLinks(userId: string, map: PlanPaymentLinkMap): Promise<void> {
  try {
    await AsyncStorage.setItem(LINKS_KEY(userId), JSON.stringify(map));
  } catch (e) {
    console.warn('[plan-match] save links', e);
  }
}

export function recurringOccurrenceKey(ruleId: string, occurrenceYmd: string): string {
  return `recurring:${ruleId}:${occurrenceYmd.slice(0, 10)}`;
}

export function loanOccurrenceKey(loanId: string, dueYmd: string): string {
  return `loan:${loanId}:${dueYmd.slice(0, 7)}`; // YYYY-MM period
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function parseTxDate(raw: string | Date): Date | null {
  if (raw instanceof Date) {
    return Number.isFinite(raw.getTime()) ? raw : null;
  }
  const s = String(raw ?? '').slice(0, 10);
  const d = new Date(`${s}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function amountMatches(txAmount: number, expected: number): boolean {
  if (!Number.isFinite(txAmount) || !Number.isFinite(expected) || expected <= 0) return false;
  const lo = expected * 0.9;
  const hi = expected * 1.1;
  return txAmount >= lo && txAmount <= hi;
}

function categoryMatches(
  txCat: string | undefined,
  txSub: string | null | undefined,
  expectedCat: string,
  expectedSub: string | null | undefined,
): boolean {
  const n = normalizeCategory(txCat, txSub);
  if (n.category !== mainCategoryName(expectedCat, expectedSub ?? null)) return false;
  if (expectedSub) {
    return (n.subcategory ?? null) === expectedSub;
  }
  return true;
}

function nextLoanDueDate(loan: LoanItem, now: Date): Date | null {
  const start =
    loan.startDate instanceof Date ? loan.startDate : new Date(loan.startDate as string);
  if (!Number.isFinite(start.getTime())) return null;
  const day = start.getDate();
  const paid = Math.max(0, Math.floor(loan.paymentsMade ?? 0));
  const anchorRaw = loan.installmentStartDate;
  const anchor =
    anchorRaw instanceof Date
      ? anchorRaw
      : anchorRaw
        ? new Date(anchorRaw as string)
        : start;
  const base = Number.isFinite(anchor.getTime()) ? anchor : start;
  const due = new Date(base.getFullYear(), base.getMonth() + paid, 1, 12, 0, 0, 0);
  const last = new Date(due.getFullYear(), due.getMonth() + 1, 0).getDate();
  due.setDate(Math.min(day, last));
  const today = startOfDay(now);
  // Povol i nedávno splatné (pro párování zpětně), ale ne starší než 14 dní
  const earliest = addDays(today, -14);
  while (due < earliest) {
    due.setMonth(due.getMonth() + 1);
    const last2 = new Date(due.getFullYear(), due.getMonth() + 1, 0).getDate();
    due.setDate(Math.min(day, last2));
  }
  return due;
}

function loanCategoryHint(loan: LoanItem): { category: string; subcategory: string | null } {
  if (loan.loanType === 'mortgage') {
    return { category: 'Úvěry', subcategory: 'Hypotéka' };
  }
  if (loan.loanType === 'car') {
    return { category: 'Úvěry', subcategory: 'Leasing' };
  }
  return { category: 'Úvěry', subcategory: null };
}

/**
 * Spáruje nezaplacené výskyty s výdaji (typicky nově přidanými).
 * @param candidateTxs pokud chybí, vezme výdaje z finance-store v relevantním okně
 */
export async function matchPlanPaymentsForUser(
  userId: string,
  candidateTxs?: Transaction[],
): Promise<PlanPaymentMatch[]> {
  if (!userId) return [];
  const links = await loadPlanPaymentLinks(userId);
  const usedTx = new Set(Object.keys(links.byTransaction));
  const matches: PlanPaymentMatch[] = [];
  const now = new Date();

  const storeTx =
    candidateTxs && candidateTxs.length > 0
      ? candidateTxs
      : useFinanceStore.getState().transactions.filter((t) => t.type === 'expense');

  const expenses = storeTx.filter((t) => t.type === 'expense' && !usedTx.has(t.id));

  // --- personal recurring ---
  const { rules } = await fetchPersonalRecurringRules(userId);
  const activeExp = (rules ?? []).filter((r) => r.active && r.type === 'expense');

  for (const rule of activeExp) {
    const occYmd = rule.nextDate.slice(0, 10);
    const occKey = recurringOccurrenceKey(rule.id, occYmd);
    if (links.byOccurrence[occKey]) continue;

    const due = new Date(`${occYmd}T12:00:00`);
    if (Number.isNaN(due.getTime())) continue;
    const winStart = addDays(startOfDay(due), -7);
    const winEnd = addDays(startOfDay(due), 5);
    winEnd.setHours(23, 59, 59, 999);

    const hit = expenses.find((t) => {
      if (usedTx.has(t.id)) return false;
      if (links.byTransaction[t.id]) return false;
      const td = parseTxDate(t.date);
      if (!td) return false;
      if (td < winStart || td > winEnd) return false;
      if (!amountMatches(Number(t.amount) || 0, rule.amount)) return false;
      if (!categoryMatches(t.category, t.subcategory, rule.category, rule.subcategory)) {
        return false;
      }
      return true;
    });

    if (!hit) continue;

    const next = advanceRecurringDate(occYmd, rule.frequency);
    const { error } = await updatePersonalRecurringRule(userId, rule.id, { nextDate: next });
    if (error) {
      console.warn('[plan-match] advance recurring', error.message);
      continue;
    }

    // Vazba na transakci (+ recurring_id pokud chybí)
    try {
      if (!hit.recurringId) {
        await supabase
          .from('transactions')
          .update({ recurring_id: rule.id })
          .eq('id', hit.id)
          .eq('user_id', userId);
        useFinanceStore.getState().updateTransaction(
          hit.id,
          { recurringId: rule.id },
          { skipNotify: true },
        );
      }
    } catch (e) {
      console.warn('[plan-match] set recurring_id', e);
    }

    links.byOccurrence[occKey] = hit.id;
    links.byTransaction[hit.id] = occKey;
    usedTx.add(hit.id);
    matches.push({
      kind: 'recurring',
      title: rule.title,
      amount: rule.amount,
      occurrenceKey: occKey,
      transactionId: hit.id,
    });
  }

  // --- loans ---
  const loans = useFinanceStore.getState().loans ?? [];
  for (const loan of loans) {
    const pay = Number(loan.monthlyPayment) || 0;
    if (pay <= 0) continue;
    const due = nextLoanDueDate(loan, now);
    if (!due) continue;
    const dueYmd = toYyyyMmDd(due);
    const occKey = loanOccurrenceKey(loan.id, dueYmd);
    if (links.byOccurrence[occKey]) continue;

    const winStart = addDays(startOfDay(due), -7);
    const winEnd = addDays(startOfDay(due), 5);
    winEnd.setHours(23, 59, 59, 999);
    const hint = loanCategoryHint(loan);

    const hit = expenses.find((t) => {
      if (usedTx.has(t.id)) return false;
      if (links.byTransaction[t.id]) return false;
      const td = parseTxDate(t.date);
      if (!td) return false;
      if (td < winStart || td > winEnd) return false;
      if (!amountMatches(Number(t.amount) || 0, pay)) return false;
      // Úvěry: hlavní kategorie Úvěry NEBO fuzzy match názvu v title
      const n = normalizeCategory(t.category, t.subcategory);
      const catOk =
        n.category === 'Úvěry' ||
        categoryMatches(t.category, t.subcategory, hint.category, hint.subcategory);
      const nameOk =
        Boolean(loan.name) &&
        String(t.title ?? '')
          .toLowerCase()
          .includes(String(loan.name).toLowerCase().slice(0, 12));
      return catOk || nameOk;
    });

    if (!hit) continue;

    useFinanceStore.getState().markLoanPaymentPaid(loan.id);
    links.byOccurrence[occKey] = hit.id;
    links.byTransaction[hit.id] = occKey;
    usedTx.add(hit.id);
    matches.push({
      kind: 'loan',
      title: loan.name || 'Závazek',
      amount: pay,
      occurrenceKey: occKey,
      transactionId: hit.id,
    });
  }

  if (matches.length > 0) {
    await savePlanPaymentLinks(userId, links);
  }
  return matches;
}

/** Ruční Zaplaceno — uloží vazbu (bez transactionId, placeholder). */
export async function recordManualPlanPaymentLink(
  userId: string,
  occurrenceKey: string,
  transactionId: string | null,
): Promise<void> {
  const links = await loadPlanPaymentLinks(userId);
  const txId = transactionId ?? `manual:${occurrenceKey}`;
  links.byOccurrence[occurrenceKey] = txId;
  links.byTransaction[txId] = occurrenceKey;
  await savePlanPaymentLinks(userId, links);
}

export async function isRecurringOccurrenceLinked(
  userId: string,
  ruleId: string,
  occurrenceYmd: string,
): Promise<boolean> {
  const links = await loadPlanPaymentLinks(userId);
  return Boolean(links.byOccurrence[recurringOccurrenceKey(ruleId, occurrenceYmd)]);
}

export function formatPlanMatchToast(matches: PlanPaymentMatch[]): string {
  if (matches.length === 0) return '';
  if (matches.length === 1) {
    const m = matches[0]!;
    return `✓ ${m.title} ${Math.round(m.amount).toLocaleString('cs-CZ')} Kč označeny jako zaplacené`;
  }
  return `✓ ${matches.length} pravidelných plateb označeno jako zaplacené`;
}
