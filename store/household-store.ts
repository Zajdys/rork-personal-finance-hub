import createContextHook from '@nkzw/create-context-hook';
import { useState, useCallback, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import type {
  Household,
  SharedPolicy,
  TransactionShare,
  Settlement,
  Visibility,
  SplitRule,
  HouseholdDashboard,
  CategoryBudget,
} from '@/types/household';

const USE_MOCK_MODE = true;

export const [HouseholdProvider, useHousehold] = createContextHook(() => {
  const [selectedHouseholdId, setSelectedHouseholdId] = useState<string | null>(null);
  const [isAuthenticated] = useState<boolean>(true);
  const [error] = useState<string | null>(null);
  
  const [mockHouseholds, setMockHouseholds] = useState<Household[]>([]);
  const [mockPolicies, setMockPolicies] = useState<SharedPolicy[]>([]);
  const [mockSettlements] = useState<Settlement[]>([]);
  const [mockIsLoading, setMockIsLoading] = useState(false);

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
      if (USE_MOCK_MODE) {
        setMockIsLoading(true);
        await new Promise(resolve => setTimeout(resolve, 500));
        const newHousehold: Household = {
          id: `household_${Date.now()}`,
          name,
          ownerUserId: 'mock_user_1',
          members: [
            {
              userId: 'mock_user_1',
              userName: 'Já',
              userEmail: 'me@example.com',
              role: 'OWNER',
              joinStatus: 'ACTIVE',
              joinedAt: new Date(),
              invitedAt: new Date(),
            },
          ],
          defaultSplits: {},
          categoryBudgets: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        setMockHouseholds([...mockHouseholds, newHousehold]);
        setSelectedHouseholdId(newHousehold.id);
        setMockIsLoading(false);
        return newHousehold;
      }
      const result = await createMutation.mutateAsync({ name });
      return result;
    },
    [createMutation, mockHouseholds]
  );

  const inviteMember = useCallback(
    async (email: string, role: 'PARTNER' | 'SUMMARY_VIEWER' | 'READ_ONLY' = 'PARTNER'): Promise<void> => {
      if (!selectedHouseholdId) {
        throw new Error('No household selected');
      }
      
      if (USE_MOCK_MODE) {
        setMockIsLoading(true);
        await new Promise(resolve => setTimeout(resolve, 500));
        const newMember = {
          userId: `mock_user_${Date.now()}`,
          userName: email.split('@')[0],
          userEmail: email,
          role,
          joinStatus: 'ACTIVE' as const,
          joinedAt: new Date(),
          invitedAt: new Date(),
        };
        setMockHouseholds(prev => 
          prev.map(h => 
            h.id === selectedHouseholdId 
              ? { ...h, members: [...h.members, newMember] }
              : h
          )
        );
        setMockIsLoading(false);
        return;
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
      
      if (USE_MOCK_MODE) {
        setMockIsLoading(true);
        await new Promise(resolve => setTimeout(resolve, 300));
        const newPolicy: SharedPolicy = {
          id: `policy_${Date.now()}`,
          householdId: selectedHouseholdId,
          scope: { type: scopeType, id: scopeId },
          visibility,
          priority,
        };
        setMockPolicies(prev => [...prev, newPolicy]);
        setMockIsLoading(false);
        return newPolicy;
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
      
      if (USE_MOCK_MODE) {
        setMockIsLoading(true);
        await new Promise(resolve => setTimeout(resolve, 300));
        setMockHouseholds(prev => 
          prev.map(h => 
            h.id === selectedHouseholdId 
              ? { ...h, defaultSplits: { ...h.defaultSplits, [categoryId]: splitRule } }
              : h
          )
        );
        setMockIsLoading(false);
        return;
      }
      
      await setDefaultSplitMutation.mutateAsync({
        householdId: selectedHouseholdId,
        categoryId,
        splitRule,
      });
    },
    [setDefaultSplitMutation, selectedHouseholdId]
  );

  const setCategoryBudget = useCallback(
    async (categoryId: string, budget: CategoryBudget): Promise<void> => {
      if (!selectedHouseholdId) {
        throw new Error('No household selected');
      }
      
      if (USE_MOCK_MODE) {
        setMockIsLoading(true);
        await new Promise(resolve => setTimeout(resolve, 300));
        setMockHouseholds(prev => 
          prev.map(h => 
            h.id === selectedHouseholdId 
              ? { ...h, categoryBudgets: { ...h.categoryBudgets, [categoryId]: budget } }
              : h
          )
        );
        setMockIsLoading(false);
        return;
      }
      
      console.log('Setting category budget (backend not implemented)', categoryId, budget);
    },
    [selectedHouseholdId]
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
    if (USE_MOCK_MODE) {
      if (selectedHouseholdId) {
        return mockHouseholds.find(h => h.id === selectedHouseholdId) || null;
      }
      return mockHouseholds[0] || null;
    }
    if (selectedHouseholdId) {
      return householdQuery.data || null;
    }
    return householdsQuery.data?.[0] || null;
  }, [selectedHouseholdId, householdQuery.data, householdsQuery.data, mockHouseholds]);

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

  const mockDashboard: HouseholdDashboard | null = useMemo(() => {
    if (!USE_MOCK_MODE || !currentHousehold) return null;
    
    const balances = currentHousehold.members
      .filter(m => m.joinStatus === 'ACTIVE')
      .map((member, idx) => ({
        userId: member.userId,
        userName: member.userName,
        totalShared: 15000 + idx * 5000,
        totalPaid: 17500 + idx * 3000,
        balance: idx === 0 ? 2500 : -2500,
      }));
    
    return {
      household: currentHousehold,
      totalSharedIncome: 45000,
      totalSharedExpenses: 32500,
      sharedBalance: 12500,
      balances,
      categoryBreakdown: [
        { category: 'Bydlení', amount: 12000, percentage: 37, icon: '🏠', color: '#8B5CF6' },
        { category: 'Jídlo', amount: 8500, percentage: 26, icon: '🍽️', color: '#10B981' },
        { category: 'Doprava', amount: 6000, percentage: 18, icon: '🚗', color: '#F59E0B' },
        { category: 'Zábava', amount: 6000, percentage: 19, icon: '🎬', color: '#EF4444' },
      ],
      settlementSummary: balances[1] ? [{
        fromUserId: balances[1].userId,
        fromUserName: balances[1].userName,
        toUserId: balances[0].userId,
        toUserName: balances[0].userName,
        amount: 2500,
      }] : [],
      recentActivity: [],
    };
  }, [currentHousehold]);

  return useMemo(
    () => ({
      households: USE_MOCK_MODE ? mockHouseholds : (householdsQuery.data || []),
      currentHousehold,
      dashboard: USE_MOCK_MODE ? mockDashboard : (dashboardQuery.data || null),
      policies: USE_MOCK_MODE ? mockPolicies : (policiesQuery.data || []),
      settlements: USE_MOCK_MODE ? mockSettlements : (settlementsQuery.data || []),
      isInHousehold,
      isOwner,
      selectedHouseholdId,
      setSelectedHouseholdId,
      createHousehold,
      inviteMember,
      acceptInvitation,
      createPolicy,
      setDefaultSplit,
      setCategoryBudget,
      shareTransaction,
      createSettlement,
      getVisibilityForTransaction,
      isLoading: USE_MOCK_MODE ? mockIsLoading : (
        householdsQuery.isLoading ||
        householdQuery.isLoading ||
        dashboardQuery.isLoading
      ),
      isCreating: USE_MOCK_MODE ? mockIsLoading : createMutation.isPending,
      isInviting: USE_MOCK_MODE ? mockIsLoading : inviteMutation.isPending,
      isSharingTransaction: shareTransactionMutation.isPending,
      isCreatingSettlement: createSettlementMutation.isPending,
      error,
      isAuthenticated,
      refetch,
    }),
    [
      mockHouseholds,
      mockPolicies,
      mockSettlements,
      mockIsLoading,
      mockDashboard,
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
      setCategoryBudget,
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
