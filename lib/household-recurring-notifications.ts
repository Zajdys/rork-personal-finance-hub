import { Alert, Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import type { LoanItem, SubscriptionItem } from '@/store/finance-store';

export type UserNotificationProfile = {
  recurring_expense_notifications_enabled: boolean;
  notification_days_before: number;
  notification_time: string;
};

const DEFAULT_PROFILE: UserNotificationProfile = {
  recurring_expense_notifications_enabled: true,
  notification_days_before: 1,
  notification_time: '09:00',
};

/** Načte nebo vytvoří výchozí profil upozornění (Supabase — stále pro obrazovku Domácnost). */
export async function fetchOrCreateUserNotificationProfile(
  userId: string,
): Promise<UserNotificationProfile> {
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

  const { error: insErr } = await supabase.from('user_profiles').insert({
    user_id: userId,
    recurring_expense_notifications_enabled: DEFAULT_PROFILE.recurring_expense_notifications_enabled,
    notification_days_before: DEFAULT_PROFILE.notification_days_before,
    notification_time: DEFAULT_PROFILE.notification_time,
  });
  if (insErr && insErr.code !== '23505') {
    console.warn('[household-notifications] insert profile', insErr.message);
    Alert.alert('Upozornění', `Nepodařilo se vytvořit profil notifikací: ${insErr.message}`);
  }
  return { ...DEFAULT_PROFILE };
}

/**
 * Synchronizace všech lokálních notifikací (domácnost, předplatné, hypotéka, denní tip).
 * Volat při otevření appky (aktivní stav).
 */
export async function runHouseholdRecurringNotificationSync(
  userId: string,
  subscriptions: SubscriptionItem[],
  currencyLabel: string,
  loans: LoanItem[],
): Promise<void> {
  if (Platform.OS === 'web') return;
  const { rescheduleAllLocalNotifications } = await import('@/lib/reschedule-all-local-notifications');
  await rescheduleAllLocalNotifications({ userId, subscriptions, loans, currencyLabel });
}
