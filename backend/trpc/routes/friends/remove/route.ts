import { z } from 'zod';
import { publicProcedure } from '../../../create-context';
import { getDB } from '../../../utils/db';

export const removeFriendProcedure = publicProcedure
  .input(z.object({
    userId: z.string(),
    friendId: z.string(),
  }))
  .mutation(async ({ input }) => {
    const db = getDB();
    
    await db.run(
      `delete from friendships where (user_id = ? and friend_id = ?) or (user_id = ? and friend_id = ?)`,
      [input.userId, input.friendId, input.friendId, input.userId]
    );
    
    return { success: true };
  });
