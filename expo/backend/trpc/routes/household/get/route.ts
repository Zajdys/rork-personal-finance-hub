import { z } from 'zod';
import { protectedProcedure } from '@/backend/trpc/create-context';
import { getHouseholdById, getUserHouseholds } from '../db';

export const getHouseholdProcedure = protectedProcedure
  .input(
    z.object({
      householdId: z.string().optional(),
    })
  )
  .query(async ({ input, ctx }) => {
    const { householdId } = input;
    const userId = ctx.userId;

    if (householdId) {
      const household = await getHouseholdById(householdId);
      
      const isMember = household.members.some(m => m.userId === userId && m.joinStatus === 'ACTIVE');
      if (!isMember) {
        throw new Error('Not authorized to view this household');
      }
      
      return household;
    } else {
      const households = await getUserHouseholds(userId);
      return households[0] || null;
    }
  });
