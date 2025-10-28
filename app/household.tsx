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
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Users, Plus, ArrowRight, DollarSign, Eye, Settings } from 'lucide-react-native';
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
            <Users size={64} color="#9CA3AF" strokeWidth={1.5} />
            <Text style={styles.emptyTitle}>Zatím nejste v žádné domácnosti</Text>
            <Text style={styles.emptyText}>
              Vytvořte domácnost pro sdílení financí s partnerem nebo rodinou
            </Text>

            {!showCreateForm ? (
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => setShowCreateForm(true)}
              >
                <Plus size={20} color="#FFF" strokeWidth={2.5} />
                <Text style={styles.primaryButtonText}>Vytvořit domácnost</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.form}>
                <TextInput
                  style={styles.input}
                  placeholder="Název domácnosti (např. 'Naše rodina')"
                  value={householdName}
                  onChangeText={setHouseholdName}
                  autoFocus
                />
                <View style={styles.formButtons}>
                  <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={() => {
                      setShowCreateForm(false);
                      setHouseholdName('');
                    }}
                  >
                    <Text style={styles.secondaryButtonText}>Zrušit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={handleCreateHousehold}
                    disabled={isCreating}
                  >
                    {isCreating ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <Text style={styles.primaryButtonText}>Vytvořit</Text>
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
          title: currentHousehold?.name || 'Domácnost',
          headerShown: true,
          headerRight: () => (
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => console.log('Settings')}
            >
              <Settings size={22} color="#1F2937" strokeWidth={2} />
            </TouchableOpacity>
          ),
        }}
      />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Členové</Text>
          {currentHousehold?.members
            .filter(m => m.joinStatus === 'ACTIVE')
            .map(member => (
              <View key={member.userId} style={styles.memberCard}>
                <View style={styles.memberInfo}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {member.userName.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.memberDetails}>
                    <Text style={styles.memberName}>{member.userName}</Text>
                    <Text style={styles.memberRole}>{getRoleLabel(member.role)}</Text>
                  </View>
                </View>
              </View>
            ))}

          {isOwner && (
            <>
              {!showInviteForm ? (
                <TouchableOpacity
                  style={styles.addButton}
                  onPress={() => setShowInviteForm(true)}
                >
                  <Plus size={20} color="#8B5CF6" strokeWidth={2.5} />
                  <Text style={styles.addButtonText}>Pozvat člena</Text>
                </TouchableOpacity>
              ) : (
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
            </>
          )}
        </View>

        {dashboard && (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Bilance</Text>
              {dashboard.balances.map(balance => (
                <View key={balance.userId} style={styles.balanceCard}>
                  <View style={styles.balanceInfo}>
                    <Text style={styles.balanceName}>{balance.userName}</Text>
                    <Text style={styles.balanceDetail}>
                      Celkem zaplaceno: {balance.totalPaid.toFixed(0)} {currency.symbol}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.balanceAmount,
                      balance.balance > 0 && styles.balancePositive,
                      balance.balance < 0 && styles.balanceNegative,
                    ]}
                  >
                    {balance.balance > 0 ? '+' : ''}
                    {balance.balance.toFixed(0)} {currency.symbol}
                  </Text>
                </View>
              ))}
            </View>

            {dashboard.settlementSummary.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Doporučené vyrovnání</Text>
                {dashboard.settlementSummary.map((settlement, index) => (
                  <View key={index} style={styles.settlementCard}>
                    <View style={styles.settlementInfo}>
                      <Text style={styles.settlementText}>
                        <Text style={styles.settlementName}>
                          {settlement.fromUserName}
                        </Text>
                        {' → '}
                        <Text style={styles.settlementName}>
                          {settlement.toUserName}
                        </Text>
                      </Text>
                    </View>
                    <Text style={styles.settlementAmount}>
                      {settlement.amount.toFixed(0)} {currency.symbol}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        <View style={styles.section}>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => console.log('Policies')}
          >
            <View style={styles.menuItemLeft}>
              <Eye size={22} color="#8B5CF6" strokeWidth={2} />
              <Text style={styles.menuItemText}>Pravidla sdílení</Text>
            </View>
            <ArrowRight size={20} color="#9CA3AF" strokeWidth={2} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => console.log('Settlements')}
          >
            <View style={styles.menuItemLeft}>
              <DollarSign size={22} color="#10B981" strokeWidth={2} />
              <Text style={styles.menuItemText}>Historie vyrovnání</Text>
            </View>
            <ArrowRight size={20} color="#9CA3AF" strokeWidth={2} />
          </TouchableOpacity>
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>Jak funguje sdílení?</Text>
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
    backgroundColor: '#F9FAFB',
  },
  scrollContent: {
    padding: 16,
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
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: '#1F2937',
    marginBottom: 12,
  },
  form: {
    gap: 12,
  },
  input: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#1F2937',
  },
  formButtons: {
    flexDirection: 'row' as const,
    gap: 12,
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
  memberCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  memberInfo: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#8B5CF6',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  avatarText: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '700' as const,
  },
  memberDetails: {
    marginLeft: 12,
    flex: 1,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#1F2937',
    marginBottom: 2,
  },
  memberRole: {
    fontSize: 14,
    color: '#6B7280',
  },
  addButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: '#F3F4F6',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 8,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderStyle: 'dashed' as const,
  },
  addButtonText: {
    color: '#8B5CF6',
    fontSize: 16,
    fontWeight: '600' as const,
  },
  balanceCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  balanceInfo: {
    flex: 1,
  },
  balanceName: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#1F2937',
    marginBottom: 4,
  },
  balanceDetail: {
    fontSize: 14,
    color: '#6B7280',
  },
  balanceAmount: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: '#1F2937',
  },
  balancePositive: {
    color: '#10B981',
  },
  balanceNegative: {
    color: '#EF4444',
  },
  settlementCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  settlementInfo: {
    flex: 1,
  },
  settlementText: {
    fontSize: 15,
    color: '#6B7280',
  },
  settlementName: {
    fontWeight: '600' as const,
    color: '#1F2937',
  },
  settlementAmount: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: '#8B5CF6',
  },
  menuItem: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  menuItemLeft: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
  },
  menuItemText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#1F2937',
  },
  infoBox: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    marginTop: 8,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#1E40AF',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#3B82F6',
    lineHeight: 20,
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
