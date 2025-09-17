import { z } from 'zod';
import { createTRPCRouter, publicProcedure } from '../../create-context';
import { randomBytes, createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';

export default createTRPCRouter({
  mutate: publicProcedure
    .input(z.object({ email: z.string().email(), password: z.string().min(6) }))
    .mutation(async ({ ctx, input }) => {
      const { db } = ctx;
      const existing = await db.get<{ id: string }>("select id from users where email = $1", [input.email]);
      if (existing) throw new Error('Email already registered');
      const password_hash = await bcrypt.hash(input.password, 10);
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      if (db.dialect === 'postgres') {
        await db.run("insert into users (email, password_hash) values ($1, $2)", [input.email, password_hash]);
      } else {
        await db.run("insert into users (id, email, password_hash) values ($1, $2, $3)", [id, input.email, password_hash]);
      }
      const token = createSessionToken();
      await db.run(
        db.dialect === 'postgres'
          ? "insert into sessions (token, user_id, expires_at) values ($1, (select id from users where email = $2), $3)"
          : "insert into sessions (token, user_id, expires_at) values ($1, (select id from users where email = $2), $3)",
        [token, input.email, expiresInDays(30)]
      );
      await db.run(
        db.dialect === 'postgres'
          ? "insert into subscriptions (user_id, active, expires_at) values ((select id from users where email = $1), 0, null) on conflict (user_id) do nothing"
          : "insert or ignore into subscriptions (user_id, active, expires_at) values ((select id from users where email = $1), 0, null)",
        [input.email]
      );
      return { token };
    })
});

function createSessionToken() {
  return randomBytes(24).toString('hex');
}

function expiresInDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}
