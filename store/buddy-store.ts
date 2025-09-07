import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import { useLanguageStore } from './language-store';

interface BuddyState {
  level: number;
  points: number;
  completedLessons: string[];
  dailyTip: string;
  currentMessage: string | null;
  isLoaded: boolean;
  addPoints: (amount: number) => void;
  completeLesson: (lessonId: string) => void;
  showBuddyMessage: (message: string) => void;
  clearBuddyMessage: () => void;
  loadData: () => Promise<void>;
  saveData: () => Promise<void>;
  refreshDailyTip: () => void;
}

const DAILY_TIP_KEYS = [
  'dailyTip1',
  'dailyTip2', 
  'dailyTip3',
  'dailyTip4',
  'dailyTip5',
] as const;

function getDailyTip(): string {
  const { t } = useLanguageStore.getState();
  const randomKey = DAILY_TIP_KEYS[Math.floor(Math.random() * DAILY_TIP_KEYS.length)];
  return t(randomKey);
}

export const useBuddyStore = create<BuddyState>((set, get) => ({
  level: 1,
  points: 45,
  completedLessons: [],
  dailyTip: getDailyTip(),
  currentMessage: null,
  isLoaded: false,

  addPoints: (amount: number) => {
    set((state) => {
      const newPoints = state.points + amount;
      const newLevel = Math.floor(newPoints / 100) + 1;
      
      return {
        points: newPoints,
        level: newLevel,
      };
    });
    get().saveData();
  },

  completeLesson: (lessonId: string) => {
    set((state) => {
      if (state.completedLessons.includes(lessonId)) {
        return state;
      }
      
      return {
        completedLessons: [...state.completedLessons, lessonId],
      };
    });
    get().addPoints(15);
  },

  showBuddyMessage: (message: string) => {
    set({ currentMessage: message });
    
    // Zkontrolujeme, zda jsou push notifikace povolené
    // Importujeme settings store dynamicky, abychom se vyhnuli circular dependency
    import('@/store/settings-store').then(({ useSettingsStore }) => {
      const { notifications } = useSettingsStore.getState();
      
      if (notifications.pushNotifications) {
        // Zobrazíme push notifikaci jako Alert
        Alert.alert('MoneyBuddy 💰', message, [
          { text: 'OK', style: 'default' }
        ]);
      }
    });
    
    setTimeout(() => {
      get().clearBuddyMessage();
    }, 5000);
  },

  clearBuddyMessage: () => {
    set({ currentMessage: null });
  },

  loadData: async () => {
    try {
      const [levelData, pointsData, lessonsData] = await Promise.all([
        AsyncStorage.getItem('buddy_level'),
        AsyncStorage.getItem('buddy_points'),
        AsyncStorage.getItem('buddy_completed_lessons'),
      ]);
      
      const level = levelData ? parseInt(levelData) : 1;
      const points = pointsData ? parseInt(pointsData) : 45;
      const completedLessons = lessonsData ? JSON.parse(lessonsData) : [];
      
      set({ 
        level, 
        points, 
        completedLessons,
        isLoaded: true 
      });
      
      console.log('Buddy data loaded successfully');
    } catch (error) {
      console.error('Failed to load buddy data:', error);
      set({ isLoaded: true });
    }
  },

  saveData: async () => {
    try {
      const state = get();
      await Promise.all([
        AsyncStorage.setItem('buddy_level', state.level.toString()),
        AsyncStorage.setItem('buddy_points', state.points.toString()),
        AsyncStorage.setItem('buddy_completed_lessons', JSON.stringify(state.completedLessons)),
      ]);
      console.log('Buddy data saved successfully');
    } catch (error) {
      console.error('Failed to save buddy data:', error);
    }
  },

  refreshDailyTip: () => {
    set({ dailyTip: getDailyTip() });
  },
}));