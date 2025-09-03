import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';

export type Theme = 'light' | 'dark' | 'auto';
export type Currency = 'CZK' | 'EUR' | 'USD' | 'GBP';
export type CurrencyScope = 'wholeApp' | 'investmentsOnly';

export interface CurrencyInfo {
  code: Currency;
  name: string;
  symbol: string;
  flag: string;
}

export const CURRENCIES: Record<Currency, CurrencyInfo> = {
  CZK: { code: 'CZK', name: 'Koruna česká', symbol: 'Kč', flag: '🇨🇿' },
  EUR: { code: 'EUR', name: 'Euro', symbol: '€', flag: '🇪🇺' },
  USD: { code: 'USD', name: 'Americký dolar', symbol: '$', flag: '🇺🇸' },
  GBP: { code: 'GBP', name: 'Britská libra', symbol: '£', flag: '🇬🇧' },
};

interface SettingsState {
  theme: Theme;
  currency: Currency;
  currencyScope: CurrencyScope;
  isDarkMode: boolean;
  setTheme: (theme: Theme) => void;
  setCurrency: (currency: Currency) => void;
  setCurrencyScope: (scope: CurrencyScope) => void;
  loadSettings: () => Promise<void>;
  getCurrentCurrency: () => CurrencyInfo;
}

const getEffectiveTheme = (theme: Theme): boolean => {
  if (theme === 'auto') {
    return Appearance.getColorScheme() === 'dark';
  }
  return theme === 'dark';
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  theme: 'light',
  currency: 'CZK',
  currencyScope: 'wholeApp',
  isDarkMode: false,

  setTheme: async (theme: Theme) => {
    const isDarkMode = getEffectiveTheme(theme);
    set({ theme, isDarkMode });
    try {
      await AsyncStorage.setItem('theme', theme);
      console.log('Theme changed to:', theme, 'isDarkMode:', isDarkMode);
    } catch (error) {
      console.error('Failed to save theme:', error);
    }
  },

  setCurrency: async (currency: Currency) => {
    set({ currency });
    await AsyncStorage.setItem('currency', currency);
    console.log('Currency changed to:', currency);
  },

  setCurrencyScope: async (currencyScope: CurrencyScope) => {
    set({ currencyScope });
    await AsyncStorage.setItem('currencyScope', currencyScope);
    console.log('Currency scope changed to:', currencyScope);
  },

  loadSettings: async () => {
    try {
      const [savedTheme, savedCurrency, savedCurrencyScope] = await Promise.all([
        AsyncStorage.getItem('theme'),
        AsyncStorage.getItem('currency'),
        AsyncStorage.getItem('currencyScope'),
      ]);
      
      const theme = (savedTheme as Theme) || 'light';
      const currency = (savedCurrency as Currency) || 'CZK';
      const currencyScope = (savedCurrencyScope as CurrencyScope) || 'wholeApp';
      const isDarkMode = getEffectiveTheme(theme);
      
      set({ theme, currency, currencyScope, isDarkMode });
      console.log('Settings loaded:', { theme, currency, currencyScope, isDarkMode });
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  },

  getCurrentCurrency: () => {
    const { currency } = get();
    return CURRENCIES[currency];
  },
}));

// Listen to system theme changes
Appearance.addChangeListener(({ colorScheme }) => {
  const { theme, setTheme } = useSettingsStore.getState();
  if (theme === 'auto') {
    const isDarkMode = colorScheme === 'dark';
    useSettingsStore.setState({ isDarkMode });
    console.log('System theme changed, isDarkMode:', isDarkMode);
  }
});