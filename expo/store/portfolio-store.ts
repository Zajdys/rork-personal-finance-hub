import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Trade {
  id: string;
  type: 'buy' | 'sell';
  symbol: string;
  name: string;
  amount: number;
  price: number;
  date: Date;
  total: number;
}

export interface Portfolio {
  id: string;
  name: string;
  emoji?: string;
  currency?: string;
  createdAt: Date;
  trades: Trade[];
  color: string;
}

interface PortfolioState {
  portfolios: Portfolio[];
  isLoaded: boolean;
  addPortfolio: (portfolio: Portfolio) => void;
  updatePortfolio: (id: string, updates: Partial<Portfolio>) => void;
  deletePortfolio: (id: string) => void;
  addTradeToPortfolio: (portfolioId: string, trade: Trade) => void;
  removeTradeFromPortfolio: (portfolioId: string, tradeId: string) => void;
  getPortfolio: (id: string) => Portfolio | undefined;
  loadData: () => Promise<void>;
  saveData: () => Promise<void>;
}

const STORAGE_KEY = 'portfolios_data';

const PORTFOLIO_COLORS = [
  '#667eea',
  '#764ba2',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#06B6D4',
  '#EC4899',
];

export const usePortfolioStore = create<PortfolioState>((set, get) => ({
  portfolios: [],
  isLoaded: false,

  addPortfolio: (portfolio: Portfolio) => {
    set((state) => ({
      portfolios: [...state.portfolios, portfolio],
    }));
    get().saveData();
  },

  updatePortfolio: (id: string, updates: Partial<Portfolio>) => {
    set((state) => ({
      portfolios: state.portfolios.map((p) =>
        p.id === id ? { ...p, ...updates } : p
      ),
    }));
    get().saveData();
  },

  deletePortfolio: (id: string) => {
    set((state) => ({
      portfolios: state.portfolios.filter((p) => p.id !== id),
    }));
    get().saveData();
  },

  addTradeToPortfolio: (portfolioId: string, trade: Trade) => {
    set((state) => ({
      portfolios: state.portfolios.map((p) =>
        p.id === portfolioId
          ? { ...p, trades: [trade, ...p.trades] }
          : p
      ),
    }));
    get().saveData();
  },

  removeTradeFromPortfolio: (portfolioId: string, tradeId: string) => {
    set((state) => ({
      portfolios: state.portfolios.map((p) =>
        p.id === portfolioId
          ? { ...p, trades: p.trades.filter((t) => t.id !== tradeId) }
          : p
      ),
    }));
    get().saveData();
  },

  getPortfolio: (id: string) => {
    return get().portfolios.find((p) => p.id === id);
  },

  loadData: async () => {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        const portfolios = parsed.map((p: any) => ({
          ...p,
          createdAt: new Date(p.createdAt),
          trades: p.trades.map((t: any) => ({
            ...t,
            date: new Date(t.date),
          })),
        }));
        set({ portfolios, isLoaded: true });
        console.log('Portfolio data loaded successfully');
      } else {
        set({ isLoaded: true });
      }
    } catch (error) {
      console.error('Failed to load portfolio data:', error);
      set({ isLoaded: true });
    }
  },

  saveData: async () => {
    try {
      const state = get();
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state.portfolios));
      console.log('Portfolio data saved successfully');
    } catch (error) {
      console.error('Failed to save portfolio data:', error);
    }
  },
}));

export const getRandomPortfolioColor = () => {
  return PORTFOLIO_COLORS[Math.floor(Math.random() * PORTFOLIO_COLORS.length)];
};
