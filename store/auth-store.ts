import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { trpc } from '@/lib/trpc';

export interface AuthState {
  token: string | null;
  email: string | null;
  subscriptionActive: boolean;
  isLoading: boolean;
  setToken: (token: string | null) => Promise<void>;
  load: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  email: null,
  subscriptionActive: false,
  isLoading: true,

  setToken: async (token: string | null) => {
    try {
      if (token) await AsyncStorage.setItem('authToken', token); else await AsyncStorage.removeItem('authToken');
      set({ token });
    } catch (e) {
      console.error('auth setToken failed', e);
    }
  },

  load: async () => {
    try {
      console.log('Loading auth token...');
      const token = await AsyncStorage.getItem('authToken');
      console.log('Loaded token:', !!token);
      set({ token, isLoading: false });
    } catch (e) {
      console.error('auth load failed', e);
      set({ token: null, isLoading: false });
    }
  },
}));
