/**
 * Upozornění na rozpočty (80 % / 100 %) + volitelný týdenní souhrn.
 */
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { fetchUserBudgets, type UserBudget } from '@/lib/supabase-plan';
import { normalizeCategory } from '@/lib/category-normalize';
import { getExpenseCategoryDef } from '@/constants/categories';
import { getMonthTransactions, useFinanceStore } from '@/store/finance-store';
import { pluralDen } from '@/lib/plural-cs';
import {
  loadNotifBudgetAlertsPrefs,
  loadNotifBudgetWeeklyPrefs,
} from '@/lib/notifications-preferences';
import { useSettingsStore } from '@/store/settings-store';
import { showToast } from '@/store/toast-store';

const SENT_KEY = (userId: string) => `budget_notif_sent_v1:${userId}`;
export const BUDGET_WEEKLY_NOTIFICATION_ID = 'moneybuddy-budget-weekly';
const ANDROID_CHANNEL_BUDGET = 'budget-alerts';

type SentMap = Record<string, true>;

function sentKey(budgetId: string, ym: string, threshold: 80 | 100): string {
  return `${budgetId}:${ym}:${threshold}`;
}

async function loadSent(userId: string): Promise<SentMap> {
  try {
    const raw = await AsyncStorage.getItem(SENT_KEY(userId));
    if (!raw) return {};
    const p = JSON.parse(raw) as SentMap;
    return p && typeof p === 'object' ? p : {};
  } catch {
    return {};
  }
}

async function saveSent(userId: string, map: SentMap): Promise<void> {
  try {
    await AsyncStorage.setItem(SENT_KEY(userId), JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function budgetLabel(b: UserBudget): string {
  return b.label?.trim() || b.category;
}

function budgetEmoji(b: UserBudget): string {
  return b.emoji || getExpenseCategoryDef(b.category)?.icon || '📦';
}

function spentForBudget(
  b: UserBudget,
  monthTx: { type: string; amount: number; category?: string; subcategory?: string | null }[],
): number {
  let sum = 0;
  for (const t of monthTx) {
    if (t.type !== 'expense') continue;
    const n = normalizeCategory(t.category, t.subcategory);
    if (n.category !== b.category) continue;
    if (b.subcategory && (n.subcategory ?? null) !== b.subcategory) continue;
    sum += Number(t.amount) || 0;
  }
  return sum;
}

function formatKc(n: number): string {
  return `${Math.round(n).toLocaleString('cs-CZ')} Kč`;
}

async function ensureBudgetChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_BUDGET, {
    name: 'Upozornění na rozpočty',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

async function deliverBudgetAlert(title: string, body: string): Promise<void> {
  const foreground = AppState.currentState === 'active';
  if (foreground) {
    showToast({ type: 'warning', message: `${title} — ${body}` });
    return;
  }
  if (Platform.OS === 'web') return;
  const master = useSettingsStore.getState().notifications.pushNotifications;
  if (!master) return;
  try {
    await ensureBudgetChannel();
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { kind: 'budget_alert' },
        ...(Platform.OS === 'android' ? { android: { channelId: ANDROID_CHANNEL_BUDGET } } : {}),
      },
      trigger: null,
    });
  } catch (e) {
    console.warn('[budget-notif] schedule', e);
  }
}

/**
 * Po přidání/importu transakcí: zkontroluj prahy 80 % a 100 % u rozpočtů aktuálního měsíce.
 */
export async function checkBudgetThresholdNotifications(userId: string): Promise<void> {
  if (!userId) return;
  const prefs = await loadNotifBudgetAlertsPrefs();
  if (!prefs.enabled) return;

  const budgets = await fetchUserBudgets(userId);
  if (budgets.length === 0) return;

  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const ym = `${y}-${String(m).padStart(2, '0')}`;
  const daysInMonth = new Date(y, m, 0).getDate();
  const daysLeft = Math.max(0, daysInMonth - now.getDate());

  const txs = useFinanceStore.getState().transactions;
  const monthTx = getMonthTransactions(txs, y, m);
  const sent = await loadSent(userId);
  let changed = false;

  for (const b of budgets) {
    if (b.amount <= 0) continue;
    const spent = spentForBudget(b, monthTx);
    const pct = (spent / b.amount) * 100;
    const emoji = budgetEmoji(b);
    const label = budgetLabel(b);

    if (pct >= 100) {
      const key = sentKey(b.id, ym, 100);
      if (!sent[key]) {
        const over = spent - b.amount;
        await deliverBudgetAlert(
          `⚠️ ${emoji} ${label}`,
          `rozpočet přečerpán o ${formatKc(over)}`,
        );
        sent[key] = true;
        // 80 % taky označíme, ať neposíláme obě
        sent[sentKey(b.id, ym, 80)] = true;
        changed = true;
      }
    } else if (pct >= 80) {
      const key = sentKey(b.id, ym, 80);
      if (!sent[key]) {
        const remain = Math.max(0, b.amount - spent);
        const daysNoun =
          daysLeft > 0 ? ` na ${daysLeft} ${pluralDen(daysLeft)}` : '';
        await deliverBudgetAlert(
          `${emoji} ${label}`,
          `utraceno ${formatKc(spent)} z ${formatKc(b.amount)} · zbývá ${formatKc(remain)}${daysNoun}`,
        );
        sent[key] = true;
        changed = true;
      }
    }
  }

  if (changed) await saveSent(userId, sent);
}

/**
 * Naplánuje páteční 18:00 týdenní souhrn (pokud zapnuto).
 * Volá se z rescheduleAllLocalNotifications.
 */
export async function scheduleBudgetWeeklySummaryIfEnabled(userId: string): Promise<void> {
  if (Platform.OS === 'web' || !userId) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(BUDGET_WEEKLY_NOTIFICATION_ID);
  } catch {
    /* ignore */
  }
  const prefs = await loadNotifBudgetWeeklyPrefs();
  if (!prefs.enabled) return;
  const master = useSettingsStore.getState().notifications.pushNotifications;
  if (!master) return;

  const budgets = await fetchUserBudgets(userId);
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const txs = useFinanceStore.getState().transactions;
  const monthTx = getMonthTransactions(txs, y, m);
  const spentMonth = monthTx
    .filter((t) => t.type === 'expense')
    .reduce((s, t) => s + (Number(t.amount) || 0), 0);

  let ok = 0;
  let over = 0;
  for (const b of budgets) {
    if (b.amount <= 0) continue;
    const spent = spentForBudget(b, monthTx);
    if (spent > b.amount) over += 1;
    else ok += 1;
  }

  const body =
    budgets.length === 0
      ? `Tento týden: utraceno ${formatKc(spentMonth)}`
      : `Tento týden: utraceno ${formatKc(spentMonth)}, rozpočty: ${ok} v pořádku, ${over} přes`;

  await ensureBudgetChannel();
  await Notifications.scheduleNotificationAsync({
    identifier: BUDGET_WEEKLY_NOTIFICATION_ID,
    content: {
      title: '📊 Týdenní souhrn rozpočtů',
      body,
      data: { kind: 'budget_weekly' },
      ...(Platform.OS === 'android' ? { android: { channelId: ANDROID_CHANNEL_BUDGET } } : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: 6, // pátek (1=neděle … 7=sobota v Expo)
      hour: 18,
      minute: 0,
    },
  });
}
