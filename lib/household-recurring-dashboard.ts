import { supabase } from '@/lib/supabase';
import { hasSupabaseSession, isSessionLostError } from '@/lib/supabase-session';
import {
  isRecurringDueThisMonth,
  listRecurringOccurrencesInMonth,
  normalizeFrequency,
  toIsoDate,
} from '@/lib/recurring-expense-cycle';
import { isRecurringHouseholdExpenseVisible } from '@/lib/household-recurring-visibility';
import {
  clampMySharePct,
  memberShareDisplay,
  type RecurringSplitType,
} from '@/lib/household-recurring-shares';

function normalizeRecurringSplitType(raw: unknown): RecurringSplitType {
  if (raw === 'shared_half' || raw === 'shared_custom') return raw;
  return 'mine';
}

export type HouseholdRecurringPaySummary = {
  unpaidMyShareKc: number;
  paidByMeCount: number;
  totalCount: number;
};

/**
 * Souhrn pro dashboard: stav z recurring_expense_payments podle due_date.
 * Počítá výskyty v aktuálním měsíci (weekly = 4–5×).
 */
export async function fetchHouseholdRecurringPaySummary(userId: string): Promise<HouseholdRecurringPaySummary | null> {
  if (!userId || !(await hasSupabaseSession())) return null;

  const { data: membership, error: mErr } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  if (mErr) {
    if (!isSessionLostError(mErr)) {
      console.log('[household-recurring-dashboard] membership raw:', mErr);
    }
    return null;
  }
  if (!membership?.household_id) return null;

  const hid = membership.household_id as string;
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const monthStart = toIsoDate(y, m, 1);
  const monthEnd = toIsoDate(y, m, new Date(y, m, 0).getDate());

  const [{ data: memberRows }, { data: rows, error }] = await Promise.all([
    supabase.from('household_members').select('user_id').eq('household_id', hid),
    supabase
      .from('recurring_expenses')
      .select(
        'id,amount,split_type,my_share,created_by,added_by,frequency,due_day,due_weekday,due_month,created_at',
      )
      .eq('household_id', hid),
  ]);
  if (error) {
    if (!isSessionLostError(error)) {
      console.log('[household-recurring-dashboard] recurring_expenses select raw:', error);
    }
  }

  const memberIds = (memberRows ?? [])
    .map((r: { user_id: string }) => String(r.user_id))
    .filter(Boolean);

  const rawList = (error ? [] : rows) ?? [];
  const list = rawList.filter((row: Record<string, unknown>) => {
    if (
      !isRecurringHouseholdExpenseVisible(
        row.split_type,
        row.created_by as string | null | undefined,
        row.added_by as string | null | undefined,
        userId,
      )
    ) {
      return false;
    }
    return isRecurringDueThisMonth(
      {
        frequency: normalizeFrequency(row.frequency as string | null | undefined),
        dueDay: Number(row.due_day ?? row.due_weekday ?? 1),
        dueWeekday:
          row.due_weekday != null && row.due_weekday !== ''
            ? Number(row.due_weekday)
            : null,
        dueMonth: row.due_month != null && row.due_month !== '' ? Number(row.due_month) : null,
        createdAt: row.created_at != null && row.created_at !== '' ? String(row.created_at) : null,
      },
      now,
    );
  });

  const expenseIds = list.map((r) => r.id as string).filter(Boolean);
  /** expenseId → set of due_dates I paid */
  const myPaidDueDates = new Map<string, Set<string>>();
  if (expenseIds.length > 0) {
    const { data: pays, error: pErr } = await supabase
      .from('recurring_expense_payments')
      .select('expense_id,paid,due_date')
      .eq('user_id', userId)
      .gte('due_date', monthStart)
      .lte('due_date', monthEnd)
      .in('expense_id', expenseIds);
    if (pErr) {
      console.warn('[household-recurring-dashboard] recurring_expense_payments', pErr);
    } else {
      for (const p of pays ?? []) {
        if (!p.paid || !p.due_date) continue;
        const eid = String((p as { expense_id: string }).expense_id);
        const due = String(p.due_date).slice(0, 10);
        if (!myPaidDueDates.has(eid)) myPaidDueDates.set(eid, new Set());
        myPaidDueDates.get(eid)!.add(due);
      }
    }
  }

  let unpaidMyShareKc = 0;
  let paidByMeCount = 0;
  let totalCount = 0;

  for (const row of list) {
    const amount = Number(row.amount);
    const split = normalizeRecurringSplitType(row.split_type);
    const myShare = clampMySharePct(Number(row.my_share ?? 100));
    const author =
      row.created_by != null && row.created_by !== ''
        ? String(row.created_by)
        : row.added_by != null && row.added_by !== ''
          ? String(row.added_by)
          : null;
    const oneShare = memberShareDisplay(
      amount,
      split,
      myShare,
      memberIds.length > 0 ? memberIds : [userId],
      author,
      userId,
      String(row.id ?? ''),
    );
    const occ = listRecurringOccurrencesInMonth(
      {
        frequency: row.frequency as string,
        dueDay: row.due_day != null ? Number(row.due_day) : null,
        dueWeekday: row.due_weekday != null ? Number(row.due_weekday) : null,
        dueMonth: row.due_month != null ? Number(row.due_month) : null,
      },
      y,
      m,
    );
    if (occ.length === 0) continue;
    totalCount += 1;
    const paidSet = myPaidDueDates.get(String(row.id)) ?? new Set();
    let allPaid = true;
    for (const due of occ) {
      if (paidSet.has(due)) {
        // paid
      } else {
        allPaid = false;
        unpaidMyShareKc += oneShare;
      }
    }
    if (allPaid) paidByMeCount += 1;
  }
  return { unpaidMyShareKc, paidByMeCount, totalCount };
}
