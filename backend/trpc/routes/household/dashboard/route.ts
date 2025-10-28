import { z } from 'zod';
import { protectedProcedure } from '@/backend/trpc/create-context';
import { getHouseholdById, getSettlements } from '../db';
import type { HouseholdDashboard, HouseholdBalance } from '@/types/household';

export const getHouseholdDashboardProcedure = protectedProcedure
  .input(
    z.object({
      householdId: z.string(),
    })
  )
  .query(async ({ input, ctx }) => {
    const { householdId } = input;
    const userId = ctx.userId;

    const household = await getHouseholdById(householdId);
    
    const isMember = household.members.some(m => m.userId === userId && m.joinStatus === 'ACTIVE');
    if (!isMember) {
      throw new Error('Not authorized to view dashboard');
    }

    const settlements = await getSettlements(householdId);
    
    const balances: HouseholdBalance[] = household.members
      .filter(m => m.joinStatus === 'ACTIVE')
      .map(member => {
        const memberSettlements = settlements.filter(
          s => s.fromUserId === member.userId || s.toUserId === member.userId
        );
        
        const totalPaid = memberSettlements
          .filter(s => s.fromUserId === member.userId)
          .reduce((sum, s) => sum + s.amount.amount, 0);
        
        const totalReceived = memberSettlements
          .filter(s => s.toUserId === member.userId)
          .reduce((sum, s) => sum + s.amount.amount, 0);
        
        return {
          userId: member.userId,
          userName: member.userName,
          totalShared: 0,
          totalPaid: totalPaid - totalReceived,
          balance: totalPaid - totalReceived,
        };
      });

    const settlementSummary = calculateSettlementSummary(balances);

    const dashboard: HouseholdDashboard = {
      household,
      totalSharedIncome: 0,
      totalSharedExpenses: 0,
      sharedBalance: 0,
      balances,
      categoryBreakdown: [],
      settlementSummary,
      recentActivity: [],
    };
    
    return dashboard;
  });

function calculateSettlementSummary(
  balances: HouseholdBalance[]
): {
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  toUserName: string;
  amount: number;
}[] {
  const debtors = balances.filter(b => b.balance < 0).sort((a, b) => a.balance - b.balance);
  const creditors = balances.filter(b => b.balance > 0).sort((a, b) => b.balance - a.balance);
  
  const summary: {
    fromUserId: string;
    fromUserName: string;
    toUserId: string;
    toUserName: string;
    amount: number;
  }[] = [];
  
  let i = 0;
  let j = 0;
  
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    
    const debtAmount = Math.abs(debtor.balance);
    const creditAmount = creditor.balance;
    
    const transferAmount = Math.min(debtAmount, creditAmount);
    
    summary.push({
      fromUserId: debtor.userId,
      fromUserName: debtor.userName,
      toUserId: creditor.userId,
      toUserName: creditor.userName,
      amount: transferAmount,
    });
    
    debtor.balance += transferAmount;
    creditor.balance -= transferAmount;
    
    if (Math.abs(debtor.balance) < 0.01) i++;
    if (Math.abs(creditor.balance) < 0.01) j++;
  }
  
  return summary;
}
