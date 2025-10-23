import createContextHook from '@nkzw/create-context-hook';
import { useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface DailyRewardState {
  lastClaimDate: string | null;
  currentStreak: number;
  totalKesaky: number;
  totalXp: number;
  canClaimToday: boolean;
  showModal: boolean;
}

const STORAGE_KEY = 'daily_rewards_state';

function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

function isConsecutiveDay(lastDate: Date, currentDate: Date): boolean {
  const diffTime = currentDate.getTime() - lastDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return diffDays === 1;
}

function getStreakReward(streak: number): { kesaky: number; xp: number } {
  const baseKesaky = 10;
  const baseXp = 5;
  
  if (streak >= 30) return { kesaky: baseKesaky + 100, xp: baseXp + 50 };
  if (streak >= 21) return { kesaky: baseKesaky + 70, xp: baseXp + 35 };
  if (streak >= 14) return { kesaky: baseKesaky + 50, xp: baseXp + 25 };
  if (streak >= 7) return { kesaky: baseKesaky + 30, xp: baseXp + 15 };
  if (streak >= 3) return { kesaky: baseKesaky + 15, xp: baseXp + 8 };
  
  return { kesaky: baseKesaky, xp: baseXp };
}

export const [DailyRewardsProvider, useDailyRewards] = createContextHook(() => {
  const [state, setState] = useState<DailyRewardState>({
    lastClaimDate: null,
    currentStreak: 0,
    totalKesaky: 0,
    totalXp: 0,
    canClaimToday: false,
    showModal: false,
  });

  const loadState = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsedState: DailyRewardState = JSON.parse(stored);
        
        const today = new Date();
        const canClaim = parsedState.lastClaimDate 
          ? !isSameDay(new Date(parsedState.lastClaimDate), today)
          : true;

        const shouldShowModal = canClaim;

        setState({
          ...parsedState,
          canClaimToday: canClaim,
          showModal: shouldShowModal,
        });
      } else {
        setState({
          lastClaimDate: null,
          currentStreak: 0,
          totalKesaky: 0,
          totalXp: 0,
          canClaimToday: true,
          showModal: true,
        });
      }
    } catch (error) {
      console.error('Error loading daily rewards state:', error);
    }
  }, []);

  const claimReward = useCallback(async (): Promise<{ kesaky: number; xp: number; streak: number; isNewStreak: boolean } | null> => {
    try {
      if (!state.canClaimToday) {
        return null;
      }

      const today = new Date();
      let newStreak = 1;
      let isNewStreak = false;

      if (state.lastClaimDate) {
        const lastDate = new Date(state.lastClaimDate);
        if (isConsecutiveDay(lastDate, today)) {
          newStreak = state.currentStreak + 1;
        } else {
          isNewStreak = true;
        }
      }

      const reward = getStreakReward(newStreak);
      const newState: DailyRewardState = {
        lastClaimDate: today.toISOString(),
        currentStreak: newStreak,
        totalKesaky: state.totalKesaky + reward.kesaky,
        totalXp: state.totalXp + reward.xp,
        canClaimToday: false,
        showModal: false,
      };

      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
      setState(newState);

      return {
        kesaky: reward.kesaky,
        xp: reward.xp,
        streak: newStreak,
        isNewStreak,
      };
    } catch (error) {
      console.error('Error claiming reward:', error);
      return null;
    }
  }, [state]);

  const closeModal = useCallback(() => {
    setState(prev => ({ ...prev, showModal: false }));
  }, []);

  const openModal = useCallback(() => {
    if (state.canClaimToday) {
      setState(prev => ({ ...prev, showModal: true }));
    }
  }, [state.canClaimToday]);

  useEffect(() => {
    loadState();
  }, [loadState]);

  return useMemo(
    () => ({
      ...state,
      claimReward,
      closeModal,
      openModal,
      loadState,
    }),
    [state, claimReward, closeModal, openModal, loadState]
  );
});
