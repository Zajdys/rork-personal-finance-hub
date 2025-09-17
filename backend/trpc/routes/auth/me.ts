import { createTRPCRouter, protectedProcedure } from '../../create-context';

export default createTRPCRouter({
  query: protectedProcedure.query(async ({ ctx }) => {
    const { db, userId } = ctx;
    const row = await db.get<{ email: string }>(
      db.dialect === 'postgres'
        ? "select email from users where id = $1"
        : "select email from users where id = $1",
      [userId]
    );
    const sub = await db.get<{ active: number | boolean; expires_at: string | null }>(
      "select active, expires_at from subscriptions where user_id = $1",
      [userId]
    );
    const active = typeof sub?.active === 'number' ? sub?.active === 1 : Boolean(sub?.active);
    return { email: row?.email ?? '', subscription: { active, expiresAt: sub?.expires_at ?? null } };
  })
});
