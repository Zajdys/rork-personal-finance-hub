import createContextHook from '@nkzw/create-context-hook';
import { useState, useCallback, useMemo, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  Household,
  SharedPolicy,
  TransactionShare,
  Settlement,
  Visibility,
  SplitRule,
} from '@/types/household';

export const [HouseholdProvider, useHousehold] = createContextHook(() => {
  const [selectedHouseholdId, setSelectedHouseholdId] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = await AsyncStorage.getItem('authToken');
        setIsAuthenticated(!!token);
        console.log('Household store auth check:', !!token);
      } catch (err) {
        console.error('Failed to check auth:', err);
        setIsAuthenticated(false);
      }
    };
    checkAuth();
  }, []);

  const householdsQuery = trpc.household.list.useQuery(undefined, {
    enabled: false,
    retry: false,
  });
  
  const householdQuery = trpc.household.get.useQuery(
    { householdId: selectedHouseholdId || undefined },
    { 
      enabled: false,
      retry: false,
    }
  );
  
  const dashboardQuery = trpc.household.dashboard.useQuery(
    { householdId: selectedHouseholdId || '' },
    { 
      enabled: false,
      retry: false,
    }
  );
  
  const policiesQuery = trpc.household.policies.list.useQuery(
    { householdId: selectedHouseholdId || '' },
    { 
      enabled: false,
      retry: false,
    }
  );
  
  const settlementsQuery = trpc.household.settlements.list.useQuery(
    { householdId: selectedHouseholdId || '' },
    { 
      enabled: false,
      retry: false,
    }
  );

  const createMutation = trpc.household.create.useMutation({
    onSuccess: (data) => {
      householdsQuery.refetch();
      setSelectedHouseholdId(data.id);
    },
  });

  const inviteMutation = trpc.household.invite.useMutation({
    onSuccess: () => {
      if (selectedHouseholdId) {
        householdQuery.refetch();
      }
    },
  });

  const acceptInvitationMutation = trpc.household.acceptInvitation.useMutation({
    onSuccess: () => {
      householdsQuery.refetch();
    },
  });

  const createPolicyMutation = trpc.household.policies.create.useMutation({
    onSuccess: () => {
      policiesQuery.refetch();
      if (selectedHouseholdId) {
        dashboardQuery.refetch();
      }
    },
  });

  const setDefaultSplitMutation = trpc.household.splits.set.useMutation({
    onSuccess: () => {
      if (selectedHouseholdId) {
        householdQuery.refetch();
        dashboardQuery.refetch();
      }
    },
  });

  const shareTransactionMutation = trpc.household.transactions.share.useMutation({
    onSuccess: () => {
      if (selectedHouseholdId) {
        dashboardQuery.refetch();
      }
    },
  });

  const createSettlementMutation = trpc.household.settlements.create.useMutation({
    onSuccess: () => {
      settlementsQuery.refetch();
      if (selectedHouseholdId) {
        dashboardQuery.refetch();
      }
    },
  });

  const createHousehold = useCallback(
    async (name: string): Promise<Household> => {
      const result = await createMutation.mutateAsync({ name });
      return result;
    },
    [createMutation]
  );

  const inviteMember = useCallback(
    async (email: string, role: 'PARTNER' | 'SUMMARY_VIEWER' | 'READ_ONLY' = 'PARTNER'): Promise<void> => {
      if (!selectedHouseholdId) {
        throw new Error('No household selected');
      }
      await inviteMutation.mutateAsync({
        householdId: selectedHouseholdId,
        inviteeEmail: email,
        role,
      });
    },
    [inviteMutation, selectedHouseholdId]
  );

  const acceptInvitation = useCallback(
    async (invitationId: string): Promise<void> => {
      await acceptInvitationMutation.mutateAsync({ invitationId });
    },
    [acceptInvitationMutation]
  );

  const createPolicy = useCallback(
    async (
      scopeType: 'CATEGORY' | 'TAG',
      scopeId: string,
      visibility: Visibility,
      priority: number = 0
    ): Promise<SharedPolicy> => {
      if (!selectedHouseholdId) {
        throw new Error('No household selected');
      }
      const result = await createPolicyMutation.mutateAsync({
        householdId: selectedHouseholdId,
        scopeType,
        scopeId,
        visibility,
        priority,
      });
      return result;
    },
    [createPolicyMutation, selectedHouseholdId]
  );

  const setDefaultSplit = useCallback(
    async (categoryId: string, splitRule: SplitRule): Promise<void> => {
      if (!selectedHouseholdId) {
        throw new Error('No household selected');
      }
      await setDefaultSplitMutation.mutateAsync({
        householdId: selectedHouseholdId,
        categoryId,
        splitRule,
      });
    },
    [setDefaultSplitMutation, selectedHouseholdId]
  );

  const shareTransaction = useCallback(
    async (
      transactionId: string,
      visibility: Visibility,
      split: Record<string, number>
    ): Promise<TransactionShare> => {
      if (!selectedHouseholdId) {
        throw new Error('No household selected');
      }
      const result = await shareTransactionMutation.mutateAsync({
        transactionId,
        householdId: selectedHouseholdId,
        visibility,
        split,
      });
      return result;
    },
    [shareTransactionMutation, selectedHouseholdId]
  );

  const createSettlement = useCallback(
    async (
      toUserId: string,
      amount: number,
      method: 'BANK' | 'REVOLUT' | 'CASH' | 'OTHER',
      currency: string = 'CZK',
      note?: string
    ): Promise<Settlement> => {
      if (!selectedHouseholdId) {
        throw new Error('No household selected');
      }
      const result = await createSettlementMutation.mutateAsync({
        householdId: selectedHouseholdId,
        toUserId,
        amount,
        currency,
        method,
        note,
      });
      return result;
    },
    [createSettlementMutation, selectedHouseholdId]
  );

  const getVisibilityForTransaction = useCallback(
    (transactionCategory: string, transactionTags: string[]): Visibility => {
      const policies = policiesQuery.data || [];
      
      let effectiveVisibility: Visibility = 'PRIVATE';
      let maxPriority = -1;

      for (const policy of policies) {
        if (policy.scope.type === 'CATEGORY' && policy.scope.id === transactionCategory) {
          if (policy.priority > maxPriority) {
            effectiveVisibility = policy.visibility;
            maxPriority = policy.priority;
          }
        }
        
        if (policy.scope.type === 'TAG') {
          for (const tag of transactionTags) {
            if (policy.scope.id === tag && policy.priority > maxPriority) {
              effectiveVisibility = policy.visibility;
              maxPriority = policy.priority;
            }
          }
        }
      }

      return effectiveVisibility;
    },
    [policiesQuery.data]
  );

  const currentHousehold = useMemo(() => {
    if (selectedHouseholdId) {
      return householdQuery.data || null;
    }
    return householdsQuery.data?.[0] || null;
  }, [selectedHouseholdId, householdQuery.data, householdsQuery.data]);

  const isInHousehold = useMemo(() => {
    return !!currentHousehold;
  }, [currentHousehold]);

  const isOwner = useMemo(() => {
    if (!currentHousehold) return false;
    return currentHousehold.members.some(
      m => m.role === 'OWNER' && m.joinStatus === 'ACTIVE'
    );
  }, [currentHousehold]);

  const refetch = useCallback(() => {
    householdsQuery.refetch();
    if (selectedHouseholdId) {
      householdQuery.refetch();
      dashboardQuery.refetch();
      policiesQuery.refetch();
      settlementsQuery.refetch();
    }
  }, [householdsQuery, selectedHouseholdId, householdQuery, dashboardQuery, policiesQuery, settlementsQuery]);

  return useMemo(
    () => ({
      households: householdsQuery.data || [],
      currentHousehold,
      dashboard: dashboardQuery.data || null,
      policies: policiesQuery.data || [],
      settlements: settlementsQuery.data || [],
      isInHousehold,
      isOwner,
      selectedHouseholdId,
      setSelectedHouseholdId,
      createHousehold,
      inviteMember,
      acceptInvitation,
      createPolicy,
      setDefaultSplit,
      shareTransaction,
      createSettlement,
      getVisibilityForTransaction,
      isLoading:
        householdsQuery.isLoading ||
        householdQuery.isLoading ||
        dashboardQuery.isLoading,
      isCreating: createMutation.isPending,
      isInviting: inviteMutation.isPending,
      isSharingTransaction: shareTransactionMutation.isPending,
      isCreatingSettlement: createSettlementMutation.isPending,
      error,
      isAuthenticated,
      refetch,
    }),
    [
      householdsQuery,
      householdQuery.isLoading,
      currentHousehold,
      dashboardQuery,
      policiesQuery,
      settlementsQuery,
      isInHousehold,
      isOwner,
      selectedHouseholdId,
      createHousehold,
      inviteMember,
      acceptInvitation,
      createPolicy,
      setDefaultSplit,
      shareTransaction,
      createSettlement,
      getVisibilityForTransaction,
      createMutation.isPending,
      inviteMutation.isPending,
      shareTransactionMutation.isPending,
      createSettlementMutation.isPending,
      error,
      isAuthenticated,
      refetch,
    ]
  );
});
