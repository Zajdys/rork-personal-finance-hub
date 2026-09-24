import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import { supabase } from '@/lib/supabase';

export const NOTIF_STORAGE_KEYS = {
  payments: 'notif_payments',
  subscriptions: 'notif_subscriptions',
  tip: 'notif_tip',
  mortgage: 'notif_mortgage',
} as const;

export type DaysBefore = 1 | 2 | 3;

export interface NotifCategoryPrefs {
  enabled: boolean;
  daysBefore: DaysBefore;
  /** HH:mm */
  time: string;
}

export interface NotifTipPrefs {
  enabled: boolean;
  /** HH:mm */
  time: string;
}

export const DEFAULT_NOTIF_CATEGORY: NotifCategoryPrefs = {
  enabled: true,
  daysBefore: 1,
  time: '09:00',
};

export const DEFAULT_NOTIF_TIP: NotifTipPrefs = {
  enabled: true,
  time: '08:00',
};

export function normalizeNotifCategory(raw: unknown): NotifCategoryPrefs {
  const d = DEFAULT_NOTIF_CATEGORY;
  if (!raw || typeof raw !== 'object') return { ...d };
  const o = raw as Record<string, unknown>;
  const enabled = typeof o.enabled === 'boolean' ? o.enabled : d.enabled;
  let daysBefore = typeof o.daysBefore === 'number' ? o.daysBefore : d.daysBefore;
  if (daysBefore !== 1 && daysBefore !== 2 && daysBefore !== 3) daysBefore = d.daysBefore;
  const time =
    typeof o.time === 'string' && /^\d{1,2}:\d{2}$/.test(o.time.trim())
      ? o.time.trim()
      : d.time;
  return { enabled, daysBefore: daysBefore as DaysBefore, time };
}

export function normalizeNotifTip(raw: unknown): NotifTipPrefs {
  const d = DEFAULT_NOTIF_TIP;
  if (!raw || typeof raw !== 'object') return { ...d };
  const o = raw as Record<string, unknown>;
  const enabled = typeof o.enabled === 'boolean' ? o.enabled : d.enabled;
  const time =
    typeof o.time === 'string' && /^\d{1,2}:\d{2}$/.test(o.time.trim())
      ? o.time.trim()
      : d.time;
  return { enabled, time };
}

/** Jednorázová migrace z Supabase profilu, pokud v AsyncStorage ještě nic není. */
export async function loadNotifPaymentsPrefs(userId: string | null): Promise<NotifCategoryPrefs> {
  try {
    const raw = await AsyncStorage.getItem(NOTIF_STORAGE_KEYS.payments);
    if (raw) {
      return normalizeNotifCategory(JSON.parse(raw));
    }
  } catch {
    /* ignore */
  }
  if (userId) {
    try {
      const profile = await fetchOrCreateUserProfileForMigration(userId);
      const days = profile.notification_days_before;
      const mapped: NotifCategoryPrefs = {
        enabled:
          Boolean(profile.recurring_expense_notifications_enabled) &&
          typeof days === 'number' &&
          days >= 1 &&
          days <= 3,
        daysBefore: days === 2 ? 2 : days === 3 ? 3 : 1,
        time:
          typeof profile.notification_time === 'string' && profile.notification_time.length > 0
            ? profile.notification_time
            : DEFAULT_NOTIF_CATEGORY.time,
      };
      await AsyncStorage.setItem(NOTIF_STORAGE_KEYS.payments, JSON.stringify(mapped));
      return mapped;
    } catch {
      /* ignore */
    }
  }
  return { ...DEFAULT_NOTIF_CATEGORY };
}

export async function loadNotifSubscriptionsPrefs(): Promise<NotifCategoryPrefs> {
  try {
    const raw = await AsyncStorage.getItem(NOTIF_STORAGE_KEYS.subscriptions);
    if (raw) return normalizeNotifCategory(JSON.parse(raw));
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_NOTIF_CATEGORY };
}

export async function loadNotifTipPrefs(): Promise<NotifTipPrefs> {
  try {
    const raw = await AsyncStorage.getItem(NOTIF_STORAGE_KEYS.tip);
    if (raw) return normalizeNotifTip(JSON.parse(raw));
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_NOTIF_TIP };
}

export async function loadNotifMortgagePrefs(): Promise<NotifCategoryPrefs> {
  try {
    const raw = await AsyncStorage.getItem(NOTIF_STORAGE_KEYS.mortgage);
    if (raw) return normalizeNotifCategory(JSON.parse(raw));
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_NOTIF_CATEGORY };
}

export async function saveNotifPaymentsPrefs(p: NotifCategoryPrefs): Promise<void> {
  await AsyncStorage.setItem(NOTIF_STORAGE_KEYS.payments, JSON.stringify(normalizeNotifCategory(p)));
}

export async function saveNotifSubscriptionsPrefs(p: NotifCategoryPrefs): Promise<void> {
  await AsyncStorage.setItem(NOTIF_STORAGE_KEYS.subscriptions, JSON.stringify(normalizeNotifCategory(p)));
}

export async function saveNotifTipPrefs(p: NotifTipPrefs): Promise<void> {
  await AsyncStorage.setItem(NOTIF_STORAGE_KEYS.tip, JSON.stringify(normalizeNotifTip(p)));
}

export async function saveNotifMortgagePrefs(p: NotifCategoryPrefs): Promise<void> {
  await AsyncStorage.setItem(NOTIF_STORAGE_KEYS.mortgage, JSON.stringify(normalizeNotifCategory(p)));
}

async function fetchOrCreateUserProfileForMigration(userId: string): Promise<{
  recurring_expense_notifications_enabled: boolean;
  notification_days_before: number;
  notification_time: string;
}> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('recurring_expense_notifications_enabled, notification_days_before, notification_time')
    .eq('user_id', userId)
    .maybeSingle();

  if (!error && data) {
    return {
      recurring_expense_notifications_enabled: Boolean(data.recurring_expense_notifications_enabled),
      notification_days_before:
        typeof data.notification_days_before === 'number' ? data.notification_days_before : 1,
      notification_time:
        typeof data.notification_time === 'string' && data.notification_time.length > 0
          ? data.notification_time
          : '09:00',
    };
  }

  const defaults = {
    recurring_expense_notifications_enabled: true,
    notification_days_before: 1,
    notification_time: '09:00',
  };
  const { error: insErr } = await supabase.from('user_profiles').insert({
    user_id: userId,
    ...defaults,
  });
  if (insErr && insErr.code !== '23505') {
    console.warn('[notif-prefs] insert profile', insErr.message);
    Alert.alert('Upozornění', `Nepodařilo se vytvořit profil notifikací: ${insErr.message}`);
  }
  return defaults;
}
