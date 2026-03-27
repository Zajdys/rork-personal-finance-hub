import { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { getDB } from "./utils/db";

export const createContext = async (opts: FetchCreateContextFnOptions) => {
  const db = getDB();
  const auth = await resolveAuth(opts.req.headers.get('authorization') ?? '', db);
  return {
    req: opts.req,
    db,
    userId: auth.userId,
    sessionToken: auth.token,
  };
};

async function resolveAuth(authHeader: string, db: ReturnType<typeof getDB>) {
  try {
    const token = (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '').trim();
    if (!token) return { userId: null as string | null, token: '' };
    const session = await db.get<{ user_id: string }>(
      "select user_id from sessions where token = $1 and (expires_at is null or expires_at > now())",
      [token]
    );
    return { userId: session?.user_id ?? null, token };
  } catch (e) {
    return { userId: null as string | null, token: '' };
  }
}

export type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.userId) {
    throw new Error('UNAUTHORIZED');
  }
  return next({ ctx: { ...ctx, userId: ctx.userId } });
});
