import { z } from 'zod';
import { createTRPCRouter, publicProcedure } from '../../create-context';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';

export default createTRPCRouter({
  mutate: publicProcedure
    .input(z.object({ email: z.string().email(), password: z.string().min(6) }))
    .mutation(async ({ ctx, input }) => {
      const { db } = ctx;
      const user = await db.get<{ id: string; password_hash: string }>("select id, password_hash from users where email = $1", [input.email]);
      if (!user) throw new Error('Invalid email or password');
      const ok = await bcrypt.compare(input.password, user.password_hash);
      if (!ok) throw new Error('Invalid email or password');
      const token = randomBytes(24).toString('hex');
      await db.run(
        db.dialect === 'postgres'
          ? "insert into sessions (token, user_id, expires_at) values ($1, $2, $3)"
          : "insert into sessions (token, user_id, expires_at) values ($1, $2, $3)",
        [token, user.id, expiresInDays(30)]
      );
      return { token };
    })
});

function expiresInDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}
