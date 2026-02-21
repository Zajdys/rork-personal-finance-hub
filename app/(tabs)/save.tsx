import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Animated,
  Modal,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Clock,
  TrendingUp,
  Pause,
  ShieldCheck,
  Mail,
  X,
  Check,
  ChevronRight,
  AlertTriangle,
  Banknote,
  Timer,
  Target,
  Sparkles,
  RotateCcw,
  ShoppingBag,
  CircleDollarSign,
  Hourglass,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useSettingsStore } from '@/store/settings-store';
import { useLanguageStore } from '@/store/language-store';
import { useSaveStore } from '@/store/save-store';

type ActiveSection = 'calculator' | 'pending' | 'envelopes';

export default function SaveScreen() {
  const { isDarkMode, getCurrentCurrency } = useSettingsStore();
  const { t } = useLanguageStore();
  const currencyInfo = getCurrentCurrency();
  const {
    hourlyWage,
    monthlyIncome,
    pendingPurchases,
    envelopes,
    envelopesInitialized,
    isLoaded,
    setMonthlyIncome,
    addPendingPurchase,
    decidePurchase,
    removePurchase,
    initEnvelopes,
    completeEnvelope,
    resetEnvelopes,
    loadData,
  } = useSaveStore();

  const [activeSection, setActiveSection] = useState<ActiveSection>('calculator');
  const [itemName, setItemName] = useState<string>('');
  const [itemPrice, setItemPrice] = useState<string>('');
  const [incomeInput, setIncomeInput] = useState<string>('');
  const [investYears, setInvestYears] = useState<string>('10');
  const [investReturn, setInvestReturn] = useState<string>('7');
  const [showResult, setShowResult] = useState<boolean>(false);
  const [showEnvelopeModal, setShowEnvelopeModal] = useState<boolean>(false);
  const [selectedEnvelopeIdx, setSelectedEnvelopeIdx] = useState<number>(-1);

  const resultAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (monthlyIncome > 0) {
      setIncomeInput(Math.round(monthlyIncome).toString());
    }
  }, [isLoaded]);

  useEffect(() => {
    if (showResult) {
      Animated.spring(resultAnim, {
        toValue: 1,
        friction: 6,
        tension: 40,
        useNativeDriver: true,
      }).start();
    } else {
      resultAnim.setValue(0);
    }
  }, [showResult]);

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  const price = parseFloat(itemPrice) || 0;
  const wage = hourlyWage || 0;
  const hoursNeeded = wage > 0 ? price / wage : 0;
  const years = parseFloat(investYears) || 10;
  const annualReturn = (parseFloat(investReturn) || 7) / 100;
  const futureValue = price * Math.pow(1 + annualReturn, years);

  const handleCalculate = useCallback(() => {
    if (!itemName.trim()) {
      Alert.alert('Chyba', 'Zadej název věci');
      return;
    }
    if (price <= 0) {
      Alert.alert('Chyba', 'Zadej platnou cenu');
      return;
    }
    if (wage <= 0) {
      Alert.alert('Chyba', 'Zadej svůj měsíční příjem');
      return;
    }
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setShowResult(true);
  }, [itemName, price, wage]);

  const handleThinkAboutIt = useCallback(() => {
    if (!itemName.trim() || price <= 0) {
      Alert.alert('Chyba', 'Nejdříve vyplň název a cenu');
      return;
    }
    addPendingPurchase({ name: itemName.trim(), price });
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    Alert.alert('Uloženo', `"${itemName}" bylo přidáno do seznamu k rozmyšlení na 24 hodin.`);
    setItemName('');
    setItemPrice('');
    setShowResult(false);
  }, [itemName, price, addPendingPurchase]);

  const handleIncomeSubmit = useCallback(() => {
    const val = parseFloat(incomeInput);
    if (val > 0) {
      setMonthlyIncome(val);
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    }
  }, [incomeInput, setMonthlyIncome]);

  const handleEnvelopeTap = useCallback((index: number) => {
    if (envelopes[index]?.completed) return;
    setSelectedEnvelopeIdx(index);
    setShowEnvelopeModal(true);
  }, [envelopes]);

  const confirmEnvelope = useCallback(() => {
    if (selectedEnvelopeIdx >= 0) {
      completeEnvelope(selectedEnvelopeIdx);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    }
    setShowEnvelopeModal(false);
    setSelectedEnvelopeIdx(-1);
  }, [selectedEnvelopeIdx, completeEnvelope]);

  const envelopeStats = useMemo(() => {
    const completed = envelopes.filter(e => e.completed);
    const totalSaved = completed.reduce((sum, e) => sum + e.amount, 0);
    const totalPossible = envelopes.reduce((sum, e) => sum + e.amount, 0);
    return { completedCount: completed.length, totalSaved, totalPossible };
  }, [envelopes]);

  const pendingActive = useMemo(() =>
    pendingPurchases.filter(p => !p.decided),
    [pendingPurchases]
  );

  const pendingDecided = useMemo(() =>
    pendingPurchases.filter(p => p.decided).slice(0, 10),
    [pendingPurchases]
  );

  const formatHours = (h: number): string => {
    if (h < 1) return `${Math.round(h * 60)} minut`;
    const hrs = Math.floor(h);
    const mins = Math.round((h - hrs) * 60);
    if (mins === 0) return `${hrs} hod`;
    return `${hrs} hod ${mins} min`;
  };

  const formatDays = (h: number): string => {
    const days = h / 8;
    if (days < 1) return '';
    return `(${days.toFixed(1)} prac. dní)`;
  };

  const getTimeRemaining = (expiresAt: number): string => {
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) return 'Čas vypršel';
    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  const bg = isDarkMode ? '#0F1119' : '#F5F6FA';
  const cardBg = isDarkMode ? '#1A1D2E' : '#FFFFFF';
  const textPrimary = isDarkMode ? '#F0F0F5' : '#1A1B2E';
  const textSecondary = isDarkMode ? '#8B8FA3' : '#6B7084';
  const accent = '#10B981';
  const accentLight = isDarkMode ? '#10B98120' : '#10B98115';
  const warning = '#F59E0B';
  const danger = '#EF4444';
  const inputBg = isDarkMode ? '#252840' : '#F0F1F5';
  const borderColor = isDarkMode ? '#2A2D42' : '#E5E7EB';

  const renderSectionTabs = () => (
    <View style={[styles.sectionTabs, { backgroundColor: inputBg }]}>
      {([
        { key: 'calculator' as const, label: 'Kalkulačka', icon: CircleDollarSign },
        { key: 'pending' as const, label: `Čeká (${pendingActive.length})`, icon: Hourglass },
        { key: 'envelopes' as const, label: 'Obálky', icon: Mail },
      ]).map(tab => {
        const isActive = activeSection === tab.key;
        const Icon = tab.icon;
        return (
          <TouchableOpacity
            key={tab.key}
            testID={`tab-${tab.key}`}
            style={[
              styles.sectionTab,
              isActive && { backgroundColor: accent },
            ]}
            onPress={() => {
              setActiveSection(tab.key);
              if (tab.key === 'envelopes' && !envelopesInitialized) {
                initEnvelopes();
              }
            }}
            activeOpacity={0.7}
          >
            <Icon size={16} color={isActive ? '#FFF' : textSecondary} />
            <Text style={[
              styles.sectionTabText,
              { color: isActive ? '#FFF' : textSecondary },
            ]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderPurpose = () => (
    <View style={[styles.purposeCard, { backgroundColor: cardBg, borderColor }]} testID="purpose-card">
      <View style={styles.purposeHeader}>
        <View style={[styles.iconCircle, { backgroundColor: accentLight }]}>
          <ShieldCheck size={20} color={accent} />
        </View>
        <View style={styles.purposeContent}>
          <Text style={[styles.purposeTitle, { color: textPrimary }]}>Účel</Text>
          <Text style={[styles.purposeSubtitle, { color: textSecondary }]}>
            Behaviorální filtr mezi „chci to“ a „koupit“
          </Text>
        </View>
      </View>
      {[
        'Převod ceny na čas, který musíš odpracovat',
        'Simulace budoucí hodnoty investice',
        'Rozhodovací pauza 24h',
        'Gamifikovaná výzva 100 obálek',
      ].map((item, index) => (
        <View key={item} style={styles.purposeRow}>
          <View style={[styles.purposeDot, { backgroundColor: accent }]} />
          <Text style={[styles.purposeText, { color: textSecondary }]}> {index + 1}. {item}</Text>
        </View>
      ))}
    </View>
  );

  const renderCalculator = () => (
    <View>
      <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
        <View style={styles.cardHeader}>
          <View style={[styles.iconCircle, { backgroundColor: accentLight }]}>
            <Banknote size={20} color={accent} />
          </View>
          <Text style={[styles.cardTitle, { color: textPrimary }]}>Měsíční příjem</Text>
        </View>
        <View style={styles.incomeRow}>
          <TextInput
            testID="income-input"
            style={[styles.input, styles.incomeInput, { backgroundColor: inputBg, color: textPrimary, borderColor }]}
            placeholder="Např. 40000"
            placeholderTextColor={textSecondary}
            value={incomeInput}
            onChangeText={setIncomeInput}
            keyboardType="numeric"
            onBlur={handleIncomeSubmit}
            onSubmitEditing={handleIncomeSubmit}
          />
          <Text style={[styles.currencyLabel, { color: textSecondary }]}>{currencyInfo.symbol}/měsíc</Text>
        </View>
        {wage > 0 && (
          <Text style={[styles.wageInfo, { color: accent }]}>
            Hodinová mzda: {Math.round(wage)} {currencyInfo.symbol}/hod
          </Text>
        )}
      </View>

      <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
        <View style={styles.cardHeader}>
          <View style={[styles.iconCircle, { backgroundColor: '#F59E0B15' }]}>
            <ShoppingBag size={20} color={warning} />
          </View>
          <Text style={[styles.cardTitle, { color: textPrimary }]}>Co chceš koupit?</Text>
        </View>
        <TextInput
          testID="item-name-input"
          style={[styles.input, { backgroundColor: inputBg, color: textPrimary, borderColor }]}
          placeholder="Název věci (např. iPhone, boty...)"
          placeholderTextColor={textSecondary}
          value={itemName}
          onChangeText={setItemName}
        />
        <View style={styles.priceRow}>
          <TextInput
            testID="item-price-input"
            style={[styles.input, styles.priceInput, { backgroundColor: inputBg, color: textPrimary, borderColor }]}
            placeholder="Cena"
            placeholderTextColor={textSecondary}
            value={itemPrice}
            onChangeText={setItemPrice}
            keyboardType="numeric"
          />
          <Text style={[styles.currencyLabel, { color: textSecondary }]}>{currencyInfo.symbol}</Text>
        </View>

        <TouchableOpacity
          testID="calculate-btn"
          style={styles.calculateBtn}
          onPress={handleCalculate}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={['#10B981', '#059669']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.calculateGradient}
          >
            <Clock size={18} color="#FFF" />
            <Text style={styles.calculateText}>Spočítat hodnotu času</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {showResult && price > 0 && wage > 0 && (
        <Animated.View style={{
          opacity: resultAnim,
          transform: [{ scale: resultAnim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }],
        }}>
          <View style={[styles.resultCard, { borderColor: accent }]}>
            <LinearGradient
              colors={isDarkMode ? ['#10B98115', '#0F1119'] : ['#10B98110', '#FFFFFF']}
              style={styles.resultGradient}
            >
              <View style={styles.resultHeader}>
                <AlertTriangle size={22} color={warning} />
                <Text style={[styles.resultTitle, { color: textPrimary }]}>
                  Opravdu to za to stojí?
                </Text>
              </View>

              <View style={[styles.resultBlock, { backgroundColor: inputBg }]}>
                <Clock size={24} color={accent} />
                <View style={styles.resultBlockContent}>
                  <Text style={[styles.resultLabel, { color: textSecondary }]}>
                    Musíš pracovat
                  </Text>
                  <Text style={[styles.resultValue, { color: textPrimary }]}>
                    {formatHours(hoursNeeded)}
                  </Text>
                  {hoursNeeded >= 8 && (
                    <Text style={[styles.resultSubvalue, { color: textSecondary }]}>
                      {formatDays(hoursNeeded)}
                    </Text>
                  )}
                </View>
              </View>

              <View style={[styles.resultBlock, { backgroundColor: inputBg }]}>
                <TrendingUp size={24} color="#8B5CF6" />
                <View style={styles.resultBlockContent}>
                  <Text style={[styles.resultLabel, { color: textSecondary }]}>
                    Investicí by to za {years} let bylo
                  </Text>
                  <Text style={[styles.resultValue, { color: '#8B5CF6' }]}>
                    {Math.round(futureValue).toLocaleString('cs-CZ')} {currencyInfo.symbol}
                  </Text>
                  <Text style={[styles.resultSubvalue, { color: textSecondary }]}>
                    +{Math.round(futureValue - price).toLocaleString('cs-CZ')} {currencyInfo.symbol} zisk
                  </Text>
                </View>
              </View>

              <View style={styles.investParams}>
                <View style={styles.investParamItem}>
                  <Text style={[styles.investParamLabel, { color: textSecondary }]}>Výnos %/rok</Text>
                  <TextInput
                    style={[styles.investParamInput, { backgroundColor: inputBg, color: textPrimary, borderColor }]}
                    value={investReturn}
                    onChangeText={setInvestReturn}
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.investParamItem}>
                  <Text style={[styles.investParamLabel, { color: textSecondary }]}>Počet let</Text>
                  <TextInput
                    style={[styles.investParamInput, { backgroundColor: inputBg, color: textPrimary, borderColor }]}
                    value={investYears}
                    onChangeText={setInvestYears}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <TouchableOpacity
                testID="think-btn"
                style={[styles.thinkBtn, { backgroundColor: warning + '15', borderColor: warning }]}
                onPress={handleThinkAboutIt}
                activeOpacity={0.7}
              >
                <Pause size={18} color={warning} />
                <Text style={[styles.thinkBtnText, { color: warning }]}>
                  Rozmyslet si to (24h pauza)
                </Text>
              </TouchableOpacity>
            </LinearGradient>
          </View>
        </Animated.View>
      )}
    </View>
  );

  const renderPending = () => (
    <View>
      {pendingActive.length === 0 && pendingDecided.length === 0 && (
        <View style={[styles.emptyState, { backgroundColor: cardBg, borderColor }]}>
          <Hourglass size={48} color={textSecondary} />
          <Text style={[styles.emptyTitle, { color: textPrimary }]}>
            Žádné čekající nákupy
          </Text>
          <Text style={[styles.emptySubtitle, { color: textSecondary }]}>
            Použij kalkulačku a přidej nákup k rozmyšlení
          </Text>
        </View>
      )}

      {pendingActive.length > 0 && (
        <View style={styles.pendingSection}>
          <Text style={[styles.pendingSectionTitle, { color: textPrimary }]}>
            Čeká na rozhodnutí
          </Text>
          {pendingActive.map(purchase => {
            const timeLeft = getTimeRemaining(purchase.expiresAt);
            const expired = purchase.expiresAt <= Date.now();
            return (
              <View key={purchase.id} style={[styles.pendingCard, { backgroundColor: cardBg, borderColor }]}>
                <View style={styles.pendingCardHeader}>
                  <View style={styles.pendingCardInfo}>
                    <Text style={[styles.pendingName, { color: textPrimary }]}>
                      {purchase.name}
                    </Text>
                    <Text style={[styles.pendingPrice, { color: accent }]}>
                      {purchase.price.toLocaleString('cs-CZ')} {currencyInfo.symbol}
                    </Text>
                  </View>
                  <View style={[styles.timerBadge, { backgroundColor: expired ? danger + '15' : warning + '15' }]}>
                    <Timer size={14} color={expired ? danger : warning} />
                    <Text style={[styles.timerText, { color: expired ? danger : warning }]}>
                      {timeLeft}
                    </Text>
                  </View>
                </View>
                {wage > 0 && (
                  <Text style={[styles.pendingWorkTime, { color: textSecondary }]}>
                    = {formatHours(purchase.price / wage)} práce
                  </Text>
                )}
                <View style={styles.pendingActions}>
                  <TouchableOpacity
                    style={[styles.pendingActionBtn, { backgroundColor: danger + '12', borderColor: danger + '30' }]}
                    onPress={() => decidePurchase(purchase.id, false)}
                    activeOpacity={0.7}
                  >
                    <X size={16} color={danger} />
                    <Text style={[styles.pendingActionText, { color: danger }]}>Nekupovat</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.pendingActionBtn, { backgroundColor: accent + '12', borderColor: accent + '30' }]}
                    onPress={() => decidePurchase(purchase.id, true)}
                    activeOpacity={0.7}
                  >
                    <Check size={16} color={accent} />
                    <Text style={[styles.pendingActionText, { color: accent }]}>Koupil/a jsem</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {pendingDecided.length > 0 && (
        <View style={styles.pendingSection}>
          <Text style={[styles.pendingSectionTitle, { color: textSecondary }]}>
            Rozhodnuto
          </Text>
          {pendingDecided.map(purchase => (
            <View key={purchase.id} style={[styles.decidedCard, { backgroundColor: cardBg, borderColor }]}>
              <View style={[
                styles.decidedDot,
                { backgroundColor: purchase.bought ? danger : accent },
              ]} />
              <View style={styles.decidedInfo}>
                <Text style={[styles.decidedName, { color: textPrimary }]}>
                  {purchase.name}
                </Text>
                <Text style={[styles.decidedPrice, { color: textSecondary }]}>
                  {purchase.price.toLocaleString('cs-CZ')} {currencyInfo.symbol}
                </Text>
              </View>
              <Text style={[styles.decidedStatus, { color: purchase.bought ? danger : accent }]}>
                {purchase.bought ? 'Koupeno' : 'Ušetřeno'}
              </Text>
              <TouchableOpacity
                onPress={() => removePurchase(purchase.id)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={16} color={textSecondary} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {pendingDecided.length > 0 && (
        <View style={[styles.savedSummary, { backgroundColor: accent + '12', borderColor: accent + '30' }]}>
          <ShieldCheck size={20} color={accent} />
          <Text style={[styles.savedSummaryText, { color: accent }]}>
            Ušetřeno celkem: {pendingDecided.filter(p => !p.bought).reduce((s, p) => s + p.price, 0).toLocaleString('cs-CZ')} {currencyInfo.symbol}
          </Text>
        </View>
      )}
    </View>
  );

  const renderEnvelopes = () => {
    if (!envelopesInitialized) {
      return (
        <View style={[styles.emptyState, { backgroundColor: cardBg, borderColor }]}>
          <Mail size={48} color={accent} />
          <Text style={[styles.emptyTitle, { color: textPrimary }]}>
            Výzva 100 obálek
          </Text>
          <Text style={[styles.emptySubtitle, { color: textSecondary }]}>
            Gamifikovaný způsob spoření. Každá obálka obsahuje náhodnou částku od 10 do 1000 {currencyInfo.symbol}. Otevři obálku a ulož danou částku.
          </Text>
          <TouchableOpacity
            style={styles.startEnvelopesBtn}
            onPress={initEnvelopes}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={['#10B981', '#059669']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.startEnvelopeGradient}
            >
              <Sparkles size={18} color="#FFF" />
              <Text style={styles.startEnvelopeText}>Začít výzvu</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View>
        <View style={[styles.envelopeStats, { backgroundColor: cardBg, borderColor }]}>
          <View style={styles.envelopeStatItem}>
            <Text style={[styles.envelopeStatValue, { color: accent }]}>
              {envelopeStats.completedCount}/100
            </Text>
            <Text style={[styles.envelopeStatLabel, { color: textSecondary }]}>Splněno</Text>
          </View>
          <View style={[styles.envelopeStatDivider, { backgroundColor: borderColor }]} />
          <View style={styles.envelopeStatItem}>
            <Text style={[styles.envelopeStatValue, { color: textPrimary }]}>
              {envelopeStats.totalSaved.toLocaleString('cs-CZ')} {currencyInfo.symbol}
            </Text>
            <Text style={[styles.envelopeStatLabel, { color: textSecondary }]}>Ušetřeno</Text>
          </View>
          <View style={[styles.envelopeStatDivider, { backgroundColor: borderColor }]} />
          <View style={styles.envelopeStatItem}>
            <Text style={[styles.envelopeStatValue, { color: textSecondary }]}>
              {envelopeStats.totalPossible.toLocaleString('cs-CZ')} {currencyInfo.symbol}
            </Text>
            <Text style={[styles.envelopeStatLabel, { color: textSecondary }]}>Cíl</Text>
          </View>
        </View>

        <View style={[styles.progressBarContainer, { backgroundColor: inputBg }]}>
          <View style={[
            styles.progressBar,
            {
              backgroundColor: accent,
              width: `${(envelopeStats.completedCount / 100) * 100}%` as any,
            },
          ]} />
        </View>

        <View style={styles.envelopeGrid}>
          {envelopes.map((env, idx) => (
            <TouchableOpacity
              key={idx}
              testID={`envelope-${idx}`}
              style={[
                styles.envelope,
                {
                  backgroundColor: env.completed ? accent + '20' : cardBg,
                  borderColor: env.completed ? accent : borderColor,
                },
              ]}
              onPress={() => handleEnvelopeTap(idx)}
              activeOpacity={env.completed ? 1 : 0.7}
              disabled={env.completed}
            >
              {env.completed ? (
                <Check size={14} color={accent} />
              ) : (
                <Text style={[styles.envelopeNumber, { color: textSecondary }]}>
                  {idx + 1}
                </Text>
              )}
              <Text style={[
                styles.envelopeAmount,
                { color: env.completed ? accent : textPrimary },
              ]}>
                {env.amount}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.resetBtn, { borderColor: danger + '40' }]}
          onPress={() => {
            Alert.alert(
              'Reset výzvy',
              'Opravdu chceš resetovat všechny obálky? Postup bude ztracen.',
              [
                { text: 'Zrušit', style: 'cancel' },
                { text: 'Resetovat', style: 'destructive', onPress: resetEnvelopes },
              ]
            );
          }}
          activeOpacity={0.7}
        >
          <RotateCcw size={16} color={danger} />
          <Text style={[styles.resetBtnText, { color: danger }]}>Resetovat výzvu</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <LinearGradient
        colors={isDarkMode ? ['#10B98125', '#0F1119'] : ['#10B98112', '#F5F6FA']}
        style={styles.headerGradient}
      >
        <View style={styles.headerContent}>
          <View>
            <Text style={[styles.headerTitle, { color: textPrimary }]}>Ušetři</Text>
            <Text style={[styles.headerSubtitle, { color: textSecondary }]}>
              Rozmysli si to, než utratíš
            </Text>
          </View>
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <View style={[styles.headerIcon, { backgroundColor: accent + '20' }]}>
              <ShieldCheck size={26} color={accent} />
            </View>
          </Animated.View>
        </View>
      </LinearGradient>

      {renderSectionTabs()}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {renderPurpose()}
        {activeSection === 'calculator' && renderCalculator()}
        {activeSection === 'pending' && renderPending()}
        {activeSection === 'envelopes' && renderEnvelopes()}
      </ScrollView>

      <Modal
        visible={showEnvelopeModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEnvelopeModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: cardBg }]}>
            <View style={[styles.modalIconCircle, { backgroundColor: accent + '20' }]}>
              <Mail size={32} color={accent} />
            </View>
            <Text style={[styles.modalTitle, { color: textPrimary }]}>
              Obálka #{selectedEnvelopeIdx + 1}
            </Text>
            {selectedEnvelopeIdx >= 0 && envelopes[selectedEnvelopeIdx] && (
              <Text style={[styles.modalAmount, { color: accent }]}>
                {envelopes[selectedEnvelopeIdx].amount} {currencyInfo.symbol}
              </Text>
            )}
            <Text style={[styles.modalDesc, { color: textSecondary }]}>
              Ulož tuto částku stranou. Splníš tím tuto obálku!
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: inputBg }]}
                onPress={() => setShowEnvelopeModal(false)}
              >
                <Text style={[styles.modalBtnText, { color: textSecondary }]}>Zrušit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: accent }]}
                onPress={confirmEnvelope}
              >
                <Text style={[styles.modalBtnText, { color: '#FFF' }]}>Splněno!</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerGradient: {
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800' as const,
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  headerIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  sectionTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 11,
    gap: 5,
  },
  sectionTabText: {
    fontSize: 12,
    fontWeight: '600' as const,
  },
  purposeCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
  },
  purposeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  purposeContent: {
    marginLeft: 10,
    flex: 1,
  },
  purposeTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    marginBottom: 2,
  },
  purposeSubtitle: {
    fontSize: 12,
  },
  purposeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  purposeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 8,
  },
  purposeText: {
    fontSize: 12,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 10,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
  },
  incomeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  incomeInput: {
    flex: 1,
  },
  currencyLabel: {
    fontSize: 14,
    fontWeight: '500' as const,
  },
  wageInfo: {
    fontSize: 13,
    fontWeight: '600' as const,
    marginTop: 10,
  },
  input: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    borderWidth: 1,
    marginBottom: 10,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  priceInput: {
    flex: 1,
    marginBottom: 0,
  },
  calculateBtn: {
    marginTop: 14,
    borderRadius: 14,
    overflow: 'hidden',
  },
  calculateGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  calculateText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700' as const,
  },
  resultCard: {
    borderRadius: 18,
    borderWidth: 1.5,
    overflow: 'hidden',
    marginBottom: 14,
  },
  resultGradient: {
    padding: 20,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 18,
  },
  resultTitle: {
    fontSize: 18,
    fontWeight: '800' as const,
  },
  resultBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 14,
    gap: 14,
    marginBottom: 10,
  },
  resultBlockContent: {
    flex: 1,
  },
  resultLabel: {
    fontSize: 12,
    fontWeight: '500' as const,
    marginBottom: 2,
  },
  resultValue: {
    fontSize: 22,
    fontWeight: '800' as const,
  },
  resultSubvalue: {
    fontSize: 13,
    marginTop: 2,
  },
  investParams: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    marginBottom: 14,
  },
  investParamItem: {
    flex: 1,
  },
  investParamLabel: {
    fontSize: 12,
    marginBottom: 4,
    fontWeight: '500' as const,
  },
  investParamInput: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    borderWidth: 1,
    textAlign: 'center' as const,
    fontWeight: '600' as const,
  },
  thinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
  },
  thinkBtnText: {
    fontSize: 15,
    fontWeight: '700' as const,
  },
  emptyState: {
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    marginTop: 16,
    textAlign: 'center' as const,
  },
  emptySubtitle: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center' as const,
    lineHeight: 20,
  },
  pendingSection: {
    marginBottom: 16,
  },
  pendingSectionTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    marginBottom: 10,
  },
  pendingCard: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
  },
  pendingCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  pendingCardInfo: {
    flex: 1,
  },
  pendingName: {
    fontSize: 16,
    fontWeight: '700' as const,
  },
  pendingPrice: {
    fontSize: 18,
    fontWeight: '800' as const,
    marginTop: 4,
  },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 4,
  },
  timerText: {
    fontSize: 12,
    fontWeight: '600' as const,
  },
  pendingWorkTime: {
    fontSize: 13,
    marginTop: 6,
  },
  pendingActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  pendingActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 6,
  },
  pendingActionText: {
    fontSize: 13,
    fontWeight: '600' as const,
  },
  decidedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    gap: 10,
  },
  decidedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  decidedInfo: {
    flex: 1,
  },
  decidedName: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  decidedPrice: {
    fontSize: 12,
    marginTop: 2,
  },
  decidedStatus: {
    fontSize: 12,
    fontWeight: '700' as const,
  },
  savedSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  savedSummaryText: {
    fontSize: 14,
    fontWeight: '700' as const,
  },
  envelopeStats: {
    flexDirection: 'row',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
  },
  envelopeStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  envelopeStatValue: {
    fontSize: 16,
    fontWeight: '800' as const,
  },
  envelopeStatLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  envelopeStatDivider: {
    width: 1,
    height: '80%' as any,
    alignSelf: 'center' as const,
  },
  progressBarContainer: {
    height: 6,
    borderRadius: 3,
    marginBottom: 16,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%' as any,
    borderRadius: 3,
  },
  envelopeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  envelope: {
    width: '18%' as any,
    aspectRatio: 1,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  envelopeNumber: {
    fontSize: 10,
    fontWeight: '500' as const,
  },
  envelopeAmount: {
    fontSize: 11,
    fontWeight: '700' as const,
  },
  startEnvelopesBtn: {
    marginTop: 20,
    borderRadius: 14,
    overflow: 'hidden',
    width: '100%' as any,
  },
  startEnvelopeGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  startEnvelopeText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700' as const,
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  resetBtnText: {
    fontSize: 13,
    fontWeight: '600' as const,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  modalContent: {
    borderRadius: 20,
    padding: 28,
    width: '100%',
    alignItems: 'center',
  },
  modalIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800' as const,
  },
  modalAmount: {
    fontSize: 36,
    fontWeight: '900' as const,
    marginTop: 8,
  },
  modalDesc: {
    fontSize: 14,
    textAlign: 'center' as const,
    marginTop: 8,
    lineHeight: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
    width: '100%',
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalBtnText: {
    fontSize: 15,
    fontWeight: '700' as const,
  },
});
