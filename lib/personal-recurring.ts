import { supabase } from '@/lib/supabase';
import { randomUUID } from '@/lib/random-uuid';
import { toYyyyMmDd, ymdToLocalDateNoon } from '@/lib/transaction-date';
import {
  normalizeFrequency,
  type RecurringFrequency,
} from '@/lib/recurring-expense-cycle';
import { buildTransactionUniqueKey } from '@/lib/bank-import-unique-key';
import { resolveCategoryFieldsForWrite } from '@/lib/category-normalize';

export type PersonalRecurringFrequency = RecurringFrequency;

export type PersonalRecurringRule = {
  id: string;
  userId: string;
  type: 'income' | 'expense';
  title: string;
  amount: number;
  currency: string;
  category: string;
  subcategory: string | null;
  frequency: PersonalRecurringFrequency;
  startDate: string;
  nextDate: string;
  endDate: string | null;
  active: boolean;
};

export type PersonalRecurringInput = {
  type: 'income' | 'expense';
  title: string;
  amount: number;
  currency?: string;
  category: string;
  subcategory?: string | null;
  frequency: PersonalRecurringFrequency;
  /** YYYY-MM-DD — první výskyt / start */
  startDate: string;
};

function clampDay(year: number, monthIndex0: number, day: number): number {
  const last = new Date(year, monthIndex0 + 1, 0).getDate();
  return Math.min(day, last);
}

/**
 * Posune datum o jednu periodu. Den 31 → poslední den cílového měsíce.
 */
export function advanceRecurringDate(
  isoYmd: string,
  frequency: PersonalRecurringFrequency,
): string {
  const freq = normalizeFrequency(frequency);
  const base = ymdToLocalDateNoon(isoYmd);
  const day = base.getDate();
  const y = base.getFullYear();
  const m = base.getMonth();

  if (freq === 'weekly') {
    const next = new Date(y, m, day + 7, 12, 0, 0, 0);
    return toYyyyMmDd(next);
  }

  let months = 1;
  if (freq === 'quarterly') months = 3;
  else if (freq === 'biannual') months = 6;
  else if (freq === 'yearly') months = 12;
  else months = 1; // monthly

  const total = m + months;
  const ny = y + Math.floor(total / 12);
  const nm = ((total % 12) + 12) % 12;
  const nd = clampDay(ny, nm, day);
  return toYyyyMmDd(new Date(ny, nm, nd, 12, 0, 0, 0));
}

function rowToRule(row: Record<string, unknown>): PersonalRecurringRule {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    type: row.type === 'income' ? 'income' : 'expense',
    title: String(row.title ?? ''),
    amount: Number(row.amount) || 0,
    currency: String(row.currency ?? 'CZK'),
    category: String(row.category ?? 'Ostatní'),
    subcategory:
      typeof row.subcategory === 'string' && row.subcategory.trim()
        ? row.subcategory.trim()
        : null,
    frequency: normalizeFrequency(String(row.frequency ?? 'monthly')),
    startDate: String(row.start_date).slice(0, 10),
    nextDate: String(row.next_date).slice(0, 10),
    endDate:
      typeof row.end_date === 'string' && row.end_date
        ? String(row.end_date).slice(0, 10)
        : null,
    active: row.active !== false,
  };
}

export async function fetchPersonalRecurringRules(
  userId: string,
): Promise<{ rules: PersonalRecurringRule[]; error: Error | null }> {
  const { data, error } = await supabase
    .from('personal_recurring_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('next_date', { ascending: true });
  if (error) return { rules: [], error: new Error(error.message) };
  return {
    rules: (data ?? []).map((r) => rowToRule(r as Record<string, unknown>)),
    error: null,
  };
}

/**
 * Vytvoří pravidlo + první transakci (s recurring_id) pro start_date.
 * next_date = start_date + 1 perioda.
 */
export async function createPersonalRecurringWithFirstTx(
  userId: string,
  input: PersonalRecurringInput,
): Promise<{ rule: PersonalRecurringRule | null; transactionId: string | null; error: Error | null }> {
  const frequency = normalizeFrequency(input.frequency);
  const startDate = input.startDate.slice(0, 10);
  const nextDate = advanceRecurringDate(startDate, frequency);
  const currency = (input.currency || 'CZK').trim() || 'CZK';
  const resolved = resolveCategoryFieldsForWrite({
    category: input.category,
    subcategory: input.subcategory,
    title: input.title,
    type: input.type,
  });
  const title = resolved.title;
  const category = resolved.category;
  const subcategory = resolved.subcategory;
  const ruleId = randomUUID();
  const txId = randomUUID();

  const { data: ruleRow, error: ruleErr } = await supabase
    .from('personal_recurring_transactions')
    .insert({
      id: ruleId,
      user_id: userId,
      type: input.type,
      title,
      amount: input.amount,
      currency,
      category,
      subcategory,
      frequency,
      start_date: startDate,
      next_date: nextDate,
      end_date: null,
      active: true,
    })
    .select('*')
    .single();

  if (ruleErr || !ruleRow) {
    return {
      rule: null,
      transactionId: null,
      error: new Error(ruleErr?.message ?? 'personal_recurring insert failed'),
    };
  }

  const description = title;
  const uniqueKey = buildTransactionUniqueKey({
    userId,
    bank: 'manual',
    date: startDate,
    amount: input.amount,
    description,
    bankTransactionId: `recurring:${ruleId}:${startDate}`,
  });

  const { error: txErr } = await supabase.from('transactions').insert({
    id: txId,
    user_id: userId,
    date: startDate,
    amount: input.amount,
    type: input.type,
    category,
    subcategory,
    description,
    source: 'manual',
    recurring_id: ruleId,
    unique_key: uniqueKey,
    category_source: 'user',
  });

  if (txErr) {
    // Pravidlo už existuje — smažeme ho, ať nezůstane osiřelé
    await supabase.from('personal_recurring_transactions').delete().eq('id', ruleId);
    return { rule: null, transactionId: null, error: new Error(txErr.message) };
  }

  return {
    rule: rowToRule(ruleRow as Record<string, unknown>),
    transactionId: txId,
    error: null,
  };
}

export async function updatePersonalRecurringRule(
  userId: string,
  ruleId: string,
  patch: Partial<{
    title: string;
    amount: number;
    currency: string;
    category: string;
    subcategory: string | null;
    frequency: PersonalRecurringFrequency;
    nextDate: string;
    endDate: string | null;
    active: boolean;
  }>,
): Promise<{ error: Error | null }> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title != null) payload.title = patch.title.trim();
  if (patch.amount != null) payload.amount = patch.amount;
  if (patch.currency != null) payload.currency = patch.currency;
  if (patch.category != null) payload.category = patch.category;
  if (patch.subcategory !== undefined) payload.subcategory = patch.subcategory;
  if (patch.frequency != null) payload.frequency = normalizeFrequency(patch.frequency);
  if (patch.nextDate != null) payload.next_date = patch.nextDate.slice(0, 10);
  if (patch.endDate !== undefined) payload.end_date = patch.endDate;
  if (patch.active != null) payload.active = patch.active;

  const { error } = await supabase
    .from('personal_recurring_transactions')
    .update(payload)
    .eq('id', ruleId)
    .eq('user_id', userId);
  return { error: error ? new Error(error.message) : null };
}

export async function deletePersonalRecurringRule(
  userId: string,
  ruleId: string,
): Promise<{ error: Error | null }> {
  // Smazání pravidla nemaže transakce (FK ON DELETE SET NULL).
  const { error } = await supabase
    .from('personal_recurring_transactions')
    .delete()
    .eq('id', ruleId)
    .eq('user_id', userId);
  return { error: error ? new Error(error.message) : null };
}

/**
 * Doplní chybějící transakce pro aktivní pravidla s next_date <= dnes.
 * Insert s unique (recurring_id, date) — konflikty ignoruje.
 */
export async function materializeDueRecurring(
  userId: string,
  todayYmd = toYyyyMmDd(new Date()),
): Promise<{ created: number; error: Error | null }> {
  const { data, error } = await supabase
    .from('personal_recurring_transactions')
    .select('*')
    .eq('user_id', userId)
    .eq('active', true)
    .lte('next_date', todayYmd);

  if (error) return { created: 0, error: new Error(error.message) };

  const { isRecurringOccurrenceLinked } = await import('@/lib/plan-payment-match');

  let created = 0;
  for (const raw of data ?? []) {
    const rule = rowToRule(raw as Record<string, unknown>);
    let next = rule.nextDate;
    let guard = 0;
    while (next <= todayYmd && guard < 120) {
      guard += 1;
      if (rule.endDate && next > rule.endDate) {
        await updatePersonalRecurringRule(userId, rule.id, { active: false });
        break;
      }

      // Už spárovaná transakce pro toto období → nevytvářej duplicitu
      if (await isRecurringOccurrenceLinked(userId, rule.id, next)) {
        next = advanceRecurringDate(next, rule.frequency);
        continue;
      }

      const resolved = resolveCategoryFieldsForWrite({
        category: rule.category,
        subcategory: rule.subcategory,
        title: rule.title,
        type: rule.type,
      });
      const description = resolved.title;
      const txId = randomUUID();
      const uniqueKey = buildTransactionUniqueKey({
        userId,
        bank: 'manual',
        date: next,
        amount: rule.amount,
        description,
        bankTransactionId: `recurring:${rule.id}:${next}`,
      });

      const { error: insErr } = await supabase.from('transactions').insert({
        id: txId,
        user_id: userId,
        date: next,
        amount: rule.amount,
        type: rule.type,
        category: resolved.category,
        subcategory: resolved.subcategory,
        description,
        source: 'manual',
        recurring_id: rule.id,
        unique_key: uniqueKey,
        category_source: 'user',
      });

      // Unique violation (recurring_id, date) → už existuje
      if (!insErr) created += 1;
      else if (insErr.code !== '23505') {
        console.warn('[personal-recurring] materialize insert', insErr.message);
      }

      next = advanceRecurringDate(next, rule.frequency);
    }

    await supabase
      .from('personal_recurring_transactions')
      .update({ next_date: next, updated_at: new Date().toISOString() })
      .eq('id', rule.id)
      .eq('user_id', userId);
  }

  return { created, error: null };
}

/**
 * Označí aktuální výskyt jako zaplacený: vytvoří transakci na next_date (nebo dnes,
 * pokud next_date je v minulosti) a posune next_date o jednu periodu.
 */
export async function markPersonalRecurringPaid(
  userId: string,
  ruleId: string,
): Promise<{ error: Error | null }> {
  const { data, error } = await supabase
    .from('personal_recurring_transactions')
    .select('*')
    .eq('id', ruleId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) {
    return { error: new Error(error?.message ?? 'Pravidlo nenalezeno') };
  }
  const rule = rowToRule(data as Record<string, unknown>);
  const today = toYyyyMmDd(new Date());
  const payDate = rule.nextDate <= today ? rule.nextDate : rule.nextDate;
  const resolved = resolveCategoryFieldsForWrite({
    category: rule.category,
    subcategory: rule.subcategory,
    title: rule.title,
    type: rule.type,
  });
  const description = resolved.title;
  const txId = randomUUID();
  const uniqueKey = buildTransactionUniqueKey({
    userId,
    bank: 'manual',
    date: payDate,
    amount: rule.amount,
    description,
    bankTransactionId: `recurring:${rule.id}:${payDate}`,
  });
  const { error: insErr } = await supabase.from('transactions').insert({
    id: txId,
    user_id: userId,
    date: payDate,
    amount: rule.amount,
    type: rule.type,
    category: resolved.category,
    subcategory: resolved.subcategory,
    description,
    source: 'manual',
    recurring_id: rule.id,
    unique_key: uniqueKey,
    category_source: 'user',
  });
  if (insErr && insErr.code !== '23505') {
    return { error: new Error(insErr.message) };
  }
  const next = advanceRecurringDate(payDate, rule.frequency);
  return updatePersonalRecurringRule(userId, rule.id, { nextDate: next });
}

/** Přeskočí aktuální výskyt bez vytvoření transakce (posune next_date). */
export async function skipPersonalRecurringOccurrence(
  userId: string,
  ruleId: string,
): Promise<{ error: Error | null }> {
  const { data, error } = await supabase
    .from('personal_recurring_transactions')
    .select('*')
    .eq('id', ruleId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) {
    return { error: new Error(error?.message ?? 'Pravidlo nenalezeno') };
  }
  const rule = rowToRule(data as Record<string, unknown>);
  const next = advanceRecurringDate(rule.nextDate, rule.frequency);
  return updatePersonalRecurringRule(userId, rule.id, { nextDate: next });
}

/** Aktivní pravidla se splatností zítra (pro notifikace den předem). */
export async function fetchPersonalRecurringDueTomorrow(
  userId: string,
  tomorrowYmd: string,
): Promise<PersonalRecurringRule[]> {
  const { data, error } = await supabase
    .from('personal_recurring_transactions')
    .select('*')
    .eq('user_id', userId)
    .eq('active', true)
    .eq('next_date', tomorrowYmd);
  if (error) {
    console.warn('[personal-recurring] due tomorrow', error.message);
    return [];
  }
  return (data ?? []).map((r) => rowToRule(r as Record<string, unknown>));
}
