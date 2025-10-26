import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Transaction {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  title: string;
  category: string;
  date: Date;
}

export interface MonthlyReport {
  month: string; // YYYY-MM format
  totalIncome: number;
  totalExpenses: number;
  balance: number;
  topExpenseCategory: string;
  savingsRate: number;
  transactionCount: number;
  categoryBreakdown: CategoryExpense[];
  insights: string[];
}

export type RecurrenceFrequency = 'monthly' | 'yearly';

export interface RecurringConfig {
  isRecurring: boolean;
  frequency: RecurrenceFrequency; // currently supported: monthly/yearly
  dayOfMonth?: number; // 1-31 for monthly/yearly billing day
}

export interface FinancialGoal {
  id: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  category?: string;
  deadline?: Date;
  type: 'saving' | 'spending_limit';
  recurring?: RecurringConfig;
}

export interface CategoryExpense {
  category: string;
  amount: number;
  percentage: number;
  icon: string;
  color: string;
}

export type SubscriptionSource = 'bank' | 'manual';
export interface SubscriptionItem {
  id: string;
  name: string;
  amount: number;
  category: string;
  dayOfMonth: number;
  source: SubscriptionSource;
  active: boolean;
}

export const EXPENSE_CATEGORIES = {
  'Jídlo a nápoje': { icon: '🍽️', color: '#EF4444' },
  'Nájem a bydlení': { icon: '🏠', color: '#8B5CF6' },
  'Oblečení': { icon: '👕', color: '#F59E0B' },
  'Doprava': { icon: '🚗', color: '#10B981' },
  'Zábava': { icon: '🎬', color: '#EC4899' },
  'Zdraví': { icon: '⚕️', color: '#06B6D4' },
  'Vzdělání': { icon: '📚', color: '#6366F1' },
  'Nákupy': { icon: '🛍️', color: '#F97316' },
  'Služby': { icon: '🔧', color: '#84CC16' },
  'Ostatní': { icon: '📦', color: '#6B7280' },
} as const;

export const INCOME_CATEGORIES = {
  'Mzda': { icon: '💼', color: '#10B981' },
  'Freelance': { icon: '💻', color: '#8B5CF6' },
  'Investice': { icon: '📈', color: '#F59E0B' },
  'Dary': { icon: '🎁', color: '#EC4899' },
  'Ostatní': { icon: '💰', color: '#6B7280' },
} as const;

export interface CustomCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
  type: 'income' | 'expense';
}

export type LoanType = 'mortgage' | 'car' | 'personal' | 'student' | 'other';

export interface LoanItem {
  id: string;
  loanType: LoanType;
  loanAmount: number;
  interestRate: number;
  monthlyPayment: number;
  remainingMonths: number;
  startDate: Date;
  name?: string;
  color?: string;
  emoji?: string;
  isFixed?: boolean;
  fixedYears?: number;
  fixedEndDate?: Date;
  fixationStartDate?: Date;
  currentBalance?: number;
}

interface FinanceState {
  transactions: Transaction[];
  totalIncome: number;
  totalExpenses: number;
  balance: number;
  totalTransactions: number;
  recentTransactions: Transaction[];
  categoryExpenses: CategoryExpense[];
  monthlyReports: MonthlyReport[];
  financialGoals: FinancialGoal[];
  subscriptions: SubscriptionItem[];
  customCategories: CustomCategory[];
  loans: LoanItem[];
  isLoaded: boolean;
  addTransaction: (transaction: Transaction) => void;
  updateTotals: () => void;
  getCategoryExpenses: () => CategoryExpense[];
  getExpensesByCategory: (category: string) => Transaction[];
  getIncomesByCategory: (category: string) => Transaction[];
  generateMonthlyReport: (month: string) => MonthlyReport;
  getCurrentMonthReport: () => MonthlyReport;
  addFinancialGoal: (goal: FinancialGoal) => void;
  updateFinancialGoal: (id: string, updates: Partial<FinancialGoal>) => void;
  deleteFinancialGoal: (id: string) => void;
  reorderFinancialGoals: (goals: FinancialGoal[]) => void;
  getDetectedSubscriptions: () => SubscriptionItem[];
  addSubscription: (sub: SubscriptionItem) => void;
  updateSubscription: (id: string, updates: Partial<SubscriptionItem>) => void;
  deleteSubscription: (id: string) => void;
  addCustomCategory: (category: CustomCategory) => void;
  deleteCustomCategory: (id: string) => void;
  getAllCategories: (type: 'income' | 'expense') => { [key: string]: { icon: string; color: string } };
  addLoan: (loan: LoanItem) => void;
  updateLoan: (id: string, updates: Partial<LoanItem>) => void;
  deleteLoan: (id: string) => void;
  getLoanProgress: (id: string) => { paidMonths: number; totalMonths: number; percentage: number; totalPaid: number; remainingAmount: number };
  loadData: () => Promise<void>;
  saveData: () => Promise<void>;
}

function normalizeTitle(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/\d{2,}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export const useFinanceStore = create<FinanceState>((set, get) => ({
  transactions: [],
  totalIncome: 0,
  totalExpenses: 0,
  balance: 0,
  totalTransactions: 0,
  recentTransactions: [],
  categoryExpenses: [],
  monthlyReports: [],
  financialGoals: [],
  subscriptions: [
    {
      id: 'patreon-test',
      name: 'Patreon',
      amount: 450,
      category: 'Služby',
      dayOfMonth: 25,
      source: 'manual' as SubscriptionSource,
      active: true,
    },
  ],
  customCategories: [],
  loans: [],
  isLoaded: false,

  addTransaction: (transaction: Transaction) => {
    set((state) => {
      const newTransactions = [...state.transactions, transaction];
      const recentTransactions = newTransactions
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 5);
      
      return {
        transactions: newTransactions,
        recentTransactions,
        totalTransactions: newTransactions.length,
      } as Partial<FinanceState>;
    });
    get().updateTotals();
    get().saveData();
  },

  updateTotals: () => {
    set((state) => {
      const totalIncome = state.transactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + t.amount, 0);
      
      const totalExpenses = state.transactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);
      
      const balance = totalIncome - totalExpenses;
      const categoryExpenses = get().getCategoryExpenses();
      
      return {
        totalIncome,
        totalExpenses,
        balance,
        categoryExpenses,
      } as Partial<FinanceState>;
    });
  },

  getCategoryExpenses: () => {
    const state = get();
    const expenseTransactions = state.transactions.filter(t => t.type === 'expense');
    const totalExpenses = expenseTransactions.reduce((sum, t) => sum + t.amount, 0);
    
    if (totalExpenses === 0) return [] as CategoryExpense[];
    
    const categoryTotals: { [key: string]: number } = {};
    
    expenseTransactions.forEach(transaction => {
      const category = transaction.category || 'Ostatní';
      categoryTotals[category] = (categoryTotals[category] || 0) + transaction.amount;
    });
    
    const allCategories = get().getAllCategories('expense');
    
    return Object.entries(categoryTotals)
      .map(([category, amount]) => ({
        category,
        amount,
        percentage: Math.round((amount / totalExpenses) * 100),
        icon: allCategories[category]?.icon || '📦',
        color: allCategories[category]?.color || '#6B7280',
      }))
      .sort((a, b) => b.amount - a.amount);
  },

  getExpensesByCategory: (category: string) => {
    const state = get();
    return state.transactions
      .filter(t => t.type === 'expense' && t.category === category)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  },

  getIncomesByCategory: (category: string) => {
    const state = get();
    return state.transactions
      .filter(t => t.type === 'income' && t.category === category)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  },

  generateMonthlyReport: (month: string) => {
    const state = get();
    const monthTransactions = state.transactions.filter(t => {
      const transactionMonth = new Date(t.date).toISOString().slice(0, 7);
      return transactionMonth === month;
    });

    const totalIncome = monthTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);
    
    const totalExpenses = monthTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);
    
    const balance = totalIncome - totalExpenses;
    const savingsRate = totalIncome > 0 ? Math.round((balance / totalIncome) * 100) : 0;
    
    const expenseTransactions = monthTransactions.filter(t => t.type === 'expense');
    const categoryTotals: { [key: string]: number } = {};
    
    expenseTransactions.forEach(transaction => {
      const category = transaction.category || 'Ostatní';
      categoryTotals[category] = (categoryTotals[category] || 0) + transaction.amount;
    });
    
    const allCategories = get().getAllCategories('expense');
    
    const categoryBreakdown = Object.entries(categoryTotals)
      .map(([category, amount]) => ({
        category,
        amount,
        percentage: totalExpenses > 0 ? Math.round((amount / totalExpenses) * 100) : 0,
        icon: allCategories[category]?.icon || '📦',
        color: allCategories[category]?.color || '#6B7280',
      }))
      .sort((a, b) => b.amount - a.amount);
    
    const topExpenseCategory = categoryBreakdown[0]?.category || 'Žádné výdaje';
    
    const insights: string[] = [];
    if (savingsRate > 20) {
      insights.push('🎉 Skvělá míra úspor! Šetříte více než 20% příjmů.');
    } else if (savingsRate < 10 && totalIncome > 0) {
      insights.push('⚠️ Nízká míra úspor. Zkuste snížit výdaje nebo zvýšit příjmy.');
    }
    
    if (categoryBreakdown[0] && categoryBreakdown[0].percentage > 40) {
      insights.push(`💡 ${categoryBreakdown[0].category} tvoří ${categoryBreakdown[0].percentage}% výdajů. Zvažte optimalizaci.`);
    }
    
    if (balance < 0) {
      insights.push('🚨 Tento měsíc jste utratili více než vydělali!');
    }
    
    return {
      month,
      totalIncome,
      totalExpenses,
      balance,
      topExpenseCategory,
      savingsRate,
      transactionCount: monthTransactions.length,
      categoryBreakdown,
      insights,
    } as MonthlyReport;
  },

  getCurrentMonthReport: () => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    return get().generateMonthlyReport(currentMonth);
  },

  addFinancialGoal: (goal: FinancialGoal) => {
    set((state) => ({
      financialGoals: [...state.financialGoals, goal],
    }));
    get().saveData();
  },

  updateFinancialGoal: (id: string, updates: Partial<FinancialGoal>) => {
    set((state) => ({
      financialGoals: state.financialGoals.map(goal => 
        goal.id === id ? { ...goal, ...updates } : goal
      ),
    }));
    get().saveData();
  },

  deleteFinancialGoal: (id: string) => {
    console.log('Store: Deleting financial goal with ID:', id);
    const state = get();
    const goalToDelete = state.financialGoals.find(goal => goal.id === id);
    console.log('Store: Goal to delete:', goalToDelete);
    
    if (!goalToDelete) {
      console.warn('Store: Goal not found for deletion:', id);
      return;
    }
    
    const updatedGoals = state.financialGoals.filter(goal => goal.id !== id);
    console.log('Store: Updated goals count:', updatedGoals.length, 'vs original:', state.financialGoals.length);
    
    set(() => ({
      financialGoals: updatedGoals,
    }));
    
    get().saveData();
    console.log('Store: Financial goal deleted and data saved');
  },

  reorderFinancialGoals: (goals: FinancialGoal[]) => {
    set({ financialGoals: goals });
    get().saveData();
  },

  getDetectedSubscriptions: () => {
    const state = get();
    const out: SubscriptionItem[] = [];
    const groups: Record<string, Transaction[]> = {};
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);

    state.transactions
      .filter(t => t.type === 'expense' && t.date >= sixMonthsAgo)
      .forEach(t => {
        const key = normalizeTitle(t.title);
        if (!groups[key]) groups[key] = [];
        groups[key].push(t);
      });

    Object.entries(groups).forEach(([name, txs]) => {
      if (txs.length < 3) return;
      txs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const amounts = txs.map(t => t.amount);
      const avg = amounts.reduce((s, n) => s + n, 0) / amounts.length;
      const within10pct = amounts.every(a => Math.abs(a - avg) / avg < 0.15);
      if (!within10pct) return;

      let monthlyCount = 0;
      for (let i = 1; i < txs.length; i++) {
        const d1 = new Date(txs[i - 1].date);
        const d2 = new Date(txs[i].date);
        const diffDays = Math.abs((+d2 - +d1) / (1000 * 60 * 60 * 24));
        if (diffDays >= 25 && diffDays <= 35) monthlyCount++;
      }
      if (monthlyCount < 2) return;

      const last = txs[txs.length - 1];
      const item: SubscriptionItem = {
        id: `detected-${name}`,
        name: name || 'Předplatné',
        amount: Math.round(avg * 100) / 100,
        category: last.category || 'Služby',
        dayOfMonth: new Date(last.date).getDate(),
        source: 'bank',
        active: true,
      };
      out.push(item);
    });

    const existingNames = new Set((state.subscriptions || []).map(s => normalizeTitle(s.name)));
    return out.filter(s => !existingNames.has(normalizeTitle(s.name)));
  },

  addSubscription: (sub: SubscriptionItem) => {
    set((state) => ({ subscriptions: [...state.subscriptions, sub] }));
    get().saveData();
  },

  updateSubscription: (id: string, updates: Partial<SubscriptionItem>) => {
    set((state) => ({
      subscriptions: state.subscriptions.map(s => s.id === id ? { ...s, ...updates } : s),
    }));
    get().saveData();
  },

  deleteSubscription: (id: string) => {
    set((state) => ({ subscriptions: state.subscriptions.filter(s => s.id !== id) }));
    get().saveData();
  },

  addCustomCategory: (category: CustomCategory) => {
    set((state) => ({
      customCategories: [...state.customCategories, category],
    }));
    get().saveData();
  },

  deleteCustomCategory: (id: string) => {
    set((state) => ({
      customCategories: state.customCategories.filter(c => c.id !== id),
    }));
    get().saveData();
  },

  getAllCategories: (type: 'income' | 'expense') => {
    const state = get();
    const defaultCategories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    const customCategories = state.customCategories
      .filter(c => c.type === type)
      .reduce((acc, c) => {
        acc[c.name] = { icon: c.icon, color: c.color };
        return acc;
      }, {} as { [key: string]: { icon: string; color: string } });
    
    return { ...defaultCategories, ...customCategories };
  },

  addLoan: (loan: LoanItem) => {
    set((state) => ({
      loans: [...state.loans, loan],
    }));
    get().saveData();
  },

  updateLoan: (id: string, updates: Partial<LoanItem>) => {
    set((state) => ({
      loans: state.loans.map(loan => 
        loan.id === id ? { ...loan, ...updates } : loan
      ),
    }));
    get().saveData();
  },

  deleteLoan: (id: string) => {
    set((state) => ({
      loans: state.loans.filter(loan => loan.id !== id),
    }));
    get().saveData();
  },

  getLoanProgress: (id: string) => {
    const state = get();
    const loan = state.loans.find(l => l.id === id);
    if (!loan) {
      return { paidMonths: 0, totalMonths: 0, percentage: 0, totalPaid: 0, remainingAmount: 0 };
    }

    const now = new Date();
    const startDate = new Date(loan.startDate);
    const monthsPassed = Math.max(0, 
      (now.getFullYear() - startDate.getFullYear()) * 12 + 
      (now.getMonth() - startDate.getMonth())
    );
    
    const remainingAmount = loan.currentBalance !== undefined 
      ? loan.currentBalance 
      : loan.loanAmount;
    
    const totalPaid = loan.loanAmount - remainingAmount;
    
    const paidMonths = Math.min(monthsPassed, loan.remainingMonths);
    const totalMonths = loan.remainingMonths + paidMonths;
    const percentage = loan.loanAmount > 0 ? Math.round((totalPaid / loan.loanAmount) * 100) : 0;

    return {
      paidMonths,
      totalMonths,
      percentage,
      totalPaid,
      remainingAmount,
    };
  },

  loadData: async () => {
    try {
      const [transactionsData, goalsData, reportsData, subsData, customCategoriesData, loansData] = await Promise.all([
        AsyncStorage.getItem('finance_transactions'),
        AsyncStorage.getItem('finance_goals'),
        AsyncStorage.getItem('finance_reports'),
        AsyncStorage.getItem('finance_subscriptions'),
        AsyncStorage.getItem('finance_custom_categories'),
        AsyncStorage.getItem('finance_loans'),
      ]);
      
      let transactions: Transaction[] = [];
      if (transactionsData) {
        try {
          transactions = JSON.parse(transactionsData).map((t: any) => ({
            ...t,
            date: new Date(t.date)
          }));
        } catch (error) {
          console.error('Failed to parse transactions data:', error, 'Data:', transactionsData);
          await AsyncStorage.removeItem('finance_transactions');
        }
      }
      
      let financialGoals: FinancialGoal[] = [];
      if (goalsData) {
        try {
          financialGoals = JSON.parse(goalsData).map((g: any) => ({
            ...g,
            deadline: g.deadline ? new Date(g.deadline) : undefined,
            recurring: g.recurring ? {
              isRecurring: Boolean(g.recurring.isRecurring),
              frequency: (g.recurring.frequency ?? 'monthly') as RecurrenceFrequency,
              dayOfMonth: typeof g.recurring.dayOfMonth === 'number' ? g.recurring.dayOfMonth : undefined,
            } : undefined,
          }));
        } catch (error) {
          console.error('Failed to parse financial goals data:', error, 'Data:', goalsData);
          await AsyncStorage.removeItem('finance_goals');
        }
      }
      
      let monthlyReports: MonthlyReport[] = [];
      if (reportsData) {
        try {
          monthlyReports = JSON.parse(reportsData);
        } catch (error) {
          console.error('Failed to parse monthly reports data:', error, 'Data:', reportsData);
          await AsyncStorage.removeItem('finance_reports');
        }
      }

      let subscriptions: SubscriptionItem[] = [];
      if (subsData) {
        try {
          subscriptions = JSON.parse(subsData);
        } catch (error) {
          console.error('Failed to parse subscriptions data:', error, 'Data:', subsData);
          await AsyncStorage.removeItem('finance_subscriptions');
        }
      }
      
      let customCategories: CustomCategory[] = [];
      if (customCategoriesData) {
        try {
          customCategories = JSON.parse(customCategoriesData);
        } catch (error) {
          console.error('Failed to parse custom categories data:', error, 'Data:', customCategoriesData);
          await AsyncStorage.removeItem('finance_custom_categories');
        }
      }

      let loans: LoanItem[] = [];
      if (loansData) {
        try {
          loans = JSON.parse(loansData).map((l: any) => ({
            ...l,
            startDate: new Date(l.startDate),
            fixedEndDate: l.fixedEndDate ? new Date(l.fixedEndDate) : undefined,
            fixationStartDate: l.fixationStartDate ? new Date(l.fixationStartDate) : undefined,
          }));
        } catch (error) {
          console.error('Failed to parse loans data:', error, 'Data:', loansData);
          await AsyncStorage.removeItem('finance_loans');
        }
      }
      
      set({ 
        transactions, 
        financialGoals, 
        monthlyReports,
        subscriptions,
        customCategories,
        loans,
        isLoaded: true 
      });
      
      get().updateTotals();
      console.log('Finance data loaded successfully');
    } catch (error) {
      console.error('Failed to load finance data:', error);
      set({ isLoaded: true });
    }
  },

  saveData: async () => {
    try {
      const state = get();
      await Promise.all([
        AsyncStorage.setItem('finance_transactions', JSON.stringify(state.transactions)),
        AsyncStorage.setItem('finance_goals', JSON.stringify(state.financialGoals)),
        AsyncStorage.setItem('finance_reports', JSON.stringify(state.monthlyReports)),
        AsyncStorage.setItem('finance_subscriptions', JSON.stringify(state.subscriptions)),
        AsyncStorage.setItem('finance_custom_categories', JSON.stringify(state.customCategories)),
        AsyncStorage.setItem('finance_loans', JSON.stringify(state.loans)),
      ]);
      console.log('Finance data saved successfully');
    } catch (error) {
      console.error('Failed to save finance data:', error);
    }
  },
}));