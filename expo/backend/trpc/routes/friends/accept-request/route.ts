import { z } from 'zod';
import { publicProcedure } from '../../../create-context';
import { getDB } from '../../../utils/db';

export const acceptFriendRequestProcedure = publicProcedure
  .input(z.object({
    userId: z.string(),
    friendId: z.string(),
  }))
  .mutation(async ({ input }) => {
    const db = getDB();
    
    await db.run(
      `update friendships set status = 'accepted', updated_at = datetime('now') 
       where user_id = ? and friend_id = ?`,
      [input.friendId, input.userId]
    );
    
    await db.run(
      `insert or ignore into friendships (user_id, friend_id, status) values (?, ?, 'accepted')`,
      [input.userId, input.friendId]
    );
    
    return { success: true };
  });
