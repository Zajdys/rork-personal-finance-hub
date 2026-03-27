import { z } from 'zod';
import { protectedProcedure } from '@/backend/trpc/create-context';
import { inviteToHousehold, getHouseholdById, addAuditLog } from '../db';

export const inviteToHouseholdProcedure = protectedProcedure
  .input(
    z.object({
      householdId: z.string(),
      inviteeEmail: z.string().email(),
      role: z.enum(['PARTNER', 'SUMMARY_VIEWER', 'READ_ONLY']).default('PARTNER'),
    })
  )
  .mutation(async ({ input, ctx }) => {
    const { householdId, inviteeEmail, role } = input;
    const userId = ctx.userId;
    const userName = 'User';

    const household = await getHouseholdById(householdId);
    
    const member = household.members.find(m => m.userId === userId);
    if (!member || (member.role !== 'OWNER' && member.role !== 'PARTNER')) {
      throw new Error('Not authorized to invite members');
    }

    const invitation = await inviteToHousehold(
      householdId,
      userId,
      userName,
      inviteeEmail,
      role
    );

    await addAuditLog(
      householdId,
      userId,
      userName,
      'INVITE_MEMBER',
      'MEMBER',
      invitation.id,
      { inviteeEmail, role }
    );
    
    console.log('Invitation sent:', invitation.id);
    
    return invitation;
  });
