import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Users, Plus, ArrowRight, DollarSign, Eye, Settings, Info, PiggyBank } from 'lucide-react-native';
import { useHousehold } from '@/store/household-store';
import { useSettingsStore } from '@/store/settings-store';


export default function HouseholdScreen() {
  const router = useRouter();
  const {
    currentHousehold,
    dashboard,
    isInHousehold,
    isOwner,
    createHousehold,
    inviteMember,
    isLoading,
    isCreating,
    isInviting,
    error,
    isAuthenticated,
  } = useHousehold();
  const { getCurrentCurrency } = useSettingsStore();
  const currency = getCurrentCurrency();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [householdName, setHouseholdName] = useState('');
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');

  const handleCreateHousehold = async () => {
    if (!householdName.trim()) {
      Alert.alert('Chyba', 'Zadejte název domácnosti');
      return;
    }

    try {
      await createHousehold(householdName.trim());
      setHouseholdName('');
      setShowCreateForm(false);
      Alert.alert('Úspěch', 'Domácnost byla vytvořena');
    } catch (error) {
      Alert.alert('Chyba', 'Nepodařilo se vytvořit domácnost');
      console.error(error);
    }
  };

  const handleInviteMember = async () => {
    if (!inviteEmail.trim()) {
      Alert.alert('Chyba', 'Zadejte e-mailovou adresu');
      return;
    }

    try {
      await inviteMember(inviteEmail.trim());
      setInviteEmail('');
      setShowInviteForm(false);
      Alert.alert('Úspěch', 'Pozvánka byla odeslána');
    } catch (error) {
      Alert.alert('Chyba', 'Nepodařilo se odeslat pozvánku');
      console.error(error);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ title: 'Domácnost', headerShown: true }} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#8B5CF6" />
        </View>
      </SafeAreaView>
    );
  }

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ title: 'Domácnost', headerShown: true }} />
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.emptyState}>
            <Users size={64} color="#F59E0B" strokeWidth={1.5} />
            <Text style={styles.emptyTitle}>Funkce domácnosti není dostupná</Text>
            <Text style={styles.emptyText}>
              Tato funkce vyžaduje připojení k backendu. Pro testování domácností prosím kontaktujte podporu.
            </Text>
            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>Chyba: {error}</Text>
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!isInHousehold) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ title: 'Domácnost', headerShown: true }} />
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.emptyState}>
            <Users size={80} color="#8B5CF6" strokeWidth={1.5} />
            <Text style={styles.emptyTitle}>Zatím nejste v žádné domácnosti</Text>
            <Text style={styles.emptyText}>
              Vytvořte domácnost pro sdílení financí s partnerem nebo rodinou
            </Text>

            {!showCreateForm ? (
              <TouchableOpacity
                style={styles.createButton}
                onPress={() => setShowCreateForm(true)}
              >
                <Plus size={22} color="#FFF" strokeWidth={2.5} />
                <Text style={styles.createButtonText}>Vytvořit domácnost</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.createForm}>
                <TextInput
                  style={styles.createInput}
                  placeholder="Název domácnosti (např. 'Naše rodina')"
                  placeholderTextColor="#9CA3AF"
                  value={householdName}
                  onChangeText={setHouseholdName}
                  autoFocus
                />
                <View style={styles.createFormButtons}>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => {
                      setShowCreateForm(false);
                      setHouseholdName('');
                    }}
                  >
                    <Text style={styles.cancelButtonText}>Zrušit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.confirmButton, isCreating && styles.confirmButtonDisabled]}
                    onPress={handleCreateHousehold}
                    disabled={isCreating}
                  >
                    {isCreating ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <>
                        <Plus size={20} color="#FFF" strokeWidth={2.5} />
                        <Text style={styles.confirmButtonText}>Vytvořit</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

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
              onPress={() => console.log('Settings')}
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
          <Text style={styles.headerTitle}>{currentHousehold?.name || 'Domácnost'}</Text>
          <Text style={styles.headerSubtitle}>
            Sdílené finance s {currentHousehold?.members.filter(m => m.joinStatus === 'ACTIVE').length || 0} členy
          </Text>
        </LinearGradient>

        {dashboard && (
          <View style={styles.statsContainer}>
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Sdílené příjmy</Text>
                <Text style={[styles.statValue, { color: '#10B981' }]}>
                  {dashboard.totalSharedIncome.toLocaleString('cs-CZ')}
                </Text>
                <Text style={styles.statCurrency}>{currency.symbol}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Sdílené výdaje</Text>
                <Text style={[styles.statValue, { color: '#EF4444' }]}>
                  {dashboard.totalSharedExpenses.toLocaleString('cs-CZ')}
                </Text>
                <Text style={styles.statCurrency}>{currency.symbol}</Text>
              </View>
            </View>
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Členové</Text>
            {isOwner && !showInviteForm && (
              <TouchableOpacity
                style={styles.sectionAction}
                onPress={() => setShowInviteForm(true)}
              >
                <Text style={styles.sectionActionText}>Přidat</Text>
                <Plus size={16} color="#8B5CF6" strokeWidth={2.5} />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.membersContainer}>
            {currentHousehold?.members
              .filter(m => m.joinStatus === 'ACTIVE')
              .map(member => (
                <View key={member.userId} style={styles.memberCard}>
                  <View style={styles.memberInfo}>
                    <LinearGradient
                      colors={['#8B5CF6', '#7C3AED']}
                      style={styles.avatar}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                    >
                      <Text style={styles.avatarText}>
                        {member.userName.charAt(0).toUpperCase()}
                      </Text>
                    </LinearGradient>
                    <View style={styles.memberDetails}>
                      <Text style={styles.memberName}>{member.userName}</Text>
                      <Text style={styles.memberRole}>{getRoleLabel(member.role)}</Text>
                    </View>
                  </View>
                </View>
              ))}

            {isOwner && showInviteForm && (
              <View style={styles.form}>
                <TextInput
                  style={styles.input}
                  placeholder="E-mail člena"
                  value={inviteEmail}
                  onChangeText={setInviteEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoFocus
                />
                <View style={styles.formButtons}>
                  <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={() => {
                      setShowInviteForm(false);
                      setInviteEmail('');
                    }}
                  >
                    <Text style={styles.secondaryButtonText}>Zrušit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={handleInviteMember}
                    disabled={isInviting}
                  >
                    {isInviting ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <Text style={styles.primaryButtonText}>Odeslat</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>

        {dashboard && dashboard.balances.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Bilance členů</Text>
            <View style={styles.balancesContainer}>
              {dashboard.balances.map(balance => (
                <View key={balance.userId} style={styles.balanceCard}>
                  <View style={styles.balanceHeader}>
                    <View style={styles.balanceUserInfo}>
                      <Text style={styles.balanceName}>{balance.userName}</Text>
                      <Text style={styles.balanceDetail}>
                        Zaplaceno: {balance.totalPaid.toFixed(0)} {currency.symbol}
                      </Text>
                    </View>
                    <View style={styles.balanceAmountContainer}>
                      <Text
                        style={[
                          styles.balanceAmount,
                          balance.balance > 0 && styles.balancePositive,
                          balance.balance < 0 && styles.balanceNegative,
                        ]}
                      >
                        {balance.balance > 0 ? '+' : ''}
                        {balance.balance.toFixed(0)}
                      </Text>
                      <Text style={styles.balanceLabel}>
                        {balance.balance > 0 ? 'Přeplatek' : balance.balance < 0 ? 'Dluh' : 'Vyrovnáno'}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {dashboard && dashboard.settlementSummary.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Doporučené vyrovnání</Text>
            <View style={styles.settlementsContainer}>
              {dashboard.settlementSummary.map((settlement, index) => (
                <View key={index} style={styles.settlementCard}>
                  <View style={styles.settlementHeader}>
                    <Text style={styles.settlementUser}>{settlement.fromUserName}</Text>
                    <View style={styles.settlementArrow}>
                      <ArrowRight size={20} color="#8B5CF6" strokeWidth={2.5} />
                    </View>
                    <Text style={styles.settlementUser}>{settlement.toUserName}</Text>
                  </View>
                  <Text style={styles.settlementAmount}>
                    {settlement.amount.toFixed(0)} {currency.symbol}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Nastavení</Text>
          <View style={styles.menuContainer}>
            <TouchableOpacity
              style={styles.menuItem}
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
                  <Text style={styles.menuItemTitle}>Pravidla sdílení</Text>
                  <Text style={styles.menuItemSubtitle}>Nastavte, co se sdílí</Text>
                </View>
              </View>
              <ArrowRight size={20} color="#9CA3AF" strokeWidth={2} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
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
                  <Text style={styles.menuItemTitle}>Rozdělení výdajů</Text>
                  <Text style={styles.menuItemSubtitle}>Nastavte poměry</Text>
                </View>
              </View>
              <ArrowRight size={20} color="#9CA3AF" strokeWidth={2} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
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
                  <Text style={styles.menuItemTitle}>Rozpočty kategorií</Text>
                  <Text style={styles.menuItemSubtitle}>Měsíční limity</Text>
                </View>
              </View>
              <ArrowRight size={20} color="#9CA3AF" strokeWidth={2} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.infoBox}>
          <View style={styles.infoHeader}>
            <Info size={22} color="#3B82F6" strokeWidth={2} />
            <Text style={styles.infoTitle}>Jak funguje sdílení?</Text>
          </View>
          <Text style={styles.infoText}>
            • Můžete sdílet vybrané kategorie výdajů s partnery{'\n'}
            • Každá transakce může být soukromá, sdílená nebo jen jako součet{'\n'}
            • Appka sleduje, kdo kolik zaplatil a navrhuje vyrovnání{'\n'}
            • Dárky jsou automaticky skryté pro zachování překvapení
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function getRoleLabel(role: string): string {
  switch (role) {
    case 'OWNER':
      return 'Vlastník';
    case 'PARTNER':
      return 'Partner';
    case 'SUMMARY_VIEWER':
      return 'Prohlížeč součtů';
    case 'READ_ONLY':
      return 'Pouze čtení';
    default:
      return role;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    paddingBottom: 32,
  },
  centered: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  emptyState: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: 60,
    paddingHorizontal: 24,
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
  statsContainer: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  statsGrid: {
    flexDirection: 'row' as const,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  statLabel: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 8,
    fontWeight: '500' as const,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: '#1F2937',
  },
  statCurrency: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  section: {
    marginBottom: 24,
    paddingHorizontal: 20,
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
  sectionAction: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
  },
  sectionActionText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#8B5CF6',
  },
  form: {
    gap: 12,
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    marginTop: 8,
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#1F2937',
  },
  formButtons: {
    flexDirection: 'row' as const,
    gap: 12,
    marginTop: 8,
  },
  primaryButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: '#8B5CF6',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 8,
    flex: 1,
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600' as const,
  },
  secondaryButton: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: '#F3F4F6',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  secondaryButtonText: {
    color: '#6B7280',
    fontSize: 16,
    fontWeight: '600' as const,
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
    marginTop: 8,
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
  createForm: {
    width: '100%',
    gap: 16,
    marginTop: 12,
  },
  createInput: {
    backgroundColor: '#FFF',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    padding: 16,
    fontSize: 16,
    color: '#1F2937',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  createFormButtons: {
    flexDirection: 'row' as const,
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: '#F3F4F6',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cancelButtonText: {
    color: '#6B7280',
    fontSize: 16,
    fontWeight: '600' as const,
  },
  confirmButton: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: '#8B5CF6',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 14,
    gap: 8,
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  confirmButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700' as const,
  },
  confirmButtonDisabled: {
    opacity: 0.6,
  },
  membersContainer: {
    gap: 10,
  },
  memberCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },
  memberInfo: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  avatarText: {
    color: '#FFF',
    fontSize: 22,
    fontWeight: '700' as const,
  },
  memberDetails: {
    marginLeft: 14,
    flex: 1,
  },
  memberName: {
    fontSize: 17,
    fontWeight: '600' as const,
    color: '#1F2937',
    marginBottom: 4,
  },
  memberRole: {
    fontSize: 14,
    color: '#6B7280',
  },
  balancesContainer: {
    gap: 10,
  },
  balanceCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },
  balanceHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  balanceUserInfo: {
    flex: 1,
  },
  balanceName: {
    fontSize: 17,
    fontWeight: '600' as const,
    color: '#1F2937',
    marginBottom: 4,
  },
  balanceDetail: {
    fontSize: 13,
    color: '#6B7280',
  },
  balanceAmountContainer: {
    alignItems: 'flex-end' as const,
  },
  balanceAmount: {
    fontSize: 22,
    fontWeight: '700' as const,
    color: '#1F2937',
    marginBottom: 2,
  },
  balancePositive: {
    color: '#10B981',
  },
  balanceNegative: {
    color: '#EF4444',
  },
  balanceLabel: {
    fontSize: 11,
    color: '#9CA3AF',
    fontWeight: '500' as const,
  },
  settlementsContainer: {
    gap: 10,
  },
  settlementCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },
  settlementHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginBottom: 12,
    justifyContent: 'center' as const,
  },
  settlementArrow: {
    marginHorizontal: 8,
  },
  settlementUser: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: '#1F2937',
  },
  settlementAmount: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: '#8B5CF6',
    textAlign: 'center' as const,
  },
  menuContainer: {
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
  infoBox: {
    backgroundColor: '#F0F9FF',
    borderRadius: 16,
    padding: 18,
    marginHorizontal: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  infoHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginBottom: 12,
    gap: 10,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#1E40AF',
  },
  infoText: {
    fontSize: 14,
    color: '#3B82F6',
    lineHeight: 22,
  },
  headerButton: {
    padding: 8,
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FEE2E2',
    marginTop: 16,
    width: '100%',
  },
  errorText: {
    fontSize: 14,
    color: '#DC2626',
    textAlign: 'center' as const,
  },
});
