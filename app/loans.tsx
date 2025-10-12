import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  Plus,
  Home,
  Car,
  DollarSign,
  GraduationCap,
  CreditCard,
  Trash2,
  Sparkles,
  TrendingDown,
  AlertCircle,
  CheckCircle,
} from 'lucide-react-native';
import { useFinanceStore, LoanType } from '@/store/finance-store';
import { useSettingsStore } from '@/store/settings-store';

export default function LoansScreen() {
  const router = useRouter();
  const { loans, getLoanProgress, deleteLoan } = useFinanceStore();
  const { isDarkMode, getCurrentCurrency } = useSettingsStore();
  const currentCurrency = getCurrentCurrency();
  const [analyzingLoans, setAnalyzingLoans] = React.useState(false);
  const [loanAnalysis, setLoanAnalysis] = React.useState<Record<string, {
    currentRate: number;
    bestRate: number;
    bestProvider: string;
    potentialSavings: number;
    recommendation: string;
    status: 'good' | 'average' | 'poor';
  }>>({});

  const analyzeLoan = async (loan: any) => {
    const bestOffers: Record<string, Array<{ provider: string; rate: number }>> = {
      mortgage: [
        { provider: 'Česká spořitelna', rate: 4.49 },
        { provider: 'Raiffeisenbank', rate: 4.59 },
        { provider: 'ČSOB', rate: 4.69 },
        { provider: 'Komerční banka', rate: 4.79 },
        { provider: 'mBank', rate: 4.89 },
      ],
      car: [
        { provider: 'Raiffeisenbank', rate: 5.99 },
        { provider: 'ČSOB', rate: 6.49 },
        { provider: 'Česká spořitelna', rate: 6.79 },
        { provider: 'UniCredit Bank', rate: 6.99 },
        { provider: 'Komerční banka', rate: 7.29 },
      ],
      personal: [
        { provider: 'Air Bank', rate: 7.90 },
        { provider: 'mBank', rate: 8.20 },
        { provider: 'Raiffeisenbank', rate: 8.49 },
        { provider: 'ČSOB', rate: 8.99 },
        { provider: 'Česká spořitelna', rate: 9.49 },
      ],
      student: [
        { provider: 'ČSOB', rate: 3.49 },
        { provider: 'Česká spořitelna', rate: 3.79 },
        { provider: 'Komerční banka', rate: 3.99 },
        { provider: 'Raiffeisenbank', rate: 4.29 },
      ],
      other: [
        { provider: 'Air Bank', rate: 6.90 },
        { provider: 'mBank', rate: 7.20 },
        { provider: 'Raiffeisenbank', rate: 7.49 },
        { provider: 'ČSOB', rate: 7.99 },
      ],
    };

    const offers = bestOffers[loan.loanType] || bestOffers.other;
    const bestOffer = offers[0];
    const currentRate = loan.interestRate;
    const bestRate = bestOffer.rate;
    const bestProvider = bestOffer.provider;
    
    let status: 'good' | 'average' | 'poor';
    let recommendation: string;
    
    if (currentRate <= bestRate + 0.3) {
      status = 'good';
      recommendation = `Máte výbornou sazbu! Aktuálně nejlepší nabídka je ${bestRate}% u ${bestProvider}.`;
    } else if (currentRate <= bestRate + 1.0) {
      status = 'average';
      recommendation = `Můžete ušetřit! ${bestProvider} nabízí ${bestRate}%. Zvažte refinancování.`;
    } else {
      status = 'poor';
      recommendation = `Přeplácíte! ${bestProvider} nabízí ${bestRate}%. Refinancování se vyplatí!`;
    }
    
    const progress = getLoanProgress(loan.id);
    const remainingMonths = loan.remainingMonths;
    const monthlyPaymentDiff = (currentRate - bestRate) / 100 / 12 * progress.remainingAmount;
    const potentialSavings = Math.max(0, monthlyPaymentDiff * remainingMonths);
    
    return {
      currentRate,
      bestRate,
      bestProvider,
      potentialSavings: Math.round(potentialSavings),
      recommendation,
      status,
    };
  };

  const analyzeAllLoans = async () => {
    if (loans.length === 0) return;
    
    setAnalyzingLoans(true);
    const analysis: Record<string, any> = {};
    
    for (const loan of loans) {
      await new Promise(resolve => setTimeout(resolve, 500));
      analysis[loan.id] = await analyzeLoan(loan);
    }
    
    setLoanAnalysis(analysis);
    setAnalyzingLoans(false);
  };

  React.useEffect(() => {
    if (loans.length > 0 && Object.keys(loanAnalysis).length === 0) {
      analyzeAllLoans();
    }
  }, [loans]);

  const handleDeleteLoan = (loanId: string, loanName: string) => {
    Alert.alert(
      'Smazat závazek',
      `Opravdu chcete smazat závazek "${loanName}"?`,
      [
        {
          text: 'Zrušit',
          style: 'cancel',
        },
        {
          text: 'Smazat',
          style: 'destructive',
          onPress: () => {
            deleteLoan(loanId);
          },
        },
      ]
    );
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

  const getLoanTypeLabel = (type: LoanType) => {
    switch (type) {
      case 'mortgage':
        return 'Hypotéka';
      case 'car':
        return 'Úvěr na auto';
      case 'personal':
        return 'Osobní úvěr';
      case 'student':
        return 'Studentský úvěr';
      case 'other':
        return 'Jiný úvěr';
      default:
        return 'Úvěr';
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
          <TouchableOpacity
            style={styles.headerBackButton}
            onPress={() => router.back()}
          >
            <ArrowLeft color="white" size={24} />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>Moje závazky</Text>
            <Text style={styles.headerSubtitle}>
              {loans.length} {loans.length === 1 ? 'závazek' : loans.length < 5 ? 'závazky' : 'závazků'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => router.push('/add-loan')}
          >
            <Plus color="white" size={24} />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          {loans.length > 0 && (
            <View style={[styles.aiCard, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}>
              <View style={styles.aiHeader}>
                <View style={styles.aiIconContainer}>
                  <Sparkles color="#F59E0B" size={24} />
                </View>
                <View style={styles.aiHeaderText}>
                  <Text style={[styles.aiTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                    AI Analýza úvěrů
                  </Text>
                  <Text style={[styles.aiSubtitle, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                    Najdeme pro vás nejlepší nabídky na trhu
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.refreshButton}
                  onPress={analyzeAllLoans}
                  disabled={analyzingLoans}
                >
                  <Text style={styles.refreshButtonText}>
                    {analyzingLoans ? '...' : '🔄'}
                  </Text>
                </TouchableOpacity>
              </View>
              
              {analyzingLoans ? (
                <View style={styles.analyzingContainer}>
                  <Text style={[styles.analyzingText, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                    Analyzuji vaše úvěry...
                  </Text>
                </View>
              ) : (
                <View style={styles.aiContent}>
                  {loans.map((loan) => {
                    const analysis = loanAnalysis[loan.id];
                    if (!analysis) return null;
                    
                    const StatusIcon = analysis.status === 'good' ? CheckCircle : 
                                     analysis.status === 'average' ? AlertCircle : TrendingDown;
                    const statusColor = analysis.status === 'good' ? '#10B981' : 
                                      analysis.status === 'average' ? '#F59E0B' : '#EF4444';
                    
                    return (
                      <View key={loan.id} style={[styles.analysisItem, { borderLeftColor: statusColor }]}>
                        <View style={styles.analysisHeader}>
                          <Text style={[styles.analysisLoanName, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                            {loan.name || getLoanTypeLabel(loan.loanType)}
                          </Text>
                          <StatusIcon color={statusColor} size={20} />
                        </View>
                        <View style={styles.analysisStats}>
                          <View style={styles.analysisStat}>
                            <Text style={[styles.analysisStatLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                              Vaše sazba
                            </Text>
                            <Text style={[styles.analysisStatValue, { color: statusColor }]}>
                              {analysis.currentRate}%
                            </Text>
                          </View>
                          <View style={styles.analysisStat}>
                            <Text style={[styles.analysisStatLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                              Nejlepší nabídka
                            </Text>
                            <Text style={[styles.analysisStatValue, { color: '#10B981' }]}>
                              {analysis.bestRate}%
                            </Text>
                          </View>
                          {analysis.potentialSavings > 0 && (
                            <View style={styles.analysisStat}>
                              <Text style={[styles.analysisStatLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                                Možná úspora
                              </Text>
                              <Text style={[styles.analysisStatValue, { color: '#10B981' }]}>
                                {analysis.potentialSavings.toLocaleString('cs-CZ')} {currentCurrency.symbol}
                              </Text>
                            </View>
                          )}
                        </View>
                        <View style={styles.bestProviderContainer}>
                          <Text style={[styles.bestProviderLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                            💡 Nejlepší nabídka:
                          </Text>
                          <Text style={[styles.bestProviderValue, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                            {analysis.bestProvider}
                          </Text>
                        </View>
                        <Text style={[styles.analysisRecommendation, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                          {analysis.recommendation}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          )}
          {loans.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}>
              <CreditCard color={isDarkMode ? '#9CA3AF' : '#6B7280'} size={64} />
              <Text style={[styles.emptyTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                Zatím nemáte žádné závazky
              </Text>
              <Text style={[styles.emptySubtitle, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                Přidejte svou hypotéku, úvěr nebo půjčku a sledujte průběh splácení
              </Text>
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={() => router.push('/add-loan')}
              >
                <LinearGradient
                  colors={['#667eea', '#764ba2']}
                  style={styles.emptyButtonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Plus color="white" size={20} />
                  <Text style={styles.emptyButtonText}>Přidat první závazek</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          ) : (
            loans.map((loan) => {
              const progress = getLoanProgress(loan.id);
              const LoanIcon = getLoanIcon(loan.loanType);
              const loanName = loan.name || getLoanTypeLabel(loan.loanType);
              
              return (
                <View key={loan.id} style={[styles.loanCard, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}>
                  <View style={styles.loanCardContent}>
                    <View style={styles.loanHeader}>
                      <TouchableOpacity
                        style={styles.loanHeaderTouchable}
                        onPress={() => router.push(`/loan-detail?id=${loan.id}`)}
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
                        Výše úvěru
                      </Text>
                      <Text style={[styles.loanDetailValue, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                        {loan.loanAmount.toLocaleString('cs-CZ')} {currentCurrency.symbol}
                      </Text>
                    </View>
                    <View style={styles.loanDetailRow}>
                      <Text style={[styles.loanDetailLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                        Měsíční splátka
                      </Text>
                      <Text style={[styles.loanDetailValue, { color: '#EF4444' }]}>
                        {loan.monthlyPayment.toLocaleString('cs-CZ')} {currentCurrency.symbol}
                      </Text>
                    </View>
                    <View style={styles.loanDetailRow}>
                      <Text style={[styles.loanDetailLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                        Úroková sazba
                      </Text>
                      <Text style={[styles.loanDetailValue, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                        {loan.interestRate}% p.a.
                      </Text>
                    </View>
                    <View style={styles.loanDetailRow}>
                      <Text style={[styles.loanDetailLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                        Zbývá měsíců
                      </Text>
                      <Text style={[styles.loanDetailValue, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                        {loan.remainingMonths}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.progressContainer}>
                    <View style={styles.progressHeader}>
                      <Text style={[styles.progressLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                        Průběh splácení
                      </Text>
                      <Text style={[styles.progressPercentage, { color: '#10B981' }]}>
                        {progress.percentage}%
                      </Text>
                    </View>
                    <View style={[styles.progressBarBackground, { backgroundColor: isDarkMode ? '#4B5563' : '#F3F4F6' }]}>
                      <LinearGradient
                        colors={['#10B981', '#059669']}
                        style={[styles.progressBar, { width: `${progress.percentage}%` }]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                      />
                    </View>
                    <View style={styles.progressStats}>
                      <Text style={[styles.progressStat, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                        Splaceno: {progress.totalPaid.toLocaleString('cs-CZ')} {currentCurrency.symbol}
                      </Text>
                      <Text style={[styles.progressStat, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                        Zbývá: {progress.remainingAmount.toLocaleString('cs-CZ')} {currentCurrency.symbol}
                      </Text>
                    </View>
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
  aiCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  aiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  aiIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  aiHeaderText: {
    flex: 1,
  },
  aiTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  aiSubtitle: {
    fontSize: 13,
  },
  refreshButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshButtonText: {
    fontSize: 18,
  },
  analyzingContainer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  analyzingText: {
    fontSize: 14,
  },
  aiContent: {
    gap: 12,
  },
  analysisItem: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.02)',
    borderLeftWidth: 4,
  },
  analysisHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  analysisLoanName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  analysisStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 8,
  },
  analysisStat: {
    flex: 1,
  },
  analysisStatLabel: {
    fontSize: 11,
    marginBottom: 4,
  },
  analysisStatValue: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  analysisRecommendation: {
    fontSize: 13,
    lineHeight: 18,
    fontStyle: 'italic' as const,
  },
  bestProviderContainer: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.05)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bestProviderLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  bestProviderValue: {
    fontSize: 14,
    fontWeight: 'bold',
  },
});
