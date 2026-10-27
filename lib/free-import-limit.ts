import { supabase } from '@/lib/supabase';

/** Max. počet výpisů (souborů) za kalendářní měsíc pro Free — po prvním importu. */
export const FREE_IMPORT_FILES_PER_MONTH = 2;

export type FreeImportQuota = {
  /** Ještě nemá žádnou dávku → první import bez limitu. */
  isFirstImport: boolean;
  /** Soubory započítané tento měsíc (bez úplně první dávky účtu). */
  usedThisMonth: number;
  remaining: number;
  limit: number;
};

function monthBoundsIso(now = new Date()): { startIso: string; endIso: string } {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

type BatchRow = { id: string; file_count: number; created_at: string };

async function fetchUserBatches(userId: string): Promise<BatchRow[]> {
  const { data, error } = await supabase
    .from('import_batches')
    .select('id, file_count, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('[free-import-limit] fetch batches failed', error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: String(r.id),
    file_count: Math.max(1, Number(r.file_count) || 1),
    created_at: String(r.created_at),
  }));
}

/**
 * Kvota Free importu:
 * - 0 dávek → první import neomezený
 * - jinak max FREE_IMPORT_FILES_PER_MONTH souborů/měsíc (sum file_count),
 *   bez započtení úplně první dávky účtu
 */
export async function getFreeImportQuota(userId: string): Promise<FreeImportQuota> {
  const batches = await fetchUserBatches(userId);
  const limit = FREE_IMPORT_FILES_PER_MONTH;

  if (batches.length === 0) {
    return {
      isFirstImport: true,
      usedThisMonth: 0,
      remaining: limit,
      limit,
    };
  }

  const firstId = batches[0]!.id;
  const { startIso, endIso } = monthBoundsIso();

  let usedThisMonth = 0;
  for (const b of batches) {
    if (b.id === firstId) continue;
    if (b.created_at >= startIso && b.created_at < endIso) {
      usedThisMonth += b.file_count;
    }
  }

  const remaining = Math.max(0, limit - usedThisMonth);
  return {
    isFirstImport: false,
    usedThisMonth,
    remaining,
    limit,
  };
}

/** Smí Free uživatel spustit picker / importnout `fileCount` souborů? */
export async function canFreeUserImportFiles(
  userId: string,
  fileCount: number,
): Promise<FreeImportQuota & { allowed: boolean }> {
  const quota = await getFreeImportQuota(userId);
  if (quota.isFirstImport) {
    return { ...quota, allowed: true };
  }
  const n = Math.max(0, Math.floor(fileCount));
  return { ...quota, allowed: n > 0 && n <= quota.remaining };
}

/** @deprecated použij canFreeUserImportFiles / getFreeImportQuota */
export async function canFreeUserImport(userId: string): Promise<{
  allowed: boolean;
  used: number;
  limit: number;
}> {
  const q = await getFreeImportQuota(userId);
  return {
    allowed: q.isFirstImport || q.remaining > 0,
    used: q.usedThisMonth,
    limit: q.limit,
  };
}

/**
 * Zapíše dávku po úspěšném importu (RLS: jen INSERT vlastních řádků).
 * created_at neposílat — trigger nastaví now(). Žádný upsert/update/delete.
 */
export async function recordImportBatch(params: {
  batchId: string;
  userId: string;
  fileCount: number;
}): Promise<{ error: Error | null }> {
  const fileCount = Math.min(500, Math.max(1, Math.floor(params.fileCount) || 1));
  const { error } = await supabase.from('import_batches').insert({
    id: params.batchId,
    user_id: params.userId,
    file_count: fileCount,
  });
  if (error) {
    // 23505 = už existuje (reimport stejného id) — ignoruj, kvótu nevracíme ani nepřepisujeme
    if (error.code === '23505') return { error: null };
    console.warn('[free-import-limit] recordImportBatch failed', error.message);
    return { error: new Error(error.message) };
  }
  return { error: null };
}
