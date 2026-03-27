import { z } from 'zod';
import { publicProcedure } from '../../../create-context';
import { getDB } from '../../../utils/db';

export const sendFriendRequestProcedure = publicProcedure
  .input(z.object({
    userId: z.string(),
    friendId: z.string(),
  }))
  .mutation(async ({ input }) => {
    const db = getDB();
    
    const existing = await db.get(
      `select * from friendships where user_id = ? and friend_id = ?`,
      [input.userId, input.friendId]
    );
    
    if (existing) {
      throw new Error('Friend request already exists');
    }
    
    await db.run(
      `insert into friendships (user_id, friend_id, status) values (?, ?, 'pending')`,
      [input.userId, input.friendId]
    );
    
    return { success: true };
  });
