/**
 * Mapuje syrové síťové chyby na krátkou CS hlášku pro uživatele.
 * Raw error vždy loguj zvlášť (console) — tento helper ho nemění.
 */

export type UserFacingErrorKind = 'offline' | 'connection' | 'retry';

const MESSAGES: Record<UserFacingErrorKind, string> = {
  offline: 'Nejsi online. Zkontroluj připojení k internetu.',
  connection: 'Nepodařilo se načíst data, zkontroluj připojení.',
  retry: 'Nepodařilo se načíst. Zkus to znovu.',
};

function errorText(error: unknown): string {
  if (error instanceof Error) return `${error.name} ${error.message}`;
  return String(error ?? '');
}

function statusFromError(error: unknown): number | undefined {
  if (error && typeof error === 'object' && 'status' in error) {
    const s = (error as { status?: unknown }).status;
    if (typeof s === 'number' && Number.isFinite(s)) return s;
  }
  return undefined;
}

/** Klasifikace pro UI (a pro retry). */
export function classifyUserFacingError(error: unknown): UserFacingErrorKind {
  const text = errorText(error).toLowerCase();
  const status = statusFromError(error);

  if (
    /\boffline\b|not connected|no internet|internet connection appears to be offline|netinfo/i.test(
      text,
    )
  ) {
    return 'offline';
  }

  if (status != null && status >= 500) return 'retry';
  if (/gateway timeout|timed?\s*out|timeout|abort(ed)?|vypršel časový limit/i.test(text)) {
    return 'retry';
  }
  if (error instanceof Error && error.name === 'AbortError') return 'retry';

  if (
    /network request failed|failed to fetch|load failed|econnreset|enotfound|econnrefused|socket|ssl|tls/i.test(
      text,
    )
  ) {
    return 'connection';
  }

  return 'retry';
}

/** Přátelská CS hláška — nikdy nevrací stack / syrový HTTP text. */
export function toUserFacingMessage(error: unknown): string {
  return MESSAGES[classifyUserFacingError(error)];
}

/**
 * Log raw + vrať friendly message (pro Alert / banner).
 * Použití: `const msg = logAndGetUserFacingError('fio-sync', e);`
 */
export function logAndGetUserFacingError(context: string, error: unknown): string {
  console.log(`[${context}] raw error:`, error);
  return toUserFacingMessage(error);
}
