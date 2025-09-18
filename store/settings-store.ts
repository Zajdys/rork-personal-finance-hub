import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';

export type Theme = 'light' | 'dark' | 'auto';
export type Currency = 'CZK' | 'EUR' | 'USD' | 'GBP';
export type CurrencyScope = 'wholeApp' | 'investmentsOnly';

export interface NotificationSettings {
  pushNotifications: boolean;
  dailyTips: boolean;
  investmentAlerts: boolean;
  budgetWarnings: boolean;
}

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
  investmentCurrency: Currency;
  currencyScope: CurrencyScope;
  isDarkMode: boolean;
  notifications: NotificationSettings;
  setTheme: (theme: Theme) => void;
  setCurrency: (currency: Currency) => void;
  setInvestmentCurrency: (currency: Currency) => void;
  setCurrencyScope: (scope: CurrencyScope) => void;
  setNotificationSetting: (key: keyof NotificationSettings, value: boolean) => void;
  loadSettings: () => Promise<void>;
  getCurrentCurrency: () => CurrencyInfo;
  getInvestmentCurrencyInfo: () => CurrencyInfo;
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
  investmentCurrency: 'EUR',
  currencyScope: 'wholeApp',
  isDarkMode: false,
  notifications: {
    pushNotifications: true,
    dailyTips: true,
    investmentAlerts: true,
    budgetWarnings: true,
  },

  setTheme: (theme: Theme) => {
    const isDarkMode = getEffectiveTheme(theme);
    set({ theme, isDarkMode });
    AsyncStorage.setItem('theme', theme).then(() => {
      console.log('Theme changed to:', theme, 'isDarkMode:', isDarkMode);
    }).catch((error) => {
      console.error('Failed to save theme:', error);
    });
  },

  setCurrency: (currency: Currency) => {
    set({ currency });
    AsyncStorage.setItem('currency', currency).then(() => {
      console.log('Currency (app-wide) changed to:', currency);
    }).catch((error) => {
      console.error('Failed to save currency:', error);
    });
  },

  setInvestmentCurrency: (currency: Currency) => {
    set({ investmentCurrency: currency });
    AsyncStorage.setItem('investmentCurrency', currency).then(() => {
      console.log('Investment currency changed to:', currency);
    }).catch((error) => {
      console.error('Failed to save investment currency:', error);
    });
  },

  setCurrencyScope: (currencyScope: CurrencyScope) => {
    set({ currencyScope });
    AsyncStorage.setItem('currencyScope', currencyScope).then(() => {
      console.log('Currency scope changed to:', currencyScope);
    }).catch((error) => {
      console.error('Failed to save currency scope:', error);
    });
  },

  setNotificationSetting: (key: keyof NotificationSettings, value: boolean) => {
    const currentNotifications = get().notifications;
    const updatedNotifications = { ...currentNotifications, [key]: value };
    set({ notifications: updatedNotifications });
    AsyncStorage.setItem('notifications', JSON.stringify(updatedNotifications)).then(() => {
      console.log(`Notification setting ${key} changed to:`, value);
    }).catch((error) => {
      console.error('Failed to save notification setting:', error);
    });
  },

  loadSettings: async () => {
    try {
      const [savedTheme, savedCurrency, savedInvestmentCurrency, savedCurrencyScope, savedNotifications] = await Promise.all([
        AsyncStorage.getItem('theme'),
        AsyncStorage.getItem('currency'),
        AsyncStorage.getItem('investmentCurrency'),
        AsyncStorage.getItem('currencyScope'),
        AsyncStorage.getItem('notifications'),
      ]);

      const theme = (savedTheme as Theme) || 'light';
      const currency = (savedCurrency as Currency) || 'CZK';
      const investmentCurrency = (savedInvestmentCurrency as Currency) || 'EUR';
      const currencyScope = (savedCurrencyScope as CurrencyScope) || 'wholeApp';
      const isDarkMode = getEffectiveTheme(theme);

      let notifications: NotificationSettings = {
        pushNotifications: true,
        dailyTips: true,
        investmentAlerts: true,
        budgetWarnings: true,
      };

      if (savedNotifications) {
        try {
          notifications = JSON.parse(savedNotifications);
        } catch (error) {
          console.error('Failed to parse saved notifications:', error);
        }
      }

      set({ theme, currency, investmentCurrency, currencyScope, isDarkMode, notifications });
      console.log('Settings loaded:', { theme, currency, investmentCurrency, currencyScope, isDarkMode, notifications });
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  },

  getCurrentCurrency: () => {
    const { currency } = get();
    return CURRENCIES[currency];
  },

  getInvestmentCurrencyInfo: () => {
    const { investmentCurrency } = get();
    return CURRENCIES[investmentCurrency];
  },
}));

Appearance.addChangeListener(({ colorScheme }) => {
  const { theme } = useSettingsStore.getState();
  if (theme === 'auto') {
    const isDarkMode = colorScheme === 'dark';
    useSettingsStore.setState({ isDarkMode });
    console.log('System theme changed, isDarkMode:', isDarkMode);
  }
});