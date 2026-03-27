import { z } from 'zod';
import { publicProcedure } from '../../../create-context';
import { getDB } from '../../../utils/db';

export const listFriendsProcedure = publicProcedure
  .input(z.object({
    userId: z.string(),
  }))
  .query(async ({ input }) => {
    const db = getDB();
    
    const friends = await db.all<{
      id: string;
      email: string;
      username: string | null;
      display_name: string | null;
      status: string;
      created_at: string;
    }>(
      `select u.id, u.email, u.username, u.display_name, f.status, f.created_at
       from friendships f
       join users u on (
         case 
           when f.user_id = ? then u.id = f.friend_id
           else u.id = f.user_id
         end
       )
       where (f.user_id = ? or f.friend_id = ?)
       and f.status = 'accepted'`,
      [input.userId, input.userId, input.userId]
    );
    
    return friends.map(friend => ({
      id: friend.id,
      email: friend.email,
      username: friend.username || friend.email.split('@')[0],
      displayName: friend.display_name || friend.username || friend.email.split('@')[0],
      status: friend.status,
      friendsSince: friend.created_at,
    }));
  });
