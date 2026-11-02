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
import { Stack } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Notifications from 'expo-notifications';
import { Bell, BellRing, CreditCard, Home, Lightbulb, PieChart, UsersRound } from 'lucide-react-native';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useSettingsStore } from '@/store/settings-store';
import { useLanguageStore } from '@/store/language-store';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/store/auth-store';
import { useFinanceStore } from '@/store/finance-store';
import {
  loadNotifBudgetAlertsPrefs,
  loadNotifBudgetWeeklyPrefs,
  loadNotifMortgagePrefs,
  loadNotifPaymentsPrefs,
  loadNotifSubscriptionsPrefs,
  loadNotifTipPrefs,
  saveNotifBudgetAlertsPrefs,
  saveNotifBudgetWeeklyPrefs,
  saveNotifMortgagePrefs,
  saveNotifPaymentsPrefs,
  saveNotifSubscriptionsPrefs,
  saveNotifTipPrefs,
  type DaysBefore,
  type NotifCategoryPrefs,
  type NotifSimpleToggle,
  type NotifTipPrefs,
} from '@/lib/notifications-preferences';
import {
  fetchNotifySplitExpenses,
  updateNotifySplitExpenses,
} from '@/lib/split-expense-notifications-pref';
import {
  rescheduleAllLocalNotifications,
  rescheduleAllLocalNotificationsIfPushEnabled,
} from '@/lib/reschedule-all-local-notifications';
import {
  getPushTokenSetupFailed,
  registerExpoPushTokenForUser,
} from '@/lib/expo-push-token';
import { supabase } from '@/lib/supabase';
import {
  fetchOrCreateUserNotificationProfile,
  type UserNotificationProfile,
} from '@/lib/household-recurring-notifications';

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

const DAY_PILL_VALUES: DaysBefore[] = [1, 2, 3];

export default function NotificationsSettingsScreen() {
  const { notifications, setNotificationSetting } = useSettingsStore();
  const { t } = useLanguageStore();
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const loans = useFinanceStore((s) => s.loans);
  const subscriptions = useFinanceStore((s) => s.subscriptions);
  const currencySymbol = useSettingsStore((s) => s.getCurrentCurrency().symbol);

  const dayPills = useMemo(
    () =>
      DAY_PILL_VALUES.map((value) => ({
        value,
        label:
          value === 1
            ? t('notificationsSettings.daysBefore1')
            : value === 2
              ? t('notificationsSettings.daysBefore2')
              : t('notificationsSettings.daysBefore3'),
      })),
    [t],
  );

  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<NotifCategoryPrefs | null>(null);
  const [subsPref, setSubsPref] = useState<NotifCategoryPrefs | null>(null);
  const [tip, setTip] = useState<NotifTipPrefs | null>(null);
  const [mortgage, setMortgage] = useState<NotifCategoryPrefs | null>(null);
  const [budgetAlerts, setBudgetAlerts] = useState<NotifSimpleToggle | null>(null);
  const [budgetWeekly, setBudgetWeekly] = useState<NotifSimpleToggle | null>(null);
  const [splitExpensesNotif, setSplitExpensesNotif] = useState<boolean | null>(null);
  const [splitSaving, setSplitSaving] = useState(false);

  const [showPayTime, setShowPayTime] = useState(false);
  const [showSubTime, setShowSubTime] = useState(false);
  const [showTipTime, setShowTipTime] = useState(false);
  const [showMortTime, setShowMortTime] = useState(false);
  const [showHhTime, setShowHhTime] = useState(false);
  const [pushSetupFailed, setPushSetupFailed] = useState(false);

  const [hhEnabled, setHhEnabled] = useState(true);
  const [hhDaysBefore, setHhDaysBefore] = useState(1);
  const [hhTimeStr, setHhTimeStr] = useState('09:00');
  const [hhSaving, setHhSaving] = useState(false);
  const [hhLoaded, setHhLoaded] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from('users')
        .select('marketing_consent')
        .eq('id', user.id)
        .maybeSingle();
      if (!cancelled) setMarketingConsent(Boolean((data as { marketing_consent?: boolean } | null)?.marketing_consent));
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const toggleMarketing = async (v: boolean) => {
    if (!user?.id) return;
    setMarketingConsent(v);
    const { error } = await supabase
      .from('users')
      .update({ marketing_consent: v, marketing_consent_at: new Date().toISOString() })
      .eq('id', user.id);
    if (error) setMarketingConsent(!v);
  };

  const hhDayOptions = useMemo(
    () => [
      { label: t('hhNotifSameDay'), value: 0 },
      { label: t('hhNotif1DayBefore'), value: 1 },
      { label: t('hhNotif2DaysBefore'), value: 2 },
      { label: t('hhNotif3DaysBefore'), value: 3 },
      { label: t('hhNotifOff'), value: -1 },
    ],
    [t],
  );

  const hasMortgage = loans.some((l) => l.loanType === 'mortgage');
  const masterOn = notifications.pushNotifications;
  const subRowsDisabled = !masterOn;
  const dimStyle = subRowsDisabled ? { opacity: 0.5 } : undefined;

  const runReschedule = useCallback(async () => {
    const uid = user?.id;
    if (uid) {
      await rescheduleAllLocalNotifications({
        allowPermissionPrompt: true,
        userId: uid,
        subscriptions,
        loans,
        currencyLabel: currencySymbol,
      });
    } else {
      await rescheduleAllLocalNotificationsIfPushEnabled({ allowPermissionPrompt: true });
    }
  }, [user?.id, subscriptions, loans, currencySymbol]);

  const saveHousehold = useCallback(
    async (
      next: Partial<UserNotificationProfile> & {
        recurring_expense_notifications_enabled?: boolean;
      },
    ) => {
      if (!user?.id) return;
      setHhSaving(true);
      try {
        const payload = {
          id: user.id,
          user_id: user.id,
          recurring_expense_notifications_enabled:
            next.recurring_expense_notifications_enabled ?? hhEnabled,
          notification_days_before: next.notification_days_before ?? hhDaysBefore,
          notification_time: next.notification_time ?? hhTimeStr,
          updated_at: new Date().toISOString(),
        };
        const { error } = await supabase.from('user_profiles').upsert(payload, {
          onConflict: 'user_id',
        });
        if (error) {
          Alert.alert(t('error'), error.message);
          return;
        }
        if (next.recurring_expense_notifications_enabled !== undefined) {
          setHhEnabled(next.recurring_expense_notifications_enabled);
        }
        if (next.notification_days_before !== undefined) {
          setHhDaysBefore(next.notification_days_before);
        }
        if (next.notification_time !== undefined) {
          setHhTimeStr(next.notification_time);
        }

        const en = next.recurring_expense_notifications_enabled ?? hhEnabled;
        const db = next.notification_days_before ?? hhDaysBefore;
        const tm = next.notification_time ?? hhTimeStr;
        await saveNotifPaymentsPrefs(householdToNotifPrefs(en, db, tm));
        await runReschedule();
      } finally {
        setHhSaving(false);
      }
    },
    [user?.id, hhEnabled, hhDaysBefore, hhTimeStr, t, runReschedule],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, s, tipPrefs, m, ba, bw, split, pushFailed] = await Promise.all([
        loadNotifPaymentsPrefs(user?.id ?? null),
        loadNotifSubscriptionsPrefs(),
        loadNotifTipPrefs(),
        loadNotifMortgagePrefs(),
        loadNotifBudgetAlertsPrefs(),
        loadNotifBudgetWeeklyPrefs(),
        user?.id ? fetchNotifySplitExpenses(user.id) : Promise.resolve(true),
        getPushTokenSetupFailed(),
      ]);
      setPayments(p);
      setSubsPref(s);
      setTip(tipPrefs);
      setMortgage(m);
      setBudgetAlerts(ba);
      setBudgetWeekly(bw);
      setSplitExpensesNotif(split);
      setPushSetupFailed(pushFailed);

      if (user?.id) {
        const hp = await fetchOrCreateUserNotificationProfile(user.id);
        setHhEnabled(hp.recurring_expense_notifications_enabled);
        setHhDaysBefore(hp.notification_days_before);
        setHhTimeStr(hp.notification_time);
        setHhLoaded(true);
      } else {
        setHhLoaded(false);
      }
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const onMasterChange = async (value: boolean) => {
    setNotificationSetting('pushNotifications', value);
    if (value) {
      const { status: existing } = await Notifications.getPermissionsAsync();
      if (existing !== 'granted') {
        await Notifications.requestPermissionsAsync();
      }
      if (user?.id) {
        await registerExpoPushTokenForUser(user.id);
        setPushSetupFailed(await getPushTokenSetupFailed());
      }
    }
    await runReschedule();
  };

  const cardStyle = [
    styles.card,
    {
      backgroundColor: colors.card,
      borderColor: isDark ? '#334155' : '#E5E7EB',
    },
  ];

  const PillRow = ({
    value,
    onChange,
    disabled,
  }: {
    value: DaysBefore;
    onChange: (d: DaysBefore) => void;
    disabled: boolean;
  }) => (
    <View style={styles.pillRow}>
      {dayPills.map((pill) => {
        const selected = value === pill.value;
        return (
          <TouchableOpacity
            key={pill.value}
            disabled={disabled}
            onPress={() => onChange(pill.value)}
            style={[
              styles.pill,
              {
                borderColor: selected ? colors.primary : isDark ? '#475569' : '#E5E7EB',
                backgroundColor: selected ? (isDark ? '#312E81' : '#EEF2FF') : 'transparent',
                opacity: disabled ? 0.45 : 1,
              },
            ]}
          >
            <Text style={[styles.pillText, { color: colors.text }]}>{pill.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  /** Jedno „kdy a v kolik“ pro všechny připomínky plateb (domácnost, předplatné, splátky). */
  const setReminderTiming = async (partial: { daysBefore?: DaysBefore; time?: string }) => {
    if (!payments || !subsPref || !mortgage) return;
    const db = partial.daysBefore ?? payments.daysBefore;
    const tm = partial.time ?? payments.time;
    const p = { ...payments, daysBefore: db, time: tm };
    const sp = { ...subsPref, daysBefore: db, time: tm };
    const mp = { ...mortgage, daysBefore: db, time: tm };
    setPayments(p);
    setSubsPref(sp);
    setMortgage(mp);
    await saveNotifSubscriptionsPrefs(sp);
    await saveNotifMortgagePrefs(mp);
    if (user?.id) {
      await saveHousehold({ notification_days_before: db, notification_time: tm });
    } else {
      await saveNotifPaymentsPrefs(p);
      await runReschedule();
    }
  };

  const SwitchRow = ({
    title,
    sub,
    value,
    disabled,
    onChange,
    onSubPress,
  }: {
    title: string;
    sub?: string;
    value: boolean;
    disabled?: boolean;
    onChange: (v: boolean) => void;
    onSubPress?: () => void;
  }) => (
    <View style={[styles.row, { paddingVertical: 10 }]}>
      <View style={styles.textBlock}>
        <Text style={[styles.title, { color: colors.text, marginBottom: sub ? 2 : 0 }]}>{title}</Text>
        {sub ? (
          onSubPress ? (
            <TouchableOpacity onPress={onSubPress} hitSlop={6}>
              <Text style={[styles.sub, { color: colors.primary, fontWeight: '600' }]}>{sub} · změnit</Text>
            </TouchableOpacity>
          ) : (
            <Text style={[styles.sub, { color: colors.textSecondary }]}>{sub}</Text>
          )
        ) : null}
      </View>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={(v) => void onChange(v)}
        trackColor={{ false: '#E5E7EB', true: '#10B981' }}
        thumbColor={value ? 'white' : '#9CA3AF'}
      />
    </View>
  );

  if (
    loading ||
    !payments ||
    !subsPref ||
    !tip ||
    !mortgage ||
    !budgetAlerts ||
    !budgetWeekly ||
    splitExpensesNotif === null
  ) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title={t('notificationsSettings.title')} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader
        title={t('notificationsSettings.title')}
        subtitle={t('notificationsSettings.subtitle')}
        variant="gradient"
      />

      <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.scrollContent}>
        {!user?.id ? (
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            {t('notificationsSettings.signInHint')}
          </Text>
        ) : null}

        <View style={cardStyle}>
          <View style={styles.row}>
            <View style={[styles.iconWrap, { backgroundColor: colors.muted }]}>
              <Bell color={colors.primary} size={22} />
            </View>
            <View style={styles.textBlock}>
              <Text style={[styles.title, { color: colors.text }]}>{t('notificationsSettings.pushTitle')}</Text>
              <Text style={[styles.sub, { color: colors.textSecondary }]}>
                {t('notificationsSettings.pushSubtitle')}
              </Text>
            </View>
            <Switch
              value={masterOn}
              onValueChange={(v) => void onMasterChange(v)}
              trackColor={{ false: '#9CA3AF', true: '#86EFAC' }}
              thumbColor={Platform.OS === 'android' ? (masterOn ? '#fff' : '#f4f3f4') : undefined}
            />
          </View>
          {pushSetupFailed ? (
            <Text style={[styles.pushWarning, { color: colors.error }]}>
              {t('notificationsSettings.pushSetupFailed')}
            </Text>
          ) : null}
        </View>

        {/* Připomínky plateb — jedno nastavení „kdy“ pro všechny platby */}
        <View style={[...cardStyle, dimStyle]}>
          <Text style={[styles.sectionHeading, { color: colors.text }]}>Připomínky plateb</Text>
          <Text style={[styles.sub, { color: colors.textSecondary, marginBottom: 6 }]}>
            Upozorníme tě, než má odejít platba.
          </Text>
          {hhLoaded ? (
            <SwitchRow
              title="Pravidelné platby a domácnost"
              value={hhEnabled && payments.enabled}
              disabled={subRowsDisabled || hhSaving}
              onChange={async (v) => {
                setPayments({ ...payments, enabled: v });
                await saveHousehold({ recurring_expense_notifications_enabled: v });
              }}
            />
          ) : null}
          <SwitchRow
            title="Předplatné"
            value={subsPref.enabled}
            disabled={subRowsDisabled}
            onChange={async (v) => {
              const next = { ...subsPref, enabled: v };
              setSubsPref(next);
              await saveNotifSubscriptionsPrefs(next);
              await runReschedule();
            }}
          />
          {hasMortgage || loans.length > 0 ? (
            <SwitchRow
              title="Splátky úvěrů a hypotéky"
              value={mortgage.enabled}
              disabled={subRowsDisabled}
              onChange={async (v) => {
                const next = { ...mortgage, enabled: v };
                setMortgage(next);
                await saveNotifMortgagePrefs(next);
                await runReschedule();
              }}
            />
          ) : null}
          {masterOn && (subsPref.enabled || mortgage.enabled || (hhEnabled && payments.enabled)) ? (
            <View style={[styles.subSettings, { borderTopColor: colors.border }]}>
              <Text style={[styles.subLabel, { color: colors.textSecondary }]}>Kdy připomenout</Text>
              <PillRow
                value={payments.daysBefore}
                disabled={false}
                onChange={(d) => void setReminderTiming({ daysBefore: d })}
              />
              <View style={[styles.row, { marginTop: 12 }]}>
                <Text style={[styles.subLabel, { color: colors.textSecondary, marginBottom: 0, flex: 1 }]}>V kolik</Text>
                <TouchableOpacity
                  style={[styles.timeBtn, { borderColor: isDark ? '#475569' : '#E5E7EB' }]}
                  onPress={() => setShowPayTime((x) => !x)}
                >
                  <Text style={[styles.timeBtnText, { color: colors.text }]}>{payments.time}</Text>
                </TouchableOpacity>
              </View>
              {showPayTime && (
                <DateTimePicker
                  value={parseTimeToDate(payments.time)}
                  mode="time"
                  is24Hour
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(_, date) => {
                    if (Platform.OS !== 'ios') setShowPayTime(false);
                    if (date) void setReminderTiming({ time: formatTimeFromDate(date) });
                  }}
                />
              )}
            </View>
          ) : null}
        </View>

        {/* Rozpočty */}
        <View style={[...cardStyle, dimStyle]}>
          <Text style={[styles.sectionHeading, { color: colors.text }]}>Rozpočty</Text>
          <SwitchRow
            title="Blížíš se k limitu"
            sub="Při 80 % a 100 % rozpočtu"
            value={budgetAlerts.enabled}
            disabled={subRowsDisabled}
            onChange={async (v) => {
              const next = { ...budgetAlerts, enabled: v };
              setBudgetAlerts(next);
              await saveNotifBudgetAlertsPrefs(next);
              await runReschedule();
            }}
          />
          <SwitchRow
            title="Týdenní souhrn"
            sub="Každý pátek v 18:00"
            value={budgetWeekly.enabled}
            disabled={subRowsDisabled}
            onChange={async (v) => {
              const next = { ...budgetWeekly, enabled: v };
              setBudgetWeekly(next);
              await saveNotifBudgetWeeklyPrefs(next);
              await runReschedule();
            }}
          />
        </View>

        {/* Ostatní */}
        <View style={[...cardStyle, dimStyle]}>
          <Text style={[styles.sectionHeading, { color: colors.text }]}>Ostatní</Text>
          <SwitchRow
            title="Denní tip"
            sub={tip.enabled ? `Každý den v ${tip.time}` : 'Krátký finanční tip'}
            value={tip.enabled}
            disabled={subRowsDisabled}
            onSubPress={tip.enabled && masterOn ? () => setShowTipTime((x) => !x) : undefined}
            onChange={async (v) => {
              const next = { ...tip, enabled: v };
              setTip(next);
              await saveNotifTipPrefs(next);
              await runReschedule();
            }}
          />
          {showTipTime && tip.enabled ? (
            <DateTimePicker
              value={parseTimeToDate(tip.time)}
              mode="time"
              is24Hour
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(_, date) => {
                if (Platform.OS !== 'ios') setShowTipTime(false);
                if (date) {
                  const next = { ...tip, time: formatTimeFromDate(date) };
                  setTip(next);
                  void saveNotifTipPrefs(next).then(() => runReschedule());
                }
              }}
            />
          ) : null}
          <SwitchRow
            title="Nové výdaje v Rozděl útratu"
            sub="Když někdo přidá výdaj do skupiny"
            value={splitExpensesNotif}
            disabled={!user?.id || splitSaving}
            onChange={async (v) => {
              if (!user?.id) return;
              const prev = splitExpensesNotif;
              setSplitExpensesNotif(v);
              setSplitSaving(true);
              const { error } = await updateNotifySplitExpenses(user.id, v);
              setSplitSaving(false);
              if (error) {
                setSplitExpensesNotif(prev);
                Alert.alert(t('error'), error.message);
              }
            }}
          />
        </View>

        {/* E-maily s novinkami (GDPR souhlas, kdykoli odvolatelný) */}
        {user?.id && marketingConsent !== null ? (
          <View style={cardStyle}>
            <Text style={[styles.sectionHeading, { color: colors.text }]}>E-maily</Text>
            <View style={styles.row}>
              <View style={styles.textBlock}>
                <Text style={[styles.title, { color: colors.text }]}>Tipy, novinky a nabídky</Text>
                <Text style={[styles.sub, { color: colors.textSecondary }]}>
                  Občas ti pošleme e-mail s novinkami v aplikaci a nabídkami. Důležité e-maily k účtu (např. obnova hesla) chodí vždy.
                </Text>
              </View>
              <Switch
                value={marketingConsent}
                onValueChange={(v) => void toggleMarketing(v)}
                trackColor={{ false: '#9CA3AF', true: '#86EFAC' }}
                thumbColor={Platform.OS === 'android' ? (marketingConsent ? '#fff' : '#f4f3f4') : undefined}
              />
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingBottom: 32 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    paddingTop: 8,
    paddingBottom: 20,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 15,
    color: 'white',
    opacity: 0.92,
  },
  hint: {
    paddingHorizontal: 20,
    marginBottom: 8,
    fontSize: 13,
  },
  pushWarning: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBlock: { flex: 1 },
  title: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
  sub: { fontSize: 13, lineHeight: 18 },
  subSettings: { marginTop: 14, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  subLabel: { fontSize: 12, marginBottom: 8, fontWeight: '500' },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
  },
  pillText: { fontSize: 13, fontWeight: '500' },
  timeBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  timeBtnText: { fontSize: 16, fontWeight: '600' },
  sectionHeading: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  hhOption: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  hhOptionText: { fontSize: 14, fontWeight: '600' },
});
