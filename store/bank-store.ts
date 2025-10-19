import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BankAccount, BankTransaction, BankProvider } from '@/types/bank';

interface BankState {
  accounts: BankAccount[];
  transactions: BankTransaction[];
  isLoaded: boolean;
  isSyncing: boolean;
  lastSyncError: string | null;
  addAccount: (account: BankAccount) => void;
  removeAccount: (accountId: string) => void;
  updateAccount: (accountId: string, updates: Partial<BankAccount>) => void;
  addTransactions: (transactions: BankTransaction[]) => void;
  getAccountTransactions: (accountId: string) => BankTransaction[];
  syncAccount: (accountId: string) => Promise<void>;
  syncAllAccounts: () => Promise<void>;
  loadData: () => Promise<void>;
  saveData: () => Promise<void>;
  clearSyncError: () => void;
}

export const useBankStore = create<BankState>((set, get) => ({
  accounts: [],
  transactions: [],
  isLoaded: false,
  isSyncing: false,
  lastSyncError: null,

  addAccount: (account: BankAccount) => {
    set((state) => ({
      accounts: [...state.accounts, account],
    }));
    get().saveData();
  },

  removeAccount: (accountId: string) => {
    set((state) => ({
      accounts: state.accounts.filter(acc => acc.id !== accountId),
      transactions: state.transactions.filter(txn => txn.accountId !== accountId),
    }));
    get().saveData();
  },

  updateAccount: (accountId: string, updates: Partial<BankAccount>) => {
    set((state) => ({
      accounts: state.accounts.map(acc =>
        acc.id === accountId ? { ...acc, ...updates } : acc
      ),
    }));
    get().saveData();
  },

  addTransactions: (transactions: BankTransaction[]) => {
    set((state) => {
      const existingIds = new Set(state.transactions.map(t => t.transactionId));
      const newTransactions = transactions.filter(t => !existingIds.has(t.transactionId));
      
      return {
        transactions: [...state.transactions, ...newTransactions]
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
      };
    });
    get().saveData();
  },

  getAccountTransactions: (accountId: string) => {
    const state = get();
    return state.transactions.filter(txn => txn.accountId === accountId);
  },

  syncAccount: async (accountId: string) => {
    console.log('Syncing account:', accountId);
    set({ isSyncing: true, lastSyncError: null });
    
    try {
      const account = get().accounts.find(acc => acc.id === accountId);
      if (!account) {
        throw new Error('Account not found');
      }

      const mockTransactions = generateMockTransactions(accountId, account.bankProvider);
      
      get().addTransactions(mockTransactions);
      
      get().updateAccount(accountId, {
        lastSyncedAt: new Date(),
      });

      console.log(`Synced ${mockTransactions.length} transactions for account ${accountId}`);
    } catch (error) {
      console.error('Sync error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Chyba při synchronizaci';
      set({ lastSyncError: errorMessage });
      throw error;
    } finally {
      set({ isSyncing: false });
    }
  },

  syncAllAccounts: async () => {
    const accounts = get().accounts.filter(acc => acc.isActive);
    console.log(`Syncing ${accounts.length} accounts`);
    
    for (const account of accounts) {
      try {
        await get().syncAccount(account.id);
      } catch (error) {
        console.error(`Failed to sync account ${account.id}:`, error);
      }
    }
  },

  clearSyncError: () => {
    set({ lastSyncError: null });
  },

  loadData: async () => {
    try {
      const [accountsData, transactionsData] = await Promise.all([
        AsyncStorage.getItem('bank_accounts'),
        AsyncStorage.getItem('bank_transactions'),
      ]);

      let accounts: BankAccount[] = [];
      if (accountsData) {
        try {
          accounts = JSON.parse(accountsData).map((acc: any) => ({
            ...acc,
            lastSyncedAt: new Date(acc.lastSyncedAt),
            connectedAt: new Date(acc.connectedAt),
          }));
        } catch (error) {
          console.error('Failed to parse bank accounts:', error);
          await AsyncStorage.removeItem('bank_accounts');
        }
      }

      let transactions: BankTransaction[] = [];
      if (transactionsData) {
        try {
          transactions = JSON.parse(transactionsData).map((txn: any) => ({
            ...txn,
            date: new Date(txn.date),
          }));
        } catch (error) {
          console.error('Failed to parse bank transactions:', error);
          await AsyncStorage.removeItem('bank_transactions');
        }
      }

      set({
        accounts,
        transactions,
        isLoaded: true,
      });

      console.log('Bank data loaded successfully');
    } catch (error) {
      console.error('Failed to load bank data:', error);
      set({ isLoaded: true });
    }
  },

  saveData: async () => {
    try {
      const state = get();
      await Promise.all([
        AsyncStorage.setItem('bank_accounts', JSON.stringify(state.accounts)),
        AsyncStorage.setItem('bank_transactions', JSON.stringify(state.transactions)),
      ]);
      console.log('Bank data saved successfully');
    } catch (error) {
      console.error('Failed to save bank data:', error);
    }
  },
}));

function generateMockTransactions(accountId: string, provider: BankProvider): BankTransaction[] {
  const transactions: BankTransaction[] = [];
  const now = new Date();
  
  const mockData = [
    { description: 'LIDL', amount: -450, category: 'Jídlo a nápoje', days: 1 },
    { description: 'Netflix', amount: -199, category: 'Zábava', days: 2 },
    { description: 'ČEZ Distribuce', amount: -1200, category: 'Nájem a bydlení', days: 3 },
    { description: 'Shell Benzín', amount: -890, category: 'Doprava', days: 4 },
    { description: 'Výplata', amount: 35000, category: 'Mzda', days: 5 },
    { description: 'Albert', amount: -320, category: 'Jídlo a nápoje', days: 6 },
    { description: 'Spotify', amount: -169, category: 'Zábava', days: 7 },
    { description: 'Kaufland', amount: -560, category: 'Jídlo a nápoje', days: 8 },
    { description: 'O2 Czech Republic', amount: -599, category: 'Nájem a bydlení', days: 9 },
    { description: 'Bolt', amount: -180, category: 'Doprava', days: 10 },
  ];

  for (const data of mockData) {
    const date = new Date(now);
    date.setDate(date.getDate() - data.days);
    
    transactions.push({
      id: `bank-${accountId}-${Date.now()}-${Math.random()}`,
      accountId,
      date,
      amount: Math.abs(data.amount),
      type: data.amount < 0 ? 'expense' : 'income',
      description: data.description,
      category: data.category,
      transactionId: `txn-${provider}-${Date.now()}-${Math.random()}`,
      counterpartyName: data.description,
    });
  }

  return transactions;
}
