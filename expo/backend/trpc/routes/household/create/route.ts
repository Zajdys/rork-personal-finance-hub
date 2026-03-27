import { z } from 'zod';
import { protectedProcedure } from '@/backend/trpc/create-context';
import { createHousehold } from '../db';

export const createHouseholdProcedure = protectedProcedure
  .input(
    z.object({
      name: z.string().min(1).max(100),
    })
  )
  .mutation(async ({ input, ctx }) => {
    const { name } = input;
    const userId = ctx.userId;
    const userName = 'User';
    const userEmail = `${userId}@app.local`;

    const household = await createHousehold(name, userId, userName, userEmail);
    
    console.log('Household created:', household.id);
    
    return household;
  });
