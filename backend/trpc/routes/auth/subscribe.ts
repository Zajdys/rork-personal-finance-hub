import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../../create-context';

export default createTRPCRouter({
  mutate: protectedProcedure
    .input(z.object({ plan: z.string().default('pro') }).optional())
    .mutation(async ({ ctx }) => {
      const { db, userId } = ctx;
      const expire = expiresInDays(30);
      await db.run(
        db.dialect === 'postgres'
          ? "insert into subscriptions (user_id, active, expires_at) values ($1, 1, $2) on conflict (user_id) do update set active = 1, expires_at = $2"
          : "insert into subscriptions (user_id, active, expires_at) values ($1, 1, $2) on conflict (user_id) do update set active = 1, expires_at = $2",
        [userId, expire]
      );
      return { active: true, expiresAt: expire };
    })
});

function expiresInDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}
