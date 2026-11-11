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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useRouter } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { PiggyBank, Timer, Briefcase, ChevronRight } from 'lucide-react-native';
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
import { PremiumGateScreen } from '@/components/PremiumGate';
import { uiLocale } from '@/lib/app-locale';

const DEFAULT_ANNUAL_RETURN = 7;
const DEFAULT_YEARS = 10;
const DEFAULT_HOURS_PER_MONTH = 160;
const DEFAULT_COOLDOWN_HOURS = 24;
const WORKDAY_HOURS = 8;
const COOLDOWN_OPTIONS = [24, 72, 168] as const;
/** Mzda a parametry výpočtu se pamatují, ať se nemusí zadávat u každé věci. */
const CALC_SETTINGS_KEY = 'moneybuddy_save_calc_v1';

const INTEREST_PRESETS = [
  { labelKey: 'savePresetSavings' as const, value: 3 },
  { labelKey: 'savePresetEtf' as const, value: 7 },
  { labelKey: 'savePresetSp500' as const, value: 10 },
] as const;

const formatCurrency = (value: number) => value.toLocaleString(uiLocale());

type WageMode = 'hourly' | 'monthly';

function SaveScreenContent() {
  const router = useRouter();
  const { getCurrentCurrency } = useSettingsStore();
  const { t, tr } = useLanguageStore();
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
  const [wageMode, setWageMode] = useState<WageMode>('monthly');
  const [hourlyWage, setHourlyWage] = useState<string>('');
  const [monthlyIncome, setMonthlyIncome] = useState<string>('');
  const [hoursPerMonth, setHoursPerMonth] = useState<string>(DEFAULT_HOURS_PER_MONTH.toString());
  const [annualReturn, setAnnualReturn] = useState<string>(DEFAULT_ANNUAL_RETURN.toString());
  const [years, setYears] = useState<string>(DEFAULT_YEARS.toString());
  const [cooldownHours, setCooldownHours] = useState<number>(DEFAULT_COOLDOWN_HOURS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
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
  const annualReturnInputRef = useRef<TextInput>(null);
  const yearsInputRef = useRef<TextInput>(null);

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

  // Načtení / uložení nastavení výpočtu (mzda, výnos, roky).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(CALC_SETTINGS_KEY);
        if (cancelled) return;
        if (raw) {
          const v = JSON.parse(raw) as Partial<Record<string, string>>;
          if (v.wageMode === 'hourly' || v.wageMode === 'monthly') setWageMode(v.wageMode);
          if (typeof v.hourlyWage === 'string') setHourlyWage(v.hourlyWage);
          if (typeof v.monthlyIncome === 'string') setMonthlyIncome(v.monthlyIncome);
          if (typeof v.hoursPerMonth === 'string') setHoursPerMonth(v.hoursPerMonth);
          if (typeof v.annualReturn === 'string') setAnnualReturn(v.annualReturn);
          if (typeof v.years === 'string') setYears(v.years);
        } else {
          setSettingsOpen(true);
        }
      } catch {
        // ignore – výchozí hodnoty
      } finally {
        if (!cancelled) setSettingsLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!settingsLoaded) return;
    void AsyncStorage.setItem(
      CALC_SETTINGS_KEY,
      JSON.stringify({ wageMode, hourlyWage, monthlyIncome, hoursPerMonth, annualReturn, years }),
    ).catch(() => {});
  }, [settingsLoaded, wageMode, hourlyWage, monthlyIncome, hoursPerMonth, annualReturn, years]);

  const formatYearsCs = useCallback(
    (n: number): string => {
      if (n == null || n <= 0) return t('saveYearMany', { n });
      if (n === 1) return t('saveYearOne');
      if (n >= 2 && n <= 4) return t('saveYearFew', { n });
      return t('saveYearMany', { n });
    },
    [t],
  );

  /** Jen jednotka (bez čísla): rok / roky / let; desetinná → let. */
  const yearsUnitLabel = useCallback(
    (raw: string): string => {
      const n = parseDecimalInput(raw, 2);
      if (n == null || !Number.isFinite(n) || n < 0) return t('saveYearUnitMany');
      if (!Number.isInteger(n) || n === 0) return t('saveYearUnitMany');
      if (n === 1) return t('saveYearUnitOne');
      if (n >= 2 && n <= 4) return t('saveYearUnitFew');
      return t('saveYearUnitMany');
    },
    [t],
  );



  /** „1 den a 2 hodiny“ – dny počítané jako 8hodinové pracovní dny. */
  const formatWorkTime = useCallback(
    (hours: number): string => {
      const totalMin = Math.max(0, Math.round(hours * 60));
      if (totalMin < 60) return tr(`${totalMin} min`, `${totalMin} min`);
      const days = Math.floor(totalMin / (WORKDAY_HOURS * 60));
      const restMin = totalMin - days * WORKDAY_HOURS * 60;
      const h = Math.floor(restMin / 60);
      const m = restMin % 60;
      const csPl = (n: number, one: string, few: string, many: string) =>
        n === 1 ? one : n >= 2 && n <= 4 ? few : many;
      const parts: string[] = [];
      if (days > 0) parts.push(tr(`${days} ${csPl(days, 'den', 'dny', 'dní')}`, `${days} ${days === 1 ? 'day' : 'days'}`));
      if (h > 0) parts.push(tr(`${h} ${csPl(h, 'hodina', 'hodiny', 'hodin')}`, `${h} ${h === 1 ? 'hour' : 'hours'}`));
      if (days === 0 && m > 0) parts.push(tr(`${m} min`, `${m} min`));
      if (parts.length === 0) return tr('0 min', '0 min');
      const last = parts.pop()!;
      return parts.length ? `${parts.join(', ')} ${tr('a', 'and')} ${last}` : last;
    },
    [tr],
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

  const wageReady = parsedHourlyWage > 0;

  /** Podíl na měsíčním příjmu (jen když známe měsíční příjem). */
  const incomeSharePct = useMemo<number | null>(() => {
    if (parsedPrice <= 0) return null;
    const hours = parseDecimalInput(hoursPerMonth, 2) ?? DEFAULT_HOURS_PER_MONTH;
    const monthly = wageMode === 'monthly' ? parseMoneyInput(monthlyIncome) ?? 0 : parsedHourlyWage * hours;
    if (monthly <= 0) return null;
    return (parsedPrice / monthly) * 100;
  }, [parsedPrice, wageMode, monthlyIncome, hoursPerMonth, parsedHourlyWage]);

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
        if (parsedHourlyWage <= 0) setSettingsOpen(true);
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
    const remindAt = Date.now() + cooldownHours * 3600 * 1000;
    const item: SavePendingItem = {
      id: `${Date.now()}`,
      title: title.trim(),
      price: parsedPrice,
      hoursNeeded,
      futureValue,
      createdAt: Date.now(),
      remindAt,
    };
    addPendingItem(item);
    scheduleReminder(item);
    return true;
  }, [title, parsedPrice, parsedHourlyWage, cooldownHours, hoursNeeded, futureValue, scheduleReminder, addPendingItem, t]);

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
    <Stack.Screen options={{ headerShown: false }} />
    <ScreenHeader title={t('piggyBankFeature')} variant="gradient" />
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

      {/* Co chceš koupit */}
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
        {settingsLoaded && !wageReady ? (
          <Pressable
            onPress={() => setSettingsOpen(true)}
            style={[styles.wageHint, { backgroundColor: colors.muted }]}
          >
            <Briefcase size={18} color={colors.primary} />
            <Text style={[styles.wageHintText, { color: colors.text }]}>
              {tr(
                'Nastav si jednou svůj příjem níže a uvidíš, kolik práce tě každá věc stojí.',
                'Set your income once below to see how much work each thing costs you.',
              )}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {showResults ? (
        <>
          <LinearGradient
            colors={['#8B5CF6', '#4F46E5']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.worthCard, { shadowColor: shadowSoft }]}
            testID="save-worth-card"
          >
            <Text style={styles.worthEyebrow}>{tr('STOJÍ TO ZA TO?', 'IS IT WORTH IT?')}</Text>
            <Text style={styles.worthItem} numberOfLines={1}>
              {title.trim()} · {formatCurrency(parsedPrice)} {currency.symbol}
            </Text>

            <Text style={styles.worthLabel}>{tr('Tohle tě stojí', 'This costs you')}</Text>
            <Text style={styles.worthBig} adjustsFontSizeToFit numberOfLines={2}>
              {formatWorkTime(hoursNeeded)}
            </Text>
            <Text style={styles.worthSub}>
              {tr('práce (pracovní den = 8 h)', 'of work (8-hour workdays)')}
              {incomeSharePct != null && incomeSharePct >= 1
                ? tr(
                    ` · ${Math.round(incomeSharePct)} % měsíčního příjmu`,
                    ` · ${Math.round(incomeSharePct)} % of your monthly income`,
                  )
                : ''}
            </Text>

            {futureValue > 0 && parsedYears > 0 ? (
              <>
                <View style={styles.worthDivider} />
                <Text style={styles.worthLabel}>
                  {tr(
                    `Kdybys peníze odložil, za ${formatYearsCs(parsedYears)} by z nich mohlo být`,
                    `Set aside instead, in ${formatYearsCs(parsedYears)} it could grow to`,
                  )}
                </Text>
                <Text style={styles.worthBig2}>
                  {formatCurrency(Math.round(futureValue))} {currency.symbol}
                </Text>
                <Text style={styles.worthNote}>
                  {tr(
                    `Ilustrační výpočet (${presetLabelForReturn}). Nejde o investiční doporučení.`,
                    `Illustration only (${presetLabelForReturn}). Not investment advice.`,
                  )}
                </Text>
              </>
            ) : null}
          </LinearGradient>

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
            <TouchableOpacity
              style={[styles.decisionBtn, styles.decisionBtnSaved, { opacity: savingDecision ? 0.7 : 1 }]}
              onPress={() => void handleNotBuy()}
              disabled={savingDecision}
              activeOpacity={0.88}
              testID="save-not-buy"
            >
              <Text style={styles.decisionBtnText}>
                {tr(`Nekoupím a ušetřím ${formatCurrency(parsedPrice)} ${currency.symbol}`, `Don’t buy, save ${formatCurrency(parsedPrice)} ${currency.symbol}`)}
              </Text>
            </TouchableOpacity>

            <View style={styles.row}>
              <TouchableOpacity
                style={[styles.decisionBtnOutline, styles.rowInput, { borderColor: colors.border, opacity: savingDecision ? 0.7 : 1 }]}
                onPress={() => void handleBuy()}
                disabled={savingDecision}
                activeOpacity={0.88}
                testID="save-buy"
              >
                <Text style={[styles.decisionBtnOutlineText, { color: colors.text }]}>{tr('Koupím', 'Buy it')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.decisionBtnOutline, styles.rowInput, { borderColor: colors.primary, opacity: savingDecision ? 0.7 : 1 }]}
                onPress={() => void handleThink()}
                disabled={savingDecision}
                activeOpacity={0.88}
                testID="save-think"
              >
                <Text style={[styles.decisionBtnOutlineText, { color: colors.primary }]}>{tr('Rozmyslím si', 'Think it over')}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.cooldownRow}>
              <Text style={[styles.cooldownLabel, { color: colors.textSecondary }]}>
                {tr('Připomenout za:', 'Remind me in:')}
              </Text>
              {COOLDOWN_OPTIONS.map((h) => {
                const active = cooldownHours === h;
                const label =
                  h === 24 ? tr('24 h', '24 h') : h === 72 ? tr('3 dny', '3 days') : tr('týden', '1 week');
                return (
                  <TouchableOpacity
                    key={h}
                    onPress={() => setCooldownHours(h)}
                    style={[
                      styles.quickChip,
                      {
                        borderColor: active ? colors.primary : colors.border,
                        backgroundColor: active ? colors.primary + '22' : colors.surface,
                      },
                    ]}
                  >
                    <Text style={[styles.quickChipText, { color: active ? colors.primary : colors.text }]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

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
        </>
      ) : null}

      {pendingItems.length > 0 ? (
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
            <Text style={[styles.cardTitle, { color: colors.text, marginBottom: 0 }]}>
              {tr('Rozmýšlíš si', 'Thinking it over')}
            </Text>
          </View>
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
      ) : null}

      {/* Nastavení výpočtu – pamatuje se */}
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
        <Pressable onPress={() => setSettingsOpen((v) => !v)} style={styles.settingsHeader} testID="save-settings-toggle">
          <Briefcase size={18} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.settingsTitle, { color: colors.text }]}>
              {tr('Nastavení výpočtu', 'Calculation settings')}
            </Text>
            <Text style={[styles.settingsSummary, { color: colors.textSecondary }]} numberOfLines={1}>
              {wageReady
                ? `${formatCurrency(Math.round(parsedHourlyWage))} ${currency.symbol}/h · ${presetLabelForReturn} · ${formatYearsCs(parsedYears)}`
                : tr('Zadej svůj příjem', 'Enter your income')}
            </Text>
          </View>
          <ChevronRight
            size={20}
            color={colors.textSecondary}
            style={{ transform: [{ rotate: settingsOpen ? '90deg' : '0deg' }] }}
          />
        </Pressable>
        {settingsOpen ? (
          <View style={{ marginTop: 14 }}>
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
            <View style={styles.rowInput}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                {t('saveAnnualReturnLabel')}
              </Text>
              <Pressable
                onPress={() => annualReturnInputRef.current?.focus()}
                style={[
                  styles.inputCompact,
                  styles.inputWithSuffix,
                  { borderColor: colors.border, backgroundColor: colors.surface },
                ]}
              >
                <TextInput
                  ref={annualReturnInputRef}
                  value={annualReturn}
                  onChangeText={setAnnualReturn}
                  placeholder={t('saveAnnualReturnPlaceholder')}
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="decimal-pad"
                  style={[styles.inputInner, { color: colors.text }]}
                  testID="save-annual-return"
                />
                <Text style={[styles.inputSuffix, { color: colors.textSecondary }]}>%</Text>
              </Pressable>
            </View>
            <View style={styles.rowInput}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                {t('savePeriodLabel')}
              </Text>
              <Pressable
                onPress={() => yearsInputRef.current?.focus()}
                style={[
                  styles.inputCompact,
                  styles.inputWithSuffix,
                  { borderColor: colors.border, backgroundColor: colors.surface },
                ]}
              >
                <TextInput
                  ref={yearsInputRef}
                  value={years}
                  onChangeText={setYears}
                  placeholder={t('savePeriodPlaceholder')}
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="decimal-pad"
                  style={[styles.inputInner, { color: colors.text }]}
                  testID="save-years"
                />
                <Text style={[styles.inputSuffix, { color: colors.textSecondary }]}>
                  {yearsUnitLabel(years)}
                </Text>
              </Pressable>
            </View>
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
        ) : null}
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
              : date.toLocaleDateString(uiLocale(), { day: 'numeric', month: 'short' });
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
  fieldLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 2,
  },
  inputWithSuffix: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  inputInner: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
    paddingHorizontal: 0,
    margin: 0,
  },
  inputSuffix: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
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
  wageHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    marginTop: 4,
  },
  wageHintText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '500' },
  worthCard: {
    borderRadius: 20,
    padding: 22,
    marginBottom: 14,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 6,
  },
  worthEyebrow: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  worthItem: { color: '#FFFFFF', fontSize: 15, fontWeight: '600', marginTop: 6, marginBottom: 16 },
  worthLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '500' },
  worthBig: { color: '#FFFFFF', fontSize: 32, fontWeight: '800', letterSpacing: -0.5, marginTop: 2 },
  worthSub: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 4 },
  worthDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.35)',
    marginVertical: 16,
  },
  worthBig2: { color: '#FFFFFF', fontSize: 26, fontWeight: '800', marginTop: 2 },
  worthNote: { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 6, lineHeight: 15 },
  decisionBtnOutline: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  decisionBtnOutlineText: { fontSize: 15, fontWeight: '700' },
  cooldownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  cooldownLabel: { fontSize: 13, fontWeight: '600' },
  settingsHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  settingsTitle: { fontSize: 16, fontWeight: '700' },
  settingsSummary: { fontSize: 12, marginTop: 2 },
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

export default function SaveScreen() {
  return (
    <PremiumGateScreen feature="save" showBack>
      <SaveScreenContent />
    </PremiumGateScreen>
  );
}
