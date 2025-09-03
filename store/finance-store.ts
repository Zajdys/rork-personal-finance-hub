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

export interface FinancialGoal {
  id: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  category?: string;
  deadline?: Date;
  type: 'saving' | 'spending_limit';
}

export interface CategoryExpense {
  category: string;
  amount: number;
  percentage: number;
  icon: string;
  color: string;
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
};

export const INCOME_CATEGORIES = {
  'Mzda': { icon: '💼', color: '#10B981' },
  'Freelance': { icon: '💻', color: '#8B5CF6' },
  'Investice': { icon: '📈', color: '#F59E0B' },
  'Dary': { icon: '🎁', color: '#EC4899' },
  'Ostatní': { icon: '💰', color: '#6B7280' },
};

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
  loadData: () => Promise<void>;
  saveData: () => Promise<void>;
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
      };
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
      };
    });
  },

  getCategoryExpenses: () => {
    const state = get();
    const expenseTransactions = state.transactions.filter(t => t.type === 'expense');
    const totalExpenses = expenseTransactions.reduce((sum, t) => sum + t.amount, 0);
    
    if (totalExpenses === 0) return [];
    
    const categoryTotals: { [key: string]: number } = {};
    
    expenseTransactions.forEach(transaction => {
      const category = transaction.category || 'Ostatní';
      categoryTotals[category] = (categoryTotals[category] || 0) + transaction.amount;
    });
    
    return Object.entries(categoryTotals)
      .map(([category, amount]) => ({
        category,
        amount,
        percentage: Math.round((amount / totalExpenses) * 100),
        icon: EXPENSE_CATEGORIES[category as keyof typeof EXPENSE_CATEGORIES]?.icon || '📦',
        color: EXPENSE_CATEGORIES[category as keyof typeof EXPENSE_CATEGORIES]?.color || '#6B7280',
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
    
    // Category breakdown for the month
    const expenseTransactions = monthTransactions.filter(t => t.type === 'expense');
    const categoryTotals: { [key: string]: number } = {};
    
    expenseTransactions.forEach(transaction => {
      const category = transaction.category || 'Ostatní';
      categoryTotals[category] = (categoryTotals[category] || 0) + transaction.amount;
    });
    
    const categoryBreakdown = Object.entries(categoryTotals)
      .map(([category, amount]) => ({
        category,
        amount,
        percentage: totalExpenses > 0 ? Math.round((amount / totalExpenses) * 100) : 0,
        icon: EXPENSE_CATEGORIES[category as keyof typeof EXPENSE_CATEGORIES]?.icon || '📦',
        color: EXPENSE_CATEGORIES[category as keyof typeof EXPENSE_CATEGORIES]?.color || '#6B7280',
      }))
      .sort((a, b) => b.amount - a.amount);
    
    const topExpenseCategory = categoryBreakdown[0]?.category || 'Žádné výdaje';
    
    // Generate insights
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
    };
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
    set((state) => ({
      financialGoals: state.financialGoals.filter(goal => goal.id !== id),
    }));
    get().saveData();
  },

  loadData: async () => {
    try {
      const [transactionsData, goalsData, reportsData] = await Promise.all([
        AsyncStorage.getItem('finance_transactions'),
        AsyncStorage.getItem('finance_goals'),
        AsyncStorage.getItem('finance_reports'),
      ]);
      
      const transactions = transactionsData ? JSON.parse(transactionsData).map((t: any) => ({
        ...t,
        date: new Date(t.date)
      })) : [];
      
      const financialGoals = goalsData ? JSON.parse(goalsData).map((g: any) => ({
        ...g,
        deadline: g.deadline ? new Date(g.deadline) : undefined
      })) : [];
      
      const monthlyReports = reportsData ? JSON.parse(reportsData) : [];
      
      set({ 
        transactions, 
        financialGoals, 
        monthlyReports,
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
      ]);
      console.log('Finance data saved successfully');
    } catch (error) {
      console.error('Failed to save finance data:', error);
    }
  },
}));