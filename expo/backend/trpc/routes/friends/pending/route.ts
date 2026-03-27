import { z } from 'zod';
import { publicProcedure } from '../../../create-context';
import { getDB } from '../../../utils/db';

export const listPendingRequestsProcedure = publicProcedure
  .input(z.object({
    userId: z.string(),
  }))
  .query(async ({ input }) => {
    const db = getDB();
    
    const incoming = await db.all<{
      id: string;
      email: string;
      username: string | null;
      display_name: string | null;
      created_at: string;
    }>(
      `select u.id, u.email, u.username, u.display_name, f.created_at
       from friendships f
       join users u on u.id = f.user_id
       where f.friend_id = ? and f.status = 'pending'`,
      [input.userId]
    );
    
    const outgoing = await db.all<{
      id: string;
      email: string;
      username: string | null;
      display_name: string | null;
      created_at: string;
    }>(
      `select u.id, u.email, u.username, u.display_name, f.created_at
       from friendships f
       join users u on u.id = f.friend_id
       where f.user_id = ? and f.status = 'pending'`,
      [input.userId]
    );
    
    return {
      incoming: incoming.map(user => ({
        id: user.id,
        email: user.email,
        username: user.username || user.email.split('@')[0],
        displayName: user.display_name || user.username || user.email.split('@')[0],
        requestedAt: user.created_at,
      })),
      outgoing: outgoing.map(user => ({
        id: user.id,
        email: user.email,
        username: user.username || user.email.split('@')[0],
        displayName: user.display_name || user.username || user.email.split('@')[0],
        requestedAt: user.created_at,
      })),
    };
  });
