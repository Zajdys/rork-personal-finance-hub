import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
  Modal,
  Pressable,
} from 'react-native';
import { Stack } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  Home,
  Car,
  DollarSign,
  GraduationCap,
  CreditCard,
  Palette,
  Lock,
  Calendar,
  ChevronDown,
  ChevronUp,
} from 'lucide-react-native';
import { useFinanceStore, LoanType } from '@/store/finance-store';
import { useSettingsStore } from '@/store/settings-store';
import { useLanguageStore } from '@/store/language-store';
import { formatDateCs, fixationEndFromYears, monthlyPaymentAmortizing, monthlyPaymentDiffersOverOnePercent, resolvePaidMonths, resolveRemainingMonths } from '@/lib/loan-math';
import { parseDecimalInput, parseMoneyInput } from '@/lib/parse-money-input';
import { BackButton } from '@/components/BackButton';
import { AsyncButton } from '@/components/AsyncButton';
import { useAsyncAction } from '@/hooks/use-async-action';
import { safeReplace } from '@/lib/safe-navigate';

export default function AddLoanScreen() {
  const { addLoan } = useFinanceStore();
  const { isDarkMode, getCurrentCurrency } = useSettingsStore();
  const { t } = useLanguageStore();
  const currentCurrency = getCurrentCurrency();

  const [loanType, setLoanType] = useState<LoanType>('personal');
  const [name, setName] = useState<string>('');
  const [loanAmount, setLoanAmount] = useState<string>('');
  const [downPayment, setDownPayment] = useState<string>('');
  const [interestRate, setInterestRate] = useState<string>('');
  const [termMonths, setTermMonths] = useState<string>('');
  /** Ruční splátka; prázdné = použij vypočtenou. */
  const [monthlyPaymentManual, setMonthlyPaymentManual] = useState<string>('');
  const [startDate, setStartDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    return d;
  });
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [fixedEndPickerVisible, setFixedEndPickerVisible] = useState(false);
  const [selectedColor, setSelectedColor] = useState<string>('#3B82F6');
  const [selectedEmoji, setSelectedEmoji] = useState<string>('💰');
  const [isFixed, setIsFixed] = useState<boolean>(false);
  const [fixedYears, setFixedYears] = useState<string>('');
  const [currentBalance, setCurrentBalance] = useState<string>('');
  const [fixationStartDate, setFixationStartDate] = useState<string>('');
  const [fixedEndDate, setFixedEndDate] = useState<Date | null>(null);
  /** true = uživatel zvolil konkrétní datum (picker); false = z let */
  const [fixedEndManual, setFixedEndManual] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const loanTypes = useMemo(
    () => [
      { type: 'mortgage' as LoanType, label: t('addLoan.typeMortgage'), icon: Home, color: '#10B981' },
      { type: 'car' as LoanType, label: t('addLoan.typeCar'), icon: Car, color: '#3B82F6' },
      { type: 'personal' as LoanType, label: t('addLoan.typePersonal'), icon: DollarSign, color: '#8B5CF6' },
      { type: 'student' as LoanType, label: t('addLoan.typeStudent'), icon: GraduationCap, color: '#F59E0B' },
      { type: 'other' as LoanType, label: t('addLoan.typeOther'), icon: CreditCard, color: '#6B7280' },
    ],
    [t],
  );

  const availableColors = [
    '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6',
    '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
  ];

  const availableEmojis = [
    '💰', '🏠', '🚗', '🎓', '💳', '📱', '🏦', '💵',
    '🏡', '🚙', '📚', '🎯', '💎', '🔑', '🏢', '🛒',
  ];

  const numLoanAmount = useMemo(() => parseMoneyInput(loanAmount) ?? 0, [loanAmount]);
  const numDownPayment = useMemo(() => {
    if (!downPayment.trim()) return 0;
    return Math.max(0, parseMoneyInput(downPayment) ?? 0);
  }, [downPayment]);
  const numPrincipal = useMemo(
    () => Math.max(0, numLoanAmount - numDownPayment),
    [numLoanAmount, numDownPayment]
  );
  const numInterestRate = useMemo(() => parseDecimalInput(interestRate, 4) ?? 0, [interestRate]);
  const numTermMonths = useMemo(() => parseInt(termMonths, 10), [termMonths]);

  const computedMonthlyPayment = useMemo(() => {
    if (numPrincipal <= 0 || numTermMonths <= 0) return 0;
    return monthlyPaymentAmortizing(numPrincipal, numInterestRate, numTermMonths);
  }, [numPrincipal, numInterestRate, numTermMonths]);

  const numManualPayment = useMemo(() => {
    if (!monthlyPaymentManual.trim()) return null;
    const p = parseMoneyInput(monthlyPaymentManual);
    return p != null && p > 0 ? p : null;
  }, [monthlyPaymentManual]);

  const effectiveMonthlyPayment = numManualPayment ?? computedMonthlyPayment;

  const showPaymentMismatchHint = useMemo(
    () =>
      numManualPayment != null &&
      monthlyPaymentDiffersOverOnePercent(numManualPayment, computedMonthlyPayment),
    [numManualPayment, computedMonthlyPayment],
  );

  const loanTotals = useMemo(() => {
    if (numPrincipal <= 0 || numTermMonths <= 0 || effectiveMonthlyPayment <= 0) {
      return { totalPaid: 0, totalInterest: 0 };
    }
    const totalPaid = effectiveMonthlyPayment * numTermMonths;
    const totalInterest = Math.max(0, totalPaid - numPrincipal);
    return { totalPaid, totalInterest };
  }, [numPrincipal, numTermMonths, effectiveMonthlyPayment]);

  const selectLoanType = (type: LoanType) => {
    setLoanType(type);
    if (type === 'mortgage' && (selectedEmoji === '💰' || !selectedEmoji)) {
      setSelectedEmoji('🏠');
    }
  };

  const onDateChange = (_event: unknown, date?: Date) => {
    if (Platform.OS === 'android') {
      setDatePickerVisible(false);
    }
    if (date) {
      const d = new Date(date);
      d.setHours(12, 0, 0, 0);
      setStartDate(d);
    }
  };

  const closeDatePicker = () => setDatePickerVisible(false);

  const { run: handleSubmit } = useAsyncAction(async () => {
    if (!loanAmount || !interestRate || !termMonths) {
      Alert.alert(t('error'), t('addLoan.fillRequired'));
      return;
    }

    if (numPrincipal <= 0 || numTermMonths <= 0) {
      Alert.alert(
        t('error'),
        t('addLoan.principalMustBePositive')
      );
      return;
    }
    if (numDownPayment > numLoanAmount) {
      Alert.alert(t('error'), t('addLoan.downPaymentTooLarge'));
      return;
    }

    if (numInterestRate < 0) {
      Alert.alert(t('error'), t('addLoan.invalidRate'));
      return;
    }

    const numCurrentBalance = parseMoneyInput(currentBalance);

    let resolvedFixedEnd: Date | undefined =
      fixedEndDate && !Number.isNaN(fixedEndDate.getTime()) ? fixedEndDate : undefined;
    let parsedFixationStartDate: Date | undefined = undefined;
    if (fixationStartDate.trim()) {
      const d = new Date(fixationStartDate);
      if (!Number.isNaN(d.getTime())) parsedFixationStartDate = d;
    }
    const numFixedYears = fixedYears ? parseInt(fixedYears, 10) : NaN;
    if (
      Number.isFinite(numFixedYears) &&
      numFixedYears > 0 &&
      (!resolvedFixedEnd || !fixedEndManual)
    ) {
      const base = parsedFixationStartDate ? new Date(parsedFixationStartDate) : new Date(startDate);
      resolvedFixedEnd = fixationEndFromYears(base, numFixedYears);
    }
    const effectiveIsFixed = Boolean(isFixed || resolvedFixedEnd);
    if (!effectiveIsFixed) {
      resolvedFixedEnd = undefined;
      parsedFixationStartDate = undefined;
    }

    const M = Math.round(effectiveMonthlyPayment * 100) / 100;
    const paid = resolvePaidMonths({
      startDate,
      termMonths: numTermMonths,
    });
    const remainingMonths = resolveRemainingMonths(numTermMonths, paid);

    const newLoan = {
      id: Date.now().toString(),
      loanType,
      name: name.trim() || undefined,
      loanAmount: numPrincipal,
      interestRate: numInterestRate,
      monthlyPayment: M,
      termMonths: numTermMonths,
      remainingMonths,
      startDate,
      color: selectedColor,
      emoji: loanType === 'mortgage' && selectedEmoji === '💰' ? '🏠' : selectedEmoji,
      isFixed: effectiveIsFixed,
      fixedYears:
        effectiveIsFixed && Number.isFinite(numFixedYears) && numFixedYears > 0
          ? numFixedYears
          : undefined,
      fixedEndDate: effectiveIsFixed ? resolvedFixedEnd : undefined,
      fixationStartDate: effectiveIsFixed ? parsedFixationStartDate : undefined,
      currentBalance:
        numCurrentBalance != null && Number.isFinite(numCurrentBalance)
          ? numCurrentBalance
          : undefined,
      downPayment: numDownPayment > 0 ? numDownPayment : undefined,
    };

    addLoan(newLoan);
    safeReplace(`/loan-detail?id=${newLoan.id}`);
  });

  const subtle = isDarkMode ? '#9CA3AF' : '#6B7280' as const;
  const primary = isDarkMode ? 'white' : '#1F2937' as const;

  return (
    <View style={[styles.container, { backgroundColor: isDarkMode ? '#111827' : '#F8FAFC' }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <LinearGradient
        colors={['#667eea', '#764ba2']}
        style={styles.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.headerContent}>
          <BackButton color="white" size={24} style={styles.headerBackButton} />
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>{t('addLoan.title')}</Text>
            <Text style={styles.headerSubtitle}>{t('addLoan.subtitle')}</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: primary }]}>{t('addLoan.loanType')}</Text>
            <View style={styles.loanTypesGrid}>
              {loanTypes.map((type) => {
                const Icon = type.icon;
                const isSelected = loanType === type.type;
                return (
                  <TouchableOpacity
                    key={type.type}
                    style={[
                      styles.loanTypeCard,
                      { backgroundColor: isDarkMode ? '#374151' : 'white' },
                      isSelected && { borderColor: type.color, borderWidth: 2 },
                    ]}
                    onPress={() => selectLoanType(type.type)}
                  >
                    <View
                      style={[
                        styles.loanTypeIcon,
                        {
                          backgroundColor: isSelected
                            ? type.color + '20'
                            : isDarkMode
                              ? '#4B5563'
                              : '#F3F4F6',
                        },
                      ]}
                    >
                      <Icon color={isSelected ? type.color : '#6B7280'} size={24} />
                    </View>
                    <Text
                      style={[
                        styles.loanTypeLabel,
                        { color: isSelected ? type.color : isDarkMode ? '#D1D5DB' : '#6B7280' },
                      ]}
                    >
                      {type.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: primary }]}>{t('addLoan.nameOptional')}</Text>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: isDarkMode ? '#374151' : 'white', color: primary },
              ]}
              value={name}
              onChangeText={setName}
              placeholder={t('addLoan.namePlaceholder')}
              placeholderTextColor={subtle}
            />
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: primary }]}>{t('addLoan.principal')}</Text>
            <View style={styles.inputWithCurrency}>
              <TextInput
                style={[
                  styles.input,
                  styles.inputFlex,
                  { backgroundColor: isDarkMode ? '#374151' : 'white', color: primary },
                ]}
                value={loanAmount}
                onChangeText={setLoanAmount}
                placeholder="0"
                keyboardType="decimal-pad"
                placeholderTextColor={subtle}
              />
              <Text style={[styles.currencyLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                {currentCurrency.symbol}
              </Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: primary }]}>{t('addLoan.downPayment')}</Text>
            <View style={styles.inputWithCurrency}>
              <TextInput
                style={[
                  styles.input,
                  styles.inputFlex,
                  { backgroundColor: isDarkMode ? '#374151' : 'white', color: primary },
                ]}
                value={downPayment}
                onChangeText={setDownPayment}
                placeholder="0"
                keyboardType="decimal-pad"
                placeholderTextColor={subtle}
              />
              <Text style={[styles.currencyLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                {currentCurrency.symbol}
              </Text>
            </View>
            <Text style={[styles.helperText, { color: subtle }]}>
              {t('addLoan.downPaymentHint')}
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: primary }]}>{t('addLoan.interestRate')}</Text>
            <View style={styles.inputWithCurrency}>
              <TextInput
                style={[
                  styles.input,
                  styles.inputFlex,
                  { backgroundColor: isDarkMode ? '#374151' : 'white', color: primary },
                ]}
                value={interestRate}
                onChangeText={setInterestRate}
                placeholder="0"
                keyboardType="decimal-pad"
                placeholderTextColor={subtle}
              />
              <Text style={[styles.currencyLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>%</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: primary }]}>{t('addLoan.termMonths')}</Text>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: isDarkMode ? '#374151' : 'white', color: primary },
              ]}
              value={termMonths}
              onChangeText={setTermMonths}
              placeholder={t('addLoan.termPlaceholder')}
              keyboardType="number-pad"
              placeholderTextColor={subtle}
            />
            {numPrincipal > 0 && numTermMonths > 0 && (
              <Text style={[styles.livePaymentHint, { color: subtle }]}>
                {t('addLoan.monthlyPreview')}{' '}
                <Text style={{ color: primary, fontWeight: '700' }}>
                  {computedMonthlyPayment > 0
                    ? `${computedMonthlyPayment.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })} ${currentCurrency.symbol}`
                    : '—'}
                </Text>
              </Text>
            )}
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: primary }]}>{t('addLoan.monthlyPayment')}</Text>
            <View style={styles.inputWithCurrency}>
              <TextInput
                style={[
                  styles.input,
                  styles.inputFlex,
                  { backgroundColor: isDarkMode ? '#374151' : 'white', color: primary },
                ]}
                value={monthlyPaymentManual}
                onChangeText={setMonthlyPaymentManual}
                placeholder={
                  computedMonthlyPayment > 0
                    ? computedMonthlyPayment.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })
                    : t('addLoan.monthlyPaymentManualHint')
                }
                keyboardType="decimal-pad"
                placeholderTextColor={subtle}
              />
              <Text style={[styles.currencyLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                {currentCurrency.symbol}
              </Text>
            </View>
            {showPaymentMismatchHint ? (
              <Text style={[styles.helperText, { color: '#D97706' }]}>
                {t('addLoan.monthlyPaymentMismatchHint')}
              </Text>
            ) : (
              <Text style={[styles.helperText, { color: subtle }]}>
                {t('addLoan.monthlyPaymentManualHint')}
              </Text>
            )}
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: primary }]}>{t('addLoan.startDate')}</Text>
            <TouchableOpacity
              style={[
                styles.dateRow,
                { backgroundColor: isDarkMode ? '#374151' : 'white', borderColor: isDarkMode ? '#4B5563' : '#E2E8F0' },
              ]}
              onPress={() => setDatePickerVisible(true)}
              activeOpacity={0.8}
            >
              <Calendar color="#667eea" size={22} />
              <Text style={[styles.dateRowText, { color: primary }]}>{formatDateCs(startDate)}</Text>
              <Text style={[styles.dateRowHint, { color: subtle }]}>{t('addLoan.calendar')}</Text>
            </TouchableOpacity>
            <Text style={[styles.helperText, { color: subtle }]}>
              {t('addLoan.startDateHint')}
            </Text>
          </View>

          {Platform.OS === 'ios' && (
            <Modal transparent animationType="slide" visible={datePickerVisible}>
              <View style={styles.modalRoot}>
                <Pressable style={styles.modalBackdrop} onPress={closeDatePicker} />
                <View style={[styles.iosPickerCard, { backgroundColor: isDarkMode ? '#1F2937' : 'white' }]}>
                  <View style={styles.iosPickerHeader}>
                    <TouchableOpacity onPress={closeDatePicker}>
                      <Text style={styles.iosPickerDone}>{t('done')}</Text>
                    </TouchableOpacity>
                  </View>
                  <DateTimePicker
                    value={startDate}
                    mode="date"
                    display="spinner"
                    onChange={onDateChange}
                    maximumDate={new Date()}
                    style={{ height: 180 }}
                  />
                </View>
              </View>
            </Modal>
          )}

          {Platform.OS === 'web' && (
            <Modal transparent animationType="fade" visible={datePickerVisible}>
              <View style={styles.webDateModalRoot}>
                <Pressable style={styles.modalBackdrop} onPress={closeDatePicker} />
                <View style={[styles.webDateCard, { backgroundColor: isDarkMode ? '#1F2937' : 'white' }]}>
                  <Text style={[styles.webDateTitle, { color: primary }]}>{t('addLoan.selectDate')}</Text>
                  <DateTimePicker
                    value={startDate}
                    mode="date"
                    display="inline"
                    onChange={onDateChange}
                    maximumDate={new Date()}
                    style={{ minHeight: 340, alignSelf: 'stretch' as const }}
                  />
                  <TouchableOpacity style={styles.webDateDone} onPress={closeDatePicker} activeOpacity={0.9}>
                    <LinearGradient
                      colors={['#667eea', '#764ba2']}
                      style={styles.webDateDoneGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                    >
                      <Text style={styles.webDateDoneText}>{t('done')}</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </View>
            </Modal>
          )}

          {Platform.OS === 'android' && datePickerVisible && (
            <DateTimePicker
              value={startDate}
              mode="date"
              display="default"
              onChange={onDateChange}
              maximumDate={new Date()}
            />
          )}

          <TouchableOpacity
            style={[
              styles.advancedToggle,
              { backgroundColor: isDarkMode ? '#374151' : 'white', borderColor: isDarkMode ? '#4B5563' : '#E2E8F0' },
            ]}
            onPress={() => setAdvancedOpen((o) => !o)}
            activeOpacity={0.85}
          >
            <Text style={[styles.advancedToggleText, { color: primary }]}>{t('addLoan.advancedSettings')}</Text>
            {advancedOpen ? (
              <ChevronUp color={subtle} size={22} />
            ) : (
              <ChevronDown color={subtle} size={22} />
            )}
          </TouchableOpacity>

          {advancedOpen && (
            <View style={styles.advancedBody}>
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: primary }]}>{t('addLoan.currentBalance')}</Text>
                <View style={styles.inputWithCurrency}>
                  <TextInput
                    style={[
                      styles.input,
                      styles.inputFlex,
                      { backgroundColor: isDarkMode ? '#374151' : 'white', color: primary },
                    ]}
                    value={currentBalance}
                    onChangeText={setCurrentBalance}
                    placeholder={t('addLoan.currentBalancePlaceholder')}
                    keyboardType="decimal-pad"
                    placeholderTextColor={subtle}
                  />
                  <Text style={[styles.currencyLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                    {currentCurrency.symbol}
                  </Text>
                </View>
              </View>

              <View style={[styles.section, { marginBottom: 0 }]}>
                <Text style={[styles.sectionTitle, { color: primary }]}>{t('addLoan.rateFixation')}</Text>
                <TouchableOpacity
                  style={[
                    styles.fixedToggle,
                    { backgroundColor: isDarkMode ? '#1F2937' : '#F8FAFC' },
                    isFixed && { borderColor: '#667eea', borderWidth: 2 },
                  ]}
                  onPress={() => {
                    const next = !isFixed;
                    setIsFixed(next);
                    if (!next) {
                      setFixedEndDate(null);
                      setFixedYears('');
                      setFixationStartDate('');
                      setFixedEndManual(false);
                    }
                  }}
                >
                  <View style={styles.fixedToggleContent}>
                    <View
                      style={[
                        styles.fixedIcon,
                        { backgroundColor: isFixed ? '#667eea20' : isDarkMode ? '#4B5563' : '#F3F4F6' },
                      ]}
                    >
                      <Lock color={isFixed ? '#667eea' : '#6B7280'} size={20} />
                    </View>
                    <View style={styles.fixedTextContainer}>
                      <Text style={[styles.fixedLabel, { color: primary }]}>{t('addLoan.fixedRate')}</Text>
                      <Text style={[styles.fixedDescription, { color: subtle }]}>
                        {isFixed ? t('addLoan.enabled') : t('addLoan.disabled')}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
                {isFixed && (
                  <View style={styles.fixedYearsContainer}>
                    <Text style={[styles.inputLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                      {t('addLoan.fixationEndDate')}
                    </Text>
                    <TouchableOpacity
                      style={[
                        styles.dateRow,
                        {
                          backgroundColor: isDarkMode ? '#374151' : 'white',
                          borderColor: isDarkMode ? '#4B5563' : '#E2E8F0',
                          marginBottom: 12,
                        },
                      ]}
                      onPress={() => {
                    setIsFixed(true);
                    setFixedEndPickerVisible(true);
                  }}
                      activeOpacity={0.8}
                    >
                      <Calendar color="#667eea" size={22} />
                      <Text style={[styles.dateRowText, { color: primary }]}>
                        {fixedEndDate ? formatDateCs(fixedEndDate) : t('addLoan.selectDate')}
                      </Text>
                    </TouchableOpacity>
                    <Text style={[styles.inputLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                      {t('addLoan.fixationYears')}
                    </Text>
                    <TextInput
                      style={[
                        styles.input,
                        { backgroundColor: isDarkMode ? '#374151' : 'white', color: primary },
                      ]}
                      value={fixedYears}
                      onChangeText={(text) => {
                        setFixedYears(text);
                        const y = parseInt(text, 10);
                        if (Number.isFinite(y) && y > 0) {
                          const base = fixationStartDate.trim()
                            ? new Date(fixationStartDate)
                            : new Date(startDate);
                          if (!Number.isNaN(base.getTime())) {
                            setFixedEndDate(fixationEndFromYears(base, y));
                            setFixedEndManual(false);
                            setIsFixed(true);
                          }
                        }
                      }}
                      placeholder={t('addLoan.fixationYearsPlaceholder')}
                      keyboardType="numeric"
                      placeholderTextColor={subtle}
                    />
                    <Text style={[styles.inputLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280', marginTop: 16 }]}>
                      {t('addLoan.fixationStartDate')}
                    </Text>
                    <TextInput
                      style={[
                        styles.input,
                        { backgroundColor: isDarkMode ? '#374151' : 'white', color: primary },
                      ]}
                      value={fixationStartDate}
                      onChangeText={setFixationStartDate}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={subtle}
                    />
                  </View>
                )}
              </View>
            </View>
          )}

          {Platform.OS === 'ios' && (
            <Modal transparent animationType="slide" visible={fixedEndPickerVisible}>
              <View style={styles.modalRoot}>
                <Pressable style={styles.modalBackdrop} onPress={() => setFixedEndPickerVisible(false)} />
                <View style={[styles.iosPickerCard, { backgroundColor: isDarkMode ? '#1F2937' : 'white' }]}>
                  <View style={styles.iosPickerHeader}>
                    <TouchableOpacity onPress={() => setFixedEndPickerVisible(false)}>
                      <Text style={styles.iosPickerDone}>{t('done')}</Text>
                    </TouchableOpacity>
                  </View>
                  <DateTimePicker
                    value={fixedEndDate ?? startDate}
                    mode="date"
                    display="spinner"
                    onChange={(_e, date) => {
                      if (date) {
                        const d = new Date(date);
                        d.setHours(12, 0, 0, 0);
                        setFixedEndDate(d);
                        setFixedEndManual(true);
                        setIsFixed(true);
                      }
                    }}
                    style={{ height: 180 }}
                  />
                </View>
              </View>
            </Modal>
          )}
          {Platform.OS === 'android' && fixedEndPickerVisible && (
            <DateTimePicker
              value={fixedEndDate ?? startDate}
              mode="date"
              display="default"
              onChange={(_e, date) => {
                setFixedEndPickerVisible(false);
                if (date) {
                  const d = new Date(date);
                  d.setHours(12, 0, 0, 0);
                  setFixedEndDate(d);
                  setFixedEndManual(true);
                  setIsFixed(true);
                }
              }}
            />
          )}

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: primary }]}>{t('addLoan.color')}</Text>
            <View style={styles.colorGrid}>
              {availableColors.map((color) => (
                <TouchableOpacity
                  key={color}
                  style={[
                    styles.colorOption,
                    { backgroundColor: color },
                    selectedColor === color && styles.colorOptionSelected,
                  ]}
                  onPress={() => setSelectedColor(color)}
                >
                  {selectedColor === color && <Palette color="white" size={20} />}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: primary }]}>{t('addLoan.emoji')}</Text>
            <View style={styles.emojiGrid}>
              {availableEmojis.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={[
                    styles.emojiOption,
                    { backgroundColor: isDarkMode ? '#374151' : 'white' },
                    selectedEmoji === emoji && { borderColor: selectedColor, borderWidth: 2 },
                  ]}
                  onPress={() => setSelectedEmoji(emoji)}
                >
                  <Text style={styles.emojiText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View
            style={[
              styles.summaryCard,
              { backgroundColor: isDarkMode ? '#0B1220' : '#EFF6FF', borderColor: isDarkMode ? '#374151' : '#BFDBFE' },
            ]}
          >
            <Text style={[styles.summaryCardTitle, { color: subtle }]}>{t('addLoan.summary')}</Text>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: subtle }]} numberOfLines={2}>
                {t('addLoan.monthlyPayment')}
              </Text>
              <Text style={[styles.summaryValue, { color: primary }]}>
                {effectiveMonthlyPayment > 0 && numPrincipal > 0 && numTermMonths > 0
                  ? `${effectiveMonthlyPayment.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })} ${currentCurrency.symbol}`
                  : '—'}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: subtle }]} numberOfLines={2}>
                {t('addLoan.totalPaid')}
              </Text>
              <Text style={[styles.summaryValue, { color: primary }]}>
                {loanTotals.totalPaid > 0
                  ? `${loanTotals.totalPaid.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })} ${currentCurrency.symbol}`
                  : '—'}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: subtle }]} numberOfLines={2}>
                {t('addLoan.totalInterest')}
              </Text>
              <Text style={[styles.summaryValue, { color: primary }]}>
                {numPrincipal > 0 && numTermMonths > 0 && effectiveMonthlyPayment > 0
                  ? `${loanTotals.totalInterest.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })} ${currentCurrency.symbol}`
                  : '—'}
              </Text>
            </View>
          </View>

          <AsyncButton
            variant="primary"
            label={t('addLoan.submit')}
            loadingLabel={t('addLoan.submitting')}
            onPress={handleSubmit}
            style={styles.submitButton}
            contentStyle={styles.submitGradient}
            textStyle={styles.submitText}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingTop: 60, paddingBottom: 24, paddingHorizontal: 20 },
  headerContent: { flexDirection: 'row', alignItems: 'center' },
  headerBackButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleContainer: { flex: 1, marginLeft: 16 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: 'white' },
  headerSubtitle: { fontSize: 14, color: 'white', opacity: 0.9, marginTop: 2 },
  scrollView: { flex: 1 },
  content: { padding: 20 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12 },
  loanTypesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  loanTypeCard: {
    width: '47%',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  loanTypeIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  loanTypeLabel: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
  input: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  inputWithCurrency: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  inputFlex: { flex: 1 },
  currencyLabel: { fontSize: 16, fontWeight: '600' },
  helperText: { fontSize: 12, marginTop: 8 },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  dateRowText: { flex: 1, fontSize: 16, fontWeight: '600' },
  dateRowHint: { fontSize: 12 },
  livePaymentHint: { fontSize: 14, marginTop: 12, lineHeight: 20 },
  webDateModalRoot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  webDateCard: {
    borderRadius: 16,
    padding: 16,
    width: '100%' as const,
    maxWidth: 400,
    alignItems: 'stretch' as const,
  },
  webDateTitle: { fontSize: 17, fontWeight: '700', marginBottom: 8, textAlign: 'center' as const },
  webDateDone: { marginTop: 12, borderRadius: 12, overflow: 'hidden' },
  webDateDoneGradient: { paddingVertical: 14, alignItems: 'center' },
  webDateDoneText: { color: 'white', fontSize: 16, fontWeight: '700' },
  advancedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 8,
  },
  advancedToggleText: { fontSize: 16, fontWeight: '600' },
  advancedBody: { marginBottom: 8 },
  summaryCard: {
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    marginBottom: 8,
  },
  summaryCardTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  summaryLabel: { fontSize: 15, flex: 1 },
  summaryValue: { fontSize: 15, fontWeight: '700', textAlign: 'right' as const },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  iosPickerCard: { borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 24 },
  iosPickerHeader: { alignItems: 'flex-end', padding: 12 },
  iosPickerDone: { color: '#2563EB', fontSize: 17, fontWeight: '600' },
  submitButton: { marginTop: 16, marginBottom: 32, borderRadius: 16, overflow: 'hidden' },
  submitButtonDisabled: { opacity: 0.6 },
  submitGradient: { paddingVertical: 18, alignItems: 'center' },
  submitInner: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  submitText: { fontSize: 18, fontWeight: 'bold', color: 'white' },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  colorOption: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  colorOptionSelected: { borderWidth: 3, borderColor: 'white' },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  emojiOption: {
    width: 56,
    height: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  emojiText: { fontSize: 28 },
  fixedToggle: {
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  fixedToggleContent: { flexDirection: 'row', alignItems: 'center' },
  fixedIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  fixedTextContainer: { flex: 1 },
  fixedLabel: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
  fixedDescription: { fontSize: 12 },
  fixedYearsContainer: { marginTop: 16 },
  inputLabel: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
});
