import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import { useLanguageStore } from './language-store';
import { GamingStats, UserBadge, Achievement, Quest, MetaQuest, PersonalityStats, PersonalityType } from '@/types/gaming';
import { ALL_BADGES } from '@/constants/badges';
import { getCurrentSeason } from '@/constants/seasons';

interface BuddyState {
  level: number;
  points: number;
  completedLessons: string[];
  dailyTip: string;
  currentMessage: string | null;
  isLoaded: boolean;
  gamingStats: GamingStats;
  addPoints: (amount: number) => void;
  addXp: (amount: number) => void;
  addCoins: (amount: number) => void;
  completeLesson: (lessonId: string) => void;
  showBuddyMessage: (message: string) => void;
  clearBuddyMessage: () => void;
  earnBadge: (badgeId: string) => void;
  completeQuest: (questId: string) => void;
  updatePersonality: (type: 'analytical' | 'motivational') => void;
  checkAndAwardBadges: () => void;
  getBuddyScore: () => number;
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
  'dailyTip6',
  'dailyTip7',
  'dailyTip8',
  'dailyTip9',
  'dailyTip10',
  'dailyTip11',
  'dailyTip12',
  'dailyTip13',
  'dailyTip14',
  'dailyTip15',
  'dailyTip16',
  'dailyTip17',
  'dailyTip18',
  'dailyTip19',
  'dailyTip20',
  'dailyTip21',
  'dailyTip22',
  'dailyTip23',
  'dailyTip24',
  'dailyTip25',
  'dailyTip26',
  'dailyTip27',
  'dailyTip28',
  'dailyTip29',
  'dailyTip30',
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
  gamingStats: {
    level: 1,
    xp: 0,
    lifetimeXp: 0,
    coins: 0,
    buddyScore: 0,
    streak: 0,
    longestStreak: 0,
    loginStreak: 0,
    lastLoginDate: null,
    memberSince: new Date(),
    badges: [],
    achievements: [],
    quests: [],
    metaQuests: [],
    personality: {
      type: 'balanced',
      analyticalInteractions: 0,
      motivationalInteractions: 0,
      totalInteractions: 0,
      xpBonus: 0,
    },
    currentSeason: getCurrentSeason(),
  },

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

  addXp: (amount: number) => {
    set((state) => {
      const personalityBonus = state.gamingStats.personality.xpBonus;
      const totalXp = Math.round(amount * (1 + personalityBonus));
      const newXp = state.gamingStats.xp + totalXp;
      const newLifetimeXp = state.gamingStats.lifetimeXp + totalXp;
      
      const xpPerLevel = 100;
      const newLevel = Math.floor(newXp / xpPerLevel) + 1;
      
      return {
        gamingStats: {
          ...state.gamingStats,
          xp: newXp,
          lifetimeXp: newLifetimeXp,
          level: newLevel,
        },
        level: newLevel,
        points: newXp,
      };
    });
    get().checkAndAwardBadges();
    get().saveData();
  },

  addCoins: (amount: number) => {
    set((state) => ({
      gamingStats: {
        ...state.gamingStats,
        coins: state.gamingStats.coins + amount,
      },
    }));
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
      const [levelData, pointsData, lessonsData, gamingData] = await Promise.all([
        AsyncStorage.getItem('buddy_level'),
        AsyncStorage.getItem('buddy_points'),
        AsyncStorage.getItem('buddy_completed_lessons'),
        AsyncStorage.getItem('buddy_gaming_stats'),
      ]);
      
      const level = levelData ? parseInt(levelData) : 1;
      const points = pointsData ? parseInt(pointsData) : 45;
      let completedLessons: string[] = [];
      if (lessonsData) {
        try {
          completedLessons = JSON.parse(lessonsData);
        } catch (error) {
          console.error('Failed to parse completed lessons data:', error, 'Data:', lessonsData);
          await AsyncStorage.removeItem('buddy_completed_lessons');
        }
      }

      let gamingStats: GamingStats = {
        level: 1,
        xp: 0,
        lifetimeXp: 0,
        coins: 0,
        buddyScore: 0,
        streak: 0,
        longestStreak: 0,
        loginStreak: 0,
        lastLoginDate: null,
        memberSince: new Date(),
        badges: [],
        achievements: [],
        quests: [],
        metaQuests: [],
        personality: {
          type: 'balanced',
          analyticalInteractions: 0,
          motivationalInteractions: 0,
          totalInteractions: 0,
          xpBonus: 0,
        },
        currentSeason: getCurrentSeason(),
      };

      if (gamingData) {
        try {
          const parsed = JSON.parse(gamingData);
          gamingStats = {
            ...parsed,
            memberSince: new Date(parsed.memberSince),
            badges: parsed.badges.map((b: any) => ({
              ...b,
              earnedAt: new Date(b.earnedAt),
            })),
            achievements: parsed.achievements.map((a: any) => ({
              ...a,
              unlockedAt: a.unlockedAt ? new Date(a.unlockedAt) : undefined,
            })),
            quests: parsed.quests.map((q: any) => ({
              ...q,
              expiresAt: q.expiresAt ? new Date(q.expiresAt) : undefined,
              completedAt: q.completedAt ? new Date(q.completedAt) : undefined,
            })),
            metaQuests: parsed.metaQuests.map((mq: any) => ({
              ...mq,
              completedAt: mq.completedAt ? new Date(mq.completedAt) : undefined,
            })),
            currentSeason: getCurrentSeason(),
          };
        } catch (error) {
          console.error('Failed to parse gaming stats data:', error);
          await AsyncStorage.removeItem('buddy_gaming_stats');
        }
      }
      
      set({ 
        level, 
        points, 
        completedLessons,
        gamingStats,
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
        AsyncStorage.setItem('buddy_gaming_stats', JSON.stringify(state.gamingStats)),
      ]);
      console.log('Buddy data saved successfully');
    } catch (error) {
      console.error('Failed to save buddy data:', error);
    }
  },

  refreshDailyTip: () => {
    set({ dailyTip: getDailyTip() });
  },

  earnBadge: (badgeId: string) => {
    const badge = ALL_BADGES.find(b => b.id === badgeId);
    if (!badge) return;

    set((state) => {
      const alreadyEarned = state.gamingStats.badges.some(b => b.badgeId === badgeId);
      if (alreadyEarned) return state;

      const newBadge: UserBadge = {
        badgeId,
        earnedAt: new Date(),
      };

      return {
        gamingStats: {
          ...state.gamingStats,
          badges: [...state.gamingStats.badges, newBadge],
        },
      };
    });

    get().addXp(badge.rewardXp);
    get().addCoins(badge.rewardCoins);
    get().showBuddyMessage(`🎉 Získal jsi badge: ${badge.name}! +${badge.rewardXp} XP`);
    get().saveData();
  },

  completeQuest: (questId: string) => {
    set((state) => {
      const quest = state.gamingStats.quests.find(q => q.id === questId);
      if (!quest || quest.completed) return state;

      const updatedQuests = state.gamingStats.quests.map(q => 
        q.id === questId ? { ...q, completed: true, completedAt: new Date() } : q
      );

      return {
        gamingStats: {
          ...state.gamingStats,
          quests: updatedQuests,
        },
      };
    });

    const quest = get().gamingStats.quests.find(q => q.id === questId);
    if (quest) {
      get().addXp(quest.rewardXp);
      get().addCoins(quest.rewardCoins);
      get().showBuddyMessage(`✅ Splnil jsi quest: ${quest.title}! +${quest.rewardXp} XP`);
    }

    get().saveData();
  },

  updatePersonality: (type: 'analytical' | 'motivational') => {
    set((state) => {
      const personality = state.gamingStats.personality;
      const newAnalytical = type === 'analytical' ? personality.analyticalInteractions + 1 : personality.analyticalInteractions;
      const newMotivational = type === 'motivational' ? personality.motivationalInteractions + 1 : personality.motivationalInteractions;
      const newTotal = personality.totalInteractions + 1;

      let personalityType: PersonalityType = 'balanced';
      let xpBonus = 0;

      const analyticalRatio = newAnalytical / newTotal;
      const motivationalRatio = newMotivational / newTotal;

      if (analyticalRatio >= 0.7) {
        personalityType = 'analyst';
        xpBonus = 0.02;
      } else if (motivationalRatio >= 0.7) {
        personalityType = 'motivator';
        xpBonus = 0.02;
      } else {
        personalityType = 'balanced';
        xpBonus = 0.02;
      }

      return {
        gamingStats: {
          ...state.gamingStats,
          personality: {
            type: personalityType,
            analyticalInteractions: newAnalytical,
            motivationalInteractions: newMotivational,
            totalInteractions: newTotal,
            xpBonus,
          },
        },
      };
    });
    get().saveData();
  },

  checkAndAwardBadges: () => {
    const state = get();
    
    ALL_BADGES.forEach(badge => {
      const alreadyEarned = state.gamingStats.badges.some(b => b.badgeId === badge.id);
      if (alreadyEarned) return;

      let shouldAward = false;

      if (badge.id === 'first_transaction') {
        shouldAward = true;
      }

      if (shouldAward) {
        get().earnBadge(badge.id);
      }
    });
  },

  getBuddyScore: () => {
    const state = get();
    const stats = state.gamingStats;
    
    let score = 0;
    
    score += stats.level * 100;
    score += stats.badges.length * 50;
    score += stats.badges.filter(b => {
      const badge = ALL_BADGES.find(ab => ab.id === b.badgeId);
      return badge?.type === 'epic';
    }).length * 200;
    score += stats.badges.filter(b => {
      const badge = ALL_BADGES.find(ab => ab.id === b.badgeId);
      return badge?.type === 'legacy';
    }).length * 500;
    score += stats.streak * 10;
    score += stats.quests.filter(q => q.completed).length * 25;
    
    return score;
  },
}));