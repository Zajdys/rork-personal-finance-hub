import { z } from 'zod';
import { protectedProcedure } from '@/backend/trpc/create-context';
import { setDefaultSplit, getHouseholdById, addAuditLog } from '../../db';

export const setDefaultSplitProcedure = protectedProcedure
  .input(
    z.object({
      householdId: z.string(),
      categoryId: z.string(),
      splitRule: z.object({
        type: z.enum(['EQUAL', 'WEIGHTED', 'CUSTOM_PER_TX']),
        weights: z.record(z.string(), z.number()).optional(),
      }),
    })
  )
  .mutation(async ({ input, ctx }) => {
    const { householdId, categoryId, splitRule } = input;
    const userId = ctx.userId;
    const userName = 'User';

    const household = await getHouseholdById(householdId);
    
    const member = household.members.find(m => m.userId === userId);
    if (!member || member.role === 'READ_ONLY' || member.role === 'SUMMARY_VIEWER') {
      throw new Error('Not authorized to set split rules');
    }

    await setDefaultSplit(householdId, categoryId, splitRule);

    await addAuditLog(
      householdId,
      userId,
      userName,
      'SET_DEFAULT_SPLIT',
      'SPLIT_RULE',
      categoryId,
      { splitRule }
    );
    
    console.log('Default split set for category:', categoryId);
    
    return { success: true };
  });
