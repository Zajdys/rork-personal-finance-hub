/**
 * „Zaplaceno tento měsíc“ u pravidelných plateb (jako v Domácnosti).
 * Zaškrtnutí = vytvoří výdaj k datu splatnosti v daném měsíci. Odškrtnutí = smaže ten výdaj.
 */
import { supabase } from '@/lib/supabase';
import { randomUUID } from '@/lib/random-uuid';
import { buildTransactionUniqueKey } from '@/lib/bank-import-unique-key';
import { resolveCategoryFieldsForWrite } from '@/lib/category-normalize';
import { toYyyyMmDd, transactionDateYmd } from '@/lib/transaction-date';
import { matchesRule } from '@/lib/month-plan';
import {
  advanceRecurringDate,
  updatePersonalRecurringRule,
  type PersonalRecurringRule,
} from '@/lib/personal-recurring';
import { isExpenseForReport, type Transaction } from '@/store/finance-store';

function monthsFor(freq: string): number {
  if (freq === 'quarterly') return 3;
  if (freq === 'biannual') return 6;
  if (freq === 'yearly') return 12;
  return 1;
}

function shiftMonths(ymd: string, months: number, anchorDay: number): string {
  const [y, m] = ymd.split('-').map(Number);
  const total = (m! - 1) + months;
  const ny = y! + Math.floor(total / 12);
  const nm = ((total % 12) + 12) % 12;
  const last = new Date(ny, nm + 1, 0).getDate();
  return toYyyyMmDd(new Date(ny, nm, Math.min(anchorDay, last), 12, 0, 0, 0));
}

/** Datum splatnosti pravidla v daném měsíci (YYYY-MM-DD), nebo null když v tom měsíci neplatí. Týdenní → null. */
export function occurrenceInMonth(rule: PersonalRecurringRule, year: number, month: number): string | null {
  if (rule.frequency === 'weekly') return null;
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const step = monthsFor(rule.frequency);
  const anchorDay = parseInt((rule.startDate || rule.nextDate).slice(8, 10), 10) || 1;
  let cand = rule.nextDate.slice(0, 10);
  for (let i = 0; i < 40 && cand.slice(0, 7) > prefix; i++) cand = shiftMonths(cand, -step, anchorDay);
  for (let i = 0; i < 40 && cand.slice(0, 7) < prefix; i++) cand = shiftMonths(cand, step, anchorDay);
  if (cand.slice(0, 7) !== prefix) return null;
  if (rule.startDate && cand < rule.startDate.slice(0, 10) && cand.slice(0, 7) < rule.startDate.slice(0, 7)) return null;
  return cand;
}

/** Výdaj, kterým byla platba v měsíci zaplacena (vazba recurringId, nebo shoda z importu). */
export function findPaymentInMonth(
  rule: PersonalRecurringRule,
  transactions: Transaction[],
  year: number,
  month: number,
  usedTxIds?: Set<string>,
): Transaction | null {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const inMonth = transactions.filter(
    (t) => isExpenseForReport(t) && transactionDateYmd(t.date).startsWith(prefix),
  );
  const linked = inMonth.find((t) => t.recurringId === rule.id);
  if (linked) return linked;
  const hit = inMonth.find((t) => !t.recurringId && !usedTxIds?.has(t.id) && matchesRule(t, rule));
  return hit ?? null;
}

/** Zaškrtnout: vytvoří výdaj k datu splatnosti a posune další splatnost, pokud je potřeba. */
export async function markRecurringPaidOn(
  userId: string,
  rule: PersonalRecurringRule,
  ymd: string,
): Promise<{ tx: Transaction | null; error: Error | null }> {
  const resolved = resolveCategoryFieldsForWrite({
    category: rule.category,
    subcategory: rule.subcategory,
    title: rule.title,
    type: rule.type,
  });
  const id = randomUUID();
  const uniqueKey = buildTransactionUniqueKey({
    userId,
    bank: 'manual',
    date: ymd,
    amount: rule.amount,
    description: resolved.title,
    bankTransactionId: `recurring:${rule.id}:${ymd}`,
  });
  const { error } = await supabase.from('transactions').insert({
    id,
    user_id: userId,
    date: ymd,
    amount: rule.amount,
    type: rule.type,
    category: resolved.category,
    subcategory: resolved.subcategory,
    description: resolved.title,
    source: 'manual',
    recurring_id: rule.id,
    unique_key: uniqueKey,
    category_source: 'user',
  });
  if (error && error.code !== '23505') return { tx: null, error: new Error(error.message) };
  if (rule.nextDate.slice(0, 10) <= ymd) {
    await updatePersonalRecurringRule(userId, rule.id, { nextDate: advanceRecurringDate(ymd, rule.frequency) });
  }
  if (error) return { tx: null, error: null };
  return {
    tx: {
      id,
      type: rule.type,
      amount: rule.amount,
      title: resolved.title,
      category: resolved.category,
      subcategory: resolved.subcategory,
      date: ymd,
      source: 'manual',
      recurringId: rule.id,
    } as Transaction,
    error: null,
  };
}
