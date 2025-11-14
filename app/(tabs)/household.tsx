import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { 
  PiggyBank, 
  Settings, 
  TrendingUp, 
  Users, 
  ChevronRight,
  Info,
  DollarSign,
  ArrowRight,
  Eye
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useHousehold } from '@/store/household-store';
import { useSettingsStore } from '@/store/settings-store';
import { Stack } from 'expo-router';
import { Alert } from 'react-native';

export default function HouseholdTabScreen() {
  const router = useRouter();
  const {
    currentHousehold,
    dashboard,
    isInHousehold,
  } = useHousehold();
  const { getCurrentCurrency, isDarkMode } = useSettingsStore();
  const currency = getCurrentCurrency();

  const activeBudgets = Object.entries(currentHousehold?.categoryBudgets || {})
    .filter(([_, budget]) => budget.enabled && budget.monthlyLimit > 0);

  const totalMonthlyBudget = activeBudgets.reduce((sum, [_, b]) => sum + b.monthlyLimit, 0);

  if (!isInHousehold) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: isDarkMode ? '#111827' : '#F8FAFC' }]}>
        <Stack.Screen options={{ title: 'Domácnost', headerShown: true }} />
        <ScrollView contentContainerStyle={styles.emptyStateContainer}>
          <View style={styles.emptyState}>
            <Users size={80} color="#8B5CF6" strokeWidth={1.5} />
            <Text style={[styles.emptyTitle, { color: isDarkMode ? '#FFF' : '#1F2937' }]}>
              Nejste v žádné domácnosti
            </Text>
            <Text style={[styles.emptyText, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
              Vytvořte domácnost v nastavení profilu pro sdílení financí s partnerem
            </Text>
            <TouchableOpacity
              style={styles.createButton}
              onPress={() => router.push('/household')}
            >
              <Users size={22} color="#FFF" strokeWidth={2.5} />
              <Text style={styles.createButtonText}>Přejít do nastavení</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDarkMode ? '#111827' : '#F8FAFC' }]}>
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
      <ScrollView showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={['#8B5CF6', '#7C3AED']}
          style={styles.header}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Text style={styles.headerEmoji}>🏠</Text>
          <Text style={styles.headerTitle}>{currentHousehold?.name || 'Domácnost'}</Text>
          <Text style={styles.headerSubtitle}>
            Společný rozpočet a výdaje
          </Text>
        </LinearGradient>

        <View style={styles.content}>
          <View style={styles.budgetOverview}>
            <LinearGradient
              colors={['#10B981', '#059669']}
              style={styles.budgetCard}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <View style={styles.budgetHeader}>
                <PiggyBank size={32} color="#FFF" strokeWidth={2} />
                <Text style={styles.budgetLabel}>Celkový měsíční rozpočet</Text>
              </View>
              <Text style={styles.budgetAmount}>
                {totalMonthlyBudget.toLocaleString('cs-CZ')} {currency.symbol}
              </Text>
              <Text style={styles.budgetSubtext}>
                {activeBudgets.length} {activeBudgets.length === 1 ? 'kategorie' : activeBudgets.length < 5 ? 'kategorie' : 'kategorií'}
              </Text>
            </LinearGradient>
          </View>

          {activeBudgets.length === 0 ? (
            <View style={[styles.infoCard, { backgroundColor: isDarkMode ? '#1F2937' : '#FFF' }]}>
              <Info size={24} color="#F59E0B" strokeWidth={2} />
              <View style={styles.infoContent}>
                <Text style={[styles.infoTitle, { color: isDarkMode ? '#FFF' : '#1F2937' }]}>
                  Žádné rozpočty
                </Text>
                <Text style={[styles.infoText, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
                  Nastavte měsíční limity pro kategorie v nastavení domácnosti
                </Text>
              </View>
            </View>
          ) : (
            <>
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: isDarkMode ? '#FFF' : '#1F2937' }]}>
                    Nastavené kategorie
                  </Text>
                  <TouchableOpacity
                    onPress={() => router.push('/household-budgets')}
                  >
                    <Text style={styles.seeAllText}>Upravit</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.categoriesList}>
                  {activeBudgets.map(([categoryId, budget]) => {
                    const categoryBalance = dashboard?.categoryBalances.find(cb => cb.category === categoryId);
                    const spent = categoryBalance?.totalAmount || 0;
                    const limit = budget.monthlyLimit;
                    const percentage = limit > 0 ? (spent / limit) * 100 : 0;
                    
                    const splitRule = currentHousehold?.defaultSplits[categoryId];
                    let splitInfo = 'Rovnoměrně';
                    
                    if (splitRule && splitRule.type === 'WEIGHTED' && splitRule.weights) {
                      const members = currentHousehold.members.filter(m => m.joinStatus === 'ACTIVE');
                      const percentages = Object.entries(splitRule.weights).map(([userId, weight]) => {
                        const member = members.find(m => m.userId === userId);
                        return `${member?.userName || '?'} ${Math.round(weight * 100)}%`;
                      });
                      splitInfo = percentages.join(' / ');
                    } else if (splitRule?.type === 'EQUAL') {
                      splitInfo = '50% / 50%';
                    }
                    
                    return (
                      <View key={categoryId} style={[styles.categoryCard, { backgroundColor: isDarkMode ? '#1F2937' : '#FFF' }]}>
                        <View style={styles.categoryHeader}>
                          <View style={styles.categoryLeft}>
                            <View style={styles.categoryIconBg}>
                              <DollarSign size={20} color="#8B5CF6" strokeWidth={2.5} />
                            </View>
                            <View style={styles.categoryInfo}>
                              <Text style={[styles.categoryName, { color: isDarkMode ? '#FFF' : '#1F2937' }]}>
                                {categoryId}
                              </Text>
                              <Text style={[styles.categorySplit, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
                                {splitInfo}
                              </Text>
                            </View>
                          </View>
                          <View style={styles.categoryRight}>
                            <Text style={[styles.categoryAmount, { color: isDarkMode ? '#FFF' : '#1F2937' }]}>
                              {limit.toLocaleString('cs-CZ')} {currency.symbol}
                            </Text>
                            <Text style={[styles.categoryPeriod, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
                              měsíčně
                            </Text>
                          </View>
                        </View>
                        
                        <View style={styles.progressContainer}>
                          <View style={styles.progressBar}>
                            <View 
                              style={[
                                styles.progressFill,
                                {
                                  width: `${Math.min(percentage, 100)}%`,
                                  backgroundColor: percentage > 100 ? '#EF4444' : percentage > 80 ? '#F59E0B' : '#10B981'
                                }
                              ]}
                            />
                          </View>
                          <Text style={[styles.progressText, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
                            {spent.toFixed(0)} {currency.symbol} / {percentage.toFixed(0)}%
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            </>
          )}

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: isDarkMode ? '#FFF' : '#1F2937' }]}>
              Nastavení
            </Text>
            <View style={styles.menuList}>
              <TouchableOpacity
                style={[styles.menuItem, { backgroundColor: isDarkMode ? '#1F2937' : '#FFF' }]}
                onPress={() => router.push('/household-budgets')}
              >
                <View style={styles.menuItemLeft}>
                  <LinearGradient
                    colors={['#FEF3C7', '#FDE68A']}
                    style={styles.menuItemIconContainer}
                  >
                    <PiggyBank size={22} color="#F59E0B" strokeWidth={2} />
                  </LinearGradient>
                  <View style={styles.menuItemContent}>
                    <Text style={[styles.menuItemTitle, { color: isDarkMode ? '#FFF' : '#1F2937' }]}>
                      Rozpočty kategorií
                    </Text>
                    <Text style={[styles.menuItemSubtitle, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
                      Měsíční limity a upozornění
                    </Text>
                  </View>
                </View>
                <ChevronRight size={20} color="#9CA3AF" strokeWidth={2} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.menuItem, { backgroundColor: isDarkMode ? '#1F2937' : '#FFF' }]}
                onPress={() => router.push('/household-splits')}
              >
                <View style={styles.menuItemLeft}>
                  <LinearGradient
                    colors={['#D1FAE5', '#A7F3D0']}
                    style={styles.menuItemIconContainer}
                  >
                    <DollarSign size={22} color="#10B981" strokeWidth={2} />
                  </LinearGradient>
                  <View style={styles.menuItemContent}>
                    <Text style={[styles.menuItemTitle, { color: isDarkMode ? '#FFF' : '#1F2937' }]}>
                      Rozdělení výdajů
                    </Text>
                    <Text style={[styles.menuItemSubtitle, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
                      Nastavte poměry plateb
                    </Text>
                  </View>
                </View>
                <ChevronRight size={20} color="#9CA3AF" strokeWidth={2} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.menuItem, { backgroundColor: isDarkMode ? '#1F2937' : '#FFF' }]}
                onPress={() => router.push('/household-policies')}
              >
                <View style={styles.menuItemLeft}>
                  <LinearGradient
                    colors={['#EDE9FE', '#DDD6FE']}
                    style={styles.menuItemIconContainer}
                  >
                    <Eye size={22} color="#8B5CF6" strokeWidth={2} />
                  </LinearGradient>
                  <View style={styles.menuItemContent}>
                    <Text style={[styles.menuItemTitle, { color: isDarkMode ? '#FFF' : '#1F2937' }]}>
                      Pravidla sdílení
                    </Text>
                    <Text style={[styles.menuItemSubtitle, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
                      Co se sdílí v domácnosti
                    </Text>
                  </View>
                </View>
                <ChevronRight size={20} color="#9CA3AF" strokeWidth={2} />
              </TouchableOpacity>
            </View>
          </View>

          {dashboard && dashboard.categoryBalances.length > 0 && (
            <View style={styles.section}>
              <TouchableOpacity
                style={[styles.balanceCard, { backgroundColor: isDarkMode ? '#1F2937' : '#FFF' }]}
                onPress={() => {
                  Alert.alert(
                    'Bilance domácnosti',
                    'Pro zobrazení podrobné bilance a vyrovnání přejděte do nastavení domácnosti.',
                    [
                      { text: 'Zrušit', style: 'cancel' },
                      { text: 'Přejít do nastavení', onPress: () => router.push('/household') }
                    ]
                  );
                }}
              >
                <View style={styles.balanceHeader}>
                  <TrendingUp size={24} color="#8B5CF6" strokeWidth={2} />
                  <Text style={[styles.balanceTitle, { color: isDarkMode ? '#FFF' : '#1F2937' }]}>
                    Zobrazit bilanci
                  </Text>
                </View>
                <Text style={[styles.balanceSubtitle, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
                  Kdo kolik zaplatil a kdo dluží
                </Text>
                <View style={styles.balanceAction}>
                  <ArrowRight size={20} color="#8B5CF6" strokeWidth={2.5} />
                </View>
              </TouchableOpacity>
            </View>
          )}
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
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 24,
  },
  emptyState: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700' as const,
    color: '#1F2937',
    marginTop: 24,
    marginBottom: 12,
    textAlign: 'center' as const,
  },
  emptyText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center' as const,
    marginBottom: 32,
    lineHeight: 24,
  },
  createButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: '#8B5CF6',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 16,
    gap: 10,
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  createButtonText: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '700' as const,
  },
  header: {
    paddingTop: 100,
    paddingBottom: 32,
    paddingHorizontal: 20,
    marginBottom: -20,
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
  content: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  budgetOverview: {
    marginTop: 24,
    marginBottom: 24,
  },
  budgetCard: {
    borderRadius: 20,
    padding: 24,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
  budgetHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    marginBottom: 16,
  },
  budgetLabel: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#FFF',
    opacity: 0.95,
  },
  budgetAmount: {
    fontSize: 40,
    fontWeight: '800' as const,
    color: '#FFF',
    marginBottom: 4,
  },
  budgetSubtext: {
    fontSize: 14,
    color: '#FFF',
    opacity: 0.85,
  },
  infoCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row' as const,
    gap: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#1F2937',
    marginBottom: 4,
  },
  infoText: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  section: {
    marginBottom: 28,
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
  seeAllText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: '#8B5CF6',
  },
  categoriesList: {
    gap: 12,
  },
  categoryCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  categoryHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    marginBottom: 14,
  },
  categoryLeft: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    flex: 1,
  },
  categoryIconBg: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#EDE9FE',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  categoryInfo: {
    flex: 1,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#1F2937',
    marginBottom: 3,
  },
  categorySplit: {
    fontSize: 13,
    color: '#6B7280',
  },
  categoryRight: {
    alignItems: 'flex-end' as const,
  },
  categoryAmount: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: '#1F2937',
    marginBottom: 2,
  },
  categoryPeriod: {
    fontSize: 12,
    color: '#6B7280',
  },
  progressContainer: {
    gap: 8,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 4,
    overflow: 'hidden' as const,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 13,
    color: '#6B7280',
  },
  menuList: {
    gap: 10,
  },
  menuItem: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  menuItemLeft: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 14,
    flex: 1,
  },
  menuItemIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  menuItemContent: {
    flex: 1,
  },
  menuItemTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#1F2937',
    marginBottom: 2,
  },
  menuItemSubtitle: {
    fontSize: 13,
    color: '#6B7280',
  },
  balanceCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  balanceHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    marginBottom: 8,
  },
  balanceTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: '#1F2937',
  },
  balanceSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  balanceAction: {
    position: 'absolute' as const,
    right: 20,
    top: 20,
  },
});
