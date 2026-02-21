import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { PiggyBank, Timer, Sparkles, CheckCircle2 } from 'lucide-react-native';
import { useSettingsStore } from '@/store/settings-store';

const DEFAULT_ANNUAL_RETURN = 7;
const DEFAULT_YEARS = 10;
const DEFAULT_HOURS_PER_MONTH = 160;
const DEFAULT_COOLDOWN_HOURS = 24;

const formatCurrency = (value: number) => {
  return value.toLocaleString('cs-CZ');
};

type WageMode = 'hourly' | 'monthly';

type PendingItem = {
  id: string;
  title: string;
  price: number;
  hoursNeeded: number;
  futureValue: number;
  createdAt: number;
  cooldownHours: number;
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
  const [cooldownHours, setCooldownHours] = useState<string>(DEFAULT_COOLDOWN_HOURS.toString());
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [nowTick, setNowTick] = useState<number>(Date.now());
  const [envelopesMode, setEnvelopesMode] = useState<boolean>(false);
  const [selectedEnvelopes, setSelectedEnvelopes] = useState<Set<number>>(new Set());

  useEffect(() => {
    const interval = setInterval(() => {
      setNowTick(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

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

  const handleAddCooldown = useCallback(() => {
    if (!title.trim() || parsedPrice <= 0 || parsedHourlyWage <= 0) {
      Alert.alert('Chyba', 'Vyplň název, cenu a mzdu/příjem.');
      return;
    }
    const hours = parseFloat(cooldownHours.replace(',', '.'));
    if (!Number.isFinite(hours) || hours <= 0) {
      Alert.alert('Chyba', 'Zadej platný časovač.');
      return;
    }
    const item: PendingItem = {
      id: `${Date.now()}`,
      title: title.trim(),
      price: parsedPrice,
      hoursNeeded,
      futureValue,
      createdAt: Date.now(),
      cooldownHours: hours,
    };
    console.log('Adding cooldown item', item);
    setPendingItems((prev) => [item, ...prev]);
    setTitle('');
    setPrice('');
  }, [title, parsedPrice, parsedHourlyWage, cooldownHours, hoursNeeded, futureValue]);

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
        <Text style={[styles.sectionSubtitle, { color: subtleText }]}>Nastav si pauzu, která vytvoří odstup mezi impulzem a nákupem.</Text>
        <TextInput
          value={cooldownHours}
          onChangeText={setCooldownHours}
          placeholder="Časovač v hodinách"
          placeholderTextColor={subtleText}
          keyboardType="decimal-pad"
          style={[styles.input, { color: primaryText, borderColor: isDarkMode ? '#334155' : '#E2E8F0' }]}
          testID="save-cooldown-hours"
        />
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
              const remainingMs = item.cooldownHours * 3600 * 1000 - (nowTick - item.createdAt);
              const clampedMs = Math.max(0, remainingMs);
              const remainingHours = Math.floor(clampedMs / 3600000);
              const remainingMinutes = Math.floor((clampedMs % 3600000) / 60000);
              const isReady = clampedMs <= 0;
              return (
                <View key={item.id} style={[styles.pendingCard, { backgroundColor: isDarkMode ? '#0B1220' : '#F1F5F9' }]}>
                  <View style={styles.pendingHeader}>
                    <Text style={[styles.pendingTitle, { color: primaryText }]}>{item.title}</Text>
                    {isReady ? (
                      <CheckCircle2 color="#10B981" size={18} />
                    ) : (
                      <Timer color="#F97316" size={18} />
                    )}
                  </View>
                  <Text style={[styles.pendingMeta, { color: subtleText }]}>Cena: {formatCurrency(item.price)} {currency.symbol}</Text>
                  <Text style={[styles.pendingMeta, { color: subtleText }]}>Čas: {item.hoursNeeded.toFixed(1)} h</Text>
                  <Text style={[styles.pendingMeta, { color: subtleText }]}>Budoucí hodnota: {formatCurrency(item.futureValue)} {currency.symbol}</Text>
                  <Text style={[styles.pendingCountdown, { color: isReady ? '#10B981' : '#F97316' }]}>
                    {isReady ? 'Rozhodnutí je na tobě' : `${remainingHours} h ${remainingMinutes} min`}
                  </Text>
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
