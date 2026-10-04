import React, { useState, useEffect, useMemo } from 'react';
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
import DateTimePicker from '@react-native-community/datetimepicker';
import { Stack, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Home,
  Car,
  DollarSign,
  GraduationCap,
  CreditCard,
  Palette,
  Lock,
  Calendar,
} from 'lucide-react-native';
import { useFinanceStore, LoanType } from '@/store/finance-store';
import { useSettingsStore } from '@/store/settings-store';
import { useLanguageStore } from '@/store/language-store';
import { getLoanTypeLabel } from '@/lib/loan-type-labels';
import { formatDateCs, fixationEndFromYears, monthlyPaymentAmortizing, monthlyPaymentDiffersOverOnePercent, parseDateDdMmYyyy, resolvePaidMonths, resolveRemainingMonths } from '@/lib/loan-math';
import { parseDecimalInput, parseMoneyInput } from '@/lib/parse-money-input';
import { safeGoBack } from '@/lib/safe-back';
import { BackButton } from '@/components/BackButton';
import { AsyncButton } from '@/components/AsyncButton';
import { useAsyncAction } from '@/hooks/use-async-action';

export default function EditLoanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { loans, updateLoan } = useFinanceStore();
  const { isDarkMode, getCurrentCurrency } = useSettingsStore();
  const { t } = useLanguageStore();
  const currentCurrency = getCurrentCurrency();

  const loan = loans.find((l) => l.id === id);

  const [loanType, setLoanType] = useState<LoanType>('personal');
  const [name, setName] = useState<string>('');
  const [loanAmount, setLoanAmount] = useState<string>('');
  const [interestRate, setInterestRate] = useState<string>('');
  const [termMonths, setTermMonths] = useState<string>('');
  const [monthlyPaymentManual, setMonthlyPaymentManual] = useState<string>('');
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [fixedEndPickerVisible, setFixedEndPickerVisible] = useState(false);
  const [dateInputText, setDateInputText] = useState('');
  const [selectedColor, setSelectedColor] = useState<string>('#3B82F6');
  const [selectedEmoji, setSelectedEmoji] = useState<string>('💰');
  const [isFixed, setIsFixed] = useState<boolean>(false);
  const [fixedYears, setFixedYears] = useState<string>('');
  const [currentBalance, setCurrentBalance] = useState<string>('');
  const [fixationStartDate, setFixationStartDate] = useState<string>('');
  const [fixedEndDate, setFixedEndDate] = useState<Date | null>(null);
  /** true = uživatel zvolil konkrétní datum (picker); false = z let */
  const [fixedEndManual, setFixedEndManual] = useState(false);

  useEffect(() => {
    if (loan) {
      setLoanType(loan.loanType);
      setName(loan.name || '');
      setLoanAmount(loan.loanAmount.toString());
      setInterestRate(loan.interestRate.toString());
      const n = loan.termMonths && loan.termMonths > 0 ? loan.termMonths : loan.remainingMonths;
      setTermMonths(String(n));
      const sd = loan.startDate ? new Date(loan.startDate) : new Date();
      sd.setHours(12, 0, 0, 0);
      setStartDate(sd);
      setDateInputText(formatDateCs(sd));
      setSelectedColor(loan.color || '#3B82F6');
      setSelectedEmoji(loan.emoji || (loan.loanType === 'mortgage' ? '🏠' : '💰'));
      const end = loan.fixedEndDate ? new Date(loan.fixedEndDate) : null;
      setIsFixed(Boolean(loan.isFixed) || (end != null && !Number.isNaN(end.getTime())));
      setFixedYears(loan.fixedYears?.toString() || '');
      setCurrentBalance(loan.currentBalance != null ? String(loan.currentBalance) : '');
      setFixationStartDate(
        loan.fixationStartDate
          ? new Date(loan.fixationStartDate).toISOString().split('T')[0]
          : '',
      );
      setFixedEndDate(end && !Number.isNaN(end.getTime()) ? end : null);
      setFixedEndManual(end != null && !Number.isNaN(end.getTime()));
      setMonthlyPaymentManual(
        loan.monthlyPayment != null ? String(loan.monthlyPayment) : '',
      );
    }
  }, [loan]);

  const computedMonthlyPayment = useMemo(() => {
    const P = parseMoneyInput(loanAmount);
    const r = parseDecimalInput(interestRate, 4);
    const n = parseInt(termMonths, 10);
    if (P == null || !(P > 0) || r == null || !Number.isFinite(n) || n <= 0) return 0;
    return monthlyPaymentAmortizing(P, r, n);
  }, [loanAmount, interestRate, termMonths]);

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

  const onDateChange = (_e: unknown, date?: Date) => {
    if (Platform.OS === 'android') setDatePickerVisible(false);
    if (date) {
      const d = new Date(date);
      d.setHours(12, 0, 0, 0);
      setStartDate(d);
      setDateInputText(formatDateCs(d));
    }
  };

  const { run: handleSubmit } = useAsyncAction(async () => {
    if (!loan || !loanAmount || !interestRate || !termMonths) {
      Alert.alert(t('error'), t('editLoanFillRequired'));
      return;
    }

    const numLoanAmount = parseMoneyInput(loanAmount);
    const numInterestRate = parseDecimalInput(interestRate, 4);
    const numTermMonths = parseInt(termMonths, 10);
    const numCurrentBalance = parseMoneyInput(currentBalance);

    if (
      numLoanAmount == null ||
      numInterestRate == null ||
      isNaN(numTermMonths) ||
      numLoanAmount <= 0 ||
      numInterestRate < 0 ||
      numTermMonths <= 0
    ) {
      Alert.alert(t('error'), t('editLoanInvalidValues'));
      return;
    }

    const M = Math.round(effectiveMonthlyPayment * 100) / 100;

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

    const paid = resolvePaidMonths({
      startDate,
      termMonths: numTermMonths,
      paymentsMade: loan.paymentsMade,
    });
    const remainingMonths = resolveRemainingMonths(numTermMonths, paid);

    const updates = {
      loanType,
      name: name.trim() || undefined,
      loanAmount: numLoanAmount,
      interestRate: numInterestRate,
      monthlyPayment: M,
      termMonths: numTermMonths,
      remainingMonths,
      startDate,
      color: selectedColor,
      emoji: loanType === 'mortgage' && selectedEmoji === '💰' ? '🏠' : selectedEmoji,
      isFixed: effectiveIsFixed,
      fixedYears: effectiveIsFixed && Number.isFinite(numFixedYears) && numFixedYears > 0 ? numFixedYears : undefined,
      fixedEndDate: effectiveIsFixed ? resolvedFixedEnd : undefined,
      fixationStartDate: effectiveIsFixed ? parsedFixationStartDate : undefined,
      currentBalance:
        numCurrentBalance != null && Number.isFinite(numCurrentBalance)
          ? numCurrentBalance
          : undefined,
    };

    updateLoan(loan.id, updates);
    safeGoBack();
  });

  if (!loan) {
    return (
      <View style={[styles.container, { backgroundColor: isDarkMode ? '#111827' : '#F8FAFC' }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: isDarkMode ? 'white' : '#1F2937' }]}>
            {t('loanNotFound')}
          </Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => safeGoBack()}
          >
            <Text style={styles.backButtonText}>{t('back')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const loanTypes: { type: LoanType; label: string; icon: any; color: string }[] = [
    { type: 'mortgage', label: getLoanTypeLabel('mortgage'), icon: Home, color: '#10B981' },
    { type: 'car', label: getLoanTypeLabel('car'), icon: Car, color: '#3B82F6' },
    { type: 'personal', label: getLoanTypeLabel('personal'), icon: DollarSign, color: '#8B5CF6' },
    { type: 'student', label: getLoanTypeLabel('student'), icon: GraduationCap, color: '#F59E0B' },
    { type: 'other', label: getLoanTypeLabel('other'), icon: CreditCard, color: '#6B7280' },
  ];

  const availableColors = [
    '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6',
    '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
  ];

  const availableEmojis = [
    '💰', '🏠', '🚗', '🎓', '💳', '📱', '🏦', '💵',
    '🏡', '🚙', '📚', '🎯', '💎', '🔑', '🏢', '🛒',
  ];

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
            <Text style={styles.headerTitle}>{t('screenEditLoan')}</Text>
            <Text style={styles.headerSubtitle}>{t('loanDetailSubtitle')}</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
              {t('editLoanLoanType')}
            </Text>
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
                    onPress={() => {
                      setLoanType(type.type);
                      if (type.type === 'mortgage' && (selectedEmoji === '💰' || !selectedEmoji)) {
                        setSelectedEmoji('🏠');
                      }
                    }}
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
                        {
                          color: isSelected
                            ? type.color
                            : isDarkMode
                            ? '#D1D5DB'
                            : '#6B7280',
                        },
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
            <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
              {t('editLoanNameOptional')}
            </Text>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: isDarkMode ? '#374151' : 'white', color: isDarkMode ? 'white' : '#1F2937' },
              ]}
              value={name}
              onChangeText={setName}
              placeholder={t('editLoanNamePlaceholder')}
              placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'}
            />
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
              {t('editLoanTotalAmount')}
            </Text>
            <View style={styles.inputWithCurrency}>
              <TextInput
                style={[
                  styles.input,
                  styles.inputFlex,
                  { backgroundColor: isDarkMode ? '#374151' : 'white', color: isDarkMode ? 'white' : '#1F2937' },
                ]}
                value={loanAmount}
                onChangeText={setLoanAmount}
                placeholder="0"
                keyboardType="decimal-pad"
                placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'}
              />
              <Text style={[styles.currencyLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                {currentCurrency.symbol}
              </Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
              {t('editLoanInterestRate')}
            </Text>
            <View style={styles.inputWithCurrency}>
              <TextInput
                style={[
                  styles.input,
                  styles.inputFlex,
                  { backgroundColor: isDarkMode ? '#374151' : 'white', color: isDarkMode ? 'white' : '#1F2937' },
                ]}
                value={interestRate}
                onChangeText={setInterestRate}
                placeholder="0"
                keyboardType="decimal-pad"
                placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'}
              />
              <Text style={[styles.currencyLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                %
              </Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
              {t('editLoanTermMonths')}
            </Text>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: isDarkMode ? '#374151' : 'white', color: isDarkMode ? 'white' : '#1F2937' },
              ]}
              value={termMonths}
              onChangeText={setTermMonths}
              placeholder={t('editLoanTermPlaceholder')}
              keyboardType="number-pad"
              placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'}
            />
            {computedMonthlyPayment > 0 ? (
              <Text style={[styles.helperText, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
                {t('addLoan.monthlyPreview')}{' '}
                {computedMonthlyPayment.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })}{' '}
                {currentCurrency.symbol}
              </Text>
            ) : null}
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
              {t('addLoan.monthlyPayment')}
            </Text>
            <View style={styles.inputWithCurrency}>
              <TextInput
                style={[
                  styles.input,
                  styles.inputFlex,
                  { backgroundColor: isDarkMode ? '#374151' : 'white', color: isDarkMode ? 'white' : '#1F2937' },
                ]}
                value={monthlyPaymentManual}
                onChangeText={setMonthlyPaymentManual}
                placeholder={
                  computedMonthlyPayment > 0
                    ? computedMonthlyPayment.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })
                    : '0'
                }
                keyboardType="decimal-pad"
                placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'}
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
              <Text style={[styles.helperText, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
                {t('addLoan.monthlyPaymentManualHint')}
              </Text>
            )}
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
              {t('editLoanStartDate')}
            </Text>
            {Platform.OS === 'web' ? (
              <TextInput
                style={[
                  styles.input,
                  { backgroundColor: isDarkMode ? '#374151' : 'white', color: isDarkMode ? 'white' : '#1F2937' },
                ]}
                value={dateInputText}
                onChangeText={setDateInputText}
                onBlur={() => {
                  const d = parseDateDdMmYyyy(dateInputText);
                  if (d) {
                    d.setHours(12, 0, 0, 0);
                    if (+d <= +new Date()) {
                      setStartDate(d);
                    } else {
                      setDateInputText(formatDateCs(startDate));
                    }
                  } else {
                    setDateInputText(formatDateCs(startDate));
                  }
                }}
                placeholder={t('editLoanDateFormat')}
                placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'}
              />
            ) : (
              <TouchableOpacity
                style={[
                  styles.dateRow,
                  { backgroundColor: isDarkMode ? '#374151' : 'white', borderColor: isDarkMode ? '#4B5563' : '#E2E8F0' },
                ]}
                onPress={() => setDatePickerVisible(true)}
                activeOpacity={0.8}
              >
                <Calendar color="#667eea" size={22} />
                <Text style={[styles.dateRowText, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                  {formatDateCs(startDate)}
                </Text>
                <Text style={[styles.dateRowHint, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>{t('editLoanDateFormat')}</Text>
              </TouchableOpacity>
            )}
            <Text style={[styles.helperText, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
              {t('editLoanStartDateHint')}
            </Text>
          </View>

          {Platform.OS === 'ios' && (
            <Modal transparent animationType="slide" visible={datePickerVisible}>
              <View style={styles.modalRoot}>
                <Pressable style={styles.modalBackdrop} onPress={() => setDatePickerVisible(false)} />
                <View style={[styles.iosPickerCard, { backgroundColor: isDarkMode ? '#1F2937' : 'white' }]}>
                  <View style={styles.iosPickerHeader}>
                    <TouchableOpacity onPress={() => setDatePickerVisible(false)}>
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

          {Platform.OS === 'android' && datePickerVisible && (
            <DateTimePicker
              value={startDate}
              mode="date"
              display="default"
              onChange={onDateChange}
              maximumDate={new Date()}
            />
          )}

          <View style={[styles.section, styles.computedBox, { backgroundColor: isDarkMode ? '#0B1220' : '#EFF6FF' }]}>
            <Text style={[styles.computedLabel, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
              {t('editLoanMonthlyComputed')}
            </Text>
            <Text style={[styles.computedValue, { color: isDarkMode ? 'white' : '#1F2937' }]}>
              {computedMonthlyPayment > 0
                ? `${computedMonthlyPayment.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })} ${currentCurrency.symbol}`
                : '—'}
            </Text>
            <Text style={[styles.helperText, { color: isDarkMode ? '#9CA3AF' : '#6B7280', marginTop: 6 }]}>
              {t('editLoanAnnuityFormula')}
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
              {t('addLoan.currentBalance')}
            </Text>
            <View style={styles.inputWithCurrency}>
              <TextInput
                style={[
                  styles.input,
                  styles.inputFlex,
                  { backgroundColor: isDarkMode ? '#374151' : 'white', color: isDarkMode ? 'white' : '#1F2937' },
                ]}
                value={currentBalance}
                onChangeText={setCurrentBalance}
                placeholder={t('addLoan.currentBalancePlaceholder')}
                keyboardType="decimal-pad"
                placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'}
              />
              <Text style={[styles.currencyLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                {currentCurrency.symbol}
              </Text>
            </View>
            <Text style={[styles.helperText, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
              {t('editLoanBalanceHint')}
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
              {t('editLoanRateFixation')}
            </Text>
            <TouchableOpacity
              style={[
                styles.fixedToggle,
                { backgroundColor: isDarkMode ? '#374151' : 'white' },
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
                <View style={[
                  styles.fixedIcon,
                  { backgroundColor: isFixed ? '#667eea20' : isDarkMode ? '#4B5563' : '#F3F4F6' }
                ]}>
                  <Lock color={isFixed ? '#667eea' : '#6B7280'} size={20} />
                </View>
                <View style={styles.fixedTextContainer}>
                  <Text style={[styles.fixedLabel, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                    {t('editLoanFixedRate')}
                  </Text>
                  <Text style={[styles.fixedDescription, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
                    {isFixed ? t('editLoanOn') : t('editLoanOff')}
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
                  <Text style={[styles.dateRowText, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                    {fixedEndDate ? formatDateCs(fixedEndDate) : t('addLoan.selectDate')}
                  </Text>
                </TouchableOpacity>
                <Text style={[styles.inputLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                  {t('editLoanFixedYears')}
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    { backgroundColor: isDarkMode ? '#374151' : 'white', color: isDarkMode ? 'white' : '#1F2937' },
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
                  placeholder={t('editLoanFixedYearsPlaceholder')}
                  keyboardType="number-pad"
                  placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'}
                />
                <Text style={[styles.helperText, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
                  {t('editLoanFixedYearsHint')}
                </Text>
                
                <Text style={[styles.inputLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280', marginTop: 16 }]}>
                  {t('editLoanFixationStart')}
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    { backgroundColor: isDarkMode ? '#374151' : 'white', color: isDarkMode ? 'white' : '#1F2937' },
                  ]}
                  value={fixationStartDate}
                  onChangeText={setFixationStartDate}
                  placeholder={t('editLoanFixationStartPlaceholder')}
                  placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'}
                />
                <Text style={[styles.helperText, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
                  {t('editLoanFixationStartHint')}
                </Text>
              </View>
            )}
          </View>

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

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
              {t('editLoanColor')}
            </Text>
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
                  {selectedColor === color && (
                    <Palette color="white" size={20} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
              {t('editLoanEmoji')}
            </Text>
            <View style={styles.emojiGrid}>
              {availableEmojis.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={[
                    styles.emojiOption,
                    { backgroundColor: isDarkMode ? '#374151' : 'white' },
                    selectedEmoji === emoji && {
                      borderColor: selectedColor,
                      borderWidth: 2,
                    },
                  ]}
                  onPress={() => setSelectedEmoji(emoji)}
                >
                  <Text style={styles.emojiText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <AsyncButton
            variant="primary"
            label={t('save')}
            loadingLabel={t('editLoanSaving')}
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
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 60,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerBackButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleContainer: {
    flex: 1,
    marginLeft: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'white',
    opacity: 0.9,
    marginTop: 2,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  loanTypesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
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
  loanTypeLabel: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
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
  inputWithCurrency: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  inputFlex: {
    flex: 1,
  },
  currencyLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  helperText: {
    fontSize: 12,
    marginTop: 8,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  dateRowText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  dateRowHint: {
    fontSize: 12,
  },
  computedBox: {
    borderRadius: 14,
    padding: 16,
  },
  computedLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  computedValue: {
    fontSize: 22,
    fontWeight: '800',
    marginTop: 6,
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  iosPickerCard: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 24,
  },
  iosPickerHeader: {
    alignItems: 'flex-end',
    padding: 12,
  },
  iosPickerDone: {
    color: '#2563EB',
    fontSize: 17,
    fontWeight: '600',
  },
  submitButton: {
    marginTop: 16,
    marginBottom: 32,
    borderRadius: 16,
    overflow: 'hidden',
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitGradient: {
    paddingVertical: 18,
    alignItems: 'center',
  },
  submitInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  submitText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
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
  colorOptionSelected: {
    borderWidth: 3,
    borderColor: 'white',
  },
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
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
  emojiText: {
    fontSize: 28,
  },
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
  fixedToggleContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fixedIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  fixedTextContainer: {
    flex: 1,
  },
  fixedLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  fixedDescription: {
    fontSize: 12,
  },
  fixedYearsContainer: {
    marginTop: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  backButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#667eea',
    borderRadius: 12,
  },
  backButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
