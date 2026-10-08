import { timingSafeEqual } from 'crypto';
import type { SupabaseClient, User } from '@supabase/supabase-js';

export async function requireUser(
  anon: SupabaseClient,
  req: Request,
): Promise<{ user: User } | Response> {
  const auth = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!auth?.toLowerCase().startsWith('bearer ')) {
    return Response.json({ error: 'missing_bearer' }, { status: 401 });
  }
  const jwt = auth.slice(7).trim();
  if (!jwt) return Response.json({ error: 'missing_bearer' }, { status: 401 });

  const { data, error } = await anon.auth.getUser(jwt);
  if (error || !data.user) {
    return Response.json({ error: 'invalid_token' }, { status: 401 });
  }
  return { user: data.user };
}

function secretsEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function requireInternalSecret(
  req: Request,
  expected: string,
): true | Response {
  if (!expected) {
    return Response.json({ error: 'internal_disabled' }, { status: 503 });
  }
  const got = req.headers.get('x-internal-secret') || '';
  if (!secretsEqual(got, expected)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }
  return true;
}
