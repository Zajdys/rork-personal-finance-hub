import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Keyboard, PanResponder, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useDraggableList } from '@/lib/use-draggable-list';
import {
  listRecurringOccurrencesInMonth,
  normalizeFrequency,
  toIsoDate,
  type RecurringFrequency,
} from '@/lib/recurring-expense-cycle';
import { supabase } from '@/lib/supabase';
import { isRecurringHouseholdExpenseVisible } from '@/lib/household-recurring-visibility';
import {
  clampMySharePct,
  type RecurringSplitType,
} from '@/lib/household-recurring-shares';
import {
  mapPaymentPeriodRow,
  normalizeExpensePaymentMode,
  recurringRowToSettlementInput,
  type ExpensePaymentMode,
  type RecurringExpenseSettlementInput,
} from '@/lib/household-settlements';
import { hasSupabaseSession, logSupabaseDataError } from '@/lib/supabase-session';
import { parseDecimalInput, parseMoneyInput } from '@/lib/parse-money-input';
import { useAuth } from '@/store/auth-store';
import { useFinanceStore } from '@/store/finance-store';
import { useLanguageStore } from '@/store/language-store';
import {
  DEFAULT_RECURRING_CATEGORY_PILLS,
  isDefaultCategoryName,
  itemFullyPaid,
  needsAnchorMonth,
  normalizeRecurringSplitType,
} from '@/components/household/helpers';
import type {
  HouseholdCustomCategory,
  Member,
  RecurringExpense,
  RecurringOccurrencePayment,
} from '@/components/household/types';
import {
  CUSTOM_CATEGORY_EMOJI_OPTIONS,
  RECURRING_EXPENSE_ORDER_KEY,
  formatSupabaseError,
  friendlyCatchMessage,
  LOAD_TIMEOUT_MS,
  withTimeout,
} from './utils';

type UseRecurringExpensesParams = {
  householdId: string | null;
  members: Member[];
};

export function useRecurringExpenses({ householdId, members }: UseRecurringExpensesParams) {
  const { t } = useLanguageStore();
  const { user } = useAuth();

  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpense[]>([]);
  const [recurringSettlementInputs, setRecurringSettlementInputs] = useState<
    RecurringExpenseSettlementInput[]
  >([]);
  const [recurringModalOpen, setRecurringModalOpen] = useState(false);
  /** Rozbalené vícevýskytové položky (id → true). Výchozí sbalené. */
  const [expandedMultiOccIds, setExpandedMultiOccIds] = useState<Record<string, boolean>>({});
  const [notifPermissionDenied, setNotifPermissionDenied] = useState(false);
  const [editingRecurringId, setEditingRecurringId] = useState<string | null>(null);
  const [newRecurringName, setNewRecurringName] = useState('');
  const [newRecurringAmount, setNewRecurringAmount] = useState('');
  const [newRecurringDueDay, setNewRecurringDueDay] = useState('');
  const [newRecurringDueWeekday, setNewRecurringDueWeekday] = useState('1');
  const [newRecurringDueMonth, setNewRecurringDueMonth] = useState('1');
  const [newRecurringFrequency, setNewRecurringFrequency] = useState<RecurringFrequency>('monthly');
  const [newRecurringCategory, setNewRecurringCategory] = useState<string>(DEFAULT_RECURRING_CATEGORY_PILLS[0]!.name);
  const [newRecurringSplitType, setNewRecurringSplitType] = useState<RecurringSplitType>('mine');
  const [newRecurringMyShare, setNewRecurringMyShare] = useState('50');
  const [newRecurringPaymentMode, setNewRecurringPaymentMode] = useState<ExpensePaymentMode>('each_own_share');
  const [newRecurringPayerUserId, setNewRecurringPayerUserId] = useState('');
  const [customCategories, setCustomCategories] = useState<HouseholdCustomCategory[]>([]);
  const [customCategoryModalOpen, setCustomCategoryModalOpen] = useState(false);
  const [newCustomCategoryName, setNewCustomCategoryName] = useState('');
  const [newCustomCategoryEmoji, setNewCustomCategoryEmoji] = useState<string>(CUSTOM_CATEGORY_EMOJI_OPTIONS[0]);
  const [customCategory, setCustomCategory] = useState<{ name: string; emoji: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const frequencyOptions = useMemo(
    (): readonly { value: RecurringFrequency; label: string }[] => [
      { value: 'weekly', label: t('hhFreqWeekly') },
      { value: 'monthly', label: t('hhFreqMonthly') },
      { value: 'quarterly', label: t('hhFreqQuarterly') },
      { value: 'biannual', label: t('hhFreqBiannual') },
      { value: 'yearly', label: t('hhFreqYearly') },
    ],
    [t]
  );

  const splitTypeOptions = useMemo(
    () =>
      [
        { id: 'mine' as const, label: t('hhSplitMine') },
        { id: 'shared_half' as const, label: t('hhSplitHalf') },
        { id: 'shared_custom' as const, label: t('hhSplitCustom') },
      ] as const,
    [t]
  );

  const sortedCustomCategories = useMemo(
    () => [...customCategories].sort((a, b) => a.name.localeCompare(b.name, 'cs')),
    [customCategories],
  );

  const {
    orderedItems: orderedRecurringExpenses,
    loadOrder: loadRecurringOrder,
    showReorderAlert: showRecurringReorderAlert,
  } = useDraggableList(recurringExpenses, RECURRING_EXPENSE_ORDER_KEY);

  useEffect(() => {
    void loadRecurringOrder();
  }, [loadRecurringOrder]);

  const resetRecurringFormToDefaults = useCallback(() => {
    setEditingRecurringId(null);
    setNewRecurringName('');
    setNewRecurringAmount('');
    setNewRecurringDueDay('');
    setNewRecurringDueWeekday('1');
    setNewRecurringDueMonth('1');
    setNewRecurringFrequency('monthly');
    setNewRecurringCategory(DEFAULT_RECURRING_CATEGORY_PILLS[0]!.name);
    setNewRecurringSplitType('mine');
    setNewRecurringMyShare('50');
    setNewRecurringPaymentMode('each_own_share');
    setNewRecurringPayerUserId(user?.id ?? '');
    setCustomCategoryModalOpen(false);
    setNewCustomCategoryName('');
    setNewCustomCategoryEmoji(CUSTOM_CATEGORY_EMOJI_OPTIONS[0]);
    setCustomCategory(null);
  }, [user?.id]);

  const closeRecurringModal = useCallback(() => {
    Keyboard.dismiss();
    resetRecurringFormToDefaults();
    setRecurringModalOpen(false);
  }, [resetRecurringFormToDefaults]);

  const closeCustomCategoryModal = useCallback(() => {
    Keyboard.dismiss();
    setNewCustomCategoryName('');
    setNewCustomCategoryEmoji(CUSTOM_CATEGORY_EMOJI_OPTIONS[0]);
    setCustomCategoryModalOpen(false);
  }, []);

  const openCustomCategoryModal = useCallback(() => {
    setNewCustomCategoryName('');
    setNewCustomCategoryEmoji(CUSTOM_CATEGORY_EMOJI_OPTIONS[0]);
    setCustomCategoryModalOpen(true);
  }, []);

  const recurringSheetPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 10 && g.dy > Math.abs(g.dx),
        onPanResponderRelease: (_e, g) => {
          if (g.dy > 56) closeRecurringModal();
        },
      }),
    [closeRecurringModal]
  );

  const clearData = useCallback(() => {
    setRecurringExpenses([]);
    setRecurringSettlementInputs([]);
    setCustomCategories([]);
  }, []);

  const fetchRecurringExpenses = useCallback(async (hid: string, currentUserId: string | undefined) => {
    if (!(await hasSupabaseSession())) return;
    let result;
    try {
      result = await withTimeout(
        supabase.from('recurring_expenses').select('*').eq('household_id', hid).order('created_at', { ascending: true }),
        LOAD_TIMEOUT_MS,
        'recurring_expenses'
      );
    } catch (e) {
      logSupabaseDataError('Failed to load recurring expenses', e);
      return;
    }
    const { data, error } = result;
    if (error) {
      logSupabaseDataError('Failed to load recurring expenses', error);
      return;
    }
    const latest = data ?? [];
    const allExpenseIds = (latest as { id?: string }[])
      .map((r) => String(r.id ?? ''))
      .filter(Boolean);

    /** expenseId → období platby (nejnovější first není nutné — resolve bere max ≤ due). */
    const periodsByExpense = new Map<string, ReturnType<typeof mapPaymentPeriodRow>[]>();
    if (allExpenseIds.length > 0) {
      try {
        const perRes = await withTimeout(
          supabase
            .from('recurring_expense_payment_periods')
            .select('expense_id,payment_mode,payer_user_id,effective_from')
            .in('expense_id', allExpenseIds),
          LOAD_TIMEOUT_MS,
          'recurring_expense_payment_periods',
        );
        if (!perRes.error && perRes.data) {
          for (const row of perRes.data as Record<string, unknown>[]) {
            const eid = String(row.expense_id ?? '');
            if (!eid) continue;
            if (!periodsByExpense.has(eid)) periodsByExpense.set(eid, []);
            periodsByExpense.get(eid)!.push(mapPaymentPeriodRow(row));
          }
        }
      } catch (e) {
        console.warn('[household] recurring_expense_payment_periods load', e);
      }
    }

    setRecurringSettlementInputs(
      (latest as Record<string, unknown>[]).map((row) =>
        recurringRowToSettlementInput(row, periodsByExpense.get(String(row.id ?? ''))),
      ),
    );

    const visibleRows = (latest as Record<string, unknown>[]).filter((row) =>
      isRecurringHouseholdExpenseVisible(
        row.split_type,
        row.created_by as string | null | undefined,
        row.added_by as string | null | undefined,
        currentUserId
      )
    );

    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const monthStart = toIsoDate(y, m, 1);
    const monthEnd = toIsoDate(y, m, new Date(y, m, 0).getDate());
    const expenseIds = visibleRows.map((r) => String((r as { id: string }).id)).filter(Boolean);

    /** expenseId → dueDate → paid user ids */
    const paidByExpenseDue = new Map<string, Map<string, Set<string>>>();

    if (expenseIds.length > 0) {
      try {
        const payRes = await withTimeout(
          supabase
            .from('recurring_expense_payments')
            .select('expense_id,user_id,paid,due_date')
            .in('expense_id', expenseIds)
            .gte('due_date', monthStart)
            .lte('due_date', monthEnd),
          LOAD_TIMEOUT_MS,
          'recurring_expense_payments'
        );
        if (!payRes.error && payRes.data) {
          for (const p of payRes.data as {
            expense_id: string;
            user_id: string;
            paid: boolean;
            due_date: string | null;
          }[]) {
            if (!p.paid || !p.due_date) continue;
            const due = String(p.due_date).slice(0, 10);
            if (!paidByExpenseDue.has(p.expense_id)) paidByExpenseDue.set(p.expense_id, new Map());
            const byDue = paidByExpenseDue.get(p.expense_id)!;
            if (!byDue.has(due)) byDue.set(due, new Set());
            byDue.get(due)!.add(p.user_id);
          }
        }
      } catch (e) {
        console.warn('[household] recurring_expense_payments load', e);
      }
    }

    setRecurringExpenses(
      visibleRows.map((row: any) => {
        const frequency = normalizeFrequency(row.frequency);
        const dueDay =
          row.due_day != null && row.due_day !== '' ? Number(row.due_day) : null;
        const dueWeekday =
          row.due_weekday != null && row.due_weekday !== ''
            ? Number(row.due_weekday)
            : null;
        const dueMonth =
          row.due_month != null && row.due_month !== '' ? Number(row.due_month) : null;
        const occDates = listRecurringOccurrencesInMonth(
          { frequency, dueDay, dueWeekday, dueMonth },
          y,
          m,
        );
        const byDue = paidByExpenseDue.get(String(row.id));
        const occurrences: RecurringOccurrencePayment[] = occDates.map((dueDate) => ({
          dueDate,
          paidUserIds: byDue?.get(dueDate) ? [...byDue.get(dueDate)!] : [],
        }));
        return {
          id: row.id,
          name: row.name,
          amount: Number(row.amount),
          dueDay: Number.isFinite(dueDay as number) ? dueDay : null,
          dueWeekday: Number.isFinite(dueWeekday as number) ? dueWeekday : null,
          dueMonth: Number.isFinite(dueMonth as number) ? dueMonth : null,
          frequency,
          category: String(row.category ?? ''),
          createdBy: row.created_by != null && row.created_by !== '' ? String(row.created_by) : null,
          addedBy: row.added_by ?? null,
          splitType: normalizeRecurringSplitType(row.split_type),
          myShare: clampMySharePct(Number(row.my_share ?? 100)),
          occurrences,
          paymentMode: normalizeExpensePaymentMode(row.payment_mode),
          payerUserId:
            row.payer_user_id != null && row.payer_user_id !== ''
              ? String(row.payer_user_id)
              : null,
          createdAt: row.created_at != null && row.created_at !== '' ? String(row.created_at) : null,
        };
      }),
    );
  }, []);

  const fetchCustomCategories = useCallback(async (hid: string) => {
    if (!(await hasSupabaseSession())) return;
    let result;
    try {
      result = await withTimeout(
        supabase
          .from('custom_categories')
          .select('id, name, emoji, created_at')
          .eq('household_id', hid)
          .order('name', { ascending: true }),
        LOAD_TIMEOUT_MS,
        'custom_categories'
      );
    } catch (e) {
      logSupabaseDataError('Failed to load custom categories', e);
      return;
    }
    const { data, error } = result;
    if (error) {
      logSupabaseDataError('Failed to load custom categories', error);
      return;
    }
    setCustomCategories(
      (data ?? []).map((row: { id: string; name: string; emoji: string; created_at: string }) => ({
        id: row.id,
        name: row.name,
        emoji: row.emoji || '📦',
        createdAt: row.created_at,
      }))
    );
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web' || !householdId) {
      setNotifPermissionDenied(false);
      return;
    }
    void Notifications.getPermissionsAsync().then(({ status }) => {
      setNotifPermissionDenied(status !== 'granted');
    });
  }, [householdId]);

  const setRecurringMyPaid = async (id: string, dueDate: string, value: boolean) => {
    if (!user || !householdId) return;
    const existing = recurringExpenses.find((item) => item.id === id);
    if (!existing) return;
    // Jen pro výskyty z modelu splatnosti — nikdy pro nesplatné datumy
    if (!existing.occurrences.some((o) => o.dueDate === dueDate)) return;

    const memberIdsForShares =
      members.length > 0 ? members.map((m) => m.userId) : user?.id ? [user.id] : [];
    const wasComplete = itemFullyPaid(existing, memberIdsForShares);

    const monthYearCompat = dueDate.slice(0, 7);
    const { error: payErr } = await supabase.from('recurring_expense_payments').upsert(
      {
        expense_id: id,
        user_id: user.id,
        due_date: dueDate,
        month_year: monthYearCompat,
        paid: value,
      },
      { onConflict: 'expense_id,user_id,due_date' }
    );
    if (payErr) {
      Alert.alert(t('error'), t('hhPaymentError', { detail: formatSupabaseError(payErr) }));
      console.error('recurring_expense_payments upsert', payErr);
      return;
    }

    const { data: payRows, error: paySelErr } = await supabase
      .from('recurring_expense_payments')
      .select('user_id,paid,due_date')
      .eq('expense_id', id)
      .eq('due_date', dueDate);
    if (paySelErr) {
      console.warn('[household] payments refetch', paySelErr);
    }
    const paidUserIds = (payRows ?? [])
      .filter((r: { paid: boolean }) => r.paid)
      .map((r: { user_id: string }) => r.user_id);

    const nextOccurrences = existing.occurrences.map((o) =>
      o.dueDate === dueDate ? { ...o, paidUserIds } : o,
    );
    const nextItem = { ...existing, occurrences: nextOccurrences };
    const complete = itemFullyPaid(nextItem, memberIdsForShares);

    if (complete && !wasComplete) {
      useFinanceStore.getState().recordLoanPaymentFromRecurring({
        name: existing.name,
        amount: Number(existing.amount),
        category: existing.category,
      });
    }

    await fetchRecurringExpenses(householdId, user.id);
  };

  const openRecurringCreate = () => {
    setEditingRecurringId(null);
    setNewRecurringName('');
    setNewRecurringAmount('');
    setNewRecurringDueDay('1');
    setNewRecurringDueWeekday('1');
    setNewRecurringDueMonth('1');
    setNewRecurringFrequency('monthly');
    setNewRecurringCategory(DEFAULT_RECURRING_CATEGORY_PILLS[0]!.name);
    setNewRecurringSplitType('mine');
    setNewRecurringMyShare('50');
    setNewRecurringPaymentMode('each_own_share');
    setNewRecurringPayerUserId(user?.id ?? members[0]?.userId ?? '');
    setCustomCategoryModalOpen(false);
    setNewCustomCategoryName('');
    setNewCustomCategoryEmoji('🏠');
    setRecurringModalOpen(true);
  };

  const submitCustomCategory = async () => {
    if (!householdId || !user) return;
    const name = newCustomCategoryName.trim();
    if (!name) {
      Alert.alert(t('error'), t('hhEnterCategoryName'));
      return;
    }
    if (isDefaultCategoryName(name)) {
      Alert.alert(t('error'), t('hhDefaultCategoryExists'));
      return;
    }
    if (sortedCustomCategories.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      Alert.alert(t('error'), t('hhCategoryExists'));
      return;
    }
    const { error } = await supabase.from('custom_categories').insert({
      household_id: householdId,
      user_id: user.id,
      name,
      emoji: newCustomCategoryEmoji || '📦',
    });
    if (error) {
      Alert.alert(t('error'), t('hhAddCategoryFailed', { detail: formatSupabaseError(error) }));
      return;
    }
    setNewRecurringCategory(name);
    await fetchCustomCategories(householdId);
    closeCustomCategoryModal();
  };

  const openRecurringEdit = (item: RecurringExpense) => {
    setEditingRecurringId(item.id);
    setNewRecurringName(item.name);
    setNewRecurringAmount(String(item.amount));
    setNewRecurringDueDay(item.dueDay != null ? String(item.dueDay) : '1');
    setNewRecurringDueWeekday(
      item.dueWeekday != null
        ? String(item.dueWeekday)
        : item.frequency === 'weekly' && item.dueDay != null
          ? String(item.dueDay)
          : '1',
    );
    setNewRecurringDueMonth(item.dueMonth != null ? String(item.dueMonth) : '1');
    setNewRecurringFrequency(item.frequency);
    setNewRecurringCategory(item.category);
    setNewRecurringSplitType(item.splitType);
    setNewRecurringMyShare(String(item.myShare));
    setNewRecurringPaymentMode(item.paymentMode);
    setNewRecurringPayerUserId(item.payerUserId ?? user?.id ?? members[0]?.userId ?? '');
    setRecurringModalOpen(true);
  };

  const upsertRecurringExpense = async () => {
    if (isSaving) return;
    if (!householdId || !user) return;
    setIsSaving(true);
    try {
    const amountValue = parseMoneyInput(newRecurringAmount);
    const dueDayStr = String(newRecurringDueDay).trim().replace(',', '.');
    const dueWeekdayStr = String(newRecurringDueWeekday).trim().replace(',', '.');
    const dueMonthStr = String(newRecurringDueMonth).trim().replace(',', '.');
    const freq = newRecurringFrequency;

    if (!freq) {
      Alert.alert(t('error'), t('hhFrequencyRequired'));
      return;
    }

    if (!newRecurringName.trim() || amountValue == null || amountValue <= 0) {
      Alert.alert(t('error'), t('hhFillNameAmount'));
      return;
    }

    let dueDayDb: number | null = null;
    let dueWeekdayDb: number | null = null;
    let dueMonthDb: number | null = null;

    if (freq === 'weekly') {
      if (!dueWeekdayStr) {
        Alert.alert(t('error'), t('hhFillDueDayWeekly'));
        return;
      }
      const wd = Number(dueWeekdayStr);
      if (!Number.isInteger(wd) || wd < 1 || wd > 7) {
        Alert.alert(t('error'), t('hhWeekDayRange'));
        return;
      }
      dueWeekdayDb = wd;
      dueDayDb = null;
      dueMonthDb = null;
    } else {
      if (!dueDayStr) {
        Alert.alert(t('error'), t('hhFillDueDayMonthly'));
        return;
      }
      const dueDayValue = Number(dueDayStr);
      if (!Number.isInteger(dueDayValue) || dueDayValue < 1 || dueDayValue > 31) {
        Alert.alert(t('error'), t('hhMonthDayRange'));
        return;
      }
      dueDayDb = dueDayValue;
      dueWeekdayDb = null;

      if (needsAnchorMonth(freq)) {
        if (!dueMonthStr) {
          Alert.alert(t('error'), t('hhFillAnchorMonth'));
          return;
        }
        const dueMonthValue = Number(dueMonthStr);
        if (!Number.isInteger(dueMonthValue) || dueMonthValue < 1 || dueMonthValue > 12) {
          Alert.alert(t('error'), t('hhMonthRange'));
          return;
        }
        dueMonthDb = dueMonthValue;
      }
    }

    let splitType = newRecurringSplitType;
    let mySharePct = 100;
    if (splitType === 'shared_half') {
      mySharePct = 50;
    } else if (splitType === 'shared_custom') {
      const rawShare = parseDecimalInput(newRecurringMyShare, 2);
      if (rawShare == null) {
        Alert.alert(t('error'), t('hhInvalidSharePercent'));
        return;
      }
      mySharePct = clampMySharePct(rawShare);
    } else {
      splitType = 'mine';
      mySharePct = 100;
    }

    if (newRecurringPaymentMode === 'single_payer') {
      if (!newRecurringPayerUserId) {
        Alert.alert(t('error'), t('hhSelectPayer'));
        return;
      }
    }

    const rowPayload: Record<string, unknown> = {
      name: newRecurringName.trim(),
      amount: amountValue,
      due_day: dueDayDb,
      due_weekday: dueWeekdayDb,
      due_month: dueMonthDb,
      frequency: freq,
      category: newRecurringCategory,
      split_type: splitType,
      my_share: mySharePct,
      payment_mode: newRecurringPaymentMode,
      payer_user_id:
        newRecurringPaymentMode === 'single_payer' ? newRecurringPayerUserId : null,
    };

    const todayYmd = (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();
    const periodPayload = {
      payment_mode: newRecurringPaymentMode,
      payer_user_id:
        newRecurringPaymentMode === 'single_payer' ? newRecurringPayerUserId : null,
      effective_from: todayYmd,
    };

    if (editingRecurringId) {
      const prev = recurringExpenses.find((e) => e.id === editingRecurringId);
      const { error } = await supabase.from('recurring_expenses').update(rowPayload).eq('id', editingRecurringId);
      if (error) {
        Alert.alert(t('error'), t('hhEditExpenseFailed', { detail: formatSupabaseError(error) }));
        return;
      }
      const prevPayer =
        prev?.paymentMode === 'single_payer' ? prev.payerUserId : null;
      const nextPayer =
        newRecurringPaymentMode === 'single_payer' ? newRecurringPayerUserId : null;
      const modeOrPayerChanged =
        !prev ||
        prev.paymentMode !== newRecurringPaymentMode ||
        prevPayer !== nextPayer;
      if (modeOrPayerChanged) {
        const { error: perErr } = await supabase.from('recurring_expense_payment_periods').upsert(
          {
            expense_id: editingRecurringId,
            ...periodPayload,
          },
          { onConflict: 'expense_id,effective_from' },
        );
        if (perErr) {
          console.warn('[household] payment period upsert', perErr);
        }
      }
    } else {
      const { data: inserted, error } = await supabase
        .from('recurring_expenses')
        .insert({
          household_id: householdId,
          ...rowPayload,
          added_by: user.id,
          created_by: user.id,
        })
        .select('id')
        .single();
      if (error || !inserted?.id) {
        Alert.alert(t('error'), t('hhAddExpenseFailed', { detail: formatSupabaseError(error) }));
        return;
      }
      const { error: perErr } = await supabase.from('recurring_expense_payment_periods').insert({
        expense_id: inserted.id,
        ...periodPayload,
      });
      if (perErr) {
        console.warn('[household] payment period insert', perErr);
      }
    }

    await fetchRecurringExpenses(householdId, user.id);
    closeRecurringModal();
    } finally {
      setIsSaving(false);
    }
  };

  const deleteRecurringExpense = (id: string) => {
    Alert.alert(t('hhDeleteExpenseTitle'), t('hhDeleteExpenseConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              const delResult = await withTimeout(
                supabase.from('recurring_expenses').delete().eq('id', id),
                LOAD_TIMEOUT_MS,
                'recurring_expenses.delete'
              );
              const { error } = delResult;
              if (error) {
                Alert.alert(t('error'), t('hhDeleteExpenseFailed', { detail: formatSupabaseError(error) }));
                return;
              }
              setRecurringExpenses((prev) => prev.filter((e) => e.id !== id));
              if (householdId && user?.id) {
                await fetchRecurringExpenses(householdId, user.id);
              }
              Alert.alert(t('hhExpenseDeleted'));
            } catch (e) {
              Alert.alert(t('error'), friendlyCatchMessage('household', e));
            }
          })();
        },
      },
    ]);
  };

  return {
    data: {
      recurringExpenses,
      recurringSettlementInputs,
      customCategories,
      sortedCustomCategories,
      orderedRecurringExpenses,
      recurringModalOpen,
      expandedMultiOccIds,
      notifPermissionDenied,
      editingRecurringId,
      newRecurringName,
      newRecurringAmount,
      newRecurringDueDay,
      newRecurringDueWeekday,
      newRecurringDueMonth,
      newRecurringFrequency,
      newRecurringCategory,
      newRecurringSplitType,
      newRecurringMyShare,
      newRecurringPaymentMode,
      newRecurringPayerUserId,
      customCategoryModalOpen,
      newCustomCategoryName,
      newCustomCategoryEmoji,
      customCategory,
      isSaving,
      frequencyOptions,
      splitTypeOptions,
      recurringSheetPanResponder,
    },
    loading: false,
    error: null as string | null,
    setRecurringExpenses,
    setExpandedMultiOccIds,
    setNewRecurringName,
    setNewRecurringAmount,
    setNewRecurringDueDay,
    setNewRecurringDueWeekday,
    setNewRecurringDueMonth,
    setNewRecurringFrequency,
    setNewRecurringCategory,
    setNewRecurringSplitType,
    setNewRecurringMyShare,
    setNewRecurringPaymentMode,
    setNewRecurringPayerUserId,
    setNewCustomCategoryName,
    setNewCustomCategoryEmoji,
    setCustomCategory,
    setCustomCategoryModalOpen,
    clearData,
    fetchRecurringExpenses,
    fetchCustomCategories,
    resetRecurringFormToDefaults,
    closeRecurringModal,
    closeCustomCategoryModal,
    openCustomCategoryModal,
    setRecurringMyPaid,
    openRecurringCreate,
    submitCustomCategory,
    openRecurringEdit,
    upsertRecurringExpense,
    deleteRecurringExpense,
    showRecurringReorderAlert,
  };
}
