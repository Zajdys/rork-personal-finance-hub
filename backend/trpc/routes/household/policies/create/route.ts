import { z } from 'zod';
import { protectedProcedure } from '@/backend/trpc/create-context';
import { createSharedPolicy, getHouseholdById, addAuditLog } from '../../db';

export const createPolicyProcedure = protectedProcedure
  .input(
    z.object({
      householdId: z.string(),
      scopeType: z.enum(['CATEGORY', 'TAG']),
      scopeId: z.string(),
      visibility: z.enum(['PRIVATE', 'SHARED', 'SUMMARY_ONLY']),
      priority: z.number().default(0),
    })
  )
  .mutation(async ({ input, ctx }) => {
    const { householdId, scopeType, scopeId, visibility, priority } = input;
    const userId = ctx.userId;
    const userName = 'User';

    const household = await getHouseholdById(householdId);
    
    const member = household.members.find(m => m.userId === userId);
    if (!member || member.role === 'READ_ONLY' || member.role === 'SUMMARY_VIEWER') {
      throw new Error('Not authorized to create policies');
    }

    const policy = await createSharedPolicy(
      householdId,
      scopeType,
      scopeId,
      visibility,
      priority
    );

    await addAuditLog(
      householdId,
      userId,
      userName,
      'CREATE_POLICY',
      'POLICY',
      policy.id,
      { scopeType, scopeId, visibility, priority }
    );
    
    console.log('Policy created:', policy.id);
    
    return policy;
  });
