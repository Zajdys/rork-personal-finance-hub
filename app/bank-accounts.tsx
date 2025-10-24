import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Wallet, Plus, RefreshCw, ChevronRight, ArrowLeft } from 'lucide-react-native';
import { useBankStore } from '@/store/bank-store';
import { useSettingsStore } from '@/store/settings-store';
import { useFinanceStore } from '@/store/finance-store';

export default function BankAccountsScreen() {
  const { accounts, isSyncing, syncAllAccounts } = useBankStore();
  const { isDarkMode } = useSettingsStore();
  const { balance } = useFinanceStore();
  const router = useRouter();

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

  return (
    <View style={[styles.container, { backgroundColor: isDarkMode ? '#111827' : '#F8FAFC' }]}>
      <Stack.Screen
        options={{
          title: 'Bankovní účty',
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
        <View style={styles.totalBalanceContainer}>
          <LinearGradient
            colors={totalBalance >= 0 ? ['#10B981', '#059669'] : ['#EF4444', '#DC2626']}
            style={styles.totalBalanceGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Text style={styles.totalBalanceLabel}>Celkový zůstatek</Text>
            <Text style={styles.totalBalanceAmount}>
              {totalBalance.toLocaleString('cs-CZ')} Kč
            </Text>
            <View style={styles.balanceBreakdown}>
              <View style={styles.breakdownItem}>
                <Text style={styles.breakdownLabel}>Manuální</Text>
                <Text style={styles.breakdownAmount}>{balance.toLocaleString('cs-CZ')} Kč</Text>
              </View>
              <View style={styles.breakdownSeparator} />
              <View style={styles.breakdownItem}>
                <Text style={styles.breakdownLabel}>Banky</Text>
                <Text style={styles.breakdownAmount}>{totalBankBalance.toLocaleString('cs-CZ')} Kč</Text>
              </View>
            </View>
          </LinearGradient>
        </View>

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
            accounts.map((account) => (
              <TouchableOpacity
                key={account.id}
                style={[styles.accountCard, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}
              >
                <View style={styles.accountHeader}>
                  <View style={styles.accountIconContainer}>
                    <Text style={styles.accountIcon}>{getBankIcon(account.bankProvider)}</Text>
                  </View>
                  <View style={styles.accountInfo}>
                    <Text style={[styles.accountName, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                      {account.accountName || getBankName(account.bankProvider)}
                    </Text>
                    <Text style={[styles.accountNumber, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
                      {account.accountNumber}
                    </Text>
                  </View>
                  <ChevronRight color={isDarkMode ? '#9CA3AF' : '#6B7280'} size={20} />
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
            ))
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
  totalBalanceContainer: {
    margin: 20,
    marginTop: 60,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  totalBalanceGradient: {
    padding: 24,
    alignItems: 'center',
  },
  totalBalanceLabel: {
    fontSize: 14,
    color: 'white',
    opacity: 0.9,
    marginBottom: 8,
  },
  totalBalanceAmount: {
    fontSize: 36,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 20,
  },
  balanceBreakdown: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
    padding: 16,
    width: '100%',
  },
  breakdownItem: {
    flex: 1,
    alignItems: 'center',
  },
  breakdownLabel: {
    fontSize: 12,
    color: 'white',
    opacity: 0.8,
    marginBottom: 4,
  },
  breakdownAmount: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  breakdownSeparator: {
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    marginHorizontal: 16,
  },
  actionsContainer: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 24,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#667eea',
  },
  accountsContainer: {
    marginHorizontal: 20,
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 16,
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
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  accountHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  accountIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  accountIcon: {
    fontSize: 24,
  },
  accountInfo: {
    flex: 1,
  },
  accountName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  accountNumber: {
    fontSize: 12,
    color: '#6B7280',
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
    fontSize: 24,
    fontWeight: 'bold',
    color: '#10B981',
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
});
