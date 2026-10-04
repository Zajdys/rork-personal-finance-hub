import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';

export type Theme = 'light' | 'dark' | 'auto';
export type Currency = 'CZK' | 'EUR' | 'USD' | 'GBP';
export type CurrencyScope = 'wholeApp' | 'investmentsOnly';

export interface NotificationSettings {
  pushNotifications: boolean;
  /** Zobrazení rozpočtových varování na přehledu (bez samostatné položky v Notifikacích). */
  budgetWarnings?: boolean;
}

export interface CurrencyInfo {
  code: Currency;
  name: string;
  symbol: string;
  flag: string;
}

/** Jméno a avatar z user_profiles (cache v AsyncStorage pro dashboard i profil). */
export interface UserProfileDisplay {
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
}

const EMPTY_USER_PROFILE: UserProfileDisplay = {
  firstName: '',
  lastName: '',
  avatarUrl: null,
};

const USER_PROFILE_STORAGE_KEY = 'user_profile';

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
  userProfile: UserProfileDisplay;
  setTheme: (theme: Theme) => void;
  setCurrency: (currency: Currency) => void;
  setInvestmentCurrency: (currency: Currency) => void;
  setCurrencyScope: (scope: CurrencyScope) => void;
  setNotificationSetting: (key: keyof NotificationSettings, value: boolean) => void;
  setUserProfile: (patch: Partial<UserProfileDisplay>) => void;
  clearUserProfile: () => void;
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

function parseStoredTheme(raw: string | null): Theme | null {
  if (raw === 'light' || raw === 'dark' || raw === 'auto') return raw;
  return null;
}

/** Systémový dark/light — jen dokud uživatel nemá uloženou volbu (default = auto). */
const systemPrefersDark = (): boolean => Appearance.getColorScheme() === 'dark';

export const useSettingsStore = create<SettingsState>((set, get) => ({
  theme: 'auto',
  currency: 'CZK',
  investmentCurrency: 'EUR',
  currencyScope: 'wholeApp',
  isDarkMode: systemPrefersDark(),
  notifications: {
    pushNotifications: true,
    budgetWarnings: true,
  },
  userProfile: { ...EMPTY_USER_PROFILE },

  setUserProfile: (patch) => {
    const userProfile = { ...get().userProfile, ...patch };
    set({ userProfile });
    AsyncStorage.setItem(USER_PROFILE_STORAGE_KEY, JSON.stringify(userProfile)).catch((error) => {
      console.error('Failed to save user profile cache:', error);
    });
  },

  clearUserProfile: () => {
    set({ userProfile: { ...EMPTY_USER_PROFILE } });
    AsyncStorage.removeItem(USER_PROFILE_STORAGE_KEY).catch((error) => {
      console.error('Failed to clear user profile cache:', error);
    });
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
      if (__DEV__) console.log('Investment currency changed to:', currency);
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
      const [savedTheme, savedCurrency, savedInvestmentCurrency, savedCurrencyScope, savedNotifications, savedUserProfile] =
        await Promise.all([
        AsyncStorage.getItem('theme'),
        AsyncStorage.getItem('currency'),
        AsyncStorage.getItem('investmentCurrency'),
        AsyncStorage.getItem('currencyScope'),
        AsyncStorage.getItem('notifications'),
        AsyncStorage.getItem(USER_PROFILE_STORAGE_KEY),
      ]);

      // Bez uložené volby → auto (systém). Explicitní light/dark/auto má přednost.
      const theme = parseStoredTheme(savedTheme) ?? 'auto';
      const currency = (savedCurrency as Currency) || 'CZK';
      const investmentCurrency = (savedInvestmentCurrency as Currency) || 'EUR';
      const currencyScope = (savedCurrencyScope as CurrencyScope) || 'wholeApp';
      const isDarkMode = getEffectiveTheme(theme);

      let notifications: NotificationSettings = {
        pushNotifications: true,
        budgetWarnings: true,
      };

      if (savedNotifications) {
        try {
          const parsed = JSON.parse(savedNotifications) as Partial<NotificationSettings> & Record<string, unknown>;
          notifications = {
            pushNotifications:
              typeof parsed.pushNotifications === 'boolean' ? parsed.pushNotifications : true,
            budgetWarnings:
              typeof parsed.budgetWarnings === 'boolean' ? parsed.budgetWarnings : true,
          };
        } catch (error) {
          console.error('Failed to parse saved notifications:', error, 'Data:', savedNotifications);
          // Clear corrupted data
          await AsyncStorage.removeItem('notifications');
        }
      }

      let userProfile: UserProfileDisplay = { ...EMPTY_USER_PROFILE };
      if (savedUserProfile) {
        try {
          const p = JSON.parse(savedUserProfile) as Partial<UserProfileDisplay> & Record<string, unknown>;
          userProfile = {
            firstName: typeof p.firstName === 'string' ? p.firstName : '',
            lastName: typeof p.lastName === 'string' ? p.lastName : '',
            avatarUrl: typeof p.avatarUrl === 'string' ? p.avatarUrl : null,
          };
        } catch (error) {
          console.error('Failed to parse user profile cache:', error);
          await AsyncStorage.removeItem(USER_PROFILE_STORAGE_KEY);
        }
      }

      set({ theme, currency, investmentCurrency, currencyScope, isDarkMode, notifications, userProfile });
      console.log('Settings loaded:', { theme, currency, investmentCurrency, currencyScope, isDarkMode, notifications, userProfile });
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

/** Živá reakce na systémový dark/light — jen když je zvoleno „auto“ (žádná explicitní light/dark). */
Appearance.addChangeListener(({ colorScheme }) => {
  const { theme } = useSettingsStore.getState();
  if (theme === 'auto') {
    const isDarkMode = colorScheme === 'dark';
    useSettingsStore.setState({ isDarkMode });
    console.log('System theme changed, isDarkMode:', isDarkMode);
  }
});