import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Home,
  Car,
  DollarSign,
  GraduationCap,
  Calendar,
  TrendingDown,
  Percent,
  CreditCard,
  Trash2,
  Lock,
  Edit3,
} from 'lucide-react-native';
import { useFinanceStore, LoanType } from '@/store/finance-store';
import { useSettingsStore } from '@/store/settings-store';
import { useLanguageStore } from '@/store/language-store';
import { getLoanTypeLabel, loanYearLabel } from '@/lib/loan-type-labels';
import { formatCsCurrencyRounded, formatCsPercent2, formatCsRemainingMonthsWithYears, computeLoanDetailOverview, formatDateCs } from '@/lib/loan-math';
import { safeGoBack } from '@/lib/safe-back';
import { BackButton } from '@/components/BackButton';

export default function LoanDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { loans, deleteLoan, undoLastLoanPayment } = useFinanceStore();
  const { isDarkMode, getCurrentCurrency } = useSettingsStore();
  const { t } = useLanguageStore();

  const loan = loans.find((l) => l.id === id);
  const currentCurrency = getCurrentCurrency();

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

  const overview = computeLoanDetailOverview(loan);
  const canUndoPayment = (loan.paymentsMade ?? 0) > 0;

  const getLoanTypeIcon = (type: LoanType) => {
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

  const handleDelete = () => {
    console.log('Delete button pressed for loan:', loan.id);
    if (Platform.OS === 'web') {
      if (window.confirm(t('loanDeleteConfirmGeneric'))) {
        console.log('Deleting loan:', loan.id);
        deleteLoan(loan.id);
        console.log('Loan deleted, navigating back');
        safeGoBack();
      } else {
        console.log('Delete cancelled');
      }
    } else {
      Alert.alert(
        t('loanDeleteTitle'),
        t('loanDeleteConfirmGeneric'),
        [
          {
            text: t('cancel'),
            style: 'cancel',
            onPress: () => console.log('Delete cancelled'),
          },
          {
            text: t('delete'),
            style: 'destructive',
            onPress: () => {
              console.log('Deleting loan:', loan.id);
              deleteLoan(loan.id);
              console.log('Loan deleted, navigating back');
              safeGoBack();
            },
          },
        ],
        { cancelable: true }
      );
    }
  };

  const LoanIcon = getLoanTypeIcon(loan.loanType);

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
            <Text style={styles.headerTitle}>
              {loan.name || getLoanTypeLabel(loan.loanType)}
            </Text>
            <Text style={styles.headerSubtitle}>{t('loanDetailSubtitle')}</Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => router.push(`/edit-loan?id=${loan.id}`)}
            >
              <Edit3 color="white" size={20} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={handleDelete}
            >
              <Trash2 color="white" size={20} />
            </TouchableOpacity>
          </View>
        </View>
      </LinearGradient>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <View style={[styles.iconContainer, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}>
            <View style={[
              styles.iconCircle,
              { backgroundColor: loan.color ? loan.color + '20' : undefined }
            ]}>
              {loan.emoji ? (
                <Text style={styles.loanEmoji}>{loan.emoji}</Text>
              ) : (
                <LinearGradient
                  colors={['#667eea', '#764ba2']}
                  style={styles.iconGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <LoanIcon color="white" size={40} />
                </LinearGradient>
              )}
            </View>
            <Text style={[styles.loanTypeText, { color: isDarkMode ? 'white' : '#1F2937' }]}>
              {getLoanTypeLabel(loan.loanType)}
            </Text>
          </View>

          <View style={[styles.progressCard, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}>
            <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
              {t('loanRepaymentProgress')}
            </Text>
            <View style={styles.progressBarContainer}>
              <View style={[styles.progressBarBackground, { backgroundColor: isDarkMode ? '#4B5563' : '#F3F4F6' }]}>
                <LinearGradient
                  colors={['#10B981', '#059669']}
                  style={[
                    styles.progressBar,
                    {
                      width: `${Math.min(100, overview.principalPercentPaid)}%`,
                    },
                  ]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                />
              </View>
              <Text style={[styles.progressText, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                {t('loanPaidPrincipal', { percent: formatCsPercent2(overview.principalPercentPaid) })}
              </Text>
            </View>
            <View style={styles.progressStatsColumn}>
              <Text style={[styles.progressLine, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                {t('loanInstallmentOf', { paid: overview.paidMonths, total: overview.totalMonths })}
              </Text>
              <Text style={[styles.progressLineGreen, { color: '#10B981' }]}>
                {t('loanPaid')}: {formatCsCurrencyRounded(overview.principalPaid, currentCurrency.symbol)}
              </Text>
              <Text style={[styles.progressLine, { color: isDarkMode ? '#F9FAFB' : '#1F2937' }]}>
                {t('loanRemaining')}: {formatCsCurrencyRounded(overview.remainingPrincipal, currentCurrency.symbol)}
              </Text>
              <Text style={[styles.progressInterestLine, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
                {t('loanMonthsLeft')}:{' '}
                {formatCsRemainingMonthsWithYears(
                  Math.max(0, overview.totalMonths - overview.paidMonths),
                )}
              </Text>
            </View>
            {canUndoPayment && (
              <TouchableOpacity
                style={[styles.undoPaymentBtn, { borderColor: isDarkMode ? '#4B5563' : '#E5E7EB' }]}
                onPress={() => {
                  Alert.alert(t('loanUndoPaymentTitle'), t('loanUndoPaymentConfirm'), [
                    { text: t('loanNo'), style: 'cancel' },
                    { text: t('loanYes'), onPress: () => undoLastLoanPayment(loan.id) },
                  ]);
                }}
                activeOpacity={0.85}
              >
                <Text style={[styles.undoPaymentText, { color: isDarkMode ? '#FBBF24' : '#D97706' }]}>
                  {t('loanUndoLastPayment')}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={[styles.detailsCard, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}>
            <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
              {t('loanFinancialDetails')}
            </Text>

            <View style={styles.detailRow}>
              <View style={styles.detailIconContainer}>
                <DollarSign color="#667eea" size={20} />
              </View>
              <View style={styles.detailContent}>
                <Text
                  style={[styles.detailLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}
                  numberOfLines={2}
                >
                  {t('loanAmount')}
                </Text>
                <Text
                  style={[styles.detailValue, { color: isDarkMode ? 'white' : '#1F2937' }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                >
                  {formatCsCurrencyRounded(loan.loanAmount, currentCurrency.symbol)}
                </Text>
              </View>
            </View>

            <View style={styles.detailRow}>
              <View style={styles.detailIconContainer}>
                <Percent color="#667eea" size={20} />
              </View>
              <View style={styles.detailContent}>
                <Text style={[styles.detailLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                  {t('loanInterestRate')}
                </Text>
                <View style={styles.interestRateRow}>
                  <Text style={[styles.detailValue, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                    {formatCsPercent2(loan.interestRate)} %
                  </Text>
                  {loan.isFixed && (
                    <View style={styles.fixedBadge}>
                      <Lock color="#10B981" size={12} />
                      <Text style={styles.fixedBadgeText}>{t('loanFixed')}</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>

            {loan.isFixed && loan.fixedEndDate ? (
              <View style={styles.detailRow}>
                <View style={styles.detailIconContainer}>
                  <Lock color="#667eea" size={20} />
                </View>
                <View style={styles.detailContent}>
                  <Text style={[styles.detailLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                    {t('loanFixedUntil')}
                  </Text>
                  <Text style={[styles.detailValue, { color: '#10B981' }]}>
                    {formatDateCs(new Date(loan.fixedEndDate))}
                    {loan.fixedYears ? ` (${loan.fixedYears} ${loanYearLabel(loan.fixedYears)})` : ''}
                  </Text>
                </View>
              </View>
            ) : null}

            <View style={styles.detailRow}>
              <View style={styles.detailIconContainer}>
                <CreditCard color="#667eea" size={20} />
              </View>
              <View style={styles.detailContent}>
                <Text style={[styles.detailLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                  {t('loanMonthlyPayment')}
                </Text>
                <Text style={[styles.detailValue, { color: '#EF4444' }]}>
                  {formatCsCurrencyRounded(loan.monthlyPayment, currentCurrency.symbol)}
                </Text>
              </View>
            </View>

            <View style={styles.detailRow}>
              <View style={styles.detailIconContainer}>
                <Calendar color="#667eea" size={20} />
              </View>
              <View style={styles.detailContent}>
                <Text style={[styles.detailLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                  {t('loanStartDate')}
                </Text>
                <Text style={[styles.detailValue, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                  {formatDateCs(new Date(loan.startDate))}
                </Text>
              </View>
            </View>

            <View style={styles.detailRow}>
              <View style={styles.detailIconContainer}>
                <TrendingDown color="#667eea" size={20} />
              </View>
              <View style={styles.detailContent}>
                <Text
                  style={[styles.detailLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}
                  numberOfLines={2}
                >
                  {t('loanRemainingDebt')}
                </Text>
                <Text
                  style={[styles.detailValue, { color: '#EF4444' }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                >
                  {formatCsCurrencyRounded(overview.remainingPrincipal, currentCurrency.symbol)}
                </Text>
              </View>
            </View>
          </View>

          <View style={[styles.summaryCard, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}>
            <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
              {t('loanTotalOverview')}
            </Text>

            <View style={styles.summaryRow}>
              <Text
                style={[styles.summaryLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}
                numberOfLines={2}
              >
                {t('loanPaidTotalCash')}
              </Text>
              <Text style={[styles.summaryValue, { color: '#10B981' }]}>
                {formatCsCurrencyRounded(overview.paidTotalCash, currentCurrency.symbol)}
              </Text>
            </View>
            <View style={styles.summarySubRow}>
              <Text style={[styles.summarySubLabel, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
                {t('loanOfWhichPrincipal')}
              </Text>
              <Text style={[styles.summarySubValue, { color: isDarkMode ? '#D1D5DB' : '#4B5563' }]}>
                {formatCsCurrencyRounded(overview.principalPaid, currentCurrency.symbol)}
              </Text>
            </View>
            <View style={styles.summarySubRow}>
              <Text style={[styles.summarySubLabel, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
                {t('loanOfWhichInterest')}
              </Text>
              <Text style={[styles.summarySubValue, { color: isDarkMode ? '#D1D5DB' : '#4B5563' }]}>
                {formatCsCurrencyRounded(overview.interestPaid, currentCurrency.symbol)}
              </Text>
            </View>

            <View style={styles.summaryRow}>
              <Text
                style={[styles.summaryLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}
                numberOfLines={2}
              >
                {t('loanRemainingPrincipal')}
              </Text>
              <Text style={[styles.summaryValue, { color: '#EF4444' }]}>
                {formatCsCurrencyRounded(overview.remainingPrincipal, currentCurrency.symbol)}
              </Text>
            </View>

            <View style={styles.summaryRow}>
              <Text
                style={[styles.summaryLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}
                numberOfLines={2}
              >
                {t('loanLifetimeTotal')}
              </Text>
              <Text
                style={[styles.summaryValue, { color: isDarkMode ? 'white' : '#1F2937' }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {formatCsCurrencyRounded(overview.lifetimeTotal, currentCurrency.symbol)}
              </Text>
            </View>

            <View style={[styles.summaryRow, styles.summaryRowTotal]}>
              <Text
                style={[
                  styles.summaryLabel,
                  styles.summaryLabelTotal,
                  { color: isDarkMode ? 'white' : '#1F2937' },
                ]}
                numberOfLines={2}
              >
                {t('loanLifetimeInterest')}
              </Text>
              <Text
                style={[
                  styles.summaryValue,
                  styles.summaryValueTotal,
                  { color: isDarkMode ? 'white' : '#1F2937' },
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {formatCsCurrencyRounded(overview.lifetimeInterest, currentCurrency.symbol)}
              </Text>
            </View>
          </View>
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
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  editButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(239, 68, 68, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  iconContainer: {
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: 'hidden',
    marginBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconGradient: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loanTypeText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  progressCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  detailsCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  summaryCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  progressBarContainer: {
    marginBottom: 16,
  },
  progressBarBackground: {
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBar: {
    height: '100%',
    borderRadius: 6,
  },
  progressText: {
    fontSize: 14,
    textAlign: 'center',
  },
  progressStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 8,
  },
  progressStat: {
    alignItems: 'center',
  },
  progressStatLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  progressStatValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  progressStatsColumn: {
    marginTop: 8,
    gap: 6,
  },
  progressLine: {
    fontSize: 15,
    fontWeight: '600',
  },
  progressLineGreen: {
    fontSize: 16,
    fontWeight: '700',
  },
  progressInterestLine: {
    fontSize: 13,
    marginTop: 4,
  },
  undoPaymentBtn: {
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  undoPaymentText: {
    fontSize: 15,
    fontWeight: '600',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  detailIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(102, 126, 234, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  detailContent: {
    flex: 1,
    minWidth: 0,
  },
  detailLabel: {
    fontSize: 12,
    marginBottom: 2,
    flexShrink: 1,
  },
  detailValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  summarySubRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
    paddingLeft: 8,
  },
  summarySubLabel: {
    fontSize: 12,
    flex: 1,
    flexShrink: 1,
  },
  summarySubValue: {
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 0,
  },
  summaryRowTotal: {
    borderBottomWidth: 0,
    paddingTop: 16,
    marginTop: 8,
    borderTopWidth: 2,
    borderTopColor: 'rgba(102, 126, 234, 0.3)',
  },
  summaryLabel: {
    fontSize: 14,
    flex: 1,
    flexShrink: 1,
    paddingRight: 8,
  },
  summaryLabelTotal: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: 'bold',
    flexShrink: 0,
    maxWidth: '48%',
    textAlign: 'right',
  },
  summaryInterestValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  summaryValueTotal: {
    fontSize: 18,
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
  loanEmoji: {
    fontSize: 48,
  },
  interestRateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fixedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B98120',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  fixedBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#10B981',
  },
});
