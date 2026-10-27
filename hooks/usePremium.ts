import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus, type NativeEventSubscription } from 'react-native';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useAuth } from '@/store/auth-store';
import { useRevenueCatStore } from '@/store/revenuecat-store';
import { fetchHouseholdHasPremium } from '@/lib/household-premium';
import { isDevForcePremium } from '@/constants/premium';

/** Jedna AppState subscription pro celou appku (ne per PremiumGate). */
let fgSub: NativeEventSubscription | null = null;
let fgUserId: string | null = null;
let fgQueryClient: QueryClient | null = null;
let fgPrevState: AppStateStatus = AppState.currentState;

function syncHouseholdForegroundTarget(
  queryClient: QueryClient,
  userId: string | null,
  enabled: boolean,
): void {
  fgQueryClient = queryClient;
  fgUserId = enabled ? userId : null;
  if (!fgSub) {
    fgPrevState = AppState.currentState;
    fgSub = AppState.addEventListener('change', (state) => {
      const prev = fgPrevState;
      fgPrevState = state;
      // Jen background → active. Ignoruj inactive (Files picker, share sheet, Control Center).
      if (prev !== 'background' || state !== 'active') return;
      if (!fgUserId || !fgQueryClient) return;
      void fgQueryClient.invalidateQueries({ queryKey: ['household-premium', fgUserId] });
    });
  }
}

/**
 * Centrální premium stav.
 * refreshPremium jen při změně user.id.
 * household RPC: shared query key + invalidate jen background→active (1 listener).
 */
export function usePremium(): {
  isPremium: boolean;
  isHouseholdPremium: boolean;
  loading: boolean;
} {
  const { user, isAuthenticated } = useAuth();
  const userId = user?.id ?? null;

  const isPremium = useRevenueCatStore((s) => s.isPremium);
  const rcLoading = useRevenueCatStore((s) => s.loading);
  const queryClient = useQueryClient();

  const lastRefreshUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !userId) {
      lastRefreshUserId.current = null;
      return;
    }
    if (lastRefreshUserId.current === userId) return;
    lastRefreshUserId.current = userId;
    void useRevenueCatStore.getState().refreshPremium(userId);
  }, [isAuthenticated, userId]);

  const ownPremium = isPremium || isDevForcePremium();

  useEffect(() => {
    syncHouseholdForegroundTarget(
      queryClient,
      userId,
      Boolean(isAuthenticated && userId && !ownPremium),
    );
  }, [queryClient, userId, isAuthenticated, ownPremium]);

  const householdQuery = useQuery({
    queryKey: ['household-premium', userId ?? 'anon'],
    queryFn: () => fetchHouseholdHasPremium(),
    enabled: Boolean(isAuthenticated && userId) && !ownPremium,
    staleTime: 5 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const isHouseholdPremium = ownPremium || householdQuery.data === true;

  return {
    isPremium: ownPremium,
    isHouseholdPremium,
    loading:
      rcLoading ||
      (householdQuery.isFetching && !ownPremium && householdQuery.data === undefined),
  };
}

/** Imperativní kontrola (mimo React) — vlastní RC premium. */
export function getIsPremiumSnapshot(): boolean {
  if (isDevForcePremium()) return true;
  return useRevenueCatStore.getState().isPremium;
}
