import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Wallet, Plus, RefreshCw, ChevronRight, ChevronDown, ArrowLeft, Landmark, PiggyBank, Home } from 'lucide-react-native';
import { useBankStore } from '@/store/bank-store';
import { useSettingsStore } from '@/store/settings-store';
import { useFinanceStore } from '@/store/finance-store';
import { AccountType } from '@/types/bank';

export default function BankAccountsScreen() {
  const { accounts, isSyncing, syncAllAccounts } = useBankStore();
  const { isDarkMode } = useSettingsStore();
  const { balance } = useFinanceStore();
  const router = useRouter();
  const [expandedBanks, setExpandedBanks] = useState<Set<string>>(new Set());

  const totalBankBalance = accounts
    .filter(acc => acc.isActive)
    .reduce((sum, acc) => sum + acc.balance, 0);

  const totalBalance = balance + totalBankBalance;

  const handleSync = async () => {
    try {
      await syncAllAccounts();
    } catch (error) {
      console.error('Sync failed:', error);
    }
  };

  const getBankIcon = (provider: string): string => {
    switch (provider) {
      case 'csob':
        return '🏦';
      case 'kb':
        return '🏛️';
      case 'csas':
        return '💰';
      case 'moneta':
        return '💵';
      case 'fio':
        return '💳';
      case 'airbank':
        return '✈️';
      default:
        return '🏦';
    }
  };

  const getBankName = (provider: string): string => {
    switch (provider) {
      case 'csob':
        return 'ČSOB';
      case 'kb':
        return 'Komerční banka';
      case 'csas':
        return 'Česká spořitelna';
      case 'moneta':
        return 'Moneta Money Bank';
      case 'fio':
        return 'Fio banka';
      case 'airbank':
        return 'Air Bank';
      default:
        return provider.toUpperCase();
    }
  };

  const getAccountTypeLabel = (type: AccountType): string => {
    switch (type) {
      case 'checking':
        return 'Běžný účet';
      case 'savings':
        return 'Spořicí účet';
      case 'building_savings':
        return 'Stavební spoření';
      default:
        return 'Účet';
    }
  };

  const getAccountTypeIcon = (type: AccountType) => {
    switch (type) {
      case 'checking':
        return Landmark;
      case 'savings':
        return PiggyBank;
      case 'building_savings':
        return Home;
      default:
        return Wallet;
    }
  };

  const getAccountTypeColor = (type: AccountType): string => {
    switch (type) {
      case 'checking':
        return '#3B82F6';
      case 'savings':
        return '#10B981';
      case 'building_savings':
        return '#F59E0B';
      default:
        return '#6B7280';
    }
  };

  const toggleBank = (bankProvider: string) => {
    setExpandedBanks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(bankProvider)) {
        newSet.delete(bankProvider);
      } else {
        newSet.add(bankProvider);
      }
      return newSet;
    });
  };

  const bankGroups = accounts.reduce((groups, account) => {
    if (!groups[account.bankProvider]) {
      groups[account.bankProvider] = [];
    }
    groups[account.bankProvider].push(account);
    return groups;
  }, {} as Record<string, typeof accounts>);

  const renderBankGroup = (bankProvider: string, bankAccounts: typeof accounts) => {
    const isExpanded = expandedBanks.has(bankProvider);
    const bankTotal = bankAccounts.reduce((sum, acc) => sum + (acc.isActive ? acc.balance : 0), 0);
    const ChevronIcon = isExpanded ? ChevronDown : ChevronRight;

    return (
      <View style={styles.bankGroupSection} key={bankProvider}>
        <TouchableOpacity
          onPress={() => toggleBank(bankProvider)}
          activeOpacity={0.9}
        >
          <LinearGradient
            colors={isDarkMode ? ['#374151', '#1F2937'] : ['#FFFFFF', '#F9FAFB']}
            style={styles.bankGroupHeader}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.bankGroupHeaderContent}>
              <View style={styles.bankGroupHeaderLeft}>
                <LinearGradient
                  colors={['#667eea', '#764ba2']}
                  style={styles.bankIconContainer}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Text style={styles.bankIcon}>{getBankIcon(bankProvider)}</Text>
                </LinearGradient>
                <View style={styles.bankInfo}>
                  <Text style={[styles.bankName, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                    {getBankName(bankProvider)}
                  </Text>
                  <View style={styles.bankMetaRow}>
                    <View style={[styles.accountCountBadge, { backgroundColor: isDarkMode ? '#4B5563' : '#EEF2FF' }]}>
                      <Text style={[styles.bankAccountCount, { color: isDarkMode ? '#D1D5DB' : '#667eea' }]}>
                        {bankAccounts.length} {bankAccounts.length === 1 ? 'účet' : 'účty'}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
              <View style={styles.bankGroupHeaderRight}>
                <View style={styles.bankTotalContainer}>
                  <Text style={[styles.bankTotalLabel, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
                    Celkem
                  </Text>
                  <Text style={[styles.bankTotalAmount, { color: bankTotal >= 0 ? '#10B981' : '#EF4444' }]}>
                    {bankTotal.toLocaleString('cs-CZ')} Kč
                  </Text>
                </View>
                <View style={[styles.chevronCircle, { backgroundColor: isDarkMode ? '#4B5563' : '#F3F4F6' }]}>
                  <ChevronIcon color={isDarkMode ? '#D1D5DB' : '#667eea'} size={18} />
                </View>
              </View>
            </View>
          </LinearGradient>
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.bankAccountsContainer}>
            {bankAccounts.map((account, index) => {
              const TypeIcon = getAccountTypeIcon(account.accountType);
              const typeColor = getAccountTypeColor(account.accountType);

              return (
                <View
                  key={account.id}
                  style={styles.accountCardWrapper}
                >
                  <LinearGradient
                    colors={isDarkMode ? ['#2D3748', '#1F2937'] : ['#FFFFFF', '#FAFBFF']}
                    style={styles.accountCard}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                  >
                    <View style={styles.accountTopRow}>
                      <View style={styles.accountHeader}>
                        <LinearGradient
                          colors={[typeColor, typeColor + 'CC']}
                          style={styles.accountTypeIconContainer}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                        >
                          <TypeIcon color="white" size={20} />
                        </LinearGradient>
                        <View style={styles.accountInfo}>
                          <Text style={[styles.accountName, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                            {account.accountName}
                          </Text>
                          <Text style={[styles.accountTypeLabel, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
                            {getAccountTypeLabel(account.accountType)}
                          </Text>
                        </View>
                      </View>
                      {!account.isActive && (
                        <View style={styles.inactiveBadge}>
                          <Text style={styles.inactiveBadgeText}>Neaktivní</Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.accountDivider} />

                    <View style={styles.accountBottomRow}>
                      <View style={styles.accountNumberContainer}>
                        <Text style={[styles.accountNumberLabel, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
                          Číslo účtu
                        </Text>
                        <Text style={[styles.accountNumberValue, { color: isDarkMode ? '#D1D5DB' : '#4B5563' }]}>
                          {account.accountNumber}
                        </Text>
                      </View>

                      <View style={styles.accountBalance}>
                        <Text style={[styles.accountBalanceLabel, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
                          Zůstatek
                        </Text>
                        <Text style={[
                          styles.accountBalanceAmount,
                          { color: account.balance >= 0 ? '#10B981' : '#EF4444' }
                        ]}>
                          {account.balance.toLocaleString('cs-CZ')} Kč
                        </Text>
                      </View>
                    </View>

                    {account.lastSyncedAt && (
                      <View style={styles.syncInfoContainer}>
                        <RefreshCw size={10} color={isDarkMode ? '#6B7280' : '#9CA3AF'} />
                        <Text style={[styles.lastSynced, { color: isDarkMode ? '#6B7280' : '#9CA3AF' }]}>
                          {new Date(account.lastSyncedAt).toLocaleString('cs-CZ', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </Text>
                      </View>
                    )}
                  </LinearGradient>
                </View>
              );
            })}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: isDarkMode ? '#111827' : '#F8FAFC' }]}>
      <Stack.Screen
        options={{
          title: 'Celkový zůstatek',
          headerStyle: {
            backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF',
          },
          headerTintColor: isDarkMode ? '#FFFFFF' : '#000000',
          headerShadowVisible: false,
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.push('/(tabs)')}
              style={{ marginLeft: 16 }}
            >
              <ArrowLeft color={isDarkMode ? '#FFFFFF' : '#000000'} size={24} />
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={['#667eea', '#764ba2']}
          style={styles.headerGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.headerContent}>
            <Text style={styles.headerLabel}>Celkový zůstatek</Text>
            <Text style={styles.headerAmount}>
              {totalBalance.toLocaleString('cs-CZ')} Kč
            </Text>
            
            <View style={styles.quickStatsRow}>
              <View style={styles.quickStatCard}>
                <Wallet size={16} color="rgba(255,255,255,0.8)" />
                <View style={styles.quickStatContent}>
                  <Text style={styles.quickStatLabel}>Manuální</Text>
                  <Text style={styles.quickStatValue}>{balance.toLocaleString('cs-CZ')} Kč</Text>
                </View>
              </View>
              
              <View style={styles.quickStatCard}>
                <Landmark size={16} color="rgba(255,255,255,0.8)" />
                <View style={styles.quickStatContent}>
                  <Text style={styles.quickStatLabel}>Banky</Text>
                  <Text style={styles.quickStatValue}>{totalBankBalance.toLocaleString('cs-CZ')} Kč</Text>
                </View>
              </View>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={[styles.actionButton, { opacity: isSyncing ? 0.6 : 1 }]}
            onPress={handleSync}
            disabled={isSyncing}
          >
            <RefreshCw 
              color="#667eea" 
              size={20} 
              style={isSyncing ? { transform: [{ rotate: '180deg' }] } : undefined}
            />
            <Text style={styles.actionButtonText}>
              {isSyncing ? 'Synchronizuji...' : 'Synchronizovat'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push('/bank-connect')}
          >
            <Plus color="#667eea" size={20} />
            <Text style={styles.actionButtonText}>Přidat účet</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.accountsContainer}>
          <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
            Propojené účty ({accounts.length})
          </Text>

          {accounts.length === 0 ? (
            <View style={[styles.emptyState, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}>
              <Wallet color="#9CA3AF" size={48} />
              <Text style={[styles.emptyStateTitle, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                Žádné propojené účty
              </Text>
              <Text style={[styles.emptyStateText, { color: isDarkMode ? '#9CA3AF' : '#9CA3AF' }]}>
                Propojte svůj bankovní účet pro automatické sledování transakcí
              </Text>
              <TouchableOpacity
                style={styles.emptyStateButton}
                onPress={() => router.push('/bank-connect')}
              >
                <Text style={styles.emptyStateButtonText}>Přidat první účet</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              {Object.entries(bankGroups).map(([bankProvider, bankAccounts]) =>
                renderBankGroup(bankProvider, bankAccounts)
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  headerGradient: {
    paddingTop: 24,
    paddingBottom: 32,
    paddingHorizontal: 20,
  },
  headerContent: {
    alignItems: 'center',
  },
  headerLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.85)',
    marginBottom: 8,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  headerAmount: {
    fontSize: 48,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 24,
    letterSpacing: -1,
  },
  quickStatsRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  quickStatCard: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  quickStatContent: {
    flex: 1,
  },
  quickStatLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 4,
    fontWeight: '500',
  },
  quickStatValue: {
    fontSize: 15,
    fontWeight: '700',
    color: 'white',
  },
  actionsContainer: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 24,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    gap: 8,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 5,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#667eea',
    letterSpacing: -0.2,
  },
  accountsContainer: {
    marginHorizontal: 20,
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 20,
    letterSpacing: -0.5,
  },
  emptyState: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyStateButton: {
    backgroundColor: '#667eea',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyStateButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  accountHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  accountInfo: {
    flex: 1,
  },
  accountName: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1F2937',
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  accountBalance: {
    alignItems: 'flex-end',
  },
  accountBalanceLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  accountBalanceAmount: {
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.6,
  },
  lastSynced: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  inactiveBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  inactiveBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#D97706',
    letterSpacing: 0.3,
  },
  bankGroupSection: {
    marginBottom: 20,
  },
  bankGroupHeader: {
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(102, 126, 234, 0.1)',
  },
  bankGroupHeaderContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
  },
  bankGroupHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  bankGroupHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  bankIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  bankIcon: {
    fontSize: 30,
  },
  bankInfo: {
    flex: 1,
  },
  bankName: {
    fontSize: 19,
    fontWeight: '800',
    color: '#1F2937',
    letterSpacing: -0.4,
    marginBottom: 6,
  },
  bankMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  accountCountBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  bankAccountCount: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  bankTotalContainer: {
    alignItems: 'flex-end',
  },
  bankTotalLabel: {
    fontSize: 10,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '700',
  },
  bankTotalAmount: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.6,
  },
  chevronCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bankAccountsContainer: {
    marginTop: 12,
    gap: 12,
    paddingHorizontal: 4,
  },
  accountCardWrapper: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  accountCard: {
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(102, 126, 234, 0.08)',
  },
  accountTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  accountTypeIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  accountTypeLabel: {
    fontSize: 13,
    marginTop: 4,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  accountDivider: {
    height: 1,
    backgroundColor: 'rgba(102, 126, 234, 0.1)',
    marginVertical: 16,
  },
  accountBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 16,
  },
  accountNumberContainer: {
    flex: 1,
  },
  accountNumberLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  accountNumberValue: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  syncInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(102, 126, 234, 0.08)',
  },
});
