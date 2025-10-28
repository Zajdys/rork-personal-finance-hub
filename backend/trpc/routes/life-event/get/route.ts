import { publicProcedure } from '../../../create-context';
import { z } from 'zod';
import { LifeEventMode } from '@/types/life-event';

export const getLifeEventProcedure = publicProcedure
  .input(
    z.object({
      userId: z.string(),
    })
  )
  .query(async ({ input }) => {
    console.log('[getLifeEvent] Getting life event mode for user:', input.userId);
    
    return {
      activeMode: LifeEventMode.NONE as LifeEventMode,
      activatedAt: new Date(),
      modeHistory: [],
    };
  });
