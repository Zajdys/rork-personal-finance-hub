/**
 * Klient pro Edge Function fio-sync — retry na dočasné síťové chyby.
 */
import { supabaseUrl } from '@/lib/supabase';
import { httpError, withNetworkRetry } from '@/lib/with-network-retry';

const FIO_SYNC_URL = `${supabaseUrl}/functions/v1/fio-sync`;

export type FioSyncResult = {
  imported?: number;
  total?: number;
  [key: string]: unknown;
};

export async function invokeFioSync(params: {
  fioToken: string;
  userId: string;
  accessToken: string;
}): Promise<FioSyncResult> {
  return withNetworkRetry(
    async () => {
      const res = await fetch(FIO_SYNC_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${params.accessToken}`,
        },
        body: JSON.stringify({ fio_token: params.fioToken, user_id: params.userId }),
      });

      const data = (await res.json().catch(() => ({}))) as FioSyncResult & {
        error?: string;
        message?: string;
      };

      if (!res.ok) {
        const msg =
          (typeof data.message === 'string' && data.message) ||
          (typeof data.error === 'string' && data.error) ||
          `HTTP ${res.status}`;
        throw httpError(msg, res.status);
      }

      return data;
    },
    { label: 'fio-sync', attempts: 3, backoffMs: [400, 1000] },
  );
}
