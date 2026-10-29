import createContextHook from '@nkzw/create-context-hook';
import { useState, useCallback, useMemo, useEffect } from 'react';
import { Alert } from 'react-native';
import {
  deleteCategoryBudgetRemote,
  fetchCategoryBudgetsRemote,
  resolveHouseholdIdForBudgets,
  upsertCategoryBudgetRemote,
} from '@/lib/household-category-budgets';
import { fetchHouseholdMembersWithProfiles } from '@/lib/household-members';
import { useHouseholdActiveStore } from '@/store/household-active-store';
import { logAndGetUserFacingError } from '@/lib/user-facing-error';
import { supabase } from '@/lib/supabase';
import type {
  Household,
  HouseholdMember,
  SharedPolicy,
  TransactionShare,
  Settlement,
  Visibility,
  SplitRule,
  HouseholdDashboard,
  CategoryBudget,
} from '@/types/household';

/**
 * Tenký store nad reálnou domácností (Supabase).
 * Žádný USE_MOCK_MODE / tRPC — členové a rozpočty jen ze skutečných dat.
 * Policies / defaultSplits nemají tabulku → vždy prázdné; mutace ukážou info.
 */
export const [HouseholdProvider, useHousehold] = createContextHook(() => {
  const activeHouseholds = useHouseholdActiveStore((s) => s.households);
  const activeHouseholdId = useHouseholdActiveStore((s) => s.activeHouseholdId);
  const updateHouseholdNameLocal = useHouseholdActiveStore((s) => s.updateHouseholdName);

  const [selectedHouseholdId, setSelectedHouseholdId] = useState<string | null>(null);
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [categoryBudgets, setCategoryBudgets] = useState<Record<string, CategoryBudget>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error] = useState<string | null>(null);

  const resolvedId = selectedHouseholdId ?? activeHouseholdId ?? activeHouseholds[0]?.id ?? null;

  useEffect(() => {
    if (activeHouseholdId && selectedHouseholdId !== activeHouseholdId) {
      setSelectedHouseholdId(activeHouseholdId);
    }
  }, [activeHouseholdId, selectedHouseholdId]);

  const loadMembers = useCallback(async (householdId: string | null) => {
    if (!householdId) {
      setMembers([]);
      return;
    }
    const { members: rows, error: memErr } = await fetchHouseholdMembersWithProfiles(householdId);
    if (memErr) {
      console.warn('[household-store] members', memErr.message);
      setMembers([]);
      return;
    }
    setMembers(
      rows.map((m) => ({
        userId: m.userId,
        userName: m.displayName,
        userEmail: m.email ?? '',
        role: 'PARTNER' as const,
        joinStatus: 'ACTIVE' as const,
        invitedAt: new Date(),
        joinedAt: new Date(),
      })),
    );
  }, []);

  const getCategoryBudgets = useCallback(async (): Promise<Record<string, CategoryBudget>> => {
    const householdId = await resolveHouseholdIdForBudgets(resolvedId);
    if (!householdId) {
      setCategoryBudgets({});
      return {};
    }

    const { budgets, error: budgetErr } = await fetchCategoryBudgetsRemote(householdId);
    if (budgetErr) {
      Alert.alert('Chyba', logAndGetUserFacingError('household-budgets', budgetErr));
      return {};
    }

    setCategoryBudgets(budgets);
    return budgets;
  }, [resolvedId]);

  const refetch = useCallback(() => {
    void (async () => {
      setIsLoading(true);
      try {
        await Promise.all([loadMembers(resolvedId), getCategoryBudgets()]);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [resolvedId, loadMembers, getCategoryBudgets]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const currentHousehold = useMemo((): Household | null => {
    if (!resolvedId) return null;
    const meta =
      activeHouseholds.find((h) => h.id === resolvedId) ??
      (activeHouseholdId === resolvedId
        ? { id: resolvedId, name: 'Domácnost', inviteCode: null, createdBy: null }
        : null);
    if (!meta) return null;
    return {
      id: meta.id,
      name: meta.name,
      ownerUserId: meta.createdBy ?? '',
      members,
      defaultSplits: {},
      categoryBudgets,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }, [resolvedId, activeHouseholds, activeHouseholdId, members, categoryBudgets]);

  const households = useMemo((): Household[] => {
    return activeHouseholds.map((h) =>
      h.id === currentHousehold?.id
        ? currentHousehold
        : {
            id: h.id,
            name: h.name,
            ownerUserId: h.createdBy ?? '',
            members: [],
            defaultSplits: {},
            categoryBudgets: {},
            createdAt: new Date(),
            updatedAt: new Date(),
          },
    );
  }, [activeHouseholds, currentHousehold]);

  const isInHousehold = !!currentHousehold;
  const isOwner = useMemo(() => {
    if (!currentHousehold?.ownerUserId) return false;
    return members.some((m) => m.userId === currentHousehold.ownerUserId);
  }, [currentHousehold, members]);

  /** Žádný fake dashboard — přehledy jsou na záložce Domácnost (shared/settlements). */
  const dashboard: HouseholdDashboard | null = null;
  const policies: SharedPolicy[] = [];
  const settlements: Settlement[] = [];

  const createHousehold = useCallback(async (_name: string): Promise<Household> => {
    throw new Error('Použij záložku Domácnost pro vytvoření domácnosti.');
  }, []);

  const renameHousehold = useCallback(
    (householdId: string, name: string) => {
      updateHouseholdNameLocal(householdId, name);
      void supabase.from('households').update({ name }).eq('id', householdId).then(({ error: e }) => {
        if (e) console.warn('[household-store] rename', e.message);
      });
    },
    [updateHouseholdNameLocal],
  );

  const inviteMember = useCallback(async (): Promise<void> => {
    throw new Error('Pozvánky jsou na obrazovce Členové domácnosti.');
  }, []);

  const acceptInvitation = useCallback(async (): Promise<void> => {
    throw new Error('Přijetí pozvánky je na záložce Domácnost.');
  }, []);

  const createPolicy = useCallback(
    async (
      _scopeType: 'CATEGORY' | 'TAG',
      _scopeId: string,
      _visibility: Visibility,
      _priority: number = 0,
    ): Promise<SharedPolicy> => {
      Alert.alert(
        'Nedostupné',
        'Pravidla sdílení zatím nejsou napojená. Viditelnost řeší společné výdaje na záložce Domácnost.',
      );
      throw new Error('policies_unavailable');
    },
    [],
  );

  const setDefaultSplit = useCallback(async (_categoryId: string, _splitRule: SplitRule): Promise<void> => {
    Alert.alert(
      'Nedostupné',
      'Výchozí dělení kategorií zatím není uložené. Dělení nastavíš u konkrétního společného výdaje.',
    );
    throw new Error('default_splits_unavailable');
  }, []);

  const setCategoryBudget = useCallback(
    async (categoryId: string, budget: CategoryBudget): Promise<void> => {
      const householdId = await resolveHouseholdIdForBudgets(resolvedId);
      if (!householdId) {
        const msg = 'Žádná domácnost — nelze uložit rozpočet.';
        Alert.alert('Chyba', msg);
        throw new Error(msg);
      }

      const shouldRemove = !budget.enabled || budget.monthlyLimit <= 0;

      try {
        const { error: saveErr } = shouldRemove
          ? await deleteCategoryBudgetRemote(householdId, categoryId)
          : await upsertCategoryBudgetRemote(householdId, categoryId, budget.monthlyLimit, {
              currency: budget.currency,
              notifyAtPercentage: budget.notifyAtPercentage ?? null,
            });
        if (saveErr) throw saveErr;
      } catch (e) {
        const msg = logAndGetUserFacingError('household-budget-save', e);
        Alert.alert('Chyba', msg);
        throw e instanceof Error ? e : new Error(msg);
      }

      setCategoryBudgets((prev) => {
        if (shouldRemove) {
          const next = { ...prev };
          delete next[categoryId];
          return next;
        }
        return { ...prev, [categoryId]: { ...budget, categoryId } };
      });
    },
    [resolvedId],
  );

  const shareTransaction = useCallback(async (): Promise<TransactionShare> => {
    throw new Error('Sdílení transakcí řeší společné výdaje na záložce Domácnost.');
  }, []);

  const createSettlement = useCallback(async (): Promise<Settlement> => {
    throw new Error('Vyrovnání je na záložce Domácnost.');
  }, []);

  const getVisibilityForTransaction = useCallback((): Visibility => 'PRIVATE', []);

  return useMemo(
    () => ({
      households,
      currentHousehold,
      dashboard,
      policies,
      settlements,
      isInHousehold,
      isOwner,
      selectedHouseholdId: resolvedId,
      setSelectedHouseholdId,
      createHousehold,
      renameHousehold,
      inviteMember,
      acceptInvitation,
      createPolicy,
      setDefaultSplit,
      setCategoryBudget,
      getCategoryBudgets,
      shareTransaction,
      createSettlement,
      getVisibilityForTransaction,
      isLoading,
      isCreating: false,
      isInviting: false,
      isSharingTransaction: false,
      isCreatingSettlement: false,
      error,
      isAuthenticated: true,
      refetch,
    }),
    [
      households,
      currentHousehold,
      isInHousehold,
      isOwner,
      resolvedId,
      createHousehold,
      renameHousehold,
      inviteMember,
      acceptInvitation,
      createPolicy,
      setDefaultSplit,
      setCategoryBudget,
      getCategoryBudgets,
      shareTransaction,
      createSettlement,
      getVisibilityForTransaction,
      isLoading,
      error,
      refetch,
    ],
  );
});
