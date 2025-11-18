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



        {/* Přehled domácnosti - kategorie */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Přehled domácnosti</Text>
            <TouchableOpacity
              style={styles.infoButton}
              onPress={() => {}}
            >
              <Text style={styles.infoButtonText}>ⓘ</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoriesScroll}>
            {dashboard.categoryBalances.map((catBalance, idx) => {
              const getCategoryInfo = (id: string): { name: string; emoji: string } => {
                const categoryInfo: Record<string, { name: string; emoji: string }> = {
                  'Bydlení': { name: 'Bydlení', emoji: '🏠' },
                  'Jídlo a nápoje': { name: 'Jídlo', emoji: '🍕' },
                  'Jídlo': { name: 'Jídlo', emoji: '🍕' },
                  'Doprava': { name: 'Doprava', emoji: '🚗' },
                  'Zábava': { name: 'Zábava', emoji: '🎮' },
                  'Energie': { name: 'Energie', emoji: '💡' },
                  'Nákupy': { name: 'Nákupy', emoji: '🛒' },
                  'Zdraví': { name: 'Zdraví', emoji: '⚕️' },
                  'Vzdělání': { name: 'Vzdělání', emoji: '📚' },
                  'Nájem a bydlení': { name: 'Bydlení', emoji: '🏠' },
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

              const myPaid = catBalance.memberBalances[myUserId]?.paid || 0;
              const partnerPaid = catBalance.memberBalances[partnerUserId]?.paid || 0;
              const totalPaid = myPaid + partnerPaid;
              const categoryInfo = getCategoryInfo(catBalance.category);
              
              const myBalance = catBalance.memberBalances[myUserId]?.balance || 0;
              const partnerBalance = catBalance.memberBalances[partnerUserId]?.balance || 0;
              
              return (
                <View key={idx} style={styles.miniCategoryCard}>
                  <Text style={styles.miniCategoryEmoji}>{categoryInfo.emoji}</Text>
                  <Text style={styles.miniCategoryName}>{categoryInfo.name}</Text>
                  <Text style={styles.miniCategoryTotal}>
                    {totalPaid.toFixed(0)} {currency.symbol}
                  </Text>
                  
                  <View style={styles.miniMembersRow}>
                    <View style={styles.miniMemberItem}>
                      <View style={[styles.miniMemberDot, { backgroundColor: '#3B82F6' }]} />
                      <Text style={styles.miniMemberAmount}>{myPaid.toFixed(0)}</Text>
                      {Math.abs(myBalance) > 1 && (
                        <Text style={[
                          styles.miniMemberBalance,
                          myBalance > 0 && styles.miniBalancePositive,
                          myBalance < 0 && styles.miniBalanceNegative,
                        ]}>
                          {myBalance > 0 ? '+' : ''}{myBalance.toFixed(0)}
                        </Text>
                      )}
                    </View>
                    
                    <View style={styles.miniMemberItem}>
                      <View style={[styles.miniMemberDot, { backgroundColor: '#10B981' }]} />
                      <Text style={styles.miniMemberAmount}>{partnerPaid.toFixed(0)}</Text>
                      {Math.abs(partnerBalance) > 1 && (
                        <Text style={[
                          styles.miniMemberBalance,
                          partnerBalance > 0 && styles.miniBalancePositive,
                          partnerBalance < 0 && styles.miniBalanceNegative,
                        ]}>
                          {partnerBalance > 0 ? '+' : ''}{partnerBalance.toFixed(0)}
                        </Text>
                      )}
                    </View>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>

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
