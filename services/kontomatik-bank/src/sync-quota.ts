const MAX_SYNCS_PER_WINDOW = 4;
const WINDOW_MS = 24 * 60 * 60 * 1000;

export type SyncQuotaState = {
  sync_window_start: string | null;
  sync_count_in_window: number;
};

export function canSyncNow(
  state: SyncQuotaState,
  now = new Date(),
): { ok: true; next: SyncQuotaState } | { ok: false; retryAfterMs: number } {
  const start = state.sync_window_start
    ? new Date(state.sync_window_start)
    : null;
  const count = state.sync_count_in_window ?? 0;

  if (!start || Number.isNaN(start.getTime()) || now.getTime() - start.getTime() >= WINDOW_MS) {
    return {
      ok: true,
      next: {
        sync_window_start: now.toISOString(),
        sync_count_in_window: 1,
      },
    };
  }

  if (count >= MAX_SYNCS_PER_WINDOW) {
    const retryAfterMs = WINDOW_MS - (now.getTime() - start.getTime());
    return { ok: false, retryAfterMs };
  }

  return {
    ok: true,
    next: {
      sync_window_start: start.toISOString(),
      sync_count_in_window: count + 1,
    },
  };
}

export { MAX_SYNCS_PER_WINDOW };
