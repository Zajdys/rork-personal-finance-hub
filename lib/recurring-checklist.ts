/**
 * „Zaplaceno tento měsíc“ u pravidelných plateb (jako v Domácnosti).
 * Zaškrtnutí = vytvoří výdaj k datu splatnosti v daném měsíci. Odškrtnutí = smaže ten výdaj.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { randomUUID } from '@/lib/random-uuid';
import { buildTransactionUniqueKey } from '@/lib/bank-import-unique-key';
import { resolveCategoryFieldsForWrite } from '@/lib/category-normalize';
import { toYyyyMmDd, transactionDateYmd } from '@/lib/transaction-date';
import { mainCategoryName } from '@/lib/category-normalize';
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

function normTitle(s: string | undefined | null): string {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Přísná shoda pro odškrtávání: částka musí sedět (±15 %) a k tomu název nebo kategorie.
 * (Volnější shoda z month-plan by např. „Voda 500“ přiřadila i k pravidlu „Voda 300“.)
 */
export function strictRuleMatch(t: Transaction, r: PersonalRecurringRule): boolean {
  const amt = Number(t.amount) || 0;
  const ra = Number(r.amount) || 0;
  if (!(ra > 0 && Math.abs(amt - ra) <= Math.max(1, ra * 0.15))) return false;
  const rt = normTitle(r.title);
  const titleOk = rt.length >= 3 && normTitle(t.title).includes(rt);
  const sameCat = mainCategoryName(t.category, t.subcategory) === mainCategoryName(r.category, r.subcategory);
  return titleOk || sameCat;
}

// --- Ruční „tohle není ta platba“ (odpárování platby z výpisu) ---
const UNMATCH_KEY = 'mb_recurring_unmatched_v1';

export async function loadUnmatchedPairs(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(UNMATCH_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export async function addUnmatchedPair(ruleId: string, txId: string): Promise<Set<string>> {
  const set = await loadUnmatchedPairs();
  set.add(`${ruleId}:${txId}`);
  try {
    await AsyncStorage.setItem(UNMATCH_KEY, JSON.stringify(Array.from(set).slice(-300)));
  } catch {
    /* ignore */
  }
  return set;
}

function inMonthExpenses(transactions: Transaction[], year: number, month: number): Transaction[] {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  return transactions.filter((t) => isExpenseForReport(t) && transactionDateYmd(t.date).startsWith(prefix));
}

/** Všechny výdaje v měsíci, které vznikly odškrtnutím tohoto pravidla (může jich být víc — duplicity). */
export function linkedPaymentsInMonth(
  rule: PersonalRecurringRule,
  transactions: Transaction[],
  year: number,
  month: number,
): Transaction[] {
  return inMonthExpenses(transactions, year, month).filter((t) => t.recurringId === rule.id);
}

/** Výdaj, kterým byla platba v měsíci zaplacena (vazba recurringId, nebo shoda z výpisu). */
export function findPaymentInMonth(
  rule: PersonalRecurringRule,
  transactions: Transaction[],
  year: number,
  month: number,
  usedTxIds?: Set<string>,
  unmatched?: Set<string>,
): Transaction | null {
  const inMonth = inMonthExpenses(transactions, year, month);
  const linked = inMonth.find((t) => t.recurringId === rule.id);
  if (linked) return linked;
  const ra = Number(rule.amount) || 0;
  const candidates = inMonth
    .filter(
      (t) =>
        !t.recurringId &&
        !usedTxIds?.has(t.id) &&
        !unmatched?.has(`${rule.id}:${t.id}`) &&
        strictRuleMatch(t, rule),
    )
    .sort((a, b) => Math.abs((Number(a.amount) || 0) - ra) - Math.abs((Number(b.amount) || 0) - ra));
  return candidates[0] ?? null;
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
  // Platíš dřív než ve splatnosti → zapíše se dnešní datum (ne budoucí).
  const today = toYyyyMmDd(new Date());
  if (ymd > today && ymd.slice(0, 7) === today.slice(0, 7)) ymd = today;
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
  if (error) {
    // Už existuje (dvojí ťuknutí / dřívější zápis) → vrať existující řádek, ať se fajfka ukáže.
    const { data: ex } = await supabase
      .from('transactions')
      .select('id, date, amount, type, category, subcategory, description, source, recurring_id')
      .eq('user_id', userId)
      .eq('unique_key', uniqueKey)
      .maybeSingle();
    if (!ex) return { tx: null, error: null };
    return {
      tx: {
        id: ex.id,
        type: ex.type,
        amount: Number(ex.amount),
        title: ex.description ?? resolved.title,
        category: ex.category,
        subcategory: ex.subcategory,
        date: String(ex.date).slice(0, 10),
        source: ex.source ?? 'manual',
        recurringId: ex.recurring_id ?? rule.id,
      } as Transaction,
      error: null,
    };
  }
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
