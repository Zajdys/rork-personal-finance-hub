import { supabase } from '@/lib/supabase';

/**
 * Má klient platný access token? Bez něj jdou requesty jako anon → RLS 42501.
 */
export async function hasSupabaseSession(): Promise<boolean> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) return false;
    return Boolean(data.session?.access_token && data.session.user?.id);
  } catch {
    return false;
  }
}

/**
 * Očekávaný stav po odhlášení / smazání účtu / vypršení JWT —
 * ne logovat jako chybu aplikace.
 */
export function isSessionLostError(error: unknown): boolean {
  if (error == null) return false;

  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code ?? '')
      : '';
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? Number((error as { status?: unknown }).status)
      : NaN;
  const message = (
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message?: unknown }).message ?? '')
        : String(error)
  ).toLowerCase();

  if (code === '42501') return true;
  if (status === 401 || status === 403) return true;
  if (
    /permission denied|get_user_household_ids|jwt expired|invalid jwt|not authenticated|no .+ session|session.*expired|row-level security|rls/i.test(
      message,
    )
  ) {
    return true;
  }
  return false;
}

/** console.error jen když to není ztráta session. */
export function logSupabaseDataError(context: string, error: unknown): void {
  if (isSessionLostError(error)) return;
  console.error(context, error);
}
