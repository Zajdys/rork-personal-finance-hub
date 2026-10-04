import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  Platform,
  Pressable,
  Switch,
  Modal,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useRouter } from 'expo-router';
import { StackHeaderBackButton } from '@/components/BackButton';
import { PiggyBank, Timer, Briefcase, ChevronRight, TrendingUp } from 'lucide-react-native';
import * as Notifications from 'expo-notifications';
import { useSettingsStore } from '@/store/settings-store';
import { useLanguageStore } from '@/store/language-store';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/store/auth-store';
import { fetchPrimaryHouseholdId } from '@/lib/household-id';
import {
  fetchSaveDecisions,
  fetchSavedTotalFromDb,
  insertSaveDecision,
  type SaveDecisionRow,
  type SaveDecisionType,
} from '@/lib/save-decisions';
import { notifyHouseholdPartners } from '@/lib/notify-household-partners';
import { parseDecimalInput, parseMoneyInput } from '@/lib/parse-money-input';
import {
  useSavePendingStore,
  SAVE_PENDING_NOTIFICATION_TYPE,
  type SavePendingItem,
} from '@/store/save-pending-store';

const DEFAULT_ANNUAL_RETURN = 7;
const DEFAULT_YEARS = 10;
const DEFAULT_HOURS_PER_MONTH = 160;
const DEFAULT_COOLDOWN_HOURS = 24;
const DEFAULT_DECISION_HOUR = 9;

const INTEREST_PRESETS = [
  { labelKey: 'savePresetSavings' as const, value: 3 },
  { labelKey: 'savePresetEtf' as const, value: 7 },
  { labelKey: 'savePresetSp500' as const, value: 10 },
] as const;

const formatCurrency = (value: number) => value.toLocaleString('cs-CZ');

function hoursToHoursMinutes(hours: number): { h: number; m: number } {
  const totalM = Math.max(0, Math.round(hours * 60));
  const h = Math.floor(totalM / 60);
  const m = totalM % 60;
  return { h, m };
}

type WageMode = 'hourly' | 'monthly';

export default function SaveScreen() {
  const router = useRouter();
  const { getCurrentCurrency } = useSettingsStore();
  const { t } = useLanguageStore();
  const { colors, isDark: isDarkMode } = useTheme();
  const { user } = useAuth();
  const currency = getCurrentCurrency();
  const pendingItems = useSavePendingStore((s) => s.pendingItems);
  const isPendingLoaded = useSavePendingStore((s) => s.isLoaded);
  const loadPendingFromStorage = useSavePendingStore((s) => s.loadFromStorage);
  const addPendingItem = useSavePendingStore((s) => s.addPendingItem);
  const incrementSavedTotal = useSavePendingStore((s) => s.incrementSavedTotal);
  const [title, setTitle] = useState<string>('');
  const [price, setPrice] = useState<string>('');
  const [wageMode, setWageMode] = useState<WageMode>('hourly');
  const [hourlyWage, setHourlyWage] = useState<string>('');
  const [monthlyIncome, setMonthlyIncome] = useState<string>('');
  const [hoursPerMonth, setHoursPerMonth] = useState<string>(DEFAULT_HOURS_PER_MONTH.toString());
  const [annualReturn, setAnnualReturn] = useState<string>(DEFAULT_ANNUAL_RETURN.toString());
  const [years, setYears] = useState<string>(DEFAULT_YEARS.toString());
  const [decisionDate, setDecisionDate] = useState<string>('');
  const [decisionTime, setDecisionTime] = useState<string>('');
  const [nowTick, setNowTick] = useState<number>(Date.now());
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [dbSavedTotal, setDbSavedTotal] = useState(0);
  const [decisions, setDecisions] = useState<SaveDecisionRow[]>([]);
  const [consultPartner, setConsultPartner] = useState(false);
  const [celebrationVisible, setCelebrationVisible] = useState(false);
  const [celebrationAmount, setCelebrationAmount] = useState(0);
  const [savingDecision, setSavingDecision] = useState(false);
  const celebrationScale = useRef(new Animated.Value(0.6)).current;
  const celebrationOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isPendingLoaded) void loadPendingFromStorage();
  }, [isPendingLoaded, loadPendingFromStorage]);

  const refreshDecisionData = useCallback(async () => {
    if (!user?.id) return;
    const hid = householdId ?? (await fetchPrimaryHouseholdId(user.id));
    if (!householdId && hid) setHouseholdId(hid);
    const [total, rows] = await Promise.all([
      fetchSavedTotalFromDb(user.id, hid),
      fetchSaveDecisions(user.id, hid),
    ]);
    setDbSavedTotal(total);
    setDecisions(rows);
  }, [user?.id, householdId]);

  useEffect(() => {
    void refreshDecisionData();
  }, [refreshDecisionData]);

  useEffect(() => {
    if (!user?.id) return;
    void fetchPrimaryHouseholdId(user.id).then(setHouseholdId);
  }, [user?.id]);

  useEffect(() => {
    const interval = setInterval(() => {
      setNowTick(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (decisionDate || decisionTime) return;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(DEFAULT_DECISION_HOUR, 0, 0, 0);
    const dateString = `${String(tomorrow.getDate()).padStart(2, '0')}.${String(tomorrow.getMonth() + 1).padStart(2, '0')}.${tomorrow.getFullYear()}`;
    const timeString = `${String(tomorrow.getHours()).padStart(2, '0')}:${String(tomorrow.getMinutes()).padStart(2, '0')}`;
    setDecisionDate(dateString);
    setDecisionTime(timeString);
  }, [decisionDate, decisionTime]);

  const formatYearsCs = useCallback(
    (n: number): string => {
      if (n == null || n <= 0) return t('saveYearMany', { n });
      if (n === 1) return t('saveYearOne');
      if (n >= 2 && n <= 4) return t('saveYearFew', { n });
      return t('saveYearMany', { n });
    },
    [t],
  );

  const formatWorkHours = useCallback(
    (h: number, m: number) => t('saveWorkHours', { h, m }),
    [t],
  );

  const parsedPrice = useMemo<number>(() => parseMoneyInput(price) ?? 0, [price]);

  const parsedHourlyWage = useMemo<number>(() => {
    if (wageMode === 'hourly') {
      return parseMoneyInput(hourlyWage) ?? 0;
    }
    const parsedMonthly = parseMoneyInput(monthlyIncome);
    const parsedHours = parseDecimalInput(hoursPerMonth, 2);
    if (parsedMonthly == null || parsedHours == null || parsedHours <= 0) {
      return 0;
    }
    return parsedMonthly / parsedHours;
  }, [hourlyWage, wageMode, monthlyIncome, hoursPerMonth]);

  const parsedAnnualReturn = useMemo<number>(() => parseDecimalInput(annualReturn, 4) ?? 0, [annualReturn]);

  const parsedYears = useMemo<number>(() => parseDecimalInput(years, 2) ?? 0, [years]);

  const hoursNeeded = useMemo<number>(() => {
    if (parsedPrice <= 0 || parsedHourlyWage <= 0) return 0;
    return parsedPrice / parsedHourlyWage;
  }, [parsedPrice, parsedHourlyWage]);

  const timeParts = useMemo(() => hoursToHoursMinutes(hoursNeeded), [hoursNeeded]);

  const futureValue = useMemo<number>(() => {
    if (parsedPrice <= 0 || parsedAnnualReturn <= 0 || parsedYears <= 0) return 0;
    return parsedPrice * Math.pow(1 + parsedAnnualReturn / 100, parsedYears);
  }, [parsedPrice, parsedAnnualReturn, parsedYears]);

  const presetLabelForReturn = useMemo(() => {
    const match = INTEREST_PRESETS.find((p) => Math.abs(p.value - parsedAnnualReturn) < 0.001);
    return match ? t(match.labelKey) : `${parsedAnnualReturn} % p.a.`;
  }, [parsedAnnualReturn, t]);

  const showResults = useMemo(
    () => Boolean(title.trim() && parsedPrice > 0 && parsedHourlyWage > 0),
    [title, parsedPrice, parsedHourlyWage],
  );

  const showCelebration = useCallback(
    (amount: number) => {
      setCelebrationAmount(amount);
      setCelebrationVisible(true);
      celebrationScale.setValue(0.6);
      celebrationOpacity.setValue(0);
      Animated.parallel([
        Animated.spring(celebrationScale, { toValue: 1, friction: 5, useNativeDriver: true }),
        Animated.timing(celebrationOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
    },
    [celebrationOpacity, celebrationScale],
  );

  const hideCelebration = useCallback(() => {
    Animated.timing(celebrationOpacity, { toValue: 0, duration: 160, useNativeDriver: true }).start(() => {
      setCelebrationVisible(false);
    });
  }, [celebrationOpacity]);

  const maybeNotifyPartners = useCallback(async () => {
    if (!consultPartner || !householdId || !user?.id || !title.trim()) return;
    await notifyHouseholdPartners({
      householdId,
      senderUserId: user.id,
      senderDisplayName: user.name || user.email || 'Uživatel',
      itemName: title.trim(),
      price: parsedPrice,
      currencySymbol: currency.symbol,
    });
  }, [consultPartner, householdId, user, title, parsedPrice, currency.symbol]);

  const recordDecision = useCallback(
    async (decision: SaveDecisionType): Promise<boolean> => {
      if (!user?.id) {
        Alert.alert(t('error'), t('privacyNotSignedIn'));
        return false;
      }
      if (!title.trim() || parsedPrice <= 0 || parsedHourlyWage <= 0) {
        Alert.alert(t('error'), t('saveFillRequired'));
        return false;
      }
      setSavingDecision(true);
      try {
        const hid = householdId ?? (await fetchPrimaryHouseholdId(user.id));
        const { error } = await insertSaveDecision({
          userId: user.id,
          householdId: hid,
          itemName: title.trim(),
          price: parsedPrice,
          decision,
          hourlyWage: parsedHourlyWage,
          hoursOfWork: hoursNeeded,
          futureValue: futureValue > 0 ? futureValue : undefined,
        });
        if (error) {
          Alert.alert(t('error'), error.message ?? t('saveDecisionFailed'));
          return false;
        }
        await maybeNotifyPartners();
        await refreshDecisionData();
        incrementSavedTotal(decision === 'saved' ? parsedPrice : 0);
        return true;
      } finally {
        setSavingDecision(false);
      }
    },
    [
      user,
      title,
      parsedPrice,
      parsedHourlyWage,
      householdId,
      hoursNeeded,
      futureValue,
      maybeNotifyPartners,
      refreshDecisionData,
      incrementSavedTotal,
      t,
    ],
  );

  const parseDecisionDateTime = useCallback((): Date | null => {
    if (!decisionDate || !decisionTime) return null;
    const dateParts = decisionDate.split('.');
    const timePartsLocal = decisionTime.split(':');
    if (dateParts.length !== 3 || timePartsLocal.length < 2) return null;
    const day = parseInt(dateParts[0] ?? '', 10);
    const month = parseInt(dateParts[1] ?? '', 10);
    const year = parseInt(dateParts[2] ?? '', 10);
    const hours = parseInt(timePartsLocal[0] ?? '', 10);
    const minutes = parseInt(timePartsLocal[1] ?? '', 10);
    if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    if (day <= 0 || month <= 0 || month > 12 || year < 2024) return null;
    const date = new Date(year, month - 1, day, hours, minutes, 0, 0);
    if (Number.isNaN(date.getTime())) return null;
    return date;
  }, [decisionDate, decisionTime]);

  const scheduleReminder = useCallback(async (item: SavePendingItem) => {
    try {
      if (Platform.OS === 'web') {
        console.log('Notifications are not supported on web');
        return;
      }
      const permission = await Notifications.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert(t('saveNotifTitle'), t('saveNotifPermission'));
        return;
      }
      const triggerDate = new Date(item.remindAt);
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: t('screenThinkItOver'),
          body: t('saveNotifBody', { title: item.title }),
          sound: true,
          data: {
            type: SAVE_PENDING_NOTIFICATION_TYPE,
            pendingItemId: item.id,
          },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: triggerDate,
        },
      });
      useSavePendingStore.getState().updatePendingItemNotificationId(item.id, notificationId);
    } catch (error) {
      console.error('Failed to schedule notification', error);
    }
  }, [t]);

  const handleAddCooldown = useCallback(() => {
    if (!title.trim() || parsedPrice <= 0 || parsedHourlyWage <= 0) {
      Alert.alert(t('error'), t('saveFillRequired'));
      return false;
    }
    const decisionDateTime = parseDecisionDateTime();
    if (!decisionDateTime) {
      Alert.alert(t('error'), t('saveInvalidDateTime'));
      return false;
    }
    if (decisionDateTime.getTime() <= Date.now()) {
      Alert.alert(t('error'), t('saveFutureRequired'));
      return false;
    }
    const item: SavePendingItem = {
      id: `${Date.now()}`,
      title: title.trim(),
      price: parsedPrice,
      hoursNeeded,
      futureValue,
      createdAt: Date.now(),
      remindAt: decisionDateTime.getTime(),
    };
    addPendingItem(item);
    scheduleReminder(item);
    return true;
  }, [title, parsedPrice, parsedHourlyWage, parseDecisionDateTime, hoursNeeded, futureValue, scheduleReminder, addPendingItem, t]);

  const handleNotBuy = useCallback(async () => {
    const ok = await recordDecision('saved');
    if (!ok) return;
    showCelebration(parsedPrice);
    setTitle('');
    setPrice('');
  }, [recordDecision, showCelebration, parsedPrice]);

  const handleBuy = useCallback(async () => {
    const ok = await recordDecision('bought');
    if (!ok) return;
    Alert.alert(t('saveRecorded'));
    setTitle('');
    setPrice('');
  }, [recordDecision, t]);

  const handleThink = useCallback(async () => {
    const ok = await recordDecision('unsure');
    if (!ok) return;
    const added = handleAddCooldown();
    if (added) {
      setTitle('');
      setPrice('');
    }
  }, [recordDecision, handleAddCooldown]);

  const heroGradient = useMemo(
    () => [colors.success, colors.primary] as [string, string],
    [colors.success, colors.primary],
  );

  const shadowSoft = isDarkMode ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.08)';

  return (
    <>
    <Stack.Screen
      options={{
        title: t('piggyBankFeature'),
        headerShown: true,
        headerStyle: { backgroundColor: colors.gradientStart },
        headerTintColor: 'white',
        headerTitleStyle: { fontWeight: 'bold' },
        headerLeft: ({ tintColor }) => (
          <StackHeaderBackButton tintColor={tintColor ?? 'white'} />
        ),
      }}
    />
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      testID="save-scroll"
    >
      {/* HERO */}
      <LinearGradient
        colors={heroGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.heroCard,
          {
            shadowColor: shadowSoft,
          },
        ]}
      >
        <Text style={styles.heroTitle}>{t('piggyBankFeature')}</Text>
        <Text style={styles.heroSubtitle}>{t('saveHeroSubtitle')}</Text>
        <View style={styles.heroSavedRow}>
          <PiggyBank color="rgba(255,255,255,0.95)" size={20} />
          <View style={styles.heroSavedTextCol}>
            <Text style={styles.heroSavedLabel}>{t('saveTotalSaved')}</Text>
            <Text style={styles.heroSavedAmount}>
              {formatCurrency(dbSavedTotal)} {currency.symbol}
            </Text>
          </View>
        </View>
      </LinearGradient>

      {/* Co chceš koupit + živé výsledky */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            shadowColor: shadowSoft,
          },
        ]}
      >
        <Text style={[styles.cardTitle, { color: colors.text }]}>{t('saveWhatToBuy')}</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder={t('saveTitlePlaceholder')}
          placeholderTextColor={colors.textSecondary}
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
          testID="save-title"
        />
        <TextInput
          value={price}
          onChangeText={setPrice}
          placeholder={t('savePricePlaceholder', { symbol: currency.symbol })}
          placeholderTextColor={colors.textSecondary}
          keyboardType="decimal-pad"
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
          testID="save-price"
        />

        <View style={[styles.liveBlock, { backgroundColor: colors.muted }]}>
          {hoursNeeded > 0 ? (
            <Text style={[styles.liveLine, { color: colors.text }]}>
              {t('saveWorkCost', {
                hours: formatWorkHours(timeParts.h, timeParts.m),
              })}
              <Text style={[styles.liveHint, { color: colors.textSecondary }]}>
                {' '}
                {t('saveWorkCostHint', { hours: hoursNeeded.toFixed(1) })}
              </Text>
            </Text>
          ) : (
            <Text style={[styles.livePlaceholder, { color: colors.textSecondary }]}>
              {t('saveWorkPlaceholder')}
            </Text>
          )}
          {futureValue > 0 && parsedYears > 0 ? (
            <Text style={[styles.liveLine, styles.liveLineSecond, { color: colors.text }]}>
              {t('saveFutureValue', {
                years: formatYearsCs(parsedYears),
                amount: formatCurrency(Math.round(futureValue)),
                symbol: currency.symbol,
                rate: presetLabelForReturn,
              })}
            </Text>
          ) : parsedPrice > 0 ? (
            <Text style={[styles.livePlaceholder, styles.liveLineSecond, { color: colors.textSecondary }]}>
              {t('saveFutureHint')}
            </Text>
          ) : null}
        </View>

        {/* Mzda — kompaktně */}
        <Text style={[styles.compactSectionLabel, { color: colors.textSecondary }]}>{t('saveWage')}</Text>
        <View style={[styles.segmented, { backgroundColor: colors.muted }]}>
          {(
            [
              { id: 'hourly' as const, label: t('saveHourly') },
              { id: 'monthly' as const, label: t('saveMonthly') },
            ] as const
          ).map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.segment,
                wageMode === item.id && { backgroundColor: colors.primary },
              ]}
              onPress={() => setWageMode(item.id)}
              testID={`save-wage-${item.id}`}
            >
              <Text
                style={[
                  styles.segmentText,
                  { color: colors.textSecondary },
                  wageMode === item.id && { color: colors.onPrimary, fontWeight: '700' },
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {wageMode === 'hourly' ? (
          <TextInput
            value={hourlyWage}
            onChangeText={setHourlyWage}
            placeholder={t('saveHourlyWagePlaceholder', { symbol: currency.symbol })}
            placeholderTextColor={colors.textSecondary}
            keyboardType="decimal-pad"
            style={[styles.inputCompact, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
            testID="save-hourly"
          />
        ) : (
          <View style={styles.row}>
            <TextInput
              value={monthlyIncome}
              onChangeText={setMonthlyIncome}
              placeholder={t('saveMonthlyIncomePlaceholder', { symbol: currency.symbol })}
              placeholderTextColor={colors.textSecondary}
              keyboardType="decimal-pad"
              style={[styles.inputCompact, styles.rowInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
              testID="save-monthly"
            />
            <TextInput
              value={hoursPerMonth}
              onChangeText={setHoursPerMonth}
              placeholder={t('saveHoursPerMonth')}
              placeholderTextColor={colors.textSecondary}
              keyboardType="decimal-pad"
              style={[styles.inputCompact, styles.rowInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
              testID="save-hours-per-month"
            />
          </View>
        )}

        {/* Budoucí hodnota */}
        <Text style={[styles.cardTitleSpaced, { color: colors.text }]}>{t('saveFutureValueTitle')}</Text>
        <View style={styles.presetRow}>
          {INTEREST_PRESETS.map((p) => {
            const active = Math.abs(parsedAnnualReturn - p.value) < 0.001;
            return (
              <TouchableOpacity
                key={p.labelKey}
                style={[
                  styles.presetChip,
                  {
                    borderColor: active ? colors.primary : colors.border,
                    backgroundColor: active ? colors.primary + '22' : colors.surface,
                  },
                ]}
                onPress={() => setAnnualReturn(String(p.value))}
              >
                <Text style={[styles.presetChipText, { color: active ? colors.primary : colors.text }]}>{t(p.labelKey)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={styles.row}>
          <TextInput
            value={annualReturn}
            onChangeText={setAnnualReturn}
            placeholder="% p.a."
            placeholderTextColor={colors.textSecondary}
            keyboardType="decimal-pad"
            style={[styles.inputCompact, styles.rowInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
            testID="save-annual-return"
          />
          <TextInput
            value={years}
            onChangeText={setYears}
            placeholder={t('saveYearsPlaceholder')}
            placeholderTextColor={colors.textSecondary}
            keyboardType="decimal-pad"
            style={[styles.inputCompact, styles.rowInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
            testID="save-years"
          />
        </View>
        <View style={[styles.futureResult, { backgroundColor: colors.muted }]}>
          <Briefcase size={18} color={colors.primary} style={{ marginRight: 8 }} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.futureResultLabel, { color: colors.textSecondary }]}>{t('saveCompoundInterest')}</Text>
            {futureValue > 0 && parsedYears > 0 ? (
              <Text style={[styles.futureResultValue, { color: colors.text }]}>
                {formatCurrency(Math.round(futureValue))} {currency.symbol}
              </Text>
            ) : (
              <Text style={[styles.futureResultDash, { color: colors.textSecondary }]}>—</Text>
            )}
          </View>
        </View>
      </View>

      {showResults ? (
        <View
          style={[
            styles.card,
            styles.resultCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.primary + '55',
              shadowColor: shadowSoft,
            },
          ]}
        >
          <Text style={[styles.resultTitle, { color: colors.text }]}>{t('saveWorthItTitle')}</Text>

          <View style={[styles.resultMetric, { backgroundColor: colors.muted }]}>
            <Text style={[styles.resultMetricText, { color: colors.text }]}>
              {t('saveResultWork', { hours: formatWorkHours(timeParts.h, timeParts.m) })}
            </Text>
          </View>

          {futureValue > 0 && parsedYears > 0 ? (
            <View style={[styles.resultMetric, { backgroundColor: colors.muted }]}>
              <TrendingUp size={18} color={colors.primary} style={{ marginRight: 8 }} />
              <Text style={[styles.resultMetricText, { color: colors.text, flex: 1 }]}>
                {t('saveResultInvest', {
                  amount: formatCurrency(Math.round(futureValue)),
                  symbol: currency.symbol,
                  years: formatYearsCs(parsedYears),
                })}
              </Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.decisionBtn, styles.decisionBtnSaved, { opacity: savingDecision ? 0.7 : 1 }]}
            onPress={() => void handleNotBuy()}
            disabled={savingDecision}
            activeOpacity={0.88}
          >
            <Text style={styles.decisionBtnText}>{t('saveBtnNotBuy')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.decisionBtn, styles.decisionBtnBought, { opacity: savingDecision ? 0.7 : 1 }]}
            onPress={() => void handleBuy()}
            disabled={savingDecision}
            activeOpacity={0.88}
          >
            <Text style={styles.decisionBtnText}>{t('saveBtnBuy')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.decisionBtn, { backgroundColor: colors.primary, opacity: savingDecision ? 0.7 : 1 }]}
            onPress={() => void handleThink()}
            disabled={savingDecision}
            activeOpacity={0.88}
          >
            <Text style={[styles.decisionBtnText, { color: colors.onPrimary }]}>{t('saveBtnThink')}</Text>
          </TouchableOpacity>

          {householdId ? (
            <View style={[styles.partnerRow, { borderTopColor: colors.border }]}>
              <Text style={[styles.partnerLabel, { color: colors.text }]}>{t('saveConsultPartner')}</Text>
              <Switch
                value={consultPartner}
                onValueChange={setConsultPartner}
                trackColor={{ false: colors.muted, true: colors.primary }}
                thumbColor={Platform.OS === 'android' ? (consultPartner ? colors.onPrimary : colors.card) : undefined}
              />
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Rozmyslet */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            shadowColor: shadowSoft,
          },
        ]}
      >
        <View style={styles.rowIconTitle}>
          <Timer size={20} color={colors.primary} />
          <Text style={[styles.cardTitle, { color: colors.text, marginBottom: 0 }]}>{t('saveRemindDecision')}</Text>
        </View>
        <Text style={[styles.helper, { color: colors.textSecondary }]}>
          {t('saveRemindHint')}
        </Text>
        <View style={styles.row}>
          <TextInput
            value={decisionDate}
            onChangeText={setDecisionDate}
            placeholder="DD.MM.RRRR"
            placeholderTextColor={colors.textSecondary}
            keyboardType="numbers-and-punctuation"
            style={[styles.input, styles.rowInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
            testID="save-decision-date"
          />
          <TextInput
            value={decisionTime}
            onChangeText={setDecisionTime}
            placeholder="HH:MM"
            placeholderTextColor={colors.textSecondary}
            keyboardType="numbers-and-punctuation"
            style={[styles.input, styles.rowInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
            testID="save-decision-time"
          />
        </View>
        <View style={styles.quickRow}>
          <TouchableOpacity
            style={[styles.quickChip, { borderColor: colors.border, backgroundColor: colors.surface }]}
            onPress={() => {
              const tomorrow = new Date();
              tomorrow.setDate(tomorrow.getDate() + 1);
              tomorrow.setHours(DEFAULT_DECISION_HOUR, 0, 0, 0);
              const dateString = `${String(tomorrow.getDate()).padStart(2, '0')}.${String(tomorrow.getMonth() + 1).padStart(2, '0')}.${tomorrow.getFullYear()}`;
              setDecisionDate(dateString);
              setDecisionTime('09:00');
            }}
            testID="save-quick-tomorrow"
          >
            <Text style={[styles.quickChipText, { color: colors.primary }]}>{t('saveTomorrow9')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.quickChip, { borderColor: colors.border, backgroundColor: colors.surface }]}
            onPress={() => {
              const later = new Date();
              later.setHours(later.getHours() + DEFAULT_COOLDOWN_HOURS);
              const dateString = `${String(later.getDate()).padStart(2, '0')}.${String(later.getMonth() + 1).padStart(2, '0')}.${later.getFullYear()}`;
              const timeString = `${String(later.getHours()).padStart(2, '0')}:${String(later.getMinutes()).padStart(2, '0')}`;
              setDecisionDate(dateString);
              setDecisionTime(timeString);
            }}
            testID="save-quick-24h"
          >
            <Text style={[styles.quickChipText, { color: colors.primary }]}>{t('saveIn24h')}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.ctaButton, { backgroundColor: colors.primary }]}
          onPress={() => void handleThink()}
          activeOpacity={0.88}
          testID="save-add-cooldown"
        >
          <Text style={[styles.ctaButtonText, { color: colors.onPrimary }]}>{t('screenThinkItOver')}</Text>
        </TouchableOpacity>

        {pendingItems.length > 0 && (
          <View style={[styles.pendingSection, { borderTopColor: colors.border }]}>
            <Text style={[styles.listHeading, { color: colors.text }]}>{t('saveSavedByDecision')}</Text>
            {pendingItems.map((item) => {
              const remainingMs = item.remindAt - nowTick;
              const clampedMs = Math.max(0, remainingMs);
              const remainingHours = Math.floor(clampedMs / 3600000);
              const remainingMinutes = Math.floor((clampedMs % 3600000) / 60000);
              const isReady = clampedMs <= 0;
              return (
                <Pressable
                  key={item.id}
                  onPress={() =>
                    router.push({ pathname: '/save-pending-detail', params: { id: item.id } })
                  }
                  style={({ pressed }) => [
                    styles.listRow,
                    { borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.92 : 1 },
                  ]}
                  testID={`save-pending-row-${item.id}`}
                >
                  <View style={styles.listRowTop}>
                    <Text style={[styles.listTitle, { color: colors.text }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <View style={styles.listRowRight}>
                      {isReady ? (
                        <Timer color={colors.success} size={20} />
                      ) : (
                        <Timer color={colors.warning} size={20} />
                      )}
                      <ChevronRight color={colors.textSecondary} size={22} />
                    </View>
                  </View>
                  <Text style={[styles.listMeta, { color: colors.textSecondary }]}>
                    {t('savePendingWorkHours', {
                      price: formatCurrency(item.price),
                      symbol: currency.symbol,
                      hours: item.hoursNeeded.toFixed(1),
                    })}
                  </Text>
                  <Text style={[styles.listCountdown, { color: isReady ? colors.success : colors.warning }]}>
                    {isReady
                      ? t('saveTimeToDecide')
                      : t('saveRemaining', { hours: remainingHours, minutes: remainingMinutes })}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      {decisions.length > 0 ? (
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              shadowColor: shadowSoft,
            },
          ]}
        >
          <Text style={[styles.cardTitle, { color: colors.text }]}>{t('saveMyDecisions')}</Text>
          {decisions.map((row) => {
            const decisionColor =
              row.decision === 'saved'
                ? colors.success
                : row.decision === 'bought'
                  ? colors.error
                  : colors.primary;
            const decisionLabel =
              row.decision === 'saved'
                ? t('saveDecisionSaved')
                : row.decision === 'bought'
                  ? t('saveDecisionBought')
                  : t('saveDecisionUnsure');
            const date = new Date(row.created_at);
            const dateStr = Number.isNaN(date.getTime())
              ? ''
              : date.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' });
            return (
              <View
                key={row.id}
                style={[styles.decisionRow, { borderColor: colors.border, backgroundColor: colors.surface }]}
              >
                <View style={[styles.decisionDot, { backgroundColor: decisionColor }]} />
                <View style={styles.decisionRowBody}>
                  <Text style={[styles.decisionRowTitle, { color: colors.text }]} numberOfLines={1}>
                    {row.item_name}
                  </Text>
                  <Text style={[styles.decisionRowMeta, { color: colors.textSecondary }]}>
                    {formatCurrency(Number(row.price))} {currency.symbol}
                    {dateStr ? ` · ${dateStr}` : ''}
                  </Text>
                </View>
                <Text style={[styles.decisionRowBadge, { color: decisionColor }]}>{decisionLabel}</Text>
              </View>
            );
          })}
        </View>
      ) : null}

      <View style={{ height: 32 }} />
    </ScrollView>

    <Modal visible={celebrationVisible} transparent animationType="none" onRequestClose={hideCelebration}>
      <Pressable style={styles.celebrationOverlay} onPress={hideCelebration}>
        <Animated.View
          style={[
            styles.celebrationCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.success,
              opacity: celebrationOpacity,
              transform: [{ scale: celebrationScale }],
            },
          ]}
        >
          <Text style={styles.celebrationEmoji}>🎉</Text>
          <Text style={[styles.celebrationTitle, { color: colors.text }]}>
            {t('saveGreatDecision', {
              amount: formatCurrency(celebrationAmount),
              symbol: currency.symbol,
            })}
          </Text>
          <TouchableOpacity style={[styles.celebrationBtn, { backgroundColor: colors.success }]} onPress={hideCelebration}>
            <Text style={styles.celebrationBtnText}>{t('saveOk')}</Text>
          </TouchableOpacity>
        </Animated.View>
      </Pressable>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 120,
  },
  heroCard: {
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 6,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.92)',
    marginTop: 8,
    lineHeight: 22,
  },
  heroSavedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 22,
    paddingTop: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.35)',
    gap: 12,
  },
  heroSavedTextCol: { flex: 1 },
  heroSavedLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  heroSavedAmount: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 4,
  },
  card: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 12,
  },
  cardTitleSpaced: {
    fontSize: 17,
    fontWeight: '700',
    marginTop: 22,
    marginBottom: 10,
  },
  rowIconTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  helper: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 14,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    marginTop: 10,
  },
  inputCompact: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    marginTop: 8,
  },
  liveBlock: {
    borderRadius: 12,
    padding: 16,
    marginTop: 18,
    gap: 10,
  },
  liveLine: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '500',
  },
  liveLineSecond: {
    marginTop: 4,
  },
  liveEmphasis: {
    fontWeight: '800',
    fontSize: 17,
  },
  liveHint: {
    fontSize: 13,
    fontWeight: '400',
  },
  livePlaceholder: {
    fontSize: 14,
    lineHeight: 21,
  },
  compactSectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 20,
    marginBottom: 8,
  },
  segmented: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: 10,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
  },
  row: { flexDirection: 'row', gap: 10 },
  rowInput: { flex: 1 },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 6,
  },
  presetChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  presetChipText: {
    fontSize: 13,
    fontWeight: '700',
  },
  futureResult: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
  },
  futureResultLabel: { fontSize: 12, fontWeight: '600' },
  futureResultValue: { fontSize: 20, fontWeight: '800', marginTop: 2 },
  futureResultDash: { fontSize: 18, marginTop: 2 },
  quickRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  quickChip: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 11,
    alignItems: 'center',
  },
  quickChipText: {
    fontSize: 13,
    fontWeight: '700',
  },
  ctaButton: {
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: 'center',
    marginTop: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  ctaButtonText: {
    fontSize: 17,
    fontWeight: '800',
  },
  pendingSection: {
    marginTop: 28,
    paddingTop: 22,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  listHeading: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  listRow: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
  },
  listRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  listTitle: { fontSize: 16, fontWeight: '700', flex: 1 },
  listMeta: { fontSize: 13, marginTop: 6 },
  listCountdown: { fontSize: 13, fontWeight: '700', marginTop: 8 },
  listRowRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  resultCard: {
    borderWidth: 1.5,
  },
  resultTitle: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  resultMetric: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  resultMetricText: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
  },
  decisionBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 10,
  },
  decisionBtnSaved: {
    backgroundColor: '#10B981',
  },
  decisionBtnBought: {
    backgroundColor: '#6B7280',
  },
  decisionBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  partnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  partnerLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  decisionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    marginTop: 10,
    gap: 10,
  },
  decisionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  decisionRowBody: { flex: 1 },
  decisionRowTitle: { fontSize: 15, fontWeight: '700' },
  decisionRowMeta: { fontSize: 12, marginTop: 2 },
  decisionRowBadge: { fontSize: 12, fontWeight: '700' },
  celebrationOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  celebrationCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 20,
    borderWidth: 2,
    padding: 28,
    alignItems: 'center',
  },
  celebrationEmoji: { fontSize: 56, marginBottom: 12 },
  celebrationTitle: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: 20,
  },
  celebrationBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  celebrationBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
});
