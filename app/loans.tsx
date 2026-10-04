import React, { useState, useCallback, useEffect } from 'react';
import { useDraggableList } from '@/lib/use-draggable-list';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
  TextInput,
} from 'react-native';
import { Stack } from 'expo-router';
import { safePush } from '@/lib/safe-navigate';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Plus,
  Home,
  Car,
  DollarSign,
  GraduationCap,
  CreditCard,
  Trash2,
  ChevronDown,
  ChevronUp,
  Calculator,
} from 'lucide-react-native';
import { useFinanceStore, LoanType } from '@/store/finance-store';
import { useSettingsStore } from '@/store/settings-store';
import { useLanguageStore } from '@/store/language-store';
import { useTheme } from '@/hooks/use-theme';
import { getLoanTypeLabel, loanCountLabel } from '@/lib/loan-type-labels';
import { BackButton } from '@/components/BackButton';
import { EmptyState } from '@/components/EmptyState';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';
import { parseDecimalInput } from '@/lib/parse-money-input';
import {
  loanRefinanceParams,
  refinanceMonthlyPayment,
  formatCsCurrencyRounded,
  formatCsPercent2,
  formatCsRemainingMonthsWithYears,
} from '@/lib/loan-math';

const LOAN_ORDER_KEY = 'loan_order';

export default function LoansScreen() {
  const { loans, getLoanProgress, deleteLoan, isLoaded: financeLoaded } = useFinanceStore();
  const loansLoading = !financeLoaded;
  const { isDarkMode, getCurrentCurrency } = useSettingsStore();
  const { t } = useLanguageStore();
  const { colors } = useTheme();
  const currentCurrency = getCurrentCurrency();

  const [refiExpanded, setRefiExpanded] = useState(false);
  const [newRateInput, setNewRateInput] = useState('');
  const [refiCalculated, setRefiCalculated] = useState(false);

  const {
    orderedItems: orderedLoans,
    loadOrder: loadLoanOrder,
    showReorderAlert: showLoanReorderAlert,
  } = useDraggableList(loans, LOAN_ORDER_KEY);

  useEffect(() => {
    void loadLoanOrder();
  }, [loadLoanOrder]);

  const primary = isDarkMode ? '#F9FAFB' : '#1F2937';
  const subtle = isDarkMode ? '#9CA3AF' : '#6B7280';
  const cardBg = isDarkMode ? '#374151' : 'white';
  const inputBg = isDarkMode ? '#1F2937' : '#F8FAFC';

  const runRefinanceCalc = useCallback(() => {
    const rate = parseDecimalInput(newRateInput, 4);
    if (newRateInput.trim() === '' || rate == null || rate < 0) {
      Alert.alert(t('error'), t('loanInvalidRate'));
      return;
    }
    setRefiCalculated(true);
  }, [newRateInput, t]);
  const handleDeleteLoan = (loanId: string, loanName: string) => {
    if (Platform.OS === 'web') {
      if (window.confirm(t('loanDeleteConfirm', { name: loanName }))) {
        deleteLoan(loanId);
      }
    } else {
      Alert.alert(
        t('loanDeleteTitle'),
        t('loanDeleteConfirm', { name: loanName }),
        [
          {
            text: t('cancel'),
            style: 'cancel',
          },
          {
            text: t('delete'),
            style: 'destructive',
            onPress: () => {
              deleteLoan(loanId);
            },
          },
        ]
      );
    }
  };

  const getLoanIcon = (type: LoanType) => {
    switch (type) {
      case 'mortgage':
        return Home;
      case 'car':
        return Car;
      case 'personal':
        return DollarSign;
      case 'student':
        return GraduationCap;
      default:
        return CreditCard;
    }
  };

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
            <Text style={styles.headerTitle}>{t('profileMyLiabilities')}</Text>
            <Text style={styles.headerSubtitle}>
              {loans.length} {loanCountLabel(loans.length)}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => safePush('/add-loan')}
          >
            <Plus color="white" size={24} />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          {loans.length > 0 && (
            <View style={[styles.refiCard, { backgroundColor: cardBg }]}>
              <TouchableOpacity
                style={styles.refiHeaderRow}
                onPress={() => setRefiExpanded((e) => !e)}
                activeOpacity={0.85}
              >
                <View style={styles.refiHeaderLeft}>
                  <View style={[styles.refiIconWrap, { backgroundColor: isDarkMode ? '#4B5563' : '#EEF2FF' }]}>
                    <Calculator color="#667eea" size={22} />
                  </View>
                  <Text style={[styles.refiTitle, { color: primary }]}>{t('loanRefiCalculator')}</Text>
                </View>
                {refiExpanded ? (
                  <ChevronUp color={subtle} size={22} />
                ) : (
                  <ChevronDown color={subtle} size={22} />
                )}
              </TouchableOpacity>

              {refiExpanded && (
                <View style={styles.refiBody}>
                  <Text style={[styles.refiIntro, { color: subtle }]}>
                    {t('loanRefiIntro')}
                  </Text>
                  <Text style={[styles.refiLabel, { color: primary }]}>{t('loanNewRateLabel')}</Text>
                  <TextInput
                    style={[
                      styles.refiInput,
                      { backgroundColor: inputBg, color: primary, borderColor: isDarkMode ? '#4B5563' : '#E2E8F0' },
                    ]}
                    value={newRateInput}
                    onChangeText={(t) => {
                      setNewRateInput(t);
                      setRefiCalculated(false);
                    }}
                    placeholder={t('loanRatePlaceholder')}
                    placeholderTextColor={subtle}
                    keyboardType="decimal-pad"
                  />
                  <TouchableOpacity style={styles.refiCalcButton} onPress={runRefinanceCalc} activeOpacity={0.9}>
                    <LinearGradient
                      colors={['#667eea', '#764ba2']}
                      style={styles.refiCalcGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                    >
                      <Text style={styles.refiCalcButtonText}>{t('loanCalculate')}</Text>
                    </LinearGradient>
                  </TouchableOpacity>

                  {refiCalculated &&
                    (() => {
                      const parsedRate = parseDecimalInput(newRateInput, 4);
                      if (parsedRate == null || parsedRate < 0) return null;
                      return (
                        <View style={styles.refiResults}>
                          {loans.map((loan, idx) => {
                            const loanName = loan.name || getLoanTypeLabel(loan.loanType);
                            const sep = idx > 0
                              ? { borderTopWidth: 1, borderTopColor: isDarkMode ? '#4B5563' : '#E5E7EB', paddingTop: 16, marginTop: 16 }
                              : { paddingTop: 4 };
                            const params = loanRefinanceParams({
                              loanAmount: loan.loanAmount,
                              interestRate: loan.interestRate,
                              termMonths: loan.termMonths,
                              remainingMonths: loan.remainingMonths,
                              startDate: loan.startDate,
                              currentBalance: loan.currentBalance,
                            });
                            if (!params || params.monthsLeft <= 0 || params.balance <= 0) {
                              return (
                                <View key={loan.id} style={sep}>
                                  <Text style={[styles.refiLoanName, { color: primary }]}>{loanName}</Text>
                                  <Text style={[styles.refiMuted, { color: subtle }]}>
                                    {t('loanRefiCannotCalc')}
                                  </Text>
                                </View>
                              );
                            }
                            const { balance, monthsLeft } = params;
                            const newMonthly = refinanceMonthlyPayment(balance, parsedRate, monthsLeft);
                            const roundedNew = Math.round(newMonthly * 100) / 100;
                            const currentMonthly = loan.monthlyPayment;
                            const monthlySave = Math.round((currentMonthly - roundedNew) * 100) / 100;
                            const totalSave = Math.round(monthlySave * monthsLeft * 100) / 100;
                            const newRateHigher = parsedRate > loan.interestRate;

                            return (
                              <View key={loan.id} style={sep}>
                                <Text style={[styles.refiLoanName, { color: primary }]}>{loanName}</Text>
                                <Text style={[styles.refiResultLine, { color: subtle }]}>
                                  {t('loanNewMonthlyPayment')}{' '}
                                  <Text style={[styles.refiResultEm, { color: primary }]}>
                                    {formatCsCurrencyRounded(roundedNew, currentCurrency.symbol)}
                                  </Text>
                                </Text>
                                <Text style={[styles.refiResultLine, { color: subtle }]}>
                                  {t('loanMonthlySavings')}{' '}
                                  <Text style={[styles.refiResultEm, { color: primary }]}>
                                    {formatCsCurrencyRounded(monthlySave, currentCurrency.symbol)}
                                  </Text>
                                </Text>
                                <Text style={[styles.refiResultLine, { color: subtle }]}>
                                  {t('loanTotalSavings')}{' '}
                                  <Text style={[styles.refiResultEm, { color: primary }]}>
                                    {formatCsCurrencyRounded(totalSave, currentCurrency.symbol)}
                                  </Text>
                                </Text>
                                {newRateHigher && (
                                  <Text style={[styles.refiThumbs, { color: subtle }]}>
                                    {t('loanCurrentRateBetter')}
                                  </Text>
                                )}
                                {!newRateHigher && monthlySave > 0 && (
                                  <Text style={styles.refiWin}>
                                    {t('loanRefiWorthIt', { amount: formatCsCurrencyRounded(totalSave, currentCurrency.symbol) })}
                                  </Text>
                                )}
                              </View>
                            );
                          })}
                        </View>
                      );
                    })()}
                </View>
              )}
            </View>
          )}

          {loansLoading && loans.length === 0 ? (
            <LoadingSkeleton loading variant="cards" />
          ) : !loansLoading && loans.length === 0 ? (
            <EmptyState
              title={t('loanEmptyTitle')}
              description={t('loanEmptySubtitle')}
              icon={<CreditCard color={colors.textSecondary} size={48} />}
              actionLabel={t('loanAddFirst')}
              actionIcon={<Plus color={colors.onPrimary} size={20} />}
              onAction={() => safePush('/add-loan')}
            />
          ) : (
            orderedLoans.map((loan) => {
              const progress = getLoanProgress(loan.id);
              const trackPayments = progress.totalInterestPaid != null;
              const barPct = Math.min(
                100,
                trackPayments ? (progress.principalPercentPaid ?? progress.percentage) : progress.percentage,
              );
              const monthsLeft = Math.max(0, progress.totalMonths - progress.paidMonths);
              const LoanIcon = getLoanIcon(loan.loanType);
              const loanName = loan.name || getLoanTypeLabel(loan.loanType);

              return (
                <View
                  key={loan.id}
                  style={[styles.loanCard, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}
                  delayLongPress={500}
                  onLongPress={() => showLoanReorderAlert(loan.id)}
                >
                  <View style={styles.loanCardContent}>
                    <View style={styles.loanHeader}>
                      <TouchableOpacity
                        style={styles.loanHeaderTouchable}
                        onPress={() => safePush(`/loan-detail?id=${loan.id}`)}
                      >
                        <View style={[
                          styles.loanIconContainer,
                          { backgroundColor: loan.color ? loan.color + '20' : (isDarkMode ? '#4B5563' : '#F3F4F6') }
                        ]}>
                          {loan.emoji ? (
                            <Text style={styles.loanEmoji}>{loan.emoji}</Text>
                          ) : (
                            <LoanIcon color={loan.color || '#667eea'} size={28} />
                          )}
                        </View>
                        <View style={styles.loanInfo}>
                          <Text style={[styles.loanName, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                            {loanName}
                          </Text>
                          <Text style={[styles.loanType, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                            {getLoanTypeLabel(loan.loanType)}
                          </Text>
                        </View>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.deleteIconButton}
                        onPress={() => handleDeleteLoan(loan.id, loanName)}
                      >
                        <Trash2 color="#EF4444" size={20} />
                      </TouchableOpacity>
                    </View>

                  <View style={styles.loanDetails}>
                    <View style={styles.loanDetailRow}>
                      <Text style={[styles.loanDetailLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                        {t('loanAmount')}
                      </Text>
                      <Text style={[styles.loanDetailValue, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                        {formatCsCurrencyRounded(loan.loanAmount, currentCurrency.symbol)}
                      </Text>
                    </View>
                    <View style={styles.loanDetailRow}>
                      <Text style={[styles.loanDetailLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                        {t('loanMonthlyPayment')}
                      </Text>
                      <Text style={[styles.loanDetailValue, { color: '#EF4444' }]}>
                        {formatCsCurrencyRounded(loan.monthlyPayment, currentCurrency.symbol)}
                      </Text>
                    </View>
                    <View style={styles.loanDetailRow}>
                      <Text style={[styles.loanDetailLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                        {t('loanInterestRate')}
                      </Text>
                      <Text style={[styles.loanDetailValue, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                        {formatCsPercent2(loan.interestRate)} %
                      </Text>
                    </View>
                    <View style={styles.loanDetailRow}>
                      <Text style={[styles.loanDetailLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                        {t('loanMonthsRemaining')}
                      </Text>
                      <Text style={[styles.loanDetailValue, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                        {formatCsRemainingMonthsWithYears(monthsLeft)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.progressContainer}>
                    <View style={styles.progressHeader}>
                      <Text style={[styles.progressLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                        {t('loanRepaymentProgress')}
                      </Text>
                      <Text style={[styles.progressPercentage, { color: '#10B981' }]}>
                        {trackPayments && progress.principalPercentPaid != null
                          ? `${formatCsPercent2(progress.principalPercentPaid)}%`
                          : `${formatCsPercent2(progress.percentage)}%`}
                      </Text>
                    </View>
                    <View style={[styles.progressBarBackground, { backgroundColor: isDarkMode ? '#4B5563' : '#F3F4F6' }]}>
                      <LinearGradient
                        colors={['#10B981', '#059669']}
                        style={[styles.progressBar, { width: `${barPct}%` }]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                      />
                    </View>
                    <Text style={[styles.progressInstallmentHint, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
                      {t('loanInstallmentOf', { paid: progress.paidMonths, total: progress.totalMonths })}
                      {trackPayments && progress.principalPercentPaid != null
                        ? ` · ${formatCsPercent2(progress.principalPercentPaid)} %`
                        : ''}
                    </Text>
                    <View style={styles.progressStats}>
                      <Text style={[styles.progressStat, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                        {t('loanPaid')}: {formatCsCurrencyRounded(progress.totalPaid, currentCurrency.symbol)}
                      </Text>
                      <Text style={[styles.progressStat, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                        {t('loanRemaining')}: {formatCsCurrencyRounded(progress.remainingAmount, currentCurrency.symbol)}
                      </Text>
                    </View>
                    {trackPayments && progress.totalInterestPaid != null && (
                      <Text style={[styles.progressInterestHint, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
                        {t('loanInterestPaid')}: {formatCsCurrencyRounded(progress.totalInterestPaid, currentCurrency.symbol)}
                      </Text>
                    )}
                  </View>
                  </View>
                </View>
              );
            })
          )}
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
    justifyContent: 'space-between',
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
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  emptyCard: {
    borderRadius: 16,
    padding: 40,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  emptyButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  emptyButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    gap: 8,
  },
  emptyButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
  },
  loanCard: {
    borderRadius: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  loanCardContent: {
    padding: 20,
  },
  loanHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
    position: 'relative' as const,
  },
  loanHeaderTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  loanIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  loanInfo: {
    flex: 1,
  },
  loanName: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  loanType: {
    fontSize: 14,
  },
  loanDetails: {
    marginBottom: 16,
  },
  loanDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  loanDetailLabel: {
    fontSize: 14,
  },
  loanDetailValue: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  progressContainer: {
    marginTop: 8,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  progressPercentage: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  progressBarBackground: {
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBar: {
    height: '100%',
    borderRadius: 5,
  },
  progressInstallmentHint: {
    fontSize: 11,
    marginBottom: 6,
  },
  progressInterestHint: {
    fontSize: 11,
    marginTop: 6,
  },
  progressStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressStat: {
    fontSize: 12,
  },
  loanEmoji: {
    fontSize: 32,
  },
  deleteIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  refiCard: {
    borderRadius: 16,
    marginBottom: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  refiHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  refiHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  refiIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refiTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  refiBody: {
    marginTop: 16,
  },
  refiIntro: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  refiLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  refiInput: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  refiCalcButton: {
    marginTop: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  refiCalcGradient: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  refiCalcButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  refiResults: {
    marginTop: 8,
  },
  refiLoanName: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
  },
  refiResultLine: {
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 4,
  },
  refiResultEm: {
    fontWeight: '700',
  },
  refiMuted: {
    fontSize: 13,
    lineHeight: 18,
  },
  refiThumbs: {
    fontSize: 14,
    marginTop: 10,
    fontWeight: '600',
  },
  refiWin: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 10,
    color: '#10B981',
  },
});
