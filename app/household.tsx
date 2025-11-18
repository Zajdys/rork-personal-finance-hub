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
  Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Users, Plus, ArrowRight, DollarSign, Eye, Settings, Info, PiggyBank, CheckCircle, TrendingUp, X } from 'lucide-react-native';
import { useHousehold } from '@/store/household-store';
import { useSettingsStore } from '@/store/settings-store';


function getRoleLabel(role: string): string {
  const roleLabels: Record<string, string> = {
    'OWNER': 'Vlastník',
    'PARTNER': 'Partner',
    'SUMMARY_VIEWER': 'Pouze souhrn',
    'READ_ONLY': 'Pouze čtení',
  };
  return roleLabels[role] || role;
}

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
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [selectedSettlement, setSelectedSettlement] = useState<{
    fromUserId: string;
    fromUserName: string;
    toUserId: string;
    toUserName: string;
    amount: number;
  } | null>(null);

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

  const handleSettlement = (settlement: typeof selectedSettlement) => {
    setSelectedSettlement(settlement);
    setShowSettlementModal(true);
  };

  const confirmSettlement = () => {
    if (!selectedSettlement) return;
    
    Alert.alert(
      'Potvrdit vyrovnání?',
      `${selectedSettlement.fromUserName} zaplatil ${selectedSettlement.amount.toFixed(0)} ${currency.symbol} uživateli ${selectedSettlement.toUserName}?`,
      [
        { text: 'Zrušit', style: 'cancel' },
        {
          text: 'Potvrdit',
          onPress: () => {
            Alert.alert('Úspěch', 'Dluh byl označen jako vyrovnaný');
            setShowSettlementModal(false);
            setSelectedSettlement(null);
          },
        },
      ]
    );
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
          <View style={styles.budgetSection}>
            <View style={styles.budgetCard}>
              <Text style={styles.budgetLabel}>Celkový měsíční rozpočet</Text>
              <Text style={styles.budgetValue}>
                {(currentHousehold?.categoryBudgets && 
                  Object.values(currentHousehold.categoryBudgets).reduce(
                    (sum, b) => sum + (b.monthlyLimit || 0), 0
                  ).toLocaleString('cs-CZ')) || '0'} {currency.symbol}
              </Text>
              <Text style={styles.budgetSubtext}>Společný rozpočet domácnosti</Text>
            </View>
          </View>
        )}

        {currentHousehold?.categoryBudgets && Object.keys(currentHousehold.categoryBudgets).length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Limity kategorií</Text>
            <View style={styles.limitsContainer}>
              {Object.entries(currentHousehold.categoryBudgets).map(([categoryId, budget]) => {
                const categoryBalance = dashboard?.categoryBalances.find(cb => cb.category === categoryId);
                const spent = categoryBalance?.totalAmount || 0;
                const limit = budget.monthlyLimit || 0;
                const percentage = limit > 0 ? (spent / limit) * 100 : 0;
                
                return (
                  <View key={categoryId} style={styles.limitCard}>
                    <View style={styles.limitHeader}>
                      <Text style={styles.limitCategory}>{categoryId}</Text>
                      <Text style={styles.limitAmount}>
                        {spent.toFixed(0)} / {limit.toFixed(0)} {currency.symbol}
                      </Text>
                    </View>
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
                    <Text style={styles.limitPercentage}>{percentage.toFixed(0)}% využito</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {dashboard && (
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


      </ScrollView>

      <Modal visible={showSettlementModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Potvrdit vyrovnání</Text>
              <TouchableOpacity onPress={() => setShowSettlementModal(false)}>
                <X size={24} color="#6B7280" strokeWidth={2} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              {selectedSettlement && (
                <>
                  <View style={styles.settlementPreview}>
                    <View style={styles.settlementParticipants}>
                      <View style={styles.participantBox}>
                        <View style={styles.participantAvatar}>
                          <Text style={styles.participantAvatarText}>
                            {selectedSettlement.fromUserName.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <Text style={styles.participantName}>{selectedSettlement.fromUserName}</Text>
                      </View>
                      
                      <ArrowRight size={32} color="#8B5CF6" strokeWidth={2.5} />
                      
                      <View style={styles.participantBox}>
                        <View style={styles.participantAvatar}>
                          <Text style={styles.participantAvatarText}>
                            {selectedSettlement.toUserName.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <Text style={styles.participantName}>{selectedSettlement.toUserName}</Text>
                      </View>
                    </View>
                    
                    <View style={styles.amountPreview}>
                      <TrendingUp size={28} color="#10B981" strokeWidth={2} />
                      <Text style={styles.amountPreviewValue}>
                        {selectedSettlement.amount.toFixed(0)} {currency.symbol}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.infoBox}>
                    <Info size={20} color="#3B82F6" strokeWidth={2} />
                    <Text style={styles.infoText}>
                      Po potvrzení bude tento dluh označen jako vyrovnaný a zmizí z doporučených vyrovnání.
                    </Text>
                  </View>
                </>
              )}
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.confirmButton}
                onPress={confirmSettlement}
              >
                <CheckCircle size={20} color="#FFF" strokeWidth={2.5} />
                <Text style={styles.confirmButtonText}>Potvrdit vyrovnání</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  budgetSection: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  budgetCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    alignItems: 'center' as const,
  },
  budgetLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
    fontWeight: '500' as const,
  },
  budgetValue: {
    fontSize: 36,
    fontWeight: '800' as const,
    color: '#8B5CF6',
    marginBottom: 4,
  },
  budgetSubtext: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  limitsContainer: {
    gap: 12,
  },
  limitCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  limitHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: 12,
  },
  limitCategory: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#1F2937',
  },
  limitAmount: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: '#6B7280',
  },
  progressBar: {
    height: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 4,
    overflow: 'hidden' as const,
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  limitPercentage: {
    fontSize: 13,
    color: '#6B7280',
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
  },
  categoryEmoji: {
    fontSize: 24,
    marginBottom: 6,
  },
  compactCategoryName: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: '#1F2937',
    marginBottom: 2,
  },
  compactCategoryAmount: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500' as const,
    marginBottom: 6,
  },
  memberDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
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
  infoButton: {
    padding: 6,
  },
  infoButtonText: {
    fontSize: 16,
    color: '#8B5CF6',
    fontWeight: '600' as const,
  },
  categoriesContainer: {
    gap: 12,
  },
  categoriesGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
  },
  categoryBalanceCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  categoryBalanceHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  categoryBalanceTitle: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: '#1F2937',
  },
  categoryBalanceTotal: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: '#8B5CF6',
  },
  memberBalancesContainer: {
    gap: 10,
  },
  memberBalanceRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: 8,
  },
  memberBalanceLeft: {
    flex: 1,
  },
  memberBalanceName: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: '#1F2937',
    marginBottom: 3,
  },
  memberBalanceDetail: {
    fontSize: 13,
    color: '#6B7280',
  },
  memberBalanceRight: {
    alignItems: 'flex-end' as const,
  },
  memberBalanceAmount: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: '#6B7280',
  },
  memberBalancePositive: {
    color: '#10B981',
  },
  memberBalanceNegative: {
    color: '#EF4444',
  },
  splitRuleInfo: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  splitRuleText: {
    fontSize: 13,
    color: '#6B7280',
    fontStyle: 'italic' as const,
  },
  membersBreakdown: {
    marginTop: 8,
    gap: 4,
  },
  memberBreakdownRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  memberBreakdownText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500' as const,
    flex: 1,
  },
  memberBreakdownBalance: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: '#6B7280',
  },
  memberBreakdownPositive: {
    color: '#10B981',
  },
  memberBreakdownNegative: {
    color: '#EF4444',
  },
  settlementContent: {
    marginBottom: 12,
  },
  settlementAction: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  settlementActionText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: '#10B981',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end' as const,
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: '#1F2937',
  },
  modalBody: {
    padding: 20,
  },
  modalFooter: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  settlementPreview: {
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  settlementParticipants: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: 20,
  },
  participantBox: {
    alignItems: 'center' as const,
    flex: 1,
  },
  participantAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#8B5CF6',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 8,
  },
  participantAvatarText: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: '#FFF',
  },
  participantName: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: '#1F2937',
  },
  amountPreview: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 12,
    paddingTop: 16,
    borderTopWidth: 2,
    borderTopColor: '#E5E7EB',
  },
  amountPreviewValue: {
    fontSize: 28,
    fontWeight: '800' as const,
    color: '#10B981',
  },
});
