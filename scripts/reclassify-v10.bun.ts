/**
 * Jednorázový přepočet kategorií na CATEGORIZATION_VERSION 10.
 * Run:
 *   SUPABASE_SERVICE_ROLE_KEY=… bun scripts/reclassify-v10.bun.ts
 */
// @ts-nocheck
import { createClient } from '@supabase/supabase-js';
import { CATEGORIZATION_VERSION } from '../lib/categorization.ts';
import { reclassifyExistingImportTransactions } from '../lib/reclassify-import-categories.ts';

const USER_ID = process.env.OWNER_USER_ID || '7ce943bd-eb89-4c95-9022-39a08901320a';
const url = process.env.SUPABASE_URL || 'https://jcwbkydaeeqcbdcxgnad.supabase.co';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceKey) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

console.log('CATEGORIZATION_VERSION', CATEGORIZATION_VERSION);
console.log('user', USER_ID);

const result = await reclassifyExistingImportTransactions(USER_ID, supabase);
console.log('reclassify result', result);

const { error: upsertErr } = await supabase.from('user_profiles').upsert(
  {
    id: USER_ID,
    user_id: USER_ID,
    categories_version: CATEGORIZATION_VERSION,
    updated_at: new Date().toISOString(),
  },
  { onConflict: 'user_id' },
);
if (upsertErr) {
  console.error('version bump failed', upsertErr.message);
  process.exit(1);
}

const { data: ver } = await supabase
  .from('user_profiles')
  .select('categories_version')
  .eq('user_id', USER_ID)
  .maybeSingle();

console.log('categories_version now', ver?.categories_version);
console.log('CATEGORY_CHANGED', result.categoryChanged);
console.log('UPDATED_ROWS', result.updated);
