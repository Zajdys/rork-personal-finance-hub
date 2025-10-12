import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  Home,
  Car,
  DollarSign,
  GraduationCap,
  Calendar,
  TrendingDown,
  Percent,
  CreditCard,
  Trash2,
} from 'lucide-react-native';
import { useFinanceStore, LoanType } from '@/store/finance-store';
import { useSettingsStore } from '@/store/settings-store';

export default function LoanDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { loans, deleteLoan, getLoanProgress } = useFinanceStore();
  const { isDarkMode, getCurrentCurrency } = useSettingsStore();

  const loan = loans.find((l) => l.id === id);
  const currentCurrency = getCurrentCurrency();

  if (!loan) {
    return (
      <View style={[styles.container, { backgroundColor: isDarkMode ? '#111827' : '#F8FAFC' }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: isDarkMode ? 'white' : '#1F2937' }]}>
            Závazek nenalezen
          </Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>Zpět</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const progress = getLoanProgress(loan.id);

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

  const handleDelete = () => {
    console.log('Delete button pressed for loan:', loan.id);
    Alert.alert(
      'Smazat závazek',
      'Opravdu chcete smazat tento závazek?',
      [
        {
          text: 'Zrušit',
          style: 'cancel',
          onPress: () => console.log('Delete cancelled'),
        },
        {
          text: 'Smazat',
          style: 'destructive',
          onPress: () => {
            console.log('Deleting loan:', loan.id);
            deleteLoan(loan.id);
            console.log('Loan deleted, navigating back');
            router.back();
          },
        },
      ],
      { cancelable: true }
    );
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
          <TouchableOpacity
            style={styles.headerBackButton}
            onPress={() => router.back()}
          >
            <ArrowLeft color="white" size={24} />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>
              {loan.name || getLoanTypeLabel(loan.loanType)}
            </Text>
            <Text style={styles.headerSubtitle}>Detail závazku</Text>
          </View>
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={handleDelete}
          >
            <Trash2 color="white" size={20} />
          </TouchableOpacity>
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
              Průběh splácení
            </Text>
            <View style={styles.progressBarContainer}>
              <View style={[styles.progressBarBackground, { backgroundColor: isDarkMode ? '#4B5563' : '#F3F4F6' }]}>
                <LinearGradient
                  colors={['#10B981', '#059669']}
                  style={[styles.progressBar, { width: `${progress.percentage}%` }]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                />
              </View>
              <Text style={[styles.progressText, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                {progress.percentage}% splaceno
              </Text>
            </View>
            <View style={styles.progressStats}>
              <View style={styles.progressStat}>
                <Text style={[styles.progressStatLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                  Splaceno měsíců
                </Text>
                <Text style={[styles.progressStatValue, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                  {progress.paidMonths} / {progress.totalMonths}
                </Text>
              </View>
              <View style={styles.progressStat}>
                <Text style={[styles.progressStatLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                  Zbývá měsíců
                </Text>
                <Text style={[styles.progressStatValue, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                  {loan.remainingMonths}
                </Text>
              </View>
            </View>
          </View>

          <View style={[styles.detailsCard, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}>
            <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
              Finanční údaje
            </Text>

            <View style={styles.detailRow}>
              <View style={styles.detailIconContainer}>
                <DollarSign color="#667eea" size={20} />
              </View>
              <View style={styles.detailContent}>
                <Text style={[styles.detailLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                  Výše úvěru
                </Text>
                <Text style={[styles.detailValue, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                  {loan.loanAmount.toLocaleString('cs-CZ')} {currentCurrency.symbol}
                </Text>
              </View>
            </View>

            <View style={styles.detailRow}>
              <View style={styles.detailIconContainer}>
                <Percent color="#667eea" size={20} />
              </View>
              <View style={styles.detailContent}>
                <Text style={[styles.detailLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                  Úroková sazba
                </Text>
                <Text style={[styles.detailValue, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                  {loan.interestRate}% p.a.
                </Text>
              </View>
            </View>

            <View style={styles.detailRow}>
              <View style={styles.detailIconContainer}>
                <CreditCard color="#667eea" size={20} />
              </View>
              <View style={styles.detailContent}>
                <Text style={[styles.detailLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                  Měsíční splátka
                </Text>
                <Text style={[styles.detailValue, { color: '#EF4444' }]}>
                  {loan.monthlyPayment.toLocaleString('cs-CZ')} {currentCurrency.symbol}
                </Text>
              </View>
            </View>

            <View style={styles.detailRow}>
              <View style={styles.detailIconContainer}>
                <Calendar color="#667eea" size={20} />
              </View>
              <View style={styles.detailContent}>
                <Text style={[styles.detailLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                  Datum zahájení
                </Text>
                <Text style={[styles.detailValue, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                  {new Date(loan.startDate).toLocaleDateString('cs-CZ')}
                </Text>
              </View>
            </View>

            <View style={styles.detailRow}>
              <View style={styles.detailIconContainer}>
                <TrendingDown color="#667eea" size={20} />
              </View>
              <View style={styles.detailContent}>
                <Text style={[styles.detailLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                  Zbývající dluh
                </Text>
                <Text style={[styles.detailValue, { color: '#EF4444' }]}>
                  {progress.remainingAmount.toLocaleString('cs-CZ')} {currentCurrency.symbol}
                </Text>
              </View>
            </View>
          </View>

          <View style={[styles.summaryCard, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}>
            <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
              Celkový přehled
            </Text>
            
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                Celkem zaplaceno
              </Text>
              <Text style={[styles.summaryValue, { color: '#10B981' }]}>
                {progress.totalPaid.toLocaleString('cs-CZ')} {currentCurrency.symbol}
              </Text>
            </View>

            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                Zbývá zaplatit
              </Text>
              <Text style={[styles.summaryValue, { color: '#EF4444' }]}>
                {progress.remainingAmount.toLocaleString('cs-CZ')} {currentCurrency.symbol}
              </Text>
            </View>

            <View style={[styles.summaryRow, styles.summaryRowTotal]}>
              <Text style={[styles.summaryLabel, styles.summaryLabelTotal, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                Celková částka k zaplacení
              </Text>
              <Text style={[styles.summaryValue, styles.summaryValueTotal, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                {(progress.totalPaid + progress.remainingAmount).toLocaleString('cs-CZ')} {currentCurrency.symbol}
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
  },
  detailLabel: {
    fontSize: 12,
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
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
  },
  summaryLabelTotal: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: 'bold',
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
});
