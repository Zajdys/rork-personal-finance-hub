/**
 * Klient VPS služby kontomatik-bank (https://bank.moneybuddy.cz).
 */
import { supabase } from '@/lib/supabase';

export const KONTOMATIK_BANK_BASE_URL =
  (typeof process !== 'undefined' &&
    process.env.EXPO_PUBLIC_KONTOMATIK_BANK_URL?.trim()) ||
  'https://bank.moneybuddy.cz';

export const KONTOMATIK_AUTH_RETURN_URL = 'moneybuddy://bank/kontomatik';

export type BankConnectionRow = {
  id: string;
  bank: string;
  kontomatik_target: string | null;
  official_name: string | null;
  account_ibans: string[] | null;
  status: string;
  consent_expires_at: string | null;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_error_message: string | null;
};

async function getAccessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error('Nejsi přihlášený.');
  }
  return data.session.access_token;
}

async function bankFetch<T>(
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${KONTOMATIK_BANK_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    throw new Error(`Bank sync: neplatná odpověď (${res.status})`);
  }
  if (!res.ok) {
    const err = String(json.error ?? `http_${res.status}`);
    const detail = json.detail ? ` — ${String(json.detail)}` : '';
    throw new Error(`${err}${detail}`);
  }
  return json as T;
}

export async function bankLink(): Promise<{ redirectionId: string; url: string }> {
  return bankFetch('/bank/link');
}

export async function bankComplete(redirectionId: string): Promise<{
  connectionId: string;
  bank: string;
  inserted: number;
  enriched: number;
  review: number;
  consentExpiresAt: string;
}> {
  return bankFetch('/bank/complete', { redirectionId });
}

export async function bankSync(connectionId: string): Promise<{
  connectionId: string;
  inserted: number;
  enriched: number;
  review: number;
}> {
  return bankFetch('/bank/sync', { connectionId });
}

export async function bankDisconnect(connectionId: string): Promise<{ ok: boolean }> {
  return bankFetch('/bank/disconnect', { connectionId });
}

export async function fetchBankConnections(): Promise<{
  connections: BankConnectionRow[];
  error: Error | null;
}> {
  const { data, error } = await supabase
    .from('bank_connections')
    .select(
      'id, bank, kontomatik_target, official_name, account_ibans, status, consent_expires_at, last_sync_at, last_sync_status, last_error_message',
    )
    .order('created_at', { ascending: false });

  if (error) {
    return { connections: [], error: new Error(error.message) };
  }
  return { connections: (data ?? []) as BankConnectionRow[], error: null };
}

/** Parse redirectionId from auth-session return URL. */
export function parseRedirectionIdFromReturnUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const id = u.searchParams.get('redirectionId');
    if (id) return id;
  } catch {
    const m = String(url).match(/[?&#]redirectionId=([^&#]+)/i);
    if (m?.[1]) return decodeURIComponent(m[1]);
  }
  return null;
}

export function daysUntilConsentExpiry(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const end = new Date(iso).getTime();
  if (Number.isNaN(end)) return null;
  const now = Date.now();
  return Math.ceil((end - now) / 86_400_000);
}

const BANK_LABELS: Record<string, string> = {
  cs: 'Česká spořitelna',
  csob: 'ČSOB',
  kb: 'Komerční banka',
  fio: 'Fio banka',
  airbank: 'Air Bank',
  moneta: 'Moneta',
  mbank: 'mBank',
  raiffeisenbank: 'Raiffeisenbank',
  revolut: 'Revolut',
  kontobank: 'KontoBank (test)',
  bank_import: 'Banka',
};

export function bankConnectionDisplayName(row: BankConnectionRow): string {
  if (row.official_name?.trim()) return row.official_name.trim();
  return BANK_LABELS[row.bank] ?? row.bank;
}
