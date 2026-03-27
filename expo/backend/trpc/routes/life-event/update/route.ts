import { publicProcedure } from '../../../create-context';
import { z } from 'zod';
import { LifeEventMode } from '@/types/life-event';

export const updateLifeEventProcedure = publicProcedure
  .input(
    z.object({
      userId: z.string(),
      mode: z.nativeEnum(LifeEventMode),
    })
  )
  .mutation(async ({ input }) => {
    console.log('[updateLifeEvent] Updating life event mode for user:', input.userId, 'to:', input.mode);
    
    return {
      success: true,
      activeMode: input.mode,
      activatedAt: new Date(),
      message: `Režim byl úspěšně změněn na: ${input.mode}`,
    };
  });
