import { useCallback, useEffect, useMemo, useState, type MutableRefObject } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import {
  hasSupabaseSession,
  isSessionLostError,
  logSupabaseDataError,
} from '@/lib/supabase-session';
import { useAuth } from '@/store/auth-store';
import { useLanguageStore } from '@/store/language-store';
import { useHouseholdActiveStore, type UserHousehold } from '@/store/household-active-store';
import { useFocusRefresh } from '@/hooks/useFocusRefresh';
import {
  formatSupabaseError,
  friendlyCatchMessage,
  LOAD_TIMEOUT_MS,
  withTimeout,
} from './utils';

export type HouseholdFetchBundle = {
  fetchMembers: (hid: string) => Promise<void>;
  fetchRecurringExpenses: (hid: string, currentUserId: string | undefined) => Promise<void>;
  fetchSharedExpenses: (hid: string, month: Date) => Promise<void>;
  fetchSharedExpensesForSettlement: (hid: string) => Promise<void>;
  fetchHouseholdSettlements: (hid: string) => Promise<void>;
  fetchCustomCategories: (hid: string) => Promise<void>;
  clearMembers: () => void;
  clearRecurring: () => void;
  clearShared: () => void;
  sharedMonth: Date;
  setInviteSheetHousehold: (h: UserHousehold | null) => void;
};

type UseHouseholdSwitcherParams = {
  fetchesRef: MutableRefObject<HouseholdFetchBundle>;
  loadingRef: MutableRefObject<(v: boolean) => void>;
  switcherOpenRef: MutableRefObject<(v: boolean) => void>;
  loadHouseholdDataRef: MutableRefObject<(hid: string, currentUserId: string) => Promise<void>>;
};

export function useHouseholdSwitcher({
  fetchesRef,
  loadingRef,
  switcherOpenRef,
  loadHouseholdDataRef,
}: UseHouseholdSwitcherParams) {
  const router = useRouter();
  const { t } = useLanguageStore();
  const { user } = useAuth();

  const activeHouseholdId = useHouseholdActiveStore((s) => s.activeHouseholdId);
  const households = useHouseholdActiveStore((s) => s.households);
  const hydrateActiveHousehold = useHouseholdActiveStore((s) => s.hydrate);
  const fetchUserHouseholds = useHouseholdActiveStore((s) => s.fetchHouseholds);
  const setActiveHouseholdId = useHouseholdActiveStore((s) => s.setActiveHouseholdId);
  const updateHouseholdNameInStore = useHouseholdActiveStore((s) => s.updateHouseholdName);
  const resetActiveHouseholdStore = useHouseholdActiveStore((s) => s.reset);
  const householdId = activeHouseholdId;
  const householdName = useMemo(() => {
    const match = households.find((h) => h.id === householdId);
    return match?.name ?? '';
  }, [households, householdId]);

  const [loading, setLoading] = useState(true);
  const [householdSwitcherOpen, setHouseholdSwitcherOpen] = useState(false);
  const [newHouseholdModalOpen, setNewHouseholdModalOpen] = useState(false);
  const [newHouseholdName, setNewHouseholdName] = useState('');
  const [newHouseholdShowInvite, setNewHouseholdShowInvite] = useState(false);
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [isJoiningHousehold, setIsJoiningHousehold] = useState(false);
  const [isCreatingHousehold, setIsCreatingHousehold] = useState(false);
  const [joinCode, setJoinCode] = useState('');

  loadingRef.current = setLoading;
  switcherOpenRef.current = setHouseholdSwitcherOpen;

  const activeHouseholdIndex = useMemo(
    () => households.findIndex((h) => h.id === householdId),
    [households, householdId],
  );

  const clearAllLocal = useCallback(() => {
    fetchesRef.current.clearMembers();
    fetchesRef.current.clearRecurring();
    fetchesRef.current.clearShared();
  }, [fetchesRef]);

  const upsertCurrentUserRecord = useCallback(async () => {
    if (!user) return;
    if (!(await hasSupabaseSession())) return;
    try {
      await withTimeout(
        supabase.from('users').upsert({
          id: user.id,
          email: user.email,
          display_name: user.name || user.email,
        }),
        LOAD_TIMEOUT_MS,
        'users.upsert'
      );
    } catch (e) {
      logSupabaseDataError('upsertCurrentUserRecord', e);
    }
  }, [user]);

  /** Zajistí řádek v `users` před vytvořením / připojením k domácnosti; při chybě zobrazí přesnou hlášku. */
  const upsertUserRowOrAlert = useCallback(async (): Promise<boolean> => {
    if (!user) return false;
    if (!(await hasSupabaseSession())) return false;
    try {
      let usersUpsert;
      try {
        usersUpsert = await withTimeout(
          supabase.from('users').upsert({
            id: user.id,
            email: user.email,
            display_name: user.name || user.email,
          }),
          LOAD_TIMEOUT_MS,
          'users.upsert'
        );
      } catch (e) {
        if (isSessionLostError(e)) return false;
        Alert.alert(t('error'), friendlyCatchMessage('household', e));
        return false;
      }
      const { error: usersError } = usersUpsert;
      if (usersError) {
        if (isSessionLostError(usersError)) return false;
        console.error('[household] upsertUserRowOrAlert: Supabase error', usersError);
        Alert.alert(t('error'), formatSupabaseError(usersError));
        return false;
      }
      return true;
    } catch (e) {
      if (isSessionLostError(e)) return false;
      Alert.alert(t('error'), friendlyCatchMessage('household', e));
      return false;
    }
  }, [user, t]);

  const loadHouseholdData = useCallback(
    async (hid: string, currentUserId: string) => {
      if (!(await hasSupabaseSession())) return;
      try {
        await withTimeout(
          Promise.all([
            fetchesRef.current.fetchMembers(hid),
            fetchesRef.current.fetchRecurringExpenses(hid, currentUserId),
            fetchesRef.current.fetchSharedExpenses(hid, fetchesRef.current.sharedMonth),
            fetchesRef.current.fetchSharedExpensesForSettlement(hid),
            fetchesRef.current.fetchHouseholdSettlements(hid),
            fetchesRef.current.fetchCustomCategories(hid),
          ]),
          LOAD_TIMEOUT_MS * 2,
          'household_expenses_bundle',
        );
      } catch (e) {
        logSupabaseDataError('Failed to load household expense data', e);
      }
    },
    [fetchesRef],
  );

  loadHouseholdDataRef.current = loadHouseholdData;

  const loadHousehold = useCallback(async () => {
    if (!user) {
      resetActiveHouseholdStore();
      clearAllLocal();
      setLoading(false);
      return;
    }

    if (!(await hasSupabaseSession())) {
      resetActiveHouseholdStore();
      clearAllLocal();
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      await upsertCurrentUserRecord();
      await hydrateActiveHousehold(user.id);
      await fetchUserHouseholds(user.id);

      const hid = useHouseholdActiveStore.getState().activeHouseholdId;
      if (!hid) {
        clearAllLocal();
        return;
      }

      await loadHouseholdData(hid, user.id);
    } catch (e) {
      logSupabaseDataError('loadHousehold unexpected error', e);
    } finally {
      setLoading(false);
    }
  }, [
    clearAllLocal,
    fetchUserHouseholds,
    hydrateActiveHousehold,
    loadHouseholdData,
    resetActiveHouseholdStore,
    upsertCurrentUserRecord,
    user,
  ]);

  const softRefreshHousehold = useCallback(async () => {
    if (!user?.id) return;
    const hid = useHouseholdActiveStore.getState().activeHouseholdId;
    if (!hid) return;
    await loadHouseholdData(hid, user.id);
  }, [loadHouseholdData, user?.id]);

  const { refresh: refreshHouseholdFocus, notifyRefreshed: notifyHouseholdRefreshed } =
    useFocusRefresh(softRefreshHousehold, {
      enabled: !!user?.id,
    });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await loadHousehold();
      if (!cancelled) notifyHouseholdRefreshed();
    })();
    return () => {
      cancelled = true;
    };
  }, [loadHousehold, notifyHouseholdRefreshed]);

  const switchToHousehold = useCallback(
    async (hid: string) => {
      if (!user || hid === householdId) {
        setHouseholdSwitcherOpen(false);
        return;
      }
      setLoading(true);
      try {
        await setActiveHouseholdId(user.id, hid);
        clearAllLocal();
        await loadHouseholdData(hid, user.id);
        notifyHouseholdRefreshed();
      } finally {
        setLoading(false);
        setHouseholdSwitcherOpen(false);
      }
    },
    [
      clearAllLocal,
      householdId,
      loadHouseholdData,
      notifyHouseholdRefreshed,
      setActiveHouseholdId,
      user,
    ],
  );

  const cycleHousehold = useCallback(
    (direction: -1 | 1) => {
      if (households.length <= 1) return;
      const idx = activeHouseholdIndex >= 0 ? activeHouseholdIndex : 0;
      const next = (idx + direction + households.length) % households.length;
      const target = households[next];
      if (target) void switchToHousehold(target.id);
    },
    [activeHouseholdIndex, households, switchToHousehold],
  );

  const generateInviteCode = async (): Promise<string> => {
    console.log('[household] generateInviteCode: start');
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = `${Math.floor(100000 + Math.random() * 900000)}`;
      console.log('[household] generateInviteCode: attempt', attempt, 'candidate', candidate);
      let result;
      try {
        result = await withTimeout(
          supabase.from('households').select('id').eq('invite_code', candidate).maybeSingle(),
          LOAD_TIMEOUT_MS,
          'generateInviteCode.select'
        );
      } catch (e) {
        console.error('[household] generateInviteCode: timeout or network', e);
        throw e;
      }
      const { data } = result;
      if (!data) {
        console.log('[household] generateInviteCode: picked unique code', candidate);
        return candidate;
      }
    }
    console.error('[household] generateInviteCode: exhausted attempts');
    throw new Error(useLanguageStore.getState().t('hhGenerateCodeFailed'));
  };

  const createHouseholdWithName = async (
    name: string,
    options?: { showInviteAfterCreate?: boolean; switchToNew?: boolean },
  ): Promise<boolean> => {
    if (!user) return false;

    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert(t('error'), t('hhEnterHouseholdName'));
      return false;
    }

    try {
      const userRowOk = await upsertUserRowOrAlert();
      if (!userRowOk) return false;

      const code = await generateInviteCode();
      let insertHouseholdResult;
      try {
        insertHouseholdResult = await withTimeout(
          supabase
            .from('households')
            .insert({ name: trimmed, invite_code: code, created_by: user.id })
            .select('id')
            .single(),
          LOAD_TIMEOUT_MS,
          'createHousehold.insert',
        );
      } catch (e) {
        Alert.alert(t('error'), friendlyCatchMessage('household', e));
        return false;
      }

      const { data: household, error: createError } = insertHouseholdResult;
      if (createError || !household) {
        const detail = formatSupabaseError(createError);
        console.error('[household] createHousehold: Supabase insert household error', createError);
        Alert.alert(t('error'), detail);
        return false;
      }

      let insertMemberResult;
      try {
        insertMemberResult = await withTimeout(
          supabase.from('household_members').insert({
            household_id: household.id,
            user_id: user.id,
          }),
          LOAD_TIMEOUT_MS,
          'createHousehold.member',
        );
      } catch (e) {
        Alert.alert(t('error'), friendlyCatchMessage('household', e));
        return false;
      }

      const { error: memberError } = insertMemberResult;
      if (memberError) {
        const detail = formatSupabaseError(memberError);
        console.error('[household] createHousehold: Supabase insert member error', memberError);
        Alert.alert(t('error'), detail);
        return false;
      }

      await fetchUserHouseholds(user.id);
      if (options?.switchToNew !== false) {
        await setActiveHouseholdId(user.id, household.id);
        await loadHouseholdData(household.id, user.id);
        notifyHouseholdRefreshed();
      }

      if (options?.showInviteAfterCreate) {
        fetchesRef.current.setInviteSheetHousehold({
          id: household.id,
          name: trimmed,
          inviteCode: code,
          createdBy: user.id,
        });
      }

      return true;
    } catch (error) {
      const msg = friendlyCatchMessage('household', error);
      console.error('[household] createHousehold: unexpected', error);
      Alert.alert(t('error'), msg);
      return false;
    }
  };

  const createHouseholdFromSwitcher = async () => {
    if (!user) {
      Alert.alert(t('hhLoginFirstTitle'), t('hhLoginFirstCreate'), [
        { text: t('cancel'), style: 'cancel' },
        { text: t('hhSignIn'), onPress: () => router.push('/auth') },
      ]);
      return;
    }
    setIsCreatingHousehold(true);
    try {
      const ok = await createHouseholdWithName(newHouseholdName, {
        showInviteAfterCreate: newHouseholdShowInvite,
      });
      if (ok) {
        setNewHouseholdName('');
        setNewHouseholdShowInvite(false);
        setNewHouseholdModalOpen(false);
        setHouseholdSwitcherOpen(false);
      }
    } finally {
      setIsCreatingHousehold(false);
    }
  };

  const openCreateHouseholdModal = useCallback(() => {
    setHouseholdSwitcherOpen(false);
    setNewHouseholdName('');
    setNewHouseholdShowInvite(false);
    requestAnimationFrame(() => setNewHouseholdModalOpen(true));
  }, []);

  const openJoinHouseholdModal = useCallback(() => {
    setHouseholdSwitcherOpen(false);
    setJoinCode('');
    requestAnimationFrame(() => setJoinModalOpen(true));
  }, []);

  const joinHousehold = async () => {
    if (!user) {
      Alert.alert(t('hhLoginFirstTitle'), t('hhLoginFirstJoin'), [
        { text: t('cancel'), style: 'cancel' },
        { text: t('hhSignIn'), onPress: () => router.push('/auth') },
      ]);
      return;
    }

    // Kód neupravuj — RPC je case-insensitive a tolerantní k mezerám.
    const code = joinCode;
    if (!code) {
      Alert.alert(t('error'), t('hhInvalidJoinCode'));
      return;
    }

    setIsJoiningHousehold(true);
    try {
      const userRowOk = await upsertUserRowOrAlert();
      if (!userRowOk) return;

      let rpcResult: {
        data: { id?: string } | { id?: string }[] | null;
        error: { message?: string; code?: string } | null;
      };
      try {
        rpcResult = await withTimeout(
          supabase.rpc('join_household_by_code', { code }),
          LOAD_TIMEOUT_MS,
          'join.join_household_by_code',
        );
      } catch (e) {
        Alert.alert(t('error'), friendlyCatchMessage('household', e));
        return;
      }

      const { data: householdRaw, error: rpcError } = rpcResult;
      if (rpcError) {
        const msg = (rpcError.message ?? '').toLowerCase();
        if (msg.includes('invalid_invite_code')) {
          Alert.alert(t('error'), t('hhInvalidInviteCode'));
          return;
        }
        if (msg.includes('must_be_authenticated')) {
          Alert.alert(t('error'), t('hhJoinAuthRequired'));
          return;
        }
        Alert.alert(t('error'), formatSupabaseError(rpcError));
        return;
      }

      const household = Array.isArray(householdRaw) ? householdRaw[0] : householdRaw;
      const householdIdJoined =
        household && typeof household === 'object' && 'id' in household && (household as { id?: unknown }).id
          ? String((household as { id: unknown }).id)
          : null;
      if (!householdIdJoined) {
        Alert.alert(t('error'), t('hhInvalidInviteCode'));
        return;
      }

      setJoinCode('');
      setJoinModalOpen(false);
      setHouseholdSwitcherOpen(false);
      await fetchUserHouseholds(user.id);
      await setActiveHouseholdId(user.id, householdIdJoined);
      await loadHouseholdData(householdIdJoined, user.id);
      notifyHouseholdRefreshed();
    } catch (e) {
      Alert.alert(t('error'), friendlyCatchMessage('household', e));
    } finally {
      setIsJoiningHousehold(false);
    }
  };

  /** Pokud načítání visí (např. nevyřešený promise), po 3 s ukončíme spinner a zobrazíme obrazovku. */
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => {
      setLoading(false);
    }, 3000);
    return () => clearTimeout(timer);
  }, [loading]);

  useEffect(() => {
    if (!householdId || !user?.id) return;

    const safeFetch = (fn: () => void | Promise<void>) => {
      void (async () => {
        if (!(await hasSupabaseSession())) return;
        await fn();
      })();
    };

    const recurringChannel = supabase
      .channel(`recurring-${householdId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'recurring_expenses', filter: `household_id=eq.${householdId}` },
        () => safeFetch(() => fetchesRef.current.fetchRecurringExpenses(householdId, user.id)),
      )
      .subscribe();

    const recurringPaymentsChannel = supabase
      .channel(`recurring-payments-${householdId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'recurring_expense_payments' },
        () => safeFetch(() => fetchesRef.current.fetchRecurringExpenses(householdId, user.id)),
      )
      .subscribe();

    const membersChannel = supabase
      .channel(`members-${householdId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'household_members', filter: `household_id=eq.${householdId}` },
        () => safeFetch(() => fetchesRef.current.fetchMembers(householdId)),
      )
      .subscribe();

    const customCategoriesChannel = supabase
      .channel(`custom-categories-${householdId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'custom_categories', filter: `household_id=eq.${householdId}` },
        () => safeFetch(() => fetchesRef.current.fetchCustomCategories(householdId)),
      )
      .subscribe();

    const sharedChannel = supabase
      .channel(`shared-expenses-${householdId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shared_expenses', filter: `household_id=eq.${householdId}` },
        () =>
          safeFetch(async () => {
            await fetchesRef.current.fetchSharedExpenses(householdId, fetchesRef.current.sharedMonth);
            await fetchesRef.current.fetchSharedExpensesForSettlement(householdId);
          }),
      )
      .subscribe();

    const settlementsChannel = supabase
      .channel(`household-settlements-${householdId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'household_settlements', filter: `household_id=eq.${householdId}` },
        () => safeFetch(() => fetchesRef.current.fetchHouseholdSettlements(householdId)),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(recurringChannel);
      supabase.removeChannel(recurringPaymentsChannel);
      supabase.removeChannel(membersChannel);
      supabase.removeChannel(customCategoriesChannel);
      supabase.removeChannel(sharedChannel);
      supabase.removeChannel(settlementsChannel);
    };
  }, [fetchesRef, householdId, user?.id]);

  return {
    data: {
      households,
      activeHouseholdId,
      householdId,
      householdName,
      householdSwitcherOpen,
      newHouseholdModalOpen,
      newHouseholdName,
      newHouseholdShowInvite,
      joinModalOpen,
      isJoiningHousehold,
      isCreatingHousehold,
      joinCode,
      activeHouseholdIndex,
    },
    loading,
    error: null as string | null,
    setHouseholdSwitcherOpen,
    setNewHouseholdModalOpen,
    setNewHouseholdName,
    setNewHouseholdShowInvite,
    setJoinModalOpen,
    setJoinCode,
    updateHouseholdNameInStore,
    upsertCurrentUserRecord,
    upsertUserRowOrAlert,
    loadHouseholdData,
    loadHousehold,
    refreshHouseholdFocus,
    switchToHousehold,
    cycleHousehold,
    generateInviteCode,
    createHouseholdWithName,
    createHouseholdFromSwitcher,
    openCreateHouseholdModal,
    openJoinHouseholdModal,
    joinHousehold,
  };
}
