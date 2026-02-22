import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { PiggyBank, Timer, Sparkles, CheckCircle2, BellRing, XCircle } from 'lucide-react-native';
import * as Notifications from 'expo-notifications';
import { useSettingsStore } from '@/store/settings-store';

const DEFAULT_ANNUAL_RETURN = 7;
const DEFAULT_YEARS = 10;
const DEFAULT_HOURS_PER_MONTH = 160;
const DEFAULT_COOLDOWN_HOURS = 24;
const DEFAULT_DECISION_HOUR = 9;

const formatCurrency = (value: number) => {
  return value.toLocaleString('cs-CZ');
};

type WageMode = 'hourly' | 'monthly';

type PendingItemStatus = 'pending' | 'saved' | 'bought';

type PendingItem = {
  id: string;
  title: string;
  price: number;
  hoursNeeded: number;
  futureValue: number;
  createdAt: number;
  remindAt: number;
  notificationId?: string;
  status: PendingItemStatus;
};

export default function SaveScreen() {
  const { isDarkMode, getCurrentCurrency } = useSettingsStore();
  const currency = getCurrentCurrency();
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
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [nowTick, setNowTick] = useState<number>(Date.now());
  const [savedTotal, setSavedTotal] = useState<number>(0);
  const [envelopesMode, setEnvelopesMode] = useState<boolean>(false);
  const [selectedEnvelopes, setSelectedEnvelopes] = useState<Set<number>>(new Set());

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

  const parsedPrice = useMemo<number>(() => {
    const parsed = parseFloat(price.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : 0;
  }, [price]);

  const parsedHourlyWage = useMemo<number>(() => {
    if (wageMode === 'hourly') {
      const parsed = parseFloat(hourlyWage.replace(',', '.'));
      return Number.isFinite(parsed) ? parsed : 0;
    }
    const parsedMonthly = parseFloat(monthlyIncome.replace(',', '.'));
    const parsedHours = parseFloat(hoursPerMonth.replace(',', '.'));
    if (!Number.isFinite(parsedMonthly) || !Number.isFinite(parsedHours) || parsedHours <= 0) {
      return 0;
    }
    return parsedMonthly / parsedHours;
  }, [hourlyWage, wageMode, monthlyIncome, hoursPerMonth]);

  const parsedAnnualReturn = useMemo<number>(() => {
    const parsed = parseFloat(annualReturn.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : 0;
  }, [annualReturn]);

  const parsedYears = useMemo<number>(() => {
    const parsed = parseFloat(years.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : 0;
  }, [years]);

  const hoursNeeded = useMemo<number>(() => {
    if (parsedPrice <= 0 || parsedHourlyWage <= 0) return 0;
    return parsedPrice / parsedHourlyWage;
  }, [parsedPrice, parsedHourlyWage]);

  const futureValue = useMemo<number>(() => {
    if (parsedPrice <= 0 || parsedAnnualReturn <= 0 || parsedYears <= 0) return 0;
    return parsedPrice * Math.pow(1 + parsedAnnualReturn / 100, parsedYears);
  }, [parsedPrice, parsedAnnualReturn, parsedYears]);

  const parseDecisionDateTime = useCallback((): Date | null => {
    if (!decisionDate || !decisionTime) return null;
    const dateParts = decisionDate.split('.');
    const timeParts = decisionTime.split(':');
    if (dateParts.length !== 3 || timeParts.length < 2) return null;
    const day = parseInt(dateParts[0] ?? '', 10);
    const month = parseInt(dateParts[1] ?? '', 10);
    const year = parseInt(dateParts[2] ?? '', 10);
    const hours = parseInt(timeParts[0] ?? '', 10);
    const minutes = parseInt(timeParts[1] ?? '', 10);
    if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    if (day <= 0 || month <= 0 || month > 12 || year < 2024) return null;
    const date = new Date(year, month - 1, day, hours, minutes, 0, 0);
    if (Number.isNaN(date.getTime())) return null;
    return date;
  }, [decisionDate, decisionTime]);

  const scheduleReminder = useCallback(async (item: PendingItem) => {
    try {
      if (Platform.OS === 'web') {
        console.log('Notifications are not supported on web');
        return;
      }
      const permission = await Notifications.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Oznámení', 'Povol upozornění, aby ti aplikace připomněla rozhodnutí.');
        return;
      }
      const trigger = new Date(item.remindAt);
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Rozmyslet nákup',
          body: `Chceš koupit „${item.title}“ nebo to nechat být?`,
          sound: true,
        },
        trigger,
      });
      console.log('Scheduled notification', notificationId);
      setPendingItems((prev) =>
        prev.map((entry) => (entry.id === item.id ? { ...entry, notificationId } : entry))
      );
    } catch (error) {
      console.error('Failed to schedule notification', error);
    }
  }, []);

  const handleAddCooldown = useCallback(() => {
    if (!title.trim() || parsedPrice <= 0 || parsedHourlyWage <= 0) {
      Alert.alert('Chyba', 'Vyplň název, cenu a mzdu/příjem.');
      return;
    }
    const decisionDateTime = parseDecisionDateTime();
    if (!decisionDateTime) {
      Alert.alert('Chyba', 'Zadej platné datum a čas rozhodnutí.');
      return;
    }
    if (decisionDateTime.getTime() <= Date.now()) {
      Alert.alert('Chyba', 'Rozhodnutí musí být v budoucnu.');
      return;
    }
    const item: PendingItem = {
      id: `${Date.now()}`,
      title: title.trim(),
      price: parsedPrice,
      hoursNeeded,
      futureValue,
      createdAt: Date.now(),
      remindAt: decisionDateTime.getTime(),
      status: 'pending',
    };
    console.log('Adding decision item', item);
    setPendingItems((prev) => [item, ...prev]);
    setTitle('');
    setPrice('');
    scheduleReminder(item);
  }, [title, parsedPrice, parsedHourlyWage, parseDecisionDateTime, hoursNeeded, futureValue, scheduleReminder]);

  const toggleEnvelope = useCallback((index: number) => {
    setSelectedEnvelopes((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const envelopeTotal = useMemo<number>(() => {
    let total = 0;
    selectedEnvelopes.forEach((value) => {
      total += value;
    });
    return total;
  }, [selectedEnvelopes]);

  const backgroundColor = isDarkMode ? '#0F172A' : '#F8FAFC';
  const cardColor = isDarkMode ? '#1F2937' : '#FFFFFF';
  const subtleText = isDarkMode ? '#94A3B8' : '#6B7280';
  const primaryText = isDarkMode ? '#F9FAFB' : '#0F172A';

  return (
    <ScrollView
      style={[styles.container, { backgroundColor }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      testID="save-scroll"
    >
      <LinearGradient
        colors={['#0EA5E9', '#2563EB']}
        style={styles.hero}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.heroHeader}>
          <PiggyBank color="white" size={28} />
          <Text style={styles.heroTitle}>Ušetři</Text>
        </View>
        <Text style={styles.heroSubtitle}>
          Přepočítej cenu na čas, budoucí hodnotu a dej si pauzu před nákupem.
        </Text>
      </LinearGradient>

      <View style={[styles.card, { backgroundColor: cardColor }]}>
        <View style={styles.sectionHeaderRow}>
          <BellRing color={isDarkMode ? '#38BDF8' : '#2563EB'} size={20} />
          <Text style={[styles.sectionTitle, { color: primaryText }]}>Ušetřeno rozhodnutím</Text>
        </View>
        <Text style={[styles.sectionSubtitle, { color: subtleText }]}>Součet věcí, které jsi se rozhodl/a nekoupit.</Text>
        <View style={[styles.resultBox, { backgroundColor: isDarkMode ? '#0B1220' : '#EFF6FF' }]}>
          <Text style={[styles.resultLabel, { color: subtleText }]}>Ušetřené peníze</Text>
          <Text style={[styles.resultValue, { color: primaryText }]}>{savedTotal > 0 ? `${formatCurrency(savedTotal)} ${currency.symbol}` : `0 ${currency.symbol}`}</Text>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: cardColor }]}>
        <Text style={[styles.sectionTitle, { color: primaryText }]}>Co chceš koupit?</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Např. nový telefon"
          placeholderTextColor={subtleText}
          style={[styles.input, { color: primaryText, borderColor: isDarkMode ? '#334155' : '#E2E8F0' }]}
          testID="save-title"
        />
        <TextInput
          value={price}
          onChangeText={setPrice}
          placeholder={`Cena v ${currency.symbol}`}
          placeholderTextColor={subtleText}
          keyboardType="decimal-pad"
          style={[styles.input, { color: primaryText, borderColor: isDarkMode ? '#334155' : '#E2E8F0' }]}
          testID="save-price"
        />

        <Text style={[styles.sectionTitle, { color: primaryText, marginTop: 16 }]}>Tvoje mzda</Text>
        <View style={styles.segmented}>
          {([
            { id: 'hourly', label: 'Hodinová' },
            { id: 'monthly', label: 'Měsíční' },
          ] as Array<{ id: WageMode; label: string }>).map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.segment,
                wageMode === item.id && styles.segmentActive,
                wageMode === item.id && { backgroundColor: '#2563EB' },
              ]}
              onPress={() => setWageMode(item.id)}
              testID={`save-wage-${item.id}`}
            >
              <Text style={[styles.segmentText, wageMode === item.id && styles.segmentTextActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {wageMode === 'hourly' ? (
          <TextInput
            value={hourlyWage}
            onChangeText={setHourlyWage}
            placeholder={`Hodinová mzda (${currency.symbol})`}
            placeholderTextColor={subtleText}
            keyboardType="decimal-pad"
            style={[styles.input, { color: primaryText, borderColor: isDarkMode ? '#334155' : '#E2E8F0' }]}
            testID="save-hourly"
          />
        ) : (
          <View style={styles.row}>
            <TextInput
              value={monthlyIncome}
              onChangeText={setMonthlyIncome}
              placeholder={`Měsíční příjem (${currency.symbol})`}
              placeholderTextColor={subtleText}
              keyboardType="decimal-pad"
              style={[styles.input, styles.rowInput, { color: primaryText, borderColor: isDarkMode ? '#334155' : '#E2E8F0' }]}
              testID="save-monthly"
            />
            <TextInput
              value={hoursPerMonth}
              onChangeText={setHoursPerMonth}
              placeholder="Hodin / měsíc"
              placeholderTextColor={subtleText}
              keyboardType="decimal-pad"
              style={[styles.input, styles.rowInput, { color: primaryText, borderColor: isDarkMode ? '#334155' : '#E2E8F0' }]}
              testID="save-hours-per-month"
            />
          </View>
        )}

        <View style={styles.metricsRow}>
          <View style={[styles.metric, { backgroundColor: isDarkMode ? '#0B1220' : '#F1F5F9' }]}>
            <Text style={[styles.metricLabel, { color: subtleText }]}>Čas v práci</Text>
            <Text style={[styles.metricValue, { color: primaryText }]}>{
              hoursNeeded > 0 ? `${hoursNeeded.toFixed(1)} h` : '--'
            }</Text>
          </View>
          <View style={[styles.metric, { backgroundColor: isDarkMode ? '#0B1220' : '#F1F5F9' }]}>
            <Text style={[styles.metricLabel, { color: subtleText }]}>Hodinová mzda</Text>
            <Text style={[styles.metricValue, { color: primaryText }]}>{
              parsedHourlyWage > 0 ? `${formatCurrency(parsedHourlyWage)} ${currency.symbol}` : '--'
            }</Text>
          </View>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: cardColor }]}>
        <View style={styles.sectionHeaderRow}>
          <Sparkles color={isDarkMode ? '#38BDF8' : '#2563EB'} size={20} />
          <Text style={[styles.sectionTitle, { color: primaryText }]}>Budoucí hodnota</Text>
        </View>
        <View style={styles.row}>
          <TextInput
            value={annualReturn}
            onChangeText={setAnnualReturn}
            placeholder="Roční výnos %"
            placeholderTextColor={subtleText}
            keyboardType="decimal-pad"
            style={[styles.input, styles.rowInput, { color: primaryText, borderColor: isDarkMode ? '#334155' : '#E2E8F0' }]}
            testID="save-annual-return"
          />
          <TextInput
            value={years}
            onChangeText={setYears}
            placeholder="Počet let"
            placeholderTextColor={subtleText}
            keyboardType="decimal-pad"
            style={[styles.input, styles.rowInput, { color: primaryText, borderColor: isDarkMode ? '#334155' : '#E2E8F0' }]}
            testID="save-years"
          />
        </View>
        <View style={[styles.resultBox, { backgroundColor: isDarkMode ? '#0B1220' : '#E0F2FE' }]}
        >
          <Text style={[styles.resultLabel, { color: subtleText }]}>Budoucí hodnota</Text>
          <Text style={[styles.resultValue, { color: primaryText }]}>{
            futureValue > 0 ? `${formatCurrency(futureValue)} ${currency.symbol}` : '--'
          }</Text>
          <Text style={[styles.resultHint, { color: subtleText }]}>Kolik by mohly mít tyto peníze, kdyby pracovaly pro tebe.</Text>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: cardColor }]}>
        <View style={styles.sectionHeaderRow}>
          <Timer color={isDarkMode ? '#38BDF8' : '#2563EB'} size={20} />
          <Text style={[styles.sectionTitle, { color: primaryText }]}>Rozmyslet</Text>
        </View>
        <Text style={[styles.sectionSubtitle, { color: subtleText }]}>Nastav si datum a čas, kdy se k rozhodnutí vrátíš.</Text>
        <View style={styles.row}>
          <TextInput
            value={decisionDate}
            onChangeText={setDecisionDate}
            placeholder="DD.MM.RRRR"
            placeholderTextColor={subtleText}
            keyboardType="numbers-and-punctuation"
            style={[styles.input, styles.rowInput, { color: primaryText, borderColor: isDarkMode ? '#334155' : '#E2E8F0' }]}
            testID="save-decision-date"
          />
          <TextInput
            value={decisionTime}
            onChangeText={setDecisionTime}
            placeholder="HH:MM"
            placeholderTextColor={subtleText}
            keyboardType="numbers-and-punctuation"
            style={[styles.input, styles.rowInput, { color: primaryText, borderColor: isDarkMode ? '#334155' : '#E2E8F0' }]}
            testID="save-decision-time"
          />
        </View>
        <View style={styles.quickRow}>
          <TouchableOpacity
            style={styles.quickButton}
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
            <Text style={styles.quickButtonText}>Zítra 9:00</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickButton}
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
            <Text style={styles.quickButtonText}>Za 24 h</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleAddCooldown}
          testID="save-add-cooldown"
        >
          <Text style={styles.primaryButtonText}>Rozmyslet</Text>
        </TouchableOpacity>

        {pendingItems.length > 0 && (
          <View style={styles.pendingList}>
            {pendingItems.map((item) => {
              const remainingMs = item.remindAt - nowTick;
              const clampedMs = Math.max(0, remainingMs);
              const remainingHours = Math.floor(clampedMs / 3600000);
              const remainingMinutes = Math.floor((clampedMs % 3600000) / 60000);
              const isReady = clampedMs <= 0;
              const statusText = item.status === 'saved' ? 'Ušetřeno' : item.status === 'bought' ? 'Koupeno' : 'Rozmyslet';
              return (
                <View key={item.id} style={[styles.pendingCard, { backgroundColor: isDarkMode ? '#0B1220' : '#F1F5F9' }]}>
                  <View style={styles.pendingHeader}>
                    <Text style={[styles.pendingTitle, { color: primaryText }]}>{item.title}</Text>
                    {item.status === 'saved' ? (
                      <CheckCircle2 color="#10B981" size={18} />
                    ) : item.status === 'bought' ? (
                      <XCircle color="#EF4444" size={18} />
                    ) : isReady ? (
                      <CheckCircle2 color="#10B981" size={18} />
                    ) : (
                      <Timer color="#F97316" size={18} />
                    )}
                  </View>
                  <Text style={[styles.pendingMeta, { color: subtleText }]}>Cena: {formatCurrency(item.price)} {currency.symbol}</Text>
                  <Text style={[styles.pendingMeta, { color: subtleText }]}>Čas: {item.hoursNeeded.toFixed(1)} h</Text>
                  <Text style={[styles.pendingMeta, { color: subtleText }]}>Budoucí hodnota: {formatCurrency(item.futureValue)} {currency.symbol}</Text>
                  <Text style={[styles.pendingCountdown, { color: isReady ? '#10B981' : '#F97316' }]}>
                    {item.status !== 'pending'
                      ? statusText
                      : isReady
                      ? 'Rozhodnutí je na tobě'
                      : `${remainingHours} h ${remainingMinutes} min`}
                  </Text>
                  {item.status === 'pending' && isReady && (
                    <View style={styles.decisionRow}>
                      <TouchableOpacity
                        style={[styles.decisionButton, styles.decisionReject]}
                        onPress={() => {
                          console.log('Marked as bought', item.id);
                          setPendingItems((prev) => prev.map((entry) => (
                            entry.id === item.id ? { ...entry, status: 'bought' } : entry
                          )));
                        }}
                        testID={`save-decision-buy-${item.id}`}
                      >
                        <Text style={styles.decisionButtonText}>Koupit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.decisionButton, styles.decisionSave]}
                        onPress={() => {
                          console.log('Marked as saved', item.id);
                          setPendingItems((prev) => prev.map((entry) => (
                            entry.id === item.id ? { ...entry, status: 'saved' } : entry
                          )));
                          setSavedTotal((prev) => prev + item.price);
                        }}
                        testID={`save-decision-skip-${item.id}`}
                      >
                        <Text style={styles.decisionButtonText}>Nekoupit</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </View>

      <View style={[styles.card, { backgroundColor: cardColor }]}>
        <View style={styles.sectionHeaderRow}>
          <PiggyBank color={isDarkMode ? '#38BDF8' : '#2563EB'} size={20} />
          <Text style={[styles.sectionTitle, { color: primaryText }]}>100 obálek</Text>
        </View>
        <Text style={[styles.sectionSubtitle, { color: subtleText }]}>Zábavný režim pro budování spořicího návyku. Vyber si obálky a sleduj součet.</Text>
        <TouchableOpacity
          style={[styles.secondaryButton, envelopesMode && styles.secondaryButtonActive]}
          onPress={() => setEnvelopesMode((prev) => !prev)}
          testID="save-envelopes-toggle"
        >
          <Text style={[styles.secondaryButtonText, envelopesMode && styles.secondaryButtonTextActive]}>
            {envelopesMode ? 'Skrýt režim' : 'Spustit režim'}
          </Text>
        </TouchableOpacity>

        {envelopesMode && (
          <View style={styles.envelopeSection}>
            <Text style={[styles.envelopeTotal, { color: primaryText }]}>Cíl: {formatCurrency(envelopeTotal)} {currency.symbol}</Text>
            <View style={styles.envelopesGrid}>
              {Array.from({ length: 100 }).map((_, index) => {
                const value = index + 1;
                const isSelected = selectedEnvelopes.has(value);
                return (
                  <TouchableOpacity
                    key={value}
                    style={[
                      styles.envelopeItem,
                      { backgroundColor: isSelected ? '#2563EB' : isDarkMode ? '#0B1220' : '#E2E8F0' },
                    ]}
                    onPress={() => toggleEnvelope(value)}
                    testID={`save-envelope-${value}`}
                  >
                    <Text style={[styles.envelopeText, { color: isSelected ? '#FFFFFF' : subtleText }]}>{value}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 120,
  },
  hero: {
    borderRadius: 24,
    padding: 20,
    marginBottom: 20,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: 'white',
  },
  heroSubtitle: {
    fontSize: 14,
    color: 'white',
    opacity: 0.9,
  },
  card: {
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  sectionSubtitle: {
    fontSize: 13,
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginTop: 10,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 12,
    padding: 4,
    marginTop: 10,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 10,
  },
  segmentActive: {
    backgroundColor: '#2563EB',
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  segmentTextActive: {
    color: '#FFFFFF',
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  rowInput: {
    flex: 1,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  metric: {
    flex: 1,
    borderRadius: 14,
    padding: 12,
  },
  metricLabel: {
    fontSize: 12,
    marginBottom: 6,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  resultBox: {
    borderRadius: 16,
    padding: 16,
    marginTop: 12,
  },
  resultLabel: {
    fontSize: 12,
  },
  resultValue: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 6,
  },
  resultHint: {
    fontSize: 12,
    marginTop: 6,
  },
  primaryButton: {
    backgroundColor: '#2563EB',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  primaryButtonText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 15,
  },
  pendingList: {
    marginTop: 16,
    gap: 12,
  },
  pendingCard: {
    borderRadius: 14,
    padding: 12,
  },
  pendingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  pendingTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  pendingMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  pendingCountdown: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '600',
  },
  decisionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  decisionButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 8,
    alignItems: 'center',
  },
  decisionSave: {
    backgroundColor: '#10B981',
  },
  decisionReject: {
    backgroundColor: '#EF4444',
  },
  decisionButtonText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 13,
  },
  quickRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  quickButton: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2563EB',
    paddingVertical: 10,
    alignItems: 'center',
  },
  quickButtonText: {
    color: '#2563EB',
    fontWeight: '600',
    fontSize: 12,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#2563EB',
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  secondaryButtonActive: {
    backgroundColor: '#2563EB',
  },
  secondaryButtonText: {
    color: '#2563EB',
    fontWeight: '600',
  },
  secondaryButtonTextActive: {
    color: 'white',
  },
  envelopeSection: {
    marginTop: 12,
  },
  envelopeTotal: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
  },
  envelopesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  envelopeItem: {
    width: '9%',
    aspectRatio: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  envelopeText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
