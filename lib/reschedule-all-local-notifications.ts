import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { supabase } from '@/lib/supabase';
import { DAILY_TIP_KEYS } from '@/constants/daily-tip-keys';
import { TRANSLATIONS, useLanguageStore } from '@/store/language-store';
import { useSettingsStore } from '@/store/settings-store';
import type { LoanItem, SubscriptionItem } from '@/store/finance-store';
import {
  loadNotifMortgagePrefs,
  loadNotifPaymentsPrefs,
  loadNotifSubscriptionsPrefs,
  loadNotifTipPrefs,
  type NotifCategoryPrefs,
} from '@/lib/notifications-preferences';
import {
  listRecurringOccurrencesInMonth,
  nextDueDateForRecurring,
  normalizeFrequency,
  toIsoDate,
  isOccurrenceOverdueUnpaid,
  type RecurringCycleFields,
} from '@/lib/recurring-expense-cycle';
import { nextBillingDatesAfter, subscriptionCountsInTotal } from '@/lib/subscription-helpers';
import { isRecurringHouseholdExpenseVisible } from '@/lib/household-recurring-visibility';
import {
  allocateRecurringMemberShares,
  clampMySharePct,
  isRecurringItemFullyPaid,
  type RecurringSplitType,
} from '@/lib/household-recurring-shares';

const ANDROID_CHANNEL_HOUSEHOLD = 'household-recurring';
const ANDROID_CHANNEL_SUBS = 'monthly-subscriptions';
const ANDROID_CHANNEL_MORTGAGE = 'mortgage-reminders';
const ANDROID_CHANNEL_TIP = 'daily-tip';

const OVERDUE_STORAGE_KEY = 'household_overdue_notification_dates';

export const DAILY_TIP_NOTIFICATION_ID = 'moneybuddy-daily-tip';

function applyNotificationTime(date: Date, timeStr: string): Date {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(timeStr).trim());
  const out = new Date(date);
  if (!m) {
    out.setHours(9, 0, 0, 0);
    return out;
  }
  out.setHours(parseInt(m[1], 10), parseInt(m[2], 10), 0, 0);
  return out;
}

function addDays(d: Date, delta: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + delta);
  return x;
}

function reminderBeforePayment(paymentDate: Date, daysBefore: number, timeStr: string): Date {
  const r = new Date(paymentDate);
  r.setDate(r.getDate() - daysBefore);
  return applyNotificationTime(r, timeStr);
}

function formatCsDate(d: Date): string {
  return d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' });
}

function parseLoanStartDate(loan: LoanItem): Date {
  const d = loan.startDate as Date | string;
  return d instanceof Date ? d : new Date(d);
}

async function ensureAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_HOUSEHOLD, {
    name: 'Pravidelné výdaje domácnosti',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_SUBS, {
    name: 'Měsíční předplatné',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_MORTGAGE, {
    name: 'Splátky hypotéky',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_TIP, {
    name: 'Denní tip MoneyBuddy',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

async function loadOverdueSentMap(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(OVERDUE_STORAGE_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as Record<string, string>;
    return typeof p === 'object' && p ? p : {};
  } catch {
    return {};
  }
}

async function saveOverdueSentMap(map: Record<string, string>): Promise<void> {
  await AsyncStorage.setItem(OVERDUE_STORAGE_KEY, JSON.stringify(map));
}

type RecurringRow = {
  id: string;
  name: string;
  amount: number;
  due_day: number | null;
  due_weekday: number | null;
  due_month: number | null;
  frequency: string | null;
  split_type?: string | null;
  my_share?: number | null;
  created_by?: string | null;
  added_by?: string | null;
};

function paidUserIdsByExpenseDue(
  payments: { expense_id: string; user_id: string; paid: boolean; due_date: string | null }[] | null | undefined
): Map<string, Map<string, string[]>> {
  const byExp = new Map<string, Map<string, Set<string>>>();
  for (const p of payments ?? []) {
    if (!p.paid || !p.due_date) continue;
    const due = String(p.due_date).slice(0, 10);
    if (!byExp.has(p.expense_id)) byExp.set(p.expense_id, new Map());
    const byDue = byExp.get(p.expense_id)!;
    if (!byDue.has(due)) byDue.set(due, new Set());
    byDue.get(due)!.add(p.user_id);
  }
  const out = new Map<string, Map<string, string[]>>();
  for (const [eid, byDue] of byExp) {
    const m = new Map<string, string[]>();
    for (const [due, set] of byDue) m.set(due, [...set]);
    out.set(eid, m);
  }
  return out;
}

function normalizeSplit(raw: unknown): RecurringSplitType {
  if (raw === 'shared_half' || raw === 'shared_custom') return raw;
  return 'mine';
}

function rowToCycle(row: RecurringRow): RecurringCycleFields {
  return {
    frequency: normalizeFrequency(row.frequency),
    dueDay: Number(row.due_day ?? row.due_weekday ?? 1),
    dueWeekday:
      row.due_weekday != null && Number.isFinite(Number(row.due_weekday))
        ? Number(row.due_weekday)
        : null,
    dueMonth:
      row.due_month != null && Number.isFinite(Number(row.due_month)) ? Number(row.due_month) : null,
  };
}

function occurrenceFullyPaid(
  row: RecurringRow,
  memberIds: string[],
  paidUserIds: string[]
): boolean {
  const author =
    row.created_by != null && row.created_by !== ''
      ? String(row.created_by)
      : row.added_by != null && row.added_by !== ''
        ? String(row.added_by)
        : null;
  const shares = allocateRecurringMemberShares({
    amount: Number(row.amount),
    split: normalizeSplit(row.split_type),
    mySharePct: clampMySharePct(Number(row.my_share ?? 100)),
    memberIds,
    myShareOwnerUserId: author,
    expenseId: row.id,
  });
  return isRecurringItemFullyPaid(shares, paidUserIds);
}

export interface RescheduleAllParams {
  userId: string;
  subscriptions: SubscriptionItem[];
  loans: LoanItem[];
  currencyLabel: string;
}

/**
 * Zruší všechny naplánované notifikace a znovu je naplánuje podle nastavení v AsyncStorage a master toggle.
 */
export async function rescheduleAllLocalNotifications(params: RescheduleAllParams): Promise<void> {
  if (Platform.OS === 'web') return;

  const pushOn = useSettingsStore.getState().notifications.pushNotifications;
  if (!pushOn) {
    await Notifications.cancelAllScheduledNotificationsAsync();
    return;
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let final = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    final = status;
  }
  if (final !== 'granted') {
    await Notifications.cancelAllScheduledNotificationsAsync();
    return;
  }

  await ensureAndroidChannels();
  await Notifications.cancelAllScheduledNotificationsAsync();

  const { userId, subscriptions, loans, currencyLabel } = params;

  const [notifPayments, notifSubs, notifTip, notifMortgage] = await Promise.all([
    loadNotifPaymentsPrefs(userId),
    loadNotifSubscriptionsPrefs(),
    loadNotifTipPrefs(),
    loadNotifMortgagePrefs(),
  ]);

  const now = new Date();

  // --- Domácnost: platby a výdaje ---
  if (notifPayments.enabled) {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session?.access_token) {
      // Bez session by RLS (get_user_household_ids) spadlo na 42501 — přeskoč.
    } else {
    const { data: membership } = await supabase
      .from('household_members')
      .select('household_id')
      .eq('user_id', userId)
      .maybeSingle();

    const householdId = membership?.household_id as string | undefined;

    if (householdId) {
      const { data: rows } = await supabase
        .from('recurring_expenses')
        .select(
          'id, name, amount, due_day, due_weekday, due_month, frequency, split_type, my_share, created_by, added_by'
        )
        .eq('household_id', householdId);

      const rowsVisible = (rows ?? []).filter((r) =>
        isRecurringHouseholdExpenseVisible(
          (r as RecurringRow).split_type,
          (r as RecurringRow).created_by,
          (r as RecurringRow).added_by,
          userId
        )
      );

      const y = now.getFullYear();
      const m = now.getMonth() + 1;
      const monthStart = toIsoDate(y, m, 1);
      // Plánuj i výskyty v příštím měsíci (připomínky dopředu)
      const nextCursor = new Date(y, m, 1); // first of next month
      const y2 = nextCursor.getFullYear();
      const m2 = nextCursor.getMonth() + 1;
      const rangeEnd = toIsoDate(y2, m2, new Date(y2, m2, 0).getDate());

      const expenseIds = rowsVisible.map((r) => (r as RecurringRow).id).filter(Boolean);
      const { data: memberRows } = await supabase
        .from('household_members')
        .select('user_id')
        .eq('household_id', householdId);
      const memberIds = (memberRows ?? [])
        .map((r: { user_id: string }) => String(r.user_id))
        .filter(Boolean);

      let paymentsOk = true;
      let paidByExpenseDue = new Map<string, Map<string, string[]>>();
      if (expenseIds.length > 0) {
        const { data: pays, error: payErr } = await supabase
          .from('recurring_expense_payments')
          .select('expense_id,user_id,paid,due_date')
          .in('expense_id', expenseIds)
          .gte('due_date', monthStart)
          .lte('due_date', rangeEnd);
        if (payErr) {
          console.warn('[notifications] payments fetch failed — skip unpaid heuristics', payErr.message);
          paymentsOk = false;
        } else {
          paidByExpenseDue = paidUserIdsByExpenseDue(
            pays as {
              expense_id: string;
              user_id: string;
              paid: boolean;
              due_date: string | null;
            }[] | null
          );
        }
      }

      const daysBefore = notifPayments.daysBefore;
      const timeStr = notifPayments.time;
      let slot = 0;
      const maxSlots = 40;
      const overdueSentMap = await loadOverdueSentMap();
      const todayKey = new Date().toISOString().slice(0, 10);
      let overdueDirty = false;

      if (rowsVisible.length) {
        for (const row of rowsVisible as RecurringRow[]) {
          const cycle = rowToCycle(row);
          const occThis = listRecurringOccurrencesInMonth(cycle, y, m);
          const occNext = listRecurringOccurrencesInMonth(cycle, y2, m2);
          const allOcc = [...occThis, ...occNext];

          for (const dueIso of allOcc) {
            const paidIds = paidByExpenseDue.get(row.id)?.get(dueIso) ?? [];
            // Když platby nenačteme, nepovažuj za nezaplacené → žádné overdue/reminder na „neznámo“
            const treatAsPaid = !paymentsOk || occurrenceFullyPaid(row, memberIds, paidIds);
            if (treatAsPaid) continue;

            const [yy, mm, dd] = dueIso.split('-').map((x) => parseInt(x, 10));
            const dueDate = new Date(yy!, mm! - 1, dd!, 12, 0, 0, 0);
            const reminderDay = addDays(dueDate, -daysBefore);
            const triggerAt = applyNotificationTime(reminderDay, timeStr);
            if (triggerAt.getTime() > now.getTime() && slot < maxSlots) {
              await Notifications.scheduleNotificationAsync({
                content: {
                  title: '💸 Nezapomeň zaplatit!',
                  body: `${row.name} — ${Number(row.amount).toLocaleString('cs-CZ')} Kč je splatný ${formatCsDate(dueDate)}`,
                  data: { kind: 'household_recurring', recurringId: row.id, dueDate: dueIso },
                  ...(Platform.OS === 'android'
                    ? { android: { channelId: ANDROID_CHANNEL_HOUSEHOLD } }
                    : {}),
                },
                trigger: {
                  type: Notifications.SchedulableTriggerInputTypes.DATE,
                  date: triggerAt,
                },
              });
              slot += 1;
            }

            if (paymentsOk && isOccurrenceOverdueUnpaid(dueIso, false, now)) {
              const overdueKey = `${row.id}:${dueIso}`;
              if (overdueSentMap[overdueKey] === todayKey) continue;

              await Notifications.scheduleNotificationAsync({
                content: {
                  title: 'MoneyBuddy',
                  body: `⚠️ ${row.name} ${Number(row.amount).toLocaleString('cs-CZ')} Kč nebyl zaplacen!`,
                  data: { kind: 'household_overdue', recurringId: row.id, dueDate: dueIso },
                  ...(Platform.OS === 'android'
                    ? { android: { channelId: ANDROID_CHANNEL_HOUSEHOLD } }
                    : {}),
                },
                trigger: {
                  type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
                  seconds: 2,
                  repeats: false,
                },
              });

              overdueSentMap[overdueKey] = todayKey;
              overdueDirty = true;
            }
          }

          // Dopředná připomínka i když tento měsíc není splatné (příští výskyt)
          if (allOcc.length === 0 && paymentsOk) {
            const nextDue = nextDueDateForRecurring(cycle, now);
            const reminderDay = addDays(nextDue, -daysBefore);
            const triggerAt = applyNotificationTime(reminderDay, timeStr);
            if (triggerAt.getTime() > now.getTime() && slot < maxSlots) {
              await Notifications.scheduleNotificationAsync({
                content: {
                  title: '💸 Nezapomeň zaplatit!',
                  body: `${row.name} — ${Number(row.amount).toLocaleString('cs-CZ')} Kč je splatný ${formatCsDate(nextDue)}`,
                  data: { kind: 'household_recurring', recurringId: row.id },
                  ...(Platform.OS === 'android'
                    ? { android: { channelId: ANDROID_CHANNEL_HOUSEHOLD } }
                    : {}),
                },
                trigger: {
                  type: Notifications.SchedulableTriggerInputTypes.DATE,
                  date: triggerAt,
                },
              });
              slot += 1;
            }
          }
        }
      }

      if (overdueDirty) {
        await saveOverdueSentMap(overdueSentMap);
      }
    }
    } // has session
  }

  // --- Předplatné ---
  if (notifSubs.enabled) {
    await scheduleSubscriptionReminders(subscriptions, currencyLabel, notifSubs, now);
  }

  // --- Hypotéka ---
  if (notifMortgage.enabled) {
    const mortgages = loans.filter((l) => l.loanType === 'mortgage');
    if (mortgages.length > 0) {
      await scheduleMortgageReminders(mortgages, currencyLabel, notifMortgage, now);
    }
  }

  // --- Denní tip ---
  if (notifTip.enabled) {
    await scheduleDailyTipNotification(notifTip);
  }
}

async function scheduleSubscriptionReminders(
  subscriptions: SubscriptionItem[],
  currencyLabel: string,
  prefs: NotifCategoryPrefs,
  now: Date,
): Promise<void> {
  const eligible = subscriptions.filter(subscriptionCountsInTotal);
  let slot = 0;
  const { daysBefore, time } = prefs;

  for (const s of eligible) {
    const payments = nextBillingDatesAfter(now, s.dayOfMonth, 4);
    for (const pay of payments) {
      const triggerAt = reminderBeforePayment(pay, daysBefore, time);
      if (triggerAt.getTime() <= now.getTime()) continue;
      const dayWord =
        daysBefore === 1 ? 'Zítra' : daysBefore === 2 ? 'Za 2 dny' : 'Za 3 dny';
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'MoneyBuddy',
          body: `${dayWord} ti strhnou ${s.name} ${s.amount.toLocaleString('cs-CZ')} ${currencyLabel}`,
          data: { kind: 'subscription_reminder', subscriptionId: s.id },
          ...(Platform.OS === 'android' ? { android: { channelId: ANDROID_CHANNEL_SUBS } } : {}),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: triggerAt,
          ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_SUBS } : {}),
        },
      });
      slot += 1;
      if (slot >= 48) return;
    }
  }
}

async function scheduleMortgageReminders(
  loans: LoanItem[],
  currencyLabel: string,
  prefs: NotifCategoryPrefs,
  now: Date,
): Promise<void> {
  let slot = 0;
  const { daysBefore, time } = prefs;

  for (const loan of loans) {
    const start = parseLoanStartDate(loan);
    const dom = start.getDate();
    const payments = nextBillingDatesAfter(now, dom, 6);
    const label = loan.name?.trim() || 'Hypotéka';
    for (const pay of payments) {
      const triggerAt = reminderBeforePayment(pay, daysBefore, time);
      if (triggerAt.getTime() <= now.getTime()) continue;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '🏠 Splátka hypotéky',
          body: `${label}: ${loan.monthlyPayment.toLocaleString('cs-CZ')} ${currencyLabel} — splatnost ${formatCsDate(pay)}`,
          data: { kind: 'mortgage_reminder', loanId: loan.id },
          ...(Platform.OS === 'android' ? { android: { channelId: ANDROID_CHANNEL_MORTGAGE } } : {}),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: triggerAt,
          ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_MORTGAGE } : {}),
        },
      });
      slot += 1;
      if (slot >= 48) return;
    }
  }
}

function randomDailyTipBody(): string {
  const lang = useLanguageStore.getState().language;
  const key = DAILY_TIP_KEYS[Math.floor(Math.random() * DAILY_TIP_KEYS.length)]!;
  const cs = TRANSLATIONS.cs as Record<string, string>;
  const loc = TRANSLATIONS[lang] as Record<string, string>;
  return loc[key] ?? cs[key] ?? key;
}

async function scheduleDailyTipNotification(prefs: { time: string }): Promise<void> {
  const m = /^(\d{1,2}):(\d{2})$/.exec(prefs.time.trim());
  const hour = m ? parseInt(m[1], 10) : 8;
  const minute = m ? parseInt(m[2], 10) : 0;
  const title = useLanguageStore.getState().t('dailyTip');
  const body = randomDailyTipBody();

  await Notifications.scheduleNotificationAsync({
    identifier: DAILY_TIP_NOTIFICATION_ID,
    content: {
      title: `💡 ${title}`,
      body,
      data: { kind: 'daily_tip' },
      ...(Platform.OS === 'android' ? { android: { channelId: ANDROID_CHANNEL_TIP } } : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });
}

/** Pro volání z finance-store bez user kontextu (např. po úpravě předplatného). */
export async function rescheduleAllLocalNotificationsIfPushEnabled(): Promise<void> {
  if (Platform.OS === 'web') return;
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData?.session?.user?.id;
  if (!userId) return;

  const { useFinanceStore } = await import('@/store/finance-store');
  const st = useFinanceStore.getState();
  const sym = useSettingsStore.getState().getCurrentCurrency().symbol;

  await rescheduleAllLocalNotifications({
    userId,
    subscriptions: st.subscriptions,
    loans: st.loans,
    currencyLabel: sym,
  });
}
