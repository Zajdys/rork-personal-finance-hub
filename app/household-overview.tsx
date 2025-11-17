import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Users, Settings, TrendingUp, DollarSign, PiggyBank } from 'lucide-react-native';
import { useHousehold } from '@/store/household-store';
import { useSettingsStore } from '@/store/settings-store';

export default function HouseholdOverviewScreen() {
  const router = useRouter();
  const { currentHousehold, dashboard, isInHousehold } = useHousehold();
  const { getCurrentCurrency } = useSettingsStore();
  const currency = getCurrentCurrency();

  if (!isInHousehold || !currentHousehold || !dashboard) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ title: 'Přehled domácnosti', headerShown: true }} />
        <View style={styles.emptyState}>
          <Users size={80} color="#8B5CF6" strokeWidth={1.5} />
          <Text style={styles.emptyTitle}>Nejste v žádné domácnosti</Text>
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={() => router.push('/household')}
          >
            <Text style={styles.settingsButtonText}>Vytvořit domácnost</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const totalBudget = currentHousehold.categoryBudgets
    ? Object.values(currentHousehold.categoryBudgets).reduce(
        (sum, b) => sum + (b.monthlyLimit || 0),
        0
      )
    : 0;

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen
        options={{
          title: '',
          headerShown: true,
          headerTransparent: true,
          headerRight: () => (
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => router.push('/household')}
            >
              <Settings size={22} color="#FFF" strokeWidth={2} />
            </TouchableOpacity>
          ),
        }}
      />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <LinearGradient
          colors={['#8B5CF6', '#7C3AED']}
          style={styles.header}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Text style={styles.headerEmoji}>🏠</Text>
          <Text style={styles.headerTitle}>{currentHousehold.name}</Text>
          <Text style={styles.headerSubtitle}>
            {currentHousehold.members.filter(m => m.joinStatus === 'ACTIVE').length} členů
          </Text>
        </LinearGradient>

        {/* Celkový rozpočet */}
        <View style={styles.section}>
          <View style={styles.budgetCard}>
            <PiggyBank size={28} color="#8B5CF6" strokeWidth={2} />
            <Text style={styles.budgetLabel}>Celkový měsíční rozpočet</Text>
            <Text style={styles.budgetValue}>
              {totalBudget.toLocaleString('cs-CZ')} {currency.symbol}
            </Text>
            <Text style={styles.budgetSubtext}>Společný rozpočet domácnosti</Text>
          </View>
        </View>

        {/* Tabulka s výdaji */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Přehled výdajů</Text>
          <View style={styles.expenseTable}>
            <View style={styles.tableHeader}>
              <Text style={styles.tableHeaderText}>Statistika</Text>
              <Text style={styles.tableHeaderText}>Částka</Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.tableLabel}>Celkové výdaje</Text>
              <Text style={styles.tableValue}>
                {dashboard.totalSharedExpenses.toFixed(0)} {currency.symbol}
              </Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.tableLabel}>Celkové příjmy</Text>
              <Text style={[styles.tableValue, styles.incomeValue]}>
                {dashboard.totalSharedIncome.toFixed(0)} {currency.symbol}
              </Text>
            </View>
            <View style={[styles.tableRow, styles.tableTotalRow]}>
              <Text style={styles.tableTotalLabel}>Bilance</Text>
              <Text style={[styles.tableTotalValue, dashboard.sharedBalance < 0 && styles.negativeBalance]}>
                {dashboard.sharedBalance.toFixed(0)} {currency.symbol}
              </Text>
            </View>
          </View>

          {/* Tabulka - kdo kolik zaplatil */}
          <View style={styles.membersTable}>
            <View style={styles.tableHeader}>
              <Text style={styles.tableHeaderText}>Člen</Text>
              <Text style={styles.tableHeaderText}>Zaplatil</Text>
            </View>
            {dashboard.balances.map(balance => (
              <View key={balance.userId} style={styles.tableRow}>
                <View style={styles.memberNameContainer}>
                  <View style={[styles.memberDot, { backgroundColor: balance.userId === 'mock_user_1' ? '#3B82F6' : '#10B981' }]} />
                  <Text style={styles.tableLabel}>{balance.userName}</Text>
                </View>
                <Text style={styles.tableValue}>
                  {balance.totalPaid.toFixed(0)} {currency.symbol}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Limity kategorií */}
        {currentHousehold.categoryBudgets && Object.keys(currentHousehold.categoryBudgets).length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Limity kategorií</Text>
            <View style={styles.categoriesContainer}>
              {Object.entries(currentHousehold.categoryBudgets).map(([categoryId, budget]) => {
                const categoryBalance = dashboard.categoryBalances.find(cb => cb.category === categoryId);
                const limit = budget.monthlyLimit || 0;

                const getCategoryName = (id: string): string => {
                  const categoryNames: Record<string, string> = {
                    'housing': 'Bydlení',
                    'food': 'Jídlo',
                    'transport': 'Doprava',
                    'entertainment': 'Zábava',
                    'utilities': 'Energie',
                    'shopping': 'Nákupy',
                    'health': 'Zdraví',
                    'education': 'Vzdělání',
                  };
                  return categoryNames[id] || id;
                };

                const myUserId = 'mock_user_1';
                const partnerUserId = 'mock_user_2';

                const myPaid = categoryBalance?.memberBalances[myUserId]?.paid || 0;
                const partnerPaid = categoryBalance?.memberBalances[partnerUserId]?.paid || 0;
                const totalPaid = myPaid + partnerPaid;

                const totalUsagePercent = limit > 0 ? (totalPaid / limit) * 100 : 0;

                return (
                  <View key={categoryId} style={styles.categoryCard}>
                    <View style={styles.categoryHeader}>
                      <Text style={styles.categoryName}>{getCategoryName(categoryId)}</Text>
                      <Text style={styles.categoryLimit}>
                        {totalPaid.toFixed(0)} / {limit.toFixed(0)} {currency.symbol}
                      </Text>
                    </View>

                    <View style={styles.progressBar}>
                      <View
                        style={[
                          styles.progressFill,
                          {
                            width: `${Math.min(totalUsagePercent, 100)}%`,
                            backgroundColor: totalUsagePercent > 80 ? '#EF4444' : '#8B5CF6',
                          }
                        ]}
                      />
                    </View>

                    <Text style={styles.categoryPercentage}>
                      {totalUsagePercent.toFixed(0)}% využito
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Bilance členů */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bilance členů</Text>
          <View style={styles.balancesContainer}>
            {dashboard.balances.map(balance => (
              <View key={balance.userId} style={styles.balanceCard}>
                <View style={styles.balanceHeader}>
                  <View style={styles.balanceAvatar}>
                    <Text style={styles.balanceAvatarText}>
                      {balance.userName.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.balanceInfo}>
                    <Text style={styles.balanceName}>{balance.userName}</Text>
                    <Text style={styles.balanceDetail}>
                      Zaplatil {balance.totalPaid.toFixed(0)} {currency.symbol}
                    </Text>
                  </View>
                </View>
                <View style={styles.balanceAmountContainer}>
                  <Text
                    style={[
                      styles.balanceAmount,
                      balance.balance > 100 && styles.balancePositive,
                      balance.balance < -100 && styles.balanceNegative,
                      Math.abs(balance.balance) <= 100 && styles.balanceNeutral,
                    ]}
                  >
                    {balance.balance > 0 ? '+' : ''}{balance.balance.toFixed(0)} {currency.symbol}
                  </Text>
                  <Text style={styles.balanceStatus}>
                    {Math.abs(balance.balance) <= 100 
                      ? 'Vyrovnáno' 
                      : balance.balance > 100 
                      ? 'Přeplatek' 
                      : 'Dluh'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Tlačítko pro pokročilé nastavení */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.advancedButton}
            onPress={() => router.push('/household')}
          >
            <Settings size={18} color="#8B5CF6" strokeWidth={2} />
            <Text style={styles.advancedButtonText}>Pokročilé nastavení</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    paddingBottom: 32,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: '#1F2937',
    marginTop: 16,
    marginBottom: 24,
  },
  settingsButton: {
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  settingsButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600' as const,
  },
  header: {
    paddingTop: 100,
    paddingBottom: 32,
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  headerEmoji: {
    fontSize: 48,
    marginBottom: 12,
    textAlign: 'center' as const,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800' as const,
    color: '#FFF',
    marginBottom: 6,
    textAlign: 'center' as const,
  },
  headerSubtitle: {
    fontSize: 15,
    color: '#FFF',
    opacity: 0.9,
    textAlign: 'center' as const,
  },
  headerButton: {
    padding: 8,
  },
  section: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: '#1F2937',
    marginBottom: 16,
  },
  budgetCard: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center' as const,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
  budgetLabel: {
    fontSize: 15,
    color: '#6B7280',
    marginTop: 16,
    marginBottom: 8,
    fontWeight: '500' as const,
  },
  budgetValue: {
    fontSize: 40,
    fontWeight: '800' as const,
    color: '#8B5CF6',
    marginBottom: 6,
  },
  budgetSubtext: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  splitsContainer: {
    gap: 12,
  },
  splitCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  splitHeader: {
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  splitCategory: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: '#1F2937',
  },
  splitDetails: {
    gap: 10,
  },
  splitRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  splitText: {
    fontSize: 15,
    color: '#6B7280',
    flex: 1,
  },
  splitMember: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: '#1F2937',
    flex: 1,
  },
  splitPercentage: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: '#8B5CF6',
  },
  emptyCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center' as const,
  },
  emptyText: {
    fontSize: 15,
    color: '#9CA3AF',
  },
  categoriesContainer: {
    gap: 12,
  },
  categoryCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  categoryHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: 14,
  },
  categoryName: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: '#1F2937',
  },
  categoryLimit: {
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '500' as const,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden' as const,
    marginBottom: 10,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  categoryPercentage: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500' as const,
  },
  balancesContainer: {
    gap: 12,
  },
  balanceCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  balanceHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    flex: 1,
  },
  balanceAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#8B5CF6',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginRight: 14,
  },
  balanceAvatarText: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: '#FFF',
  },
  balanceInfo: {
    flex: 1,
  },
  balanceName: {
    fontSize: 17,
    fontWeight: '600' as const,
    color: '#1F2937',
    marginBottom: 3,
  },
  balanceDetail: {
    fontSize: 13,
    color: '#6B7280',
  },
  balanceAmountContainer: {
    alignItems: 'flex-end' as const,
  },
  balanceAmount: {
    fontSize: 20,
    fontWeight: '700' as const,
    marginBottom: 2,
  },
  balancePositive: {
    color: '#10B981',
  },
  balanceNegative: {
    color: '#EF4444',
  },
  balanceNeutral: {
    color: '#6B7280',
  },
  balanceStatus: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '500' as const,
  },
  advancedButton: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 18,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 2,
    borderColor: '#E9D5FF',
  },
  advancedButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#8B5CF6',
  },
  expenseTable: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    overflow: 'hidden' as const,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: 16,
  },
  membersTable: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    overflow: 'hidden' as const,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  tableHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    backgroundColor: '#F9FAFB',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  tableHeaderText: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: '#6B7280',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  tableLabel: {
    fontSize: 15,
    color: '#1F2937',
    fontWeight: '500' as const,
  },
  tableValue: {
    fontSize: 15,
    color: '#1F2937',
    fontWeight: '600' as const,
  },
  incomeValue: {
    color: '#10B981',
  },
  tableTotalRow: {
    backgroundColor: '#F9FAFB',
    borderBottomWidth: 0,
  },
  tableTotalLabel: {
    fontSize: 16,
    color: '#1F2937',
    fontWeight: '700' as const,
  },
  tableTotalValue: {
    fontSize: 18,
    fontWeight: '800' as const,
    color: '#10B981',
  },
  negativeBalance: {
    color: '#EF4444',
  },
  memberNameContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
  },
  memberDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
