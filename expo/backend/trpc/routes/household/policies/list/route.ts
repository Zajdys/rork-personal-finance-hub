import { z } from 'zod';
import { protectedProcedure } from '@/backend/trpc/create-context';
import { getSharedPolicies, getHouseholdById } from '../../db';

export const listPoliciesProcedure = protectedProcedure
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
      throw new Error('Not authorized to view policies');
    }

    const policies = await getSharedPolicies(householdId);
    return policies;
  });
