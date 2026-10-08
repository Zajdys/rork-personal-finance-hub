/**
 * Cron entry: sync all active bank_connections (respects 4×/24h quota).
 * Requires full service env (service_role + Kontomatik key).
 */
import { loadServiceEnv } from '../src/env';
import { createServiceClient } from '../src/supabase';
import { makeKontomatik, handleSync } from '../src/routes/handlers';

const env = loadServiceEnv();
const service = createServiceClient(env);
const kt = makeKontomatik(env);

const { data: conns, error } = await service
  .from('bank_connections')
  .select('id, user_id')
  .eq('status', 'active');

if (error) {
  console.error('[daily-sync] list failed', error.message);
  process.exit(1);
}

let ok = 0;
let fail = 0;
for (const c of conns ?? []) {
  const fakeUser = { id: c.user_id } as { id: string };
  const res = await handleSync({
    env,
    service,
    user: fakeUser as import('@supabase/supabase-js').User,
    kt,
    body: { connectionId: c.id },
  });
  if (res.ok) {
    ok += 1;
    console.log('[daily-sync] ok', c.id);
  } else {
    fail += 1;
    const body = await res.text();
    console.warn('[daily-sync] fail', c.id, res.status, body.slice(0, 200));
  }
}

console.log(`[daily-sync] done ok=${ok} fail=${fail}`);
process.exit(fail > 0 && ok === 0 ? 1 : 0);
