export type BankProvider = 
  | 'csob'
  | 'ceska-sporitelna'
  | 'komercni-banka'
  | 'moneta'
  | 'fio'
  | 'raiffeisenbank'
  | 'unicredit'
  | 'air-bank'
  | 'revolut'
  | 'wise';

export interface BankAccount {
  id: string;
  bankProvider: BankProvider;
  accountNumber: string;
  accountName: string;
  balance: number;
  currency: string;
  lastSyncedAt: Date;
  isActive: boolean;
  connectedAt: Date;
}

export interface BankTransaction {
  id: string;
  accountId: string;
  date: Date;
  amount: number;
  type: 'income' | 'expense';
  description: string;
  category?: string;
  counterpartyName?: string;
  counterpartyAccount?: string;
  variableSymbol?: string;
  specificSymbol?: string;
  constantSymbol?: string;
  transactionId: string;
}

export interface BankConnectionStatus {
  isConnected: boolean;
  lastSync?: Date;
  nextSync?: Date;
  error?: string;
}

export const SUPPORTED_BANKS: {
  id: BankProvider;
  name: string;
  logo: string;
  color: string;
}[] = [
  {
    id: 'ceska-sporitelna',
    name: 'Česká spořitelna',
    logo: '🏦',
    color: '#003F87',
  },
  {
    id: 'csob',
    name: 'ČSOB',
    logo: '🏦',
    color: '#003F87',
  },
  {
    id: 'komercni-banka',
    name: 'Komerční banka',
    logo: '🏦',
    color: '#003D7A',
  },
  {
    id: 'moneta',
    name: 'MONETA Money Bank',
    logo: '🏦',
    color: '#FF6B00',
  },
  {
    id: 'fio',
    name: 'Fio banka',
    logo: '🏦',
    color: '#FF0000',
  },
  {
    id: 'raiffeisenbank',
    name: 'Raiffeisenbank',
    logo: '🏦',
    color: '#FFED00',
  },
  {
    id: 'unicredit',
    name: 'UniCredit Bank',
    logo: '🏦',
    color: '#E20714',
  },
  {
    id: 'air-bank',
    name: 'Air Bank',
    logo: '🏦',
    color: '#FF6600',
  },
  {
    id: 'revolut',
    name: 'Revolut',
    logo: '💳',
    color: '#0075EB',
  },
  {
    id: 'wise',
    name: 'Wise',
    logo: '💳',
    color: '#9FE870',
  },
];
