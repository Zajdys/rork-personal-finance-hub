import { z } from 'zod';
import { protectedProcedure } from '@/backend/trpc/create-context';
import { createSettlement, getHouseholdById, addAuditLog } from '../../db';

export const createSettlementProcedure = protectedProcedure
  .input(
    z.object({
      householdId: z.string(),
      toUserId: z.string(),
      amount: z.number().positive(),
      currency: z.string().default('CZK'),
      method: z.enum(['BANK', 'REVOLUT', 'CASH', 'OTHER']),
      note: z.string().optional(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    const { householdId, toUserId, amount, currency, method, note } = input;
    const userId = ctx.userId;
    const userName = 'User';

    const household = await getHouseholdById(householdId);
    
    const fromMember = household.members.find(m => m.userId === userId && m.joinStatus === 'ACTIVE');
    const toMember = household.members.find(m => m.userId === toUserId && m.joinStatus === 'ACTIVE');
    
    if (!fromMember || !toMember) {
      throw new Error('Invalid settlement members');
    }

    const settlement = await createSettlement(
      householdId,
      userId,
      fromMember.userName,
      toUserId,
      toMember.userName,
      amount,
      currency,
      method,
      note
    );

    await addAuditLog(
      householdId,
      userId,
      userName,
      'CREATE_SETTLEMENT',
      'SETTLEMENT',
      settlement.id,
      { toUserId, amount, currency, method }
    );
    
    console.log('Settlement created:', settlement.id);
    
    return settlement;
  });
