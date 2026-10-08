import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ServiceEnv } from './env';

export function createAnonClient(env: ServiceEnv): SupabaseClient {
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function createServiceClient(env: ServiceEnv): SupabaseClient {
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
