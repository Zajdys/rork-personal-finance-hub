import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack } from 'expo-router';
import { safePush } from '@/lib/safe-navigate';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Users, Settings, PiggyBank, Pencil } from 'lucide-react-native';
import { useHousehold } from '@/store/household-store';
import { useSettingsStore } from '@/store/settings-store';
import { useLanguageStore } from '@/store/language-store';
import { useHouseholdRenamePrompt } from '@/hooks/use-household-rename-prompt';
import { BackButton } from '@/components/BackButton';

export default function HouseholdOverviewScreen() {
  const { currentHousehold, dashboard, isInHousehold, renameHousehold, refetch } = useHousehold();
  const { getCurrentCurrency } = useSettingsStore();
  const { t } = useLanguageStore();
  const { promptRename, RenameModal } = useHouseholdRenamePrompt();
  const currency = getCurrentCurrency();

  const getCategoryInfo = (id: string): { name: string; emoji: string } => {
    const categoryInfo: Record<string, { nameKey: Parameters<typeof t>[0]; emoji: string }> = {
      'Bydlení': { nameKey: 'housing', emoji: '🏠' },
      'Jídlo a nápoje': { nameKey: 'hhCatFoodShort', emoji: '🍕' },
      'Jídlo': { nameKey: 'food', emoji: '🍕' },
      'Doprava': { nameKey: 'transport', emoji: '🚗' },
      'Zábava': { nameKey: 'entertainment', emoji: '🎮' },
      'Energie': { nameKey: 'hhCatUtilities', emoji: '💡' },
      'Nákupy': { nameKey: 'shopping', emoji: '🛒' },
      'Zdraví': { nameKey: 'hhCatHealth', emoji: '⚕️' },
      'Vzdělání': { nameKey: 'education', emoji: '📚' },
      'Nájem a bydlení': { nameKey: 'hhCatRentHousing', emoji: '🏠' },
      housing: { nameKey: 'housing', emoji: '🏠' },
      food: { nameKey: 'food', emoji: '🍕' },
      transport: { nameKey: 'transport', emoji: '🚗' },
      entertainment: { nameKey: 'entertainment', emoji: '🎮' },
      utilities: { nameKey: 'hhCatUtilities', emoji: '💡' },
      shopping: { nameKey: 'shopping', emoji: '🛒' },
      health: { nameKey: 'hhCatHealth', emoji: '⚕️' },
      education: { nameKey: 'education', emoji: '📚' },
    };
    const info = categoryInfo[id];
    return info ? { name: t(info.nameKey), emoji: info.emoji } : { name: id, emoji: '📁' };
  };

  if (!isInHousehold || !currentHousehold || !dashboard) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ title: t('screenHouseholdOverview'), headerShown: true }} />
        <View style={styles.emptyState}>
          <Users size={80} color="#8B5CF6" strokeWidth={1.5} />
          <Text style={styles.emptyTitle}>{t('hhOverviewNotInHousehold')}</Text>
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={() => safePush('/(tabs)/household')}
          >
            <Text style={styles.settingsButtonText}>{t('hhOverviewCreateHousehold')}</Text>
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
          headerShown: false,
        }}
      />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <LinearGradient
          colors={['#8B5CF6', '#7C3AED']}
          style={styles.header}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.headerContent}>
            <BackButton color="#FFF" size={24} style={styles.headerBackButton} />
            <View style={styles.headerTitleContainer}>
              <Text style={styles.headerTitle}>{t('household')}</Text>
              <View style={styles.headerNameRow}>
                <Text style={styles.headerAmount}>{currentHousehold.name}</Text>
                <TouchableOpacity
                  style={styles.headerRenameBtn}
                  onPress={() =>
                    promptRename(currentHousehold.id, currentHousehold.name, (newName) => {
                      renameHousehold(currentHousehold.id, newName);
                      refetch();
                    })
                  }
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel={t('hhRenameTitle')}
                >
                  <Pencil color="#FFF" size={18} strokeWidth={2} />
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.headerIcon}>
              <TouchableOpacity
                style={styles.headerButton}
                onPress={() => safePush('/(tabs)/household')}
              >
                <Settings size={24} color="#FFF" strokeWidth={2} />
              </TouchableOpacity>
            </View>
          </View>
        </LinearGradient>

        {/* Celkový rozpočet */}
        <View style={styles.section}>
          <View style={styles.budgetCard}>
            <PiggyBank size={28} color="#8B5CF6" strokeWidth={2} />
            <Text style={styles.budgetLabel}>{t('hhOverviewTotalBudget')}</Text>
            <Text style={styles.budgetValue}>
              {totalBudget.toLocaleString('cs-CZ')} {currency.symbol}
            </Text>
            <Text style={styles.budgetSubtext}>{t('hhOverviewSharedBudget')}</Text>
          </View>
        </View>



        {/* Přehled domácnosti - kategorie */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('hhOverviewTitle')}</Text>
            <TouchableOpacity
              style={styles.infoButton}
              onPress={() => {}}
            >
              <Text style={styles.infoButtonText}>ⓘ</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoriesScroll}>
            {dashboard.categoryBalances.map((catBalance, idx) => {
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
          <Text style={styles.sectionTitle}>{t('hhOverviewMemberBalances')}</Text>
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
                      {t('hhOverviewPaid', {
                        amount: balance.totalPaid.toFixed(0),
                        symbol: currency.symbol,
                      })}
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
                      ? t('hhOverviewSettled') 
                      : balance.balance > 100 
                      ? t('hhOverviewOverpaid') 
                      : t('hhOverviewDebt')}
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
            onPress={() => safePush('/(tabs)/household')}
          >
            <Settings size={18} color="#8B5CF6" strokeWidth={2} />
            <Text style={styles.advancedButtonText}>{t('hhOverviewAdvancedSettings')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      {RenameModal}
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
    paddingTop: 60,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  headerTitle: {
    fontSize: 16,
    color: 'white',
    opacity: 0.9,
    marginBottom: 4,
  },
  headerAmount: {
    fontSize: 20,
    fontWeight: 'bold' as const,
    color: 'white',
    flexShrink: 1,
  },
  headerNameRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  headerRenameBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'white',
    opacity: 0.9,
  },
  headerContent: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  headerBackButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  headerTitleContainer: {
    flex: 1,
    marginLeft: 16,
  },
  headerIcon: {
    width: 40,
    height: 40,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
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
