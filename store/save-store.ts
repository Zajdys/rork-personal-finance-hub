import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface PendingPurchase {
  id: string;
  name: string;
  price: number;
  createdAt: number;
  expiresAt: number;
  decided: boolean;
  bought: boolean;
}

export interface Envelope {
  amount: number;
  completed: boolean;
  completedAt?: number;
}

interface SaveState {
  hourlyWage: number;
  monthlyIncome: number;
  pendingPurchases: PendingPurchase[];
  envelopes: Envelope[];
  envelopesInitialized: boolean;
  isLoaded: boolean;
  setHourlyWage: (wage: number) => void;
  setMonthlyIncome: (income: number) => void;
  addPendingPurchase: (purchase: Omit<PendingPurchase, 'id' | 'createdAt' | 'expiresAt' | 'decided' | 'bought'>) => void;
  decidePurchase: (id: string, bought: boolean) => void;
  removePurchase: (id: string) => void;
  initEnvelopes: () => void;
  completeEnvelope: (index: number) => void;
  resetEnvelopes: () => void;
  loadData: () => Promise<void>;
}

const STORAGE_KEY = 'save_store';

const generateEnvelopes = (): Envelope[] => {
  const amounts: number[] = [];
  for (let i = 1; i <= 100; i++) {
    amounts.push(i * 10);
  }
  for (let i = amounts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [amounts[i], amounts[j]] = [amounts[j], amounts[i]];
  }
  return amounts.map(amount => ({ amount, completed: false }));
};

export const useSaveStore = create<SaveState>((set, get) => ({
  hourlyWage: 0,
  monthlyIncome: 0,
  pendingPurchases: [],
  envelopes: [],
  envelopesInitialized: false,
  isLoaded: false,

  setHourlyWage: (hourlyWage: number) => {
    set({ hourlyWage });
    persistState(get());
  },

  setMonthlyIncome: (monthlyIncome: number) => {
    const hourlyWage = monthlyIncome / 160;
    set({ monthlyIncome, hourlyWage });
    persistState(get());
  },

  addPendingPurchase: (purchase) => {
    const now = Date.now();
    const newPurchase: PendingPurchase = {
      ...purchase,
      id: `${now}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: now,
      expiresAt: now + 24 * 60 * 60 * 1000,
      decided: false,
      bought: false,
    };
    const updated = [newPurchase, ...get().pendingPurchases];
    set({ pendingPurchases: updated });
    persistState(get());
  },

  decidePurchase: (id: string, bought: boolean) => {
    const updated = get().pendingPurchases.map(p =>
      p.id === id ? { ...p, decided: true, bought } : p
    );
    set({ pendingPurchases: updated });
    persistState(get());
  },

  removePurchase: (id: string) => {
    const updated = get().pendingPurchases.filter(p => p.id !== id);
    set({ pendingPurchases: updated });
    persistState(get());
  },

  initEnvelopes: () => {
    if (!get().envelopesInitialized) {
      const envelopes = generateEnvelopes();
      set({ envelopes, envelopesInitialized: true });
      persistState(get());
    }
  },

  completeEnvelope: (index: number) => {
    const envelopes = [...get().envelopes];
    if (envelopes[index] && !envelopes[index].completed) {
      envelopes[index] = { ...envelopes[index], completed: true, completedAt: Date.now() };
      set({ envelopes });
      persistState(get());
    }
  },

  resetEnvelopes: () => {
    const envelopes = generateEnvelopes();
    set({ envelopes, envelopesInitialized: true });
    persistState(get());
  },

  loadData: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        set({
          hourlyWage: data.hourlyWage ?? 0,
          monthlyIncome: data.monthlyIncome ?? 0,
          pendingPurchases: data.pendingPurchases ?? [],
          envelopes: data.envelopes ?? [],
          envelopesInitialized: data.envelopesInitialized ?? false,
          isLoaded: true,
        });
      } else {
        set({ isLoaded: true });
      }
      console.log('Save store loaded');
    } catch (error) {
      console.error('Failed to load save store:', error);
      set({ isLoaded: true });
    }
  },
}));

function persistState(state: SaveState) {
  const data = {
    hourlyWage: state.hourlyWage,
    monthlyIncome: state.monthlyIncome,
    pendingPurchases: state.pendingPurchases,
    envelopes: state.envelopes,
    envelopesInitialized: state.envelopesInitialized,
  };
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data)).catch(err =>
    console.error('Failed to persist save store:', err)
  );
}
