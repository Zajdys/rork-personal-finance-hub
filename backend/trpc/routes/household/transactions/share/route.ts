import { z } from 'zod';
import { protectedProcedure } from '@/backend/trpc/create-context';
import { createTransactionShare, getHouseholdById, addAuditLog } from '../../db';

export const shareTransactionProcedure = protectedProcedure
  .input(
    z.object({
      transactionId: z.string(),
      householdId: z.string(),
      visibility: z.enum(['PRIVATE', 'SHARED', 'SUMMARY_ONLY']),
      split: z.record(z.string(), z.number()),
    })
  )
  .mutation(async ({ input, ctx }) => {
    const { transactionId, householdId, visibility, split } = input;
    const userId = ctx.userId;
    const userName = 'User';

    const household = await getHouseholdById(householdId);
    
    const isMember = household.members.some(m => m.userId === userId && m.joinStatus === 'ACTIVE');
    if (!isMember) {
      throw new Error('Not authorized to share transactions');
    }

    const transactionShare = await createTransactionShare(
      transactionId,
      householdId,
      visibility,
      split,
      userId
    );

    await addAuditLog(
      householdId,
      userId,
      userName,
      'SHARE_TRANSACTION',
      'TRANSACTION',
      transactionId,
      { visibility, split }
    );
    
    console.log('Transaction shared:', transactionId);
    
    return transactionShare;
  });
