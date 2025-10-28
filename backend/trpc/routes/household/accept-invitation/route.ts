import { z } from 'zod';
import { protectedProcedure } from '@/backend/trpc/create-context';
import { acceptInvitation } from '../db';

export const acceptInvitationProcedure = protectedProcedure
  .input(
    z.object({
      invitationId: z.string(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    const { invitationId } = input;
    const userId = ctx.userId;
    const userName = 'User';

    await acceptInvitation(invitationId, userId, userName);
    
    console.log('Invitation accepted:', invitationId);
    
    return { success: true };
  });
