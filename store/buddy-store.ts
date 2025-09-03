import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
}

const DAILY_TIPS = [
  "Utrať dnes o 50 Kč míň = 18 250 Kč ročně 💡",
  "ETF není magie. Je to balíček akcií. A díky tomu máš menší riziko 📦",
  "Inflace je jako zloděj - krade hodnotu tvých peněz každý den 🦹‍♂️",
  "Složený úrok je nejsilnější síla ve vesmíru - Albert Einstein 🚀",
  "Nejlepší čas na investování byl před 20 lety. Druhý nejlepší je dnes 📈",
];

export const useBuddyStore = create<BuddyState>((set, get) => ({
  level: 1,
  points: 45,
  completedLessons: [],
  dailyTip: DAILY_TIPS[Math.floor(Math.random() * DAILY_TIPS.length)],
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
}));