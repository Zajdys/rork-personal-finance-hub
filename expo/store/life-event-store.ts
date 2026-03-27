import createContextHook from '@nkzw/create-context-hook';
import { useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LifeEventMode, UserLifeEventState, getLifeEventInfo, buildAIContext, LifeEventAIContext } from '@/types/life-event';

const STORAGE_KEY = 'life_event_state';

export const [LifeEventProvider, useLifeEvent] = createContextHook(() => {
  const [state, setState] = useState<UserLifeEventState>({
    activeMode: LifeEventMode.NONE,
    activatedAt: new Date(),
    modeHistory: [],
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const loadState = useCallback(async () => {
    try {
      setIsLoading(true);
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      
      if (stored) {
        const parsed = JSON.parse(stored);
        setState({
          ...parsed,
          activatedAt: new Date(parsed.activatedAt),
          modeHistory: parsed.modeHistory.map((h: any) => ({
            ...h,
            activatedAt: new Date(h.activatedAt),
            deactivatedAt: h.deactivatedAt ? new Date(h.deactivatedAt) : undefined,
          })),
        });
        console.log('[LifeEventStore] State loaded from storage:', parsed.activeMode);
      } else {
        console.log('[LifeEventStore] No stored state, using defaults');
      }
    } catch (error) {
      console.error('[LifeEventStore] Failed to load state:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const saveState = useCallback(async (newState: UserLifeEventState) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
      console.log('[LifeEventStore] State saved to storage:', newState.activeMode);
    } catch (error) {
      console.error('[LifeEventStore] Failed to save state:', error);
    }
  }, []);

  const setMode = useCallback(async (mode: LifeEventMode) => {
    console.log('[LifeEventStore] Changing mode to:', mode);
    
    const newState: UserLifeEventState = {
      activeMode: mode,
      activatedAt: new Date(),
      previousMode: state.activeMode !== LifeEventMode.NONE ? state.activeMode : undefined,
      modeHistory: [
        ...state.modeHistory.map((h, idx) => 
          idx === state.modeHistory.length - 1 && !h.deactivatedAt
            ? { ...h, deactivatedAt: new Date() }
            : h
        ),
        {
          mode,
          activatedAt: new Date(),
        },
      ],
    };
    
    setState(newState);
    await saveState(newState);
    
    return newState;
  }, [state, saveState]);

  const getModeInfo = useCallback(() => {
    return getLifeEventInfo(state.activeMode);
  }, [state.activeMode]);

  const getAIContext = useCallback((additionalData?: Record<string, any>): LifeEventAIContext => {
    return buildAIContext(state, additionalData);
  }, [state]);

  const getDaysSinceActivation = useCallback((): number => {
    return Math.floor((new Date().getTime() - state.activatedAt.getTime()) / (1000 * 60 * 60 * 24));
  }, [state.activatedAt]);

  const isActive = useMemo(() => state.activeMode !== LifeEventMode.NONE, [state.activeMode]);

  useEffect(() => {
    loadState();
  }, [loadState]);

  return useMemo(() => ({
    state,
    isLoading,
    isActive,
    setMode,
    getModeInfo,
    getAIContext,
    getDaysSinceActivation,
    loadState,
  }), [
    state,
    isLoading,
    isActive,
    setMode,
    getModeInfo,
    getAIContext,
    getDaysSinceActivation,
    loadState,
  ]);
});
