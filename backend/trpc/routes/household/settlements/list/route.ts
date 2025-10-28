import { z } from 'zod';
import { protectedProcedure } from '@/backend/trpc/create-context';
import { getSettlements, getHouseholdById } from '../../db';

export const listSettlementsProcedure = protectedProcedure
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
      throw new Error('Not authorized to view settlements');
    }

    const settlements = await getSettlements(householdId);
    return settlements;
  });
