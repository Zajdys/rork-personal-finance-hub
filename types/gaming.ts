export type BadgeType = 'standard' | 'epic' | 'legacy' | 'meta';
export type BadgeRarity = 'common' | 'rare' | 'epic' | 'legendary';
export type PersonalityType = 'analyst' | 'motivator' | 'balanced';
export type SeasonTheme = 'spring_clean' | 'summer_save' | 'invest_autumn' | 'winter_shield';

export interface Badge {
  id: string;
  name: string;
  description: string;
  type: BadgeType;
  rarity: BadgeRarity;
  icon: string;
  color: string;
  rewardXp: number;
  rewardCoins: number;
  passiveBonus: number;
  condition: string;
  earnedAt?: Date;
}

export interface UserBadge {
  badgeId: string;
  earnedAt: Date;
  progress?: number;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  unlocked: boolean;
  unlockedAt?: Date;
  progress: number;
  maxProgress: number;
  rewardXp: number;
  rewardCoins: number;
}

export interface Quest {
  id: string;
  title: string;
  description: string;
  type: 'daily' | 'weekly' | 'monthly' | 'seasonal' | 'meta';
  icon: string;
  color: string;
  progress: number;
  maxProgress: number;
  rewardXp: number;
  rewardCoins: number;
  expiresAt?: Date;
  completed: boolean;
  completedAt?: Date;
}

export interface MetaQuest {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  subQuests: string[];
  completedSubQuests: string[];
  rewardBadgeId: string;
  rewardXp: number;
  rewardCoins: number;
  completed: boolean;
  completedAt?: Date;
}

export interface Season {
  id: string;
  name: string;
  theme: SeasonTheme;
  description: string;
  startDate: Date;
  endDate: Date;
  quests: string[];
  rewards: {
    top1Percent: {
      badgeId: string;
      avatarFrame: string;
    };
    top5Percent: {
      badgeId: string;
    };
    top10Percent: {
      badgeId: string;
    };
  };
}

export interface PersonalityStats {
  type: PersonalityType;
  analyticalInteractions: number;
  motivationalInteractions: number;
  totalInteractions: number;
  xpBonus: number;
}

export interface HallOfFameEntry {
  userId: string;
  username: string;
  buddyScore: number;
  level: number;
  badges: number;
  epicBadges: number;
  legacyBadges: number;
  seasonId: string;
  rank: number;
  avatarFrame?: string;
}

export interface GamingStats {
  level: number;
  xp: number;
  lifetimeXp: number;
  coins: number;
  buddyScore: number;
  streak: number;
  longestStreak: number;
  loginStreak: number;
  lastLoginDate: string | null;
  memberSince: Date;
  badges: UserBadge[];
  achievements: Achievement[];
  quests: Quest[];
  metaQuests: MetaQuest[];
  personality: PersonalityStats;
  currentSeason?: Season;
  hallOfFameRank?: number;
}
