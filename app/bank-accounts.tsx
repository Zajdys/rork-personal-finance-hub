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
          style={[styles.bankGroupHeader, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}
          onPress={() => toggleBank(bankProvider)}
          activeOpacity={0.7}
        >
          <View style={styles.bankGroupHeaderLeft}>
            <View style={styles.bankIconContainer}>
              <Text style={styles.bankIcon}>{getBankIcon(bankProvider)}</Text>
            </View>
            <View>
              <Text style={[styles.bankName, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                {getBankName(bankProvider)}
              </Text>
              <Text style={[styles.bankAccountCount, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
                {bankAccounts.length} {bankAccounts.length === 1 ? 'účet' : 'účty'}
              </Text>
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
            <ChevronIcon color={isDarkMode ? '#9CA3AF' : '#6B7280'} size={20} />
          </View>
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.bankAccountsContainer}>
            {bankAccounts.map((account) => {
              const TypeIcon = getAccountTypeIcon(account.accountType);
              const typeColor = getAccountTypeColor(account.accountType);

              return (
                <TouchableOpacity
                  key={account.id}
                  style={[styles.accountCard, { backgroundColor: isDarkMode ? '#2D3748' : '#F9FAFB' }]}
                >
                  <View style={styles.accountHeader}>
                    <View style={[styles.accountTypeIconContainer, { backgroundColor: `${typeColor}20` }]}>
                      <TypeIcon color={typeColor} size={18} />
                    </View>
                    <View style={styles.accountInfo}>
                      <Text style={[styles.accountName, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                        {account.accountName}
                      </Text>
                      <Text style={[styles.accountTypeLabel, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
                        {getAccountTypeLabel(account.accountType)} • {account.accountNumber}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.accountBalance}>
                    <Text style={[styles.accountBalanceLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                      Aktuální zůstatek
                    </Text>
                    <Text style={[
                      styles.accountBalanceAmount,
                      { color: account.balance >= 0 ? '#10B981' : '#EF4444' }
                    ]}>
                      {account.balance.toLocaleString('cs-CZ')} Kč
                    </Text>
                  </View>

                  {account.lastSyncedAt && (
                    <Text style={[styles.lastSynced, { color: isDarkMode ? '#9CA3AF' : '#9CA3AF' }]}>
                      Poslední synchronizace: {new Date(account.lastSyncedAt).toLocaleString('cs-CZ')}
                    </Text>
                  )}

                  {!account.isActive && (
                    <View style={styles.inactiveBadge}>
                      <Text style={styles.inactiveBadgeText}>Neaktivní</Text>
                    </View>
                  )}
                </TouchableOpacity>
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
              onPress={() => router.back()}
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
  accountCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 18,
    marginHorizontal: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  accountHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },

  accountInfo: {
    flex: 1,
  },
  accountName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 4,
    letterSpacing: -0.2,
  },

  accountBalance: {
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
  },
  accountBalanceLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
  },
  accountBalanceAmount: {
    fontSize: 26,
    fontWeight: '800',
    color: '#10B981',
    letterSpacing: -0.5,
  },
  lastSynced: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 8,
  },
  inactiveBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  inactiveBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#D97706',
  },
  bankGroupSection: {
    marginBottom: 16,
  },
  bankGroupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  bankGroupHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  bankGroupHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bankIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#E5E7EB',
  },
  bankIcon: {
    fontSize: 28,
  },
  bankName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    letterSpacing: -0.3,
  },
  bankAccountCount: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 4,
    fontWeight: '500',
  },
  bankTotalContainer: {
    alignItems: 'flex-end',
  },
  bankTotalLabel: {
    fontSize: 11,
    color: '#9CA3AF',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '600',
  },
  bankTotalAmount: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  bankAccountsContainer: {
    marginTop: 8,
    gap: 8,
  },
  accountTypeIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  accountTypeLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
    fontWeight: '500',
  },
});
