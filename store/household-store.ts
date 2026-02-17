import createContextHook from '@nkzw/create-context-hook';
import { useState, useCallback, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { useFinanceStore } from './finance-store';
import type {
  Household,
  SharedPolicy,
  TransactionShare,
  Settlement,
  Visibility,
  SplitRule,
  HouseholdDashboard,
  CategoryBudget,
  CategoryBalance,
} from '@/types/household';

const USE_MOCK_MODE = true;

export const [HouseholdProvider, useHousehold] = createContextHook(() => {
  const [selectedHouseholdId, setSelectedHouseholdId] = useState<string | null>('test_household_1');
  const [isAuthenticated] = useState<boolean>(true);
  const [error] = useState<string | null>(null);
  
  const [mockHouseholds, setMockHouseholds] = useState<Household[]>(() => {
    const testHousehold: Household = {
      id: 'test_household_1',
      name: 'Testovací domácnost',
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
        {
          userId: 'mock_user_2',
          userName: 'Partner',
          userEmail: 'partner@example.com',
          role: 'PARTNER',
          joinStatus: 'ACTIVE',
          joinedAt: new Date(),
          invitedAt: new Date(),
        },
      ],
      defaultSplits: {
        'Nájem a bydlení': {
          type: 'WEIGHTED',
          weights: {
            'mock_user_1': 0.5,
            'mock_user_2': 0.5,
          },
        },
        'Bydlení': {
          type: 'WEIGHTED',
          weights: {
            'mock_user_1': 0.5,
            'mock_user_2': 0.5,
          },
        },
      },
      categoryBudgets: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    return [testHousehold];
  });
  const [mockPolicies, setMockPolicies] = useState<SharedPolicy[]>(() => [
    {
      id: 'policy_1',
      householdId: 'test_household_1',
      scope: { type: 'CATEGORY', id: 'Nájem a bydlení' },
      visibility: 'SHARED',
      priority: 10,
    },
    {
      id: 'policy_2',
      householdId: 'test_household_1',
      scope: { type: 'CATEGORY', id: 'Bydlení' },
      visibility: 'SHARED',
      priority: 10,
    },
    {
      id: 'policy_3',
      householdId: 'test_household_1',
      scope: { type: 'CATEGORY', id: 'Jídlo a nápoje' },
      visibility: 'SHARED',
      priority: 5,
    },
  ]);
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

  const { transactions } = useFinanceStore();

  const calculateDashboard = useCallback((household: Household): HouseholdDashboard | null => {
    if (!household) return null;

    const activeMembers = household.members.filter(m => m.joinStatus === 'ACTIVE');
    if (activeMembers.length === 0) return null;

    const currentMonth = new Date().toISOString().slice(0, 7);
    
    const manualTransactions = transactions.filter(t => {
      const txMonth = new Date(t.date).toISOString().slice(0, 7);
      return txMonth === currentMonth;
    });

    const allTransactions = [...manualTransactions];

    const sharedExpenses = allTransactions.filter(t => t.type === 'expense');
    const sharedIncome = allTransactions.filter(t => t.type === 'income');

    const totalSharedExpenses = sharedExpenses.reduce((sum, t) => sum + t.amount, 0);
    const totalSharedIncome = sharedIncome.reduce((sum, t) => sum + t.amount, 0);

    const categoryMap: Record<string, { amount: number; byUser: Record<string, number> }> = {};

    sharedExpenses.forEach(tx => {
      const category = tx.category || 'Ostatní';
      if (!categoryMap[category]) {
        categoryMap[category] = { amount: 0, byUser: {} };
      }
      categoryMap[category].amount += tx.amount;

      const userId = activeMembers[0].userId;
      if (!categoryMap[category].byUser[userId]) {
        categoryMap[category].byUser[userId] = 0;
      }
      categoryMap[category].byUser[userId] += tx.amount;
    });

    const categoryBalances: CategoryBalance[] = Object.entries(categoryMap).map(([category, data]) => {
      const splitRule = household.defaultSplits[category] || { type: 'EQUAL' };
      const memberBalances: Record<string, { paid: number; shouldPay: number; balance: number }> = {};

      activeMembers.forEach(member => {
        const paid = data.byUser[member.userId] || 0;
        let shouldPay = 0;

        if (splitRule.type === 'EQUAL') {
          shouldPay = data.amount / activeMembers.length;
        } else if (splitRule.type === 'WEIGHTED' && splitRule.weights) {
          const weight = splitRule.weights[member.userId] || 0;
          shouldPay = data.amount * weight;
        }

        memberBalances[member.userId] = {
          paid,
          shouldPay,
          balance: paid - shouldPay,
        };
      });

      return {
        category,
        totalAmount: data.amount,
        memberBalances,
        splitRule,
      };
    });

    const balances = activeMembers.map(member => {
      const totalPaid = categoryBalances.reduce(
        (sum, cat) => sum + (cat.memberBalances[member.userId]?.paid || 0),
        0
      );
      const totalShouldPay = categoryBalances.reduce(
        (sum, cat) => sum + (cat.memberBalances[member.userId]?.shouldPay || 0),
        0
      );
      const balance = totalPaid - totalShouldPay;

      return {
        userId: member.userId,
        userName: member.userName,
        totalShared: totalShouldPay,
        totalPaid,
        balance,
      };
    });

    const categoryBreakdown = Object.entries(categoryMap)
      .map(([category, data]) => ({
        category,
        amount: data.amount,
        percentage: totalSharedExpenses > 0 ? Math.round((data.amount / totalSharedExpenses) * 100) : 0,
        icon: getCategoryIcon(category),
        color: getCategoryColor(category),
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);

    const settlementSummary = [];
    const positiveBalances = balances.filter(b => b.balance > 0).sort((a, b) => b.balance - a.balance);
    const negativeBalances = balances.filter(b => b.balance < 0).sort((a, b) => a.balance - b.balance);

    for (let i = 0; i < Math.min(positiveBalances.length, negativeBalances.length); i++) {
      const creditor = positiveBalances[i];
      const debtor = negativeBalances[i];
      const amount = Math.min(creditor.balance, Math.abs(debtor.balance));

      if (amount > 1) {
        settlementSummary.push({
          fromUserId: debtor.userId,
          fromUserName: debtor.userName,
          toUserId: creditor.userId,
          toUserName: creditor.userName,
          amount,
        });
      }
    }

    return {
      household,
      totalSharedIncome,
      totalSharedExpenses,
      sharedBalance: totalSharedIncome - totalSharedExpenses,
      balances,
      categoryBreakdown,
      categoryBalances,
      settlementSummary,
      recentActivity: [],
    };
  }, [transactions]);

  const mockDashboard: HouseholdDashboard | null = useMemo(() => {
    if (!USE_MOCK_MODE || !currentHousehold) return null;
    return calculateDashboard(currentHousehold);
  }, [currentHousehold, calculateDashboard]);

  function getCategoryIcon(category: string): string {
    const icons: Record<string, string> = {
      'Jídlo a nápoje': '🍽️',
      'Nájem a bydlení': '🏠',
      'Bydlení': '🏠',
      'Doprava': '🚗',
      'Zábava': '🎬',
      'Zdraví': '⚕️',
      'Vzdělání': '📚',
      'Nákupy': '🛍️',
      'Oblečení': '👕',
      'Služby': '🔧',
    };
    return icons[category] || '📦';
  }

  function getCategoryColor(category: string): string {
    const colors: Record<string, string> = {
      'Jídlo a nápoje': '#EF4444',
      'Nájem a bydlení': '#8B5CF6',
      'Bydlení': '#8B5CF6',
      'Doprava': '#10B981',
      'Zábava': '#EC4899',
      'Zdraví': '#06B6D4',
      'Vzdělání': '#6366F1',
      'Nákupy': '#F97316',
      'Oblečení': '#F59E0B',
      'Služby': '#84CC16',
    };
    return colors[category] || '#6B7280';
  }

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
