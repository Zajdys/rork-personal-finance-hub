import React, { useState, useEffect } from 'react';
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
import { ArrowLeft, Building2, Lock, User, CheckCircle, RefreshCw, Trash2, XCircle, ChevronDown } from 'lucide-react-native';
import { Stack, router } from 'expo-router';
import { SUPPORTED_BANKS, BankProvider, AccountType } from '@/types/bank';
import { useBankStore } from '@/store/bank-store';
import { useFinanceStore } from '@/store/finance-store';
import { trpcClient } from '@/lib/trpc';

export default function BankConnectScreen() {
  const [selectedBank, setSelectedBank] = useState<BankProvider | null>(null);
  const [accountType, setAccountType] = useState<AccountType>('checking');
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [showCredentials, setShowCredentials] = useState<boolean>(false);
  const [showAccountTypeModal, setShowAccountTypeModal] = useState<boolean>(false);

  const { accounts, addAccount, removeAccount, syncAccount, isSyncing, loadData } = useBankStore();
  const { addTransaction } = useFinanceStore();

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleBankSelect = (bankId: BankProvider) => {
    setSelectedBank(bankId);
    setAccountType('checking');
    setShowCredentials(true);
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

  const handleConnect = async () => {
    if (!selectedBank || !username || !password) {
      Alert.alert('Chyba', 'Vyplňte všechny údaje');
      return;
    }

    setIsConnecting(true);
    try {
      const result = await trpcClient.banking.connect.mutate({
        bankProvider: selectedBank,
        accountType,
        credentials: { username, password },
      });

      if (result.success && result.account) {
        addAccount(result.account);
        
        Alert.alert(
          'Úspěch!',
          `Banka ${SUPPORTED_BANKS.find(b => b.id === selectedBank)?.name} byla úspěšně propojena.`,
          [
            {
              text: 'OK',
              onPress: () => {
                setShowCredentials(false);
                setSelectedBank(null);
                setUsername('');
                setPassword('');
              },
            },
          ]
        );

        await handleSync(result.account.id);
      }
    } catch (error) {
      console.error('Bank connection error:', error);
      Alert.alert('Chyba', 'Nepodařilo se připojit k bance. Zkontrolujte přihlašovací údaje.');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSync = async (accountId: string) => {
    try {
      await syncAccount(accountId);
      
      const syncedTransactions = useBankStore.getState().getAccountTransactions(accountId);
      
      for (const txn of syncedTransactions) {
        const existingTransactions = useFinanceStore.getState().transactions;
        const isDuplicate = existingTransactions.some(
          t => t.title === txn.description && 
               Math.abs(t.amount - txn.amount) < 0.01 &&
               Math.abs(new Date(t.date).getTime() - new Date(txn.date).getTime()) < 86400000
        );

        if (!isDuplicate) {
          addTransaction({
            id: txn.id,
            type: txn.type,
            amount: txn.amount,
            title: txn.description,
            category: txn.category || 'Ostatní',
            date: txn.date,
          });
        }
      }

      Alert.alert('Synchronizace dokončena', `Načteno ${syncedTransactions.length} transakcí.`);
    } catch (error) {
      console.error('Sync error:', error);
      Alert.alert('Chyba', 'Synchronizace se nezdařila.');
    }
  };

  const handleDisconnect = (accountId: string) => {
    Alert.alert(
      'Odpojit banku?',
      'Opravdu chcete odpojit tuto banku? Už nebudete dostávat automatické aktualizace transakcí.',
      [
        { text: 'Zrušit', style: 'cancel' },
        {
          text: 'Odpojit',
          style: 'destructive',
          onPress: async () => {
            try {
              await trpcClient.banking.disconnect.mutate({ accountId });
              removeAccount(accountId);
              Alert.alert('Hotovo', 'Banka byla odpojena.');
            } catch (error) {
              console.error('Disconnect error:', error);
              Alert.alert('Chyba', 'Nepodařilo se odpojit banku.');
            }
          },
        },
      ]
    );
  };

  const connectedBankIds = new Set(accounts.map(acc => acc.bankProvider));
  const availableBanks = SUPPORTED_BANKS.filter(bank => !connectedBankIds.has(bank.id));

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Propojení s bankou',
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()}>
              <ArrowLeft color="#667eea" size={24} />
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={['#667eea', '#764ba2']}
          style={styles.header}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Building2 color="white" size={48} />
          <Text style={styles.headerTitle}>Bankovní propojení</Text>
          <Text style={styles.headerSubtitle}>
            Propojte své banky pro automatickou synchronizaci transakcí
          </Text>
        </LinearGradient>

        {accounts.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Propojené banky</Text>
            {accounts.map((account) => {
              const bank = SUPPORTED_BANKS.find(b => b.id === account.bankProvider);
              return (
                <View key={account.id} style={styles.connectedBankCard}>
                  <View style={styles.bankInfo}>
                    <Text style={styles.bankLogo}>{bank?.logo}</Text>
                    <View style={styles.bankDetails}>
                      <Text style={styles.bankName}>{bank?.name}</Text>
                      <Text style={styles.accountNumber}>{account.accountNumber}</Text>
                      <Text style={styles.lastSync}>
                        Poslední synchronizace: {new Date(account.lastSyncedAt).toLocaleString('cs-CZ')}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.bankActions}>
                    <TouchableOpacity
                      style={styles.syncButton}
                      onPress={() => handleSync(account.id)}
                      disabled={isSyncing}
                    >
                      {isSyncing ? (
                        <ActivityIndicator size="small" color="#10B981" />
                      ) : (
                        <RefreshCw color="#10B981" size={20} />
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.disconnectButton}
                      onPress={() => handleDisconnect(account.id)}
                    >
                      <Trash2 color="#EF4444" size={20} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {availableBanks.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Dostupné banky</Text>
            <View style={styles.bankGrid}>
              {availableBanks.map((bank) => (
                <TouchableOpacity
                  key={bank.id}
                  style={styles.bankCard}
                  onPress={() => handleBankSelect(bank.id)}
                >
                  <Text style={styles.bankCardLogo}>{bank.logo}</Text>
                  <Text style={styles.bankCardName}>{bank.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {availableBanks.length === 0 && accounts.length > 0 && (
          <View style={styles.allConnectedContainer}>
            <CheckCircle color="#10B981" size={48} />
            <Text style={styles.allConnectedText}>Všechny banky jsou propojeny!</Text>
          </View>
        )}
      </ScrollView>

      <Modal visible={showCredentials} transparent animationType="slide" onRequestClose={() => setShowCredentials(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              Přihlášení k {selectedBank && SUPPORTED_BANKS.find(b => b.id === selectedBank)?.name}
            </Text>
            <Text style={styles.modalSubtitle}>
              Zadejte své přihlašovací údaje k internetovému bankovnictví
            </Text>

            <View style={styles.inputContainer}>
              <User color="#6B7280" size={20} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={username}
                onChangeText={setUsername}
                placeholder="Uživatelské jméno"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
                editable={!isConnecting}
              />
            </View>

            <View style={styles.inputContainer}>
              <Lock color="#6B7280" size={20} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Heslo"
                placeholderTextColor="#9CA3AF"
                secureTextEntry
                editable={!isConnecting}
              />
            </View>

            <TouchableOpacity
              style={styles.accountTypeSelector}
              onPress={() => setShowAccountTypeModal(true)}
              disabled={isConnecting}
            >
              <Text style={styles.accountTypeSelectorLabel}>Typ účtu</Text>
              <View style={styles.accountTypeSelectorValue}>
                <Text style={styles.accountTypeSelectorText}>{getAccountTypeLabel(accountType)}</Text>
                <ChevronDown color="#6B7280" size={20} />
              </View>
            </TouchableOpacity>

            <View style={styles.securityNote}>
              <Lock color="#10B981" size={16} />
              <Text style={styles.securityNoteText}>
                Vaše údaje jsou šifrované a zabezpečené. Používáme standardy otevřeného bankovnictví (PSD2).
              </Text>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancel]}
                onPress={() => {
                  setShowCredentials(false);
                  setSelectedBank(null);
                  setUsername('');
                  setPassword('');
                }}
                disabled={isConnecting}
              >
                <XCircle color="#6B7280" size={20} />
                <Text style={styles.modalButtonText}>Zrušit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalConfirm]}
                onPress={handleConnect}
                disabled={isConnecting || !username || !password}
              >
                {isConnecting ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <>
                    <CheckCircle color="white" size={20} />
                    <Text style={[styles.modalButtonText, { color: 'white' }]}>Připojit</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showAccountTypeModal} transparent animationType="fade" onRequestClose={() => setShowAccountTypeModal(false)}>
        <TouchableOpacity 
          style={styles.accountTypeModalBackdrop} 
          activeOpacity={1}
          onPress={() => setShowAccountTypeModal(false)}
        >
          <View style={styles.accountTypeModalCard}>
            <Text style={styles.accountTypeModalTitle}>Vyberte typ účtu</Text>
            {(['checking', 'savings', 'building_savings'] as AccountType[]).map((type) => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.accountTypeOption,
                  accountType === type && styles.accountTypeOptionSelected,
                ]}
                onPress={() => {
                  setAccountType(type);
                  setShowAccountTypeModal(false);
                }}
              >
                <Text style={[
                  styles.accountTypeOptionText,
                  accountType === type && styles.accountTypeOptionTextSelected,
                ]}>
                  {getAccountTypeLabel(type)}
                </Text>
                {accountType === type && <CheckCircle color="#10B981" size={20} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    paddingTop: 40,
    paddingBottom: 40,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold' as const,
    color: 'white',
    marginTop: 16,
  },
  headerSubtitle: {
    fontSize: 16,
    color: 'white',
    opacity: 0.9,
    marginTop: 8,
    textAlign: 'center',
  },
  section: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: '#1F2937',
    marginBottom: 16,
  },
  connectedBankCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  bankInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  bankLogo: {
    fontSize: 32,
    marginRight: 12,
  },
  bankDetails: {
    flex: 1,
  },
  bankName: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: '#1F2937',
  },
  accountNumber: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  lastSync: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
  },
  bankActions: {
    flexDirection: 'row',
    gap: 8,
  },
  syncButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disconnectButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bankGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  bankCard: {
    width: '47%',
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  bankCardLogo: {
    fontSize: 40,
    marginBottom: 12,
  },
  bankCardName: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#1F2937',
    textAlign: 'center',
  },
  allConnectedContainer: {
    padding: 40,
    alignItems: 'center',
  },
  allConnectedText: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: '#10B981',
    marginTop: 16,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800' as const,
    color: '#1F2937',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 8,
    marginBottom: 24,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#1F2937',
  },
  securityNote: {
    flexDirection: 'row',
    backgroundColor: '#ECFDF5',
    borderRadius: 12,
    padding: 12,
    marginBottom: 24,
    gap: 8,
  },
  securityNoteText: {
    flex: 1,
    fontSize: 12,
    color: '#059669',
    lineHeight: 16,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 14,
  },
  modalCancel: {
    backgroundColor: '#F3F4F6',
  },
  modalConfirm: {
    backgroundColor: '#10B981',
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: '#1F2937',
  },
  accountTypeSelector: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  accountTypeSelectorLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 8,
  },
  accountTypeSelectorValue: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  accountTypeSelectorText: {
    fontSize: 16,
    color: '#1F2937',
    fontWeight: '600' as const,
  },
  accountTypeModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  accountTypeModalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 24,
  },
  accountTypeModalTitle: {
    fontSize: 20,
    fontWeight: '800' as const,
    color: '#1F2937',
    marginBottom: 16,
  },
  accountTypeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    marginBottom: 8,
  },
  accountTypeOptionSelected: {
    backgroundColor: '#ECFDF5',
    borderWidth: 2,
    borderColor: '#10B981',
  },
  accountTypeOptionText: {
    fontSize: 16,
    color: '#1F2937',
    fontWeight: '600' as const,
  },
  accountTypeOptionTextSelected: {
    color: '#10B981',
  },
});
