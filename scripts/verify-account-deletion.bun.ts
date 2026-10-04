/**
 * Ověření smazání účtu (service role).
 *
 * Jen kontrola po smazání:
 *   SUPABASE_SERVICE_ROLE_KEY=… VERIFY_USER_ID=<uuid> \
 *   EXPECT_HOUSEHOLD_ID=<uuid> EXPECT_OWNER_ID=<uuid> \
 *   bun scripts/verify-account-deletion.bun.ts
 *
 * Destruktivní tok (přihlášení → Edge delete-account → kontrola):
 *   SUPABASE_URL=… SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=… \
 *   DELETE_TEST_EMAIL=… DELETE_TEST_PASSWORD=… \
 *   bun scripts/verify-account-deletion.bun.ts
 *
 * Volitelně EXPECT_HOUSEHOLD_ID / EXPECT_OWNER_ID — domácnost s dalším členem
 * musí existovat a mít nového created_by.
 */
import { createClient } from '@supabase/supabase-js';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

const SUPABASE_URL =
  process.env.SUPABASE_URL?.trim() ||
  process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ||
  'https://jcwbkydaeeqcbdcxgnad.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY?.trim() || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();

if (!SERVICE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Tabulka + sloupce, které by neměly obsahovat smazané user_id. */
const USER_ID_CHECKS: { table: string; column: string }[] = [
  { table: 'users', column: 'id' },
  { table: 'user_profiles', column: 'user_id' },
  { table: 'transactions', column: 'user_id' },
  { table: 'monthly_subscriptions', column: 'user_id' },
  { table: 'ignored_subscription_suggestions', column: 'user_id' },
  { table: 'loans', column: 'user_id' },
  { table: 'investment_records', column: 'user_id' },
  { table: 'reserve_records', column: 'user_id' },
  { table: 'user_merchant_categories', column: 'user_id' },
  { table: 'save_decisions', column: 'user_id' },
  { table: 'household_members', column: 'user_id' },
  { table: 'households', column: 'created_by' },
  { table: 'custom_categories', column: 'user_id' },
  { table: 'recurring_expense_payments', column: 'user_id' },
  { table: 'recurring_expenses', column: 'added_by' },
  { table: 'recurring_expenses', column: 'created_by' },
  { table: 'recurring_expenses', column: 'payer_user_id' },
  { table: 'shared_expenses', column: 'payer_user_id' },
  { table: 'shared_expenses', column: 'added_by' },
  { table: 'recurring_expense_payment_periods', column: 'payer_user_id' },
  { table: 'investment_portfolios', column: 'owner_user_id' },
  { table: 'household_partner_alerts', column: 'sender_user_id' },
  { table: 'household_partner_alerts', column: 'recipient_user_id' },
  { table: 'household_settlements', column: 'from_user_id' },
  { table: 'household_settlements', column: 'to_user_id' },
  { table: 'household_settlements', column: 'created_by' },
  { table: 'split_groups', column: 'created_by' },
  { table: 'split_group_members', column: 'user_id' },
  { table: 'push_tokens', column: 'user_id' },
];

async function countRows(table: string, column: string, userId: string): Promise<number | 'missing'> {
  const { count, error } = await admin
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq(column, userId);
  if (error) {
    const msg = error.message.toLowerCase();
    if (
      msg.includes('does not exist') ||
      msg.includes('could not find') ||
      msg.includes('schema cache') ||
      error.code === '42P01' ||
      error.code === 'PGRST205'
    ) {
      return 'missing';
    }
    throw new Error(`${table}.${column}: ${error.message}`);
  }
  return count ?? 0;
}

async function verifyNoUserRows(userId: string): Promise<void> {
  console.log(`\n=== Checking no rows for user ${userId} ===`);
  let failures = 0;
  for (const { table, column } of USER_ID_CHECKS) {
    const n = await countRows(table, column, userId);
    if (n === 'missing') {
      console.log(`  skip ${table}.${column} (table/column missing)`);
      continue;
    }
    if (n > 0) {
      console.error(`  FAIL ${table}.${column} → ${n} row(s)`);
      failures += 1;
    } else {
      console.log(`  ok   ${table}.${column}`);
    }
  }
  assert(failures === 0, `${failures} table(s) still reference user`);
}

async function verifyHouseholdTransfer(
  householdId: string,
  expectedOwnerId: string,
  deletedUserId: string,
): Promise<void> {
  console.log(`\n=== Household ${householdId} must survive with new owner ===`);
  const { data, error } = await admin
    .from('households')
    .select('id, name, created_by')
    .eq('id', householdId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  assert(data != null, 'household missing after deletion');
  assert(String(data!.created_by) !== deletedUserId, 'created_by still deleted user');
  assert(
    String(data!.created_by) === expectedOwnerId,
    `created_by expected ${expectedOwnerId}, got ${data!.created_by}`,
  );
  console.log(`  ok household exists, created_by=${data!.created_by}`);
}

async function deleteViaEdge(email: string, password: string): Promise<string> {
  if (!ANON_KEY) {
    throw new Error('Missing SUPABASE_ANON_KEY / EXPO_PUBLIC_SUPABASE_ANON_KEY for delete flow');
  }
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: signIn, error: signErr } = await userClient.auth.signInWithPassword({
    email,
    password,
  });
  if (signErr || !signIn.user || !signIn.session) {
    throw new Error(`signIn failed: ${signErr?.message ?? 'no session'}`);
  }
  const userId = signIn.user.id;
  console.log(`Signed in as ${email} (${userId})`);

  const res = await fetch(`${SUPABASE_URL}/functions/v1/delete-account`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${signIn.session.access_token}`,
      apikey: ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string; success?: boolean };
  if (!res.ok || body.error) {
    throw new Error(`delete-account failed (${res.status}): ${body.error ?? res.statusText}`);
  }
  console.log('Edge delete-account returned success');
  return userId;
}

async function snapshotOwnedHouseholdWithCoMember(userId: string): Promise<{
  householdId: string;
  successorId: string;
} | null> {
  const { data: owned, error } = await admin.from('households').select('id, name').eq('created_by', userId);
  if (error) throw new Error(error.message);
  for (const h of owned ?? []) {
    const { data: members, error: mErr } = await admin
      .from('household_members')
      .select('user_id')
      .eq('household_id', h.id);
    if (mErr) throw new Error(mErr.message);
    const other = (members ?? []).find((m) => String(m.user_id) !== userId);
    if (other) {
      return { householdId: String(h.id), successorId: String(other.user_id) };
    }
  }
  return null;
}

console.log('=== verify-account-deletion ===');
console.log('URL', SUPABASE_URL);

const verifyOnlyId = process.env.VERIFY_USER_ID?.trim();
const deleteEmail = process.env.DELETE_TEST_EMAIL?.trim();
const deletePassword = process.env.DELETE_TEST_PASSWORD?.trim();
let expectHouseholdId = process.env.EXPECT_HOUSEHOLD_ID?.trim();
let expectOwnerId = process.env.EXPECT_OWNER_ID?.trim();

let deletedUserId: string;

if (verifyOnlyId) {
  deletedUserId = verifyOnlyId;
  console.log('Mode: verify-only');
} else if (deleteEmail && deletePassword) {
  console.log('Mode: delete-then-verify (destructive)');
  const userClient = createClient(SUPABASE_URL, ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: pre, error: preErr } = await userClient.auth.signInWithPassword({
    email: deleteEmail,
    password: deletePassword,
  });
  if (preErr || !pre.user) throw new Error(`pre-signIn: ${preErr?.message}`);
  const uid = pre.user.id;
  await userClient.auth.signOut();

  if (!expectHouseholdId || !expectOwnerId) {
    const snap = await snapshotOwnedHouseholdWithCoMember(uid);
    if (snap) {
      expectHouseholdId = snap.householdId;
      expectOwnerId = snap.successorId;
      console.log('Auto snapshot co-member household', snap);
    }
  }

  deletedUserId = await deleteViaEdge(deleteEmail, deletePassword);
  assert(deletedUserId === uid, 'deleted user id mismatch');
} else {
  console.error(
    'Set VERIFY_USER_ID=… or DELETE_TEST_EMAIL=… + DELETE_TEST_PASSWORD=… (+ SUPABASE_SERVICE_ROLE_KEY)',
  );
  process.exit(1);
}

await verifyNoUserRows(deletedUserId);

if (expectHouseholdId && expectOwnerId) {
  await verifyHouseholdTransfer(expectHouseholdId, expectOwnerId, deletedUserId);
} else {
  console.log('\n(skip household transfer check — no EXPECT_HOUSEHOLD_ID / EXPECT_OWNER_ID)');
}

console.log('\nOK — account deletion verification passed');
