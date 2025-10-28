import { protectedProcedure } from '@/backend/trpc/create-context';
import { getUserHouseholds } from '../db';

export const listHouseholdsProcedure = protectedProcedure
  .query(async ({ ctx }) => {
    const userId = ctx.userId;
    const households = await getUserHouseholds(userId);
    return households;
  });
