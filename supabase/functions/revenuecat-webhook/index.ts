/**
 * RevenueCat → Supabase: nastaví public.users.premium_until.
 *
 * Deploy (až po schválení migrace):
 *   supabase functions deploy revenuecat-webhook --no-verify-jwt
 *
 * Env:
 *   REVENUECAT_WEBHOOK_SECRET — Authorization Bearer z RC dashboardu
 *   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
 *
 * app_user_id = Supabase auth user UUID (Purchases.logIn(userId) po přihlášení).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const SET_UNTIL_TYPES = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'PRODUCT_CHANGE',
  'UNCANCELLATION',
  'SUBSCRIPTION_EXTENDED',
  'TEMPORARY_ENTITLEMENT_GRANT',
]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Timing-safe porovnání stringů stejné délky (constant-time). */
function timingSafeEqualString(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const bufA = enc.encode(a);
  const bufB = enc.encode(b);
  if (bufA.length !== bufB.length) {
    // Stejná délka pro porovnání — dummy loop, ať délka neuniká skrz early return timing
    let diff = bufA.length ^ bufB.length;
    const n = Math.max(bufA.length, bufB.length);
    for (let i = 0; i < n; i++) {
      diff |= (bufA[i] ?? 0) ^ (bufB[i] ?? 0);
    }
    return false;
  }
  let diff = 0;
  for (let i = 0; i < bufA.length; i++) {
    diff |= bufA[i]! ^ bufB[i]!;
  }
  return diff === 0;
}

function authorize(req: Request): boolean {
  const secret = Deno.env.get('REVENUECAT_WEBHOOK_SECRET') ?? '';
  if (!secret) return false;
  const header = req.headers.get('Authorization') ?? '';
  const expected = `Bearer ${secret}`;
  return timingSafeEqualString(header, expected);
}

function expirationIsoFromEvent(event: Record<string, unknown>): string | null {
  const expMs = event.expiration_at_ms;
  if (typeof expMs === 'number' && Number.isFinite(expMs) && expMs > 0) {
    return new Date(expMs).toISOString();
  }
  if (typeof expMs === 'string' && expMs.trim()) {
    const n = Number(expMs);
    if (Number.isFinite(n) && n > 0) return new Date(n).toISOString();
    const t = Date.parse(expMs);
    if (Number.isFinite(t)) return new Date(t).toISOString();
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  if (!authorize(req)) {
    return new Response('Unauthorized', { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const root = (body ?? {}) as Record<string, unknown>;
  const event = (root.event ?? root) as Record<string, unknown>;
  const type = String(event.type ?? '').toUpperCase();
  const appUserId = String(event.app_user_id ?? '').trim();

  if (!appUserId || appUserId.startsWith('$RCAnonymousID')) {
    return new Response(JSON.stringify({ ok: true, skipped: 'anonymous' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!UUID_RE.test(appUserId)) {
    return new Response(JSON.stringify({ ok: true, skipped: 'not_uuid' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // CANCELLATION: předplatné běží do konce období — neměnit premium_until
  if (type === 'CANCELLATION') {
    return new Response(JSON.stringify({ ok: true, skipped: 'cancellation' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let premiumUntil: string | null | undefined;
  if (type === 'EXPIRATION') {
    premiumUntil = null;
  } else if (SET_UNTIL_TYPES.has(type)) {
    premiumUntil = expirationIsoFromEvent(event);
    if (!premiumUntil) {
      console.warn('[rc-webhook] missing expiration_at_ms', { type, appUserId });
      return new Response(JSON.stringify({ ok: false, error: 'missing_expiration' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } else {
    // Ostatní typy (TEST, BILLING_ISSUE, …) — no-op
    return new Response(JSON.stringify({ ok: true, skipped: 'unhandled_type', type }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceKey) {
    console.error('[rc-webhook] missing supabase env');
    return new Response('Server misconfigured', { status: 500 });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error, count } = await admin
    .from('users')
    .update({ premium_until: premiumUntil }, { count: 'exact' })
    .eq('id', appUserId);

  if (error) {
    console.error('[rc-webhook] update failed', error.message, { appUserId, type, premiumUntil });
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (count === 0) {
    console.warn('[rc-webhook] no user row', { appUserId, type });
    // 200 — RC nemá opakovat; uživatel možná ještě nemá řádek v public.users
    return new Response(JSON.stringify({ ok: true, skipped: 'user_not_found' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  console.log('[rc-webhook] ok', { appUserId, type, premiumUntil });
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
