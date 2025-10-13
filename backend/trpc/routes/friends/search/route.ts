import { z } from 'zod';
import { publicProcedure } from '../../../create-context';
import { getDB } from '../../../utils/db';

export const searchUsersProcedure = publicProcedure
  .input(z.object({
    query: z.string().min(1),
    currentUserId: z.string(),
  }))
  .query(async ({ input }) => {
    const db = getDB();
    
    const users = await db.all<{
      id: string;
      email: string;
      username: string | null;
      display_name: string | null;
    }>(
      `select id, email, username, display_name 
       from users 
       where (username like ? or email like ? or display_name like ?) 
       and id != ?
       limit 20`,
      [
        `%${input.query}%`,
        `%${input.query}%`,
        `%${input.query}%`,
        input.currentUserId,
      ]
    );
    
    return users.map(user => ({
      id: user.id,
      email: user.email,
      username: user.username || user.email.split('@')[0],
      displayName: user.display_name || user.username || user.email.split('@')[0],
    }));
  });
