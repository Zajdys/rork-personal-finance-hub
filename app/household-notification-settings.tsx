import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Stack } from 'expo-router';
import { StackHeaderBackButton } from '@/components/BackButton';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/store/auth-store';
import { useSettingsStore } from '@/store/settings-store';
import { useLanguageStore } from '@/store/language-store';
import {
  fetchOrCreateUserNotificationProfile,
  type UserNotificationProfile,
} from '@/lib/household-recurring-notifications';
import {
  saveNotifPaymentsPrefs,
  type DaysBefore,
  type NotifCategoryPrefs,
} from '@/lib/notifications-preferences';
import { rescheduleAllLocalNotifications } from '@/lib/reschedule-all-local-notifications';
import { useFinanceStore } from '@/store/finance-store';

function parseTimeToDate(s: string): Date {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  const d = new Date();
  if (m) {
    d.setHours(parseInt(m[1], 10), parseInt(m[2], 10), 0, 0);
  } else {
    d.setHours(9, 0, 0, 0);
  }
  return d;
}

function formatTimeFromDate(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function householdToNotifPrefs(en: boolean, dayB: number, time: string): NotifCategoryPrefs {
  if (!en || dayB < 0) {
    return { enabled: false, daysBefore: 1, time };
  }
  const d = dayB === 0 ? 1 : dayB === 2 ? 2 : dayB === 3 ? 3 : 1;
  return { enabled: true, daysBefore: d as DaysBefore, time };
}

export default function HouseholdNotificationSettingsScreen() {
  const { user } = useAuth();
  const { isDarkMode } = useSettingsStore();
  const { t } = useLanguageStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [daysBefore, setDaysBefore] = useState(1);
  const [timeStr, setTimeStr] = useState('09:00');
  const [showTime, setShowTime] = useState(false);

  const DAY_OPTIONS = useMemo(
    () => [
      { label: t('hhNotifSameDay'), value: 0 },
      { label: t('hhNotif1DayBefore'), value: 1 },
      { label: t('hhNotif2DaysBefore'), value: 2 },
      { label: t('hhNotif3DaysBefore'), value: 3 },
      { label: t('hhNotifOff'), value: -1 },
    ],
    [t],
  );

  const primary = isDarkMode ? '#F9FAFB' : '#111827';
  const subtle = isDarkMode ? '#94A3B8' : '#6B7280';
  const card = isDarkMode ? '#1F2937' : '#FFFFFF';
  const border = isDarkMode ? '#334155' : '#E5E7EB';

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const p: UserNotificationProfile = await fetchOrCreateUserNotificationProfile(user.id);
      setEnabled(p.recurring_expense_notifications_enabled);
      setDaysBefore(p.notification_days_before);
      setTimeStr(p.notification_time);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (next: Partial<UserNotificationProfile> & { recurring_expense_notifications_enabled?: boolean }) => {
    if (!user?.id) return;
    setSaving(true);
    try {
      const payload = {
        user_id: user.id,
        recurring_expense_notifications_enabled: next.recurring_expense_notifications_enabled ?? enabled,
        notification_days_before: next.notification_days_before ?? daysBefore,
        notification_time: next.notification_time ?? timeStr,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('user_profiles').upsert(payload, { onConflict: 'user_id' });
      if (error) {
        Alert.alert(t('error'), error.message);
        return;
      }
      if (next.recurring_expense_notifications_enabled !== undefined) setEnabled(next.recurring_expense_notifications_enabled);
      if (next.notification_days_before !== undefined) setDaysBefore(next.notification_days_before);
      if (next.notification_time !== undefined) setTimeStr(next.notification_time);

      const en = next.recurring_expense_notifications_enabled ?? enabled;
      const db = next.notification_days_before ?? daysBefore;
      const tm = next.notification_time ?? timeStr;
      await saveNotifPaymentsPrefs(householdToNotifPrefs(en, db, tm));
      const { subscriptions, loans } = useFinanceStore.getState();
      const sym = useSettingsStore.getState().getCurrentCurrency().symbol;
      await rescheduleAllLocalNotifications({
        userId: user.id,
        subscriptions,
        loans,
        currencyLabel: sym,
      });
    } finally {
      setSaving(false);
    }
  };

  const onTimeChange = (_: unknown, date?: Date) => {
    setShowTime(Platform.OS === 'ios');
    if (date) {
      const s = formatTimeFromDate(date);
      setTimeStr(s);
      void save({ notification_time: s });
    }
  };

  if (!user?.id) {
    return (
      <View style={[styles.centered, { backgroundColor: isDarkMode ? '#111827' : '#F8FAFC' }]}>
        <Stack.Screen
          options={{
            title: t('profileNotificationSettings'),
            headerLeft: ({ tintColor }) => (
              <StackHeaderBackButton tintColor={tintColor ?? 'white'} />
            ),
          }}
        />
        <Text style={{ color: primary }}>{t('hhNotifSignIn')}</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: isDarkMode ? '#111827' : '#F8FAFC' }]}>
        <Stack.Screen
          options={{
            title: t('profileNotificationSettings'),
            headerLeft: ({ tintColor }) => (
              <StackHeaderBackButton tintColor={tintColor ?? 'white'} />
            ),
          }}
        />
        <ActivityIndicator size="large" color="#667eea" />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: isDarkMode ? '#111827' : '#F8FAFC' }]}
      contentContainerStyle={styles.content}
    >
      <Stack.Screen
        options={{
          title: t('profileNotificationSettings'),
          headerLeft: ({ tintColor }) => (
            <StackHeaderBackButton tintColor={tintColor ?? 'white'} />
          ),
        }}
      />

      <View style={[styles.card, { backgroundColor: card, borderColor: border }]}>
        <Text style={[styles.label, { color: subtle }]}>{t('hhNotifExpenseAlerts')}</Text>
        <View style={styles.rowBetween}>
          <Text style={[styles.body, { color: primary }]}>{t('hhNotifEnabled')}</Text>
          <Switch
            value={enabled}
            onValueChange={(v) => {
              setEnabled(v);
              void save({ recurring_expense_notifications_enabled: v });
            }}
            trackColor={{ false: '#9CA3AF', true: '#86EFAC' }}
            thumbColor={Platform.OS === 'android' ? (enabled ? '#fff' : '#f4f3f4') : undefined}
          />
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: card, borderColor: border }]}>
        <Text style={[styles.label, { color: subtle }]}>{t('hhNotifWhen')}</Text>
        {DAY_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={[
              styles.option,
              { borderColor: daysBefore === opt.value ? '#667eea' : border },
              daysBefore === opt.value && { backgroundColor: isDarkMode ? '#312E81' : '#EEF2FF' },
            ]}
            onPress={() => {
              setDaysBefore(opt.value);
              void save({ notification_days_before: opt.value });
            }}
          >
            <Text style={[styles.optionText, { color: primary }]}>{opt.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={[styles.card, { backgroundColor: card, borderColor: border }]}>
        <Text style={[styles.label, { color: subtle }]}>{t('hhNotifTime')}</Text>
        <TouchableOpacity style={styles.timeBtn} onPress={() => setShowTime(true)}>
          <Text style={[styles.timeBtnText, { color: primary }]}>{timeStr}</Text>
        </TouchableOpacity>
        {showTime && (
          <DateTimePicker
            value={parseTimeToDate(timeStr)}
            mode="time"
            is24Hour
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={onTimeChange}
          />
        )}
      </View>

      {saving ? <Text style={[styles.hint, { color: subtle }]}>{t('hhNotifSaving')}</Text> : null}

      <Text style={[styles.footerHint, { color: subtle }]}>{t('hhNotifFooter')}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
  },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 10 },
  body: { fontSize: 16 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  option: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  optionText: { fontSize: 15, fontWeight: '600' },
  timeBtn: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: 'rgba(102, 126, 234, 0.12)',
    alignItems: 'center',
  },
  timeBtnText: { fontSize: 18, fontWeight: '700' },
  hint: { textAlign: 'center', marginTop: 8 },
  footerHint: { fontSize: 12, lineHeight: 18, marginTop: 8 },
});
