import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  Calendar,
  CreditCard,
  DollarSign,
  Trash2,
  AlertCircle,
  CheckCircle,
  XCircle,
} from 'lucide-react-native';
import { useFinanceStore, SubscriptionItem } from '@/store/finance-store';
import { useRouter, Stack, useLocalSearchParams } from 'expo-router';
import { useSettingsStore } from '@/store/settings-store';

export default function SubscriptionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { subscriptions, updateSubscription, deleteSubscription } = useFinanceStore();
  const { isDarkMode, getCurrentCurrency } = useSettingsStore();
  const router = useRouter();
  const [isCancelling, setIsCancelling] = useState<boolean>(false);

  const subscription = subscriptions.find(s => s.id === id);
  const currentCurrency = getCurrentCurrency();

  if (!subscription) {
    return (
      <View style={[styles.container, { backgroundColor: isDarkMode ? '#111827' : '#F8FAFC' }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.errorContainer}>
          <AlertCircle color="#EF4444" size={48} />
          <Text style={[styles.errorText, { color: isDarkMode ? 'white' : '#1F2937' }]}>
            Předplatné nenalezeno
          </Text>
          <TouchableOpacity
            style={styles.backToHomeButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backToHomeButtonText}>Zpět</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const getNextPaymentDate = () => {
    const today = new Date();
    const currentDay = today.getDate();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    let nextPaymentDate: Date;

    if (currentDay < subscription.dayOfMonth) {
      nextPaymentDate = new Date(currentYear, currentMonth, subscription.dayOfMonth);
    } else {
      nextPaymentDate = new Date(currentYear, currentMonth + 1, subscription.dayOfMonth);
    }

    return nextPaymentDate;
  };

  const getDaysUntilNextPayment = () => {
    const today = new Date();
    const nextPayment = getNextPaymentDate();
    const diffTime = nextPayment.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const getSubscriptionDuration = () => {
    const startDate = subscription.id === 'patreon-test' 
      ? new Date(new Date().setMonth(new Date().getMonth() - 6))
      : null;
    
    if (!startDate) {
      return 'Informace o délce předplatného není dostupná';
    }
    
    const today = new Date();
    const monthsDiff = (today.getFullYear() - startDate.getFullYear()) * 12 + 
                       (today.getMonth() - startDate.getMonth());
    
    if (monthsDiff === 0) {
      return 'Nově přidáno';
    } else if (monthsDiff === 1) {
      return '1 měsíc';
    } else if (monthsDiff < 12) {
      return `${monthsDiff} měsíců`;
    } else {
      const years = Math.floor(monthsDiff / 12);
      const months = monthsDiff % 12;
      if (months === 0) {
        return years === 1 ? '1 rok' : `${years} roky`;
      } else {
        return `${years} ${years === 1 ? 'rok' : 'roky'} a ${months} ${months === 1 ? 'měsíc' : 'měsíců'}`;
      }
    }
  };

  const handleToggleActive = () => {
    updateSubscription(subscription.id, { active: !subscription.active });
  };

  const handleCancelSubscription = () => {
    Alert.alert(
      'Zrušit předplatné',
      `Opravdu chceš zrušit předplatné ${subscription.name}? Tato akce pouze odstraní předplatné z tvého seznamu, nezruší skutečné předplatné u poskytovatele.`,
      [
        {
          text: 'Zrušit',
          style: 'cancel',
        },
        {
          text: 'Odstranit',
          style: 'destructive',
          onPress: () => {
            setIsCancelling(true);
            setTimeout(() => {
              deleteSubscription(subscription.id);
              router.back();
            }, 500);
          },
        },
      ]
    );
  };

  const nextPaymentDate = getNextPaymentDate();
  const daysUntilPayment = getDaysUntilNextPayment();

  return (
    <View style={[styles.container, { backgroundColor: isDarkMode ? '#111827' : '#F8FAFC' }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient
        colors={subscription.active ? ['#667eea', '#764ba2'] : ['#6B7280', '#4B5563']}
        style={styles.headerGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.headerContent}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <ArrowLeft color="white" size={24} />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerSubtitle}>Předplatné</Text>
            <Text style={styles.headerTitle}>{subscription.name}</Text>
          </View>
        </View>
        <View style={styles.amountContainer}>
          <Text style={styles.amountLabel}>Měsíční platba</Text>
          <Text style={styles.amountValue}>
            {subscription.amount.toLocaleString('cs-CZ')} {currentCurrency.symbol}
          </Text>
          <View style={styles.statusBadge}>
            <View style={[styles.statusDot, { backgroundColor: subscription.active ? '#10B981' : '#EF4444' }]} />
            <Text style={styles.statusText}>
              {subscription.active ? 'Aktivní' : 'Neaktivní'}
            </Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          {/* Next Payment */}
          <View style={[styles.card, { backgroundColor: isDarkMode ? '#1F2937' : 'white' }]}>
            <View style={styles.cardHeader}>
              <Calendar color="#667eea" size={24} />
              <Text style={[styles.cardTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                Příští platba
              </Text>
            </View>
            <View style={styles.cardContent}>
              <Text style={[styles.nextPaymentDate, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                {nextPaymentDate.toLocaleDateString('cs-CZ', { 
                  day: 'numeric', 
                  month: 'long', 
                  year: 'numeric' 
                })}
              </Text>
              <View style={styles.daysUntilContainer}>
                <View style={[styles.daysUntilBadge, { 
                  backgroundColor: daysUntilPayment <= 7 ? '#FEF3C7' : isDarkMode ? '#374151' : '#F3F4F6' 
                }]}>
                  <Text style={[styles.daysUntilText, { 
                    color: daysUntilPayment <= 7 ? '#F59E0B' : isDarkMode ? '#D1D5DB' : '#6B7280' 
                  }]}>
                    {daysUntilPayment === 0 ? 'Dnes!' : 
                     daysUntilPayment === 1 ? 'Zítra!' : 
                     `Za ${daysUntilPayment} dní`}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Subscription Details */}
          <View style={[styles.card, { backgroundColor: isDarkMode ? '#1F2937' : 'white' }]}>
            <View style={styles.cardHeader}>
              <CreditCard color="#667eea" size={24} />
              <Text style={[styles.cardTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                Detaily předplatného
              </Text>
            </View>
            <View style={styles.cardContent}>
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
                  Kategorie
                </Text>
                <Text style={[styles.detailValue, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                  {subscription.category}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
                  Den platby
                </Text>
                <Text style={[styles.detailValue, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                  {subscription.dayOfMonth}. den v měsíci
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
                  Zdroj
                </Text>
                <Text style={[styles.detailValue, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                  {subscription.source === 'bank' ? 'Bankovní výpis' : 'Manuální'}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
                  Délka předplatného
                </Text>
                <Text style={[styles.detailValue, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                  {getSubscriptionDuration()}
                </Text>
              </View>
            </View>
          </View>

          {/* Yearly Cost */}
          <View style={[styles.card, { backgroundColor: isDarkMode ? '#1F2937' : 'white' }]}>
            <View style={styles.cardHeader}>
              <DollarSign color="#667eea" size={24} />
              <Text style={[styles.cardTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                Roční náklady
              </Text>
            </View>
            <View style={styles.cardContent}>
              <Text style={[styles.yearlyAmount, { color: '#667eea' }]}>
                {(subscription.amount * 12).toLocaleString('cs-CZ')} {currentCurrency.symbol}
              </Text>
              <Text style={[styles.yearlySubtext, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
                Celkem za rok
              </Text>
            </View>
          </View>

          {/* Info Box */}
          <View style={styles.infoBox}>
            <AlertCircle color="#3B82F6" size={20} />
            <Text style={styles.infoText}>
              Tato aplikace pouze sleduje tvá předplatná. Pro skutečné zrušení předplatného kontaktuj přímo poskytovatele služby.
            </Text>
          </View>

          {/* Actions */}
          <View style={styles.actionsContainer}>
            <TouchableOpacity
              style={[styles.actionButton, styles.toggleButton, {
                backgroundColor: subscription.active ? '#FEF3C7' : '#D1FAE5'
              }]}
              onPress={handleToggleActive}
            >
              {subscription.active ? (
                <XCircle color="#F59E0B" size={20} />
              ) : (
                <CheckCircle color="#10B981" size={20} />
              )}
              <Text style={[styles.actionButtonText, {
                color: subscription.active ? '#F59E0B' : '#10B981'
              }]}>
                {subscription.active ? 'Označit jako neaktivní' : 'Označit jako aktivní'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.deleteButton]}
              onPress={handleCancelSubscription}
              disabled={isCancelling}
            >
              <Trash2 color="white" size={20} />
              <Text style={styles.deleteButtonText}>
                {isCancelling ? 'Odstraňuji...' : 'Odstranit předplatné'}
              </Text>
            </TouchableOpacity>
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
  scrollView: {
    flex: 1,
  },
  headerGradient: {
    paddingTop: 60,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  backButton: {
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
  headerSubtitle: {
    fontSize: 14,
    color: 'white',
    opacity: 0.8,
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
  },
  amountContainer: {
    alignItems: 'center',
  },
  amountLabel: {
    fontSize: 14,
    color: 'white',
    opacity: 0.8,
    marginBottom: 8,
  },
  amountValue: {
    fontSize: 36,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
  },
  content: {
    padding: 20,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
    marginLeft: 12,
  },
  cardContent: {
    gap: 12,
  },
  nextPaymentDate: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1F2937',
  },
  daysUntilContainer: {
    flexDirection: 'row',
  },
  daysUntilBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  daysUntilText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  detailLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  yearlyAmount: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#667eea',
  },
  yearlySubtext: {
    fontSize: 14,
    color: '#6B7280',
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#DBEAFE',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#1E40AF',
    lineHeight: 18,
  },
  actionsContainer: {
    gap: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  toggleButton: {
    backgroundColor: '#FEF3C7',
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  deleteButton: {
    backgroundColor: '#EF4444',
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginTop: 16,
    marginBottom: 24,
  },
  backToHomeButton: {
    backgroundColor: '#667eea',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  backToHomeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
});