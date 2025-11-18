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
import { Users, Settings, PiggyBank } from 'lucide-react-native';
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

        {/* Přehled výdajů - Card design jako finanční cíle */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Přehled výdajů</Text>
            <View style={styles.tabsContainer}>
              <Text style={styles.activeTab}>STATISTIKA</Text>
              <Text style={styles.inactiveTab}>ČÁSTKA</Text>
            </View>
          </View>
          
          {/* Celkové statistiky */}
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Celkové výdaje</Text>
              <Text style={styles.statValue}>{dashboard.totalSharedExpenses.toFixed(0)} {currency.symbol}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Celkové příjmy</Text>
              <Text style={[styles.statValue, { color: '#10B981' }]}>{dashboard.totalSharedIncome.toFixed(0)} {currency.symbol}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Bilance</Text>
              <Text style={[styles.statValue, { color: dashboard.sharedBalance >= 0 ? '#10B981' : '#EF4444' }]}>
                {dashboard.sharedBalance.toFixed(0)} {currency.symbol}
              </Text>
            </View>
          </View>

          {/* Kdo kolik zaplatil - tabulka */}
          <View style={styles.memberTableCard}>
            <View style={styles.tableHeader}>
              <Text style={styles.tableHeaderText}>ČLEN</Text>
              <Text style={styles.tableHeaderText}>ZAPLATIL</Text>
            </View>
            {dashboard.balances.map((balance) => {
              const totalPaid = dashboard.balances.reduce((sum, b) => sum + b.totalPaid, 0);
              const memberColor = balance.userId === 'mock_user_1' ? '#3B82F6' : '#10B981';
              
              return (
                <View key={balance.userId} style={styles.tableRow}>
                  <View style={styles.tableMemberInfo}>
                    <View style={[styles.memberDot, { backgroundColor: memberColor }]} />
                    <Text style={styles.tableMemberName}>{balance.userName}</Text>
                  </View>
                  <Text style={styles.tableMemberAmount}>
                    {balance.totalPaid.toFixed(0)} {currency.symbol}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Rozpad 50/50 - progress bar */}
          <View style={styles.splitCard}>
            <Text style={styles.splitTitle}>Rozložení výdajů</Text>
            
            <View style={styles.splitProgressBarContainer}>
              <View style={styles.splitProgressBarBackground}>
                {dashboard.balances.map((balance, index) => {
                  const totalPaid = dashboard.balances.reduce((sum, b) => sum + b.totalPaid, 0);
                  const percentage = totalPaid > 0 ? (balance.totalPaid / totalPaid) * 100 : 0;
                  const memberColor = balance.userId === 'mock_user_1' ? '#3B82F6' : '#10B981';
                  const previousPercentages = dashboard.balances.slice(0, index).reduce((sum, b) => {
                    return sum + (totalPaid > 0 ? (b.totalPaid / totalPaid) * 100 : 0);
                  }, 0);
                  
                  return (
                    <View
                      key={balance.userId}
                      style={[
                        styles.splitProgressBar,
                        {
                          width: `${percentage}%`,
                          backgroundColor: memberColor,
                          position: index === 0 ? 'relative' : 'absolute',
                          left: index === 0 ? undefined : `${previousPercentages}%`,
                        },
                      ]}
                    />
                  );
                })}
              </View>
            </View>
            
            <View style={styles.splitPercentageRow}>
              {dashboard.balances.map(balance => {
                const totalPaid = dashboard.balances.reduce((sum, b) => sum + b.totalPaid, 0);
                const percentage = totalPaid > 0 ? (balance.totalPaid / totalPaid) * 100 : 0;
                const memberColor = balance.userId === 'mock_user_1' ? '#3B82F6' : '#10B981';
                
                return (
                  <Text key={balance.userId} style={[styles.splitPercentageText, { color: memberColor }]}>
                    {Math.round(percentage)}%
                  </Text>
                );
              })}
            </View>
          </View>
        </View>



        {/* Limity kategorií */}
        {currentHousehold.categoryBudgets && Object.keys(currentHousehold.categoryBudgets).length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Limity kategorií</Text>
            <View style={styles.categoriesGrid}>
              {Object.entries(currentHousehold.categoryBudgets).map(([categoryId, budget]) => {
                const categoryBalance = dashboard.categoryBalances.find(cb => cb.category === categoryId);
                const limit = budget.monthlyLimit || 0;

                const getCategoryInfo = (id: string): { name: string; emoji: string } => {
                  const categoryInfo: Record<string, { name: string; emoji: string }> = {
                    'housing': { name: 'Bydlení', emoji: '🏠' },
                    'food': { name: 'Jídlo', emoji: '🍕' },
                    'transport': { name: 'Doprava', emoji: '🚗' },
                    'entertainment': { name: 'Zábava', emoji: '🎮' },
                    'utilities': { name: 'Energie', emoji: '💡' },
                    'shopping': { name: 'Nákupy', emoji: '🛒' },
                    'health': { name: 'Zdraví', emoji: '⚕️' },
                    'education': { name: 'Vzdělání', emoji: '📚' },
                  };
                  return categoryInfo[id] || { name: id, emoji: '📁' };
                };

                const myUserId = 'mock_user_1';
                const partnerUserId = 'mock_user_2';

                const myPaid = categoryBalance?.memberBalances[myUserId]?.paid || 0;
                const partnerPaid = categoryBalance?.memberBalances[partnerUserId]?.paid || 0;
                const totalPaid = myPaid + partnerPaid;

                const totalUsagePercent = limit > 0 ? (totalPaid / limit) * 100 : 0;
                const categoryInfo = getCategoryInfo(categoryId);

                return (
                  <View key={categoryId} style={styles.compactCategoryCard}>
                    <Text style={styles.categoryEmoji}>{categoryInfo.emoji}</Text>
                    <Text style={styles.compactCategoryName}>{categoryInfo.name}</Text>
                    <Text style={styles.compactCategoryAmount}>
                      {totalPaid.toFixed(0)} / {limit.toFixed(0)}
                    </Text>
                    <View style={styles.compactProgressBar}>
                      <View
                        style={[
                          styles.compactProgressFill,
                          {
                            width: `${Math.min(totalUsagePercent, 100)}%`,
                            backgroundColor: totalUsagePercent > 80 ? '#EF4444' : totalUsagePercent > 50 ? '#F59E0B' : '#10B981',
                          }
                        ]}
                      />
                    </View>
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
  sectionHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: '#1F2937',
  },
  tabsContainer: {
    flexDirection: 'row' as const,
    gap: 16,
  },
  activeTab: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: '#8B5CF6',
    letterSpacing: 0.5,
  },
  inactiveTab: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: '#9CA3AF',
    letterSpacing: 0.5,
  },
  statsRow: {
    flexDirection: 'row' as const,
    gap: 8,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '600' as const,
    color: '#6B7280',
    marginBottom: 6,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: '#1F2937',
  },
  memberTableCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
    marginBottom: 12,
  },
  tableHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    marginBottom: 8,
  },
  tableHeaderText: {
    fontSize: 10,
    fontWeight: '700' as const,
    color: '#6B7280',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: 8,
  },
  tableMemberInfo: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  memberDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  tableMemberName: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: '#1F2937',
  },
  tableMemberAmount: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: '#1F2937',
  },
  splitCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  splitTitle: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: '#6B7280',
    marginBottom: 10,
  },
  splitProgressBarContainer: {
    marginBottom: 8,
  },
  splitProgressBarBackground: {
    height: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 4,
    overflow: 'hidden' as const,
    position: 'relative' as const,
  },
  splitProgressBar: {
    height: '100%',
    borderRadius: 4,
  },
  splitPercentageRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  splitPercentageText: {
    fontSize: 12,
    fontWeight: '700' as const,
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
  categoriesGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
  },
  compactCategoryCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 12,
    width: '47%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    alignItems: 'center' as const,
  },
  categoryEmoji: {
    fontSize: 28,
    marginBottom: 6,
  },
  compactCategoryName: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: '#1F2937',
    marginBottom: 4,
    textAlign: 'center' as const,
  },
  compactCategoryAmount: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500' as const,
    marginBottom: 8,
  },
  compactProgressBar: {
    height: 4,
    width: '100%',
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
    overflow: 'hidden' as const,
  },
  compactProgressFill: {
    height: '100%',
    borderRadius: 2,
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
  infoButton: {
    padding: 6,
  },
  infoButtonText: {
    fontSize: 16,
    color: '#8B5CF6',
    fontWeight: '600' as const,
  },
  categoriesScroll: {
    paddingRight: 20,
    gap: 10,
  },
  miniCategoryCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 12,
    width: 130,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    alignItems: 'center' as const,
  },
  miniCategoryEmoji: {
    fontSize: 24,
    marginBottom: 6,
  },
  miniCategoryName: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: '#1F2937',
    marginBottom: 4,
    textAlign: 'center' as const,
  },
  miniCategoryTotal: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: '#8B5CF6',
    marginBottom: 10,
  },
  miniMembersRow: {
    width: '100%',
    gap: 6,
  },
  miniMemberItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingVertical: 4,
  },
  miniMemberDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  miniMemberAmount: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: '#6B7280',
    flex: 1,
  },
  miniMemberBalance: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: '#9CA3AF',
  },
  miniBalancePositive: {
    color: '#10B981',
  },
  miniBalanceNegative: {
    color: '#EF4444',
  },
});
