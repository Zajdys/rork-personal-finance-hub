import { z } from 'zod';
import { publicProcedure } from '../../../create-context';

export const disconnectBankProcedure = publicProcedure
  .input(
    z.object({
      accountId: z.string(),
    })
  )
  .mutation(async ({ input }) => {
    console.log('Disconnecting bank account:', input.accountId);
    
    await new Promise(resolve => setTimeout(resolve, 500));

    return {
      success: true,
      message: 'Bank account disconnected successfully',
    };
  });
