/**
 * 2–3 pokusy s krátkým backoffem jen na timeout / network / 5xx / 429.
 * 4xx (kromě 429) se neopakují.
 */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function statusFromError(error: unknown): number | undefined {
  if (error && typeof error === 'object' && 'status' in error) {
    const s = (error as { status?: unknown }).status;
    if (typeof s === 'number' && Number.isFinite(s)) return s;
  }
  return undefined;
}

function errorText(error: unknown): string {
  if (error instanceof Error) return `${error.name} ${error.message}`;
  return String(error ?? '');
}

/** Je chyba dočasná a má smysl znovu zkusit? */
export function isRetryableNetworkError(error: unknown): boolean {
  const status = statusFromError(error);
  if (status != null) {
    if (status === 429) return true;
    if (status >= 500 && status < 600) return true;
    if (status >= 400 && status < 500) return false;
  }

  if (error instanceof Error && error.name === 'AbortError') return true;

  const text = errorText(error).toLowerCase();
  return /network request failed|failed to fetch|load failed|timeout|timed?\s*out|gateway timeout|econnreset|enotfound|econnrefused|abort(ed)?|vypršel časový limit|socket/i.test(
    text,
  );
}

export type WithNetworkRetryOptions = {
  /** Celkový počet pokusů včetně prvního (default 3). */
  attempts?: number;
  /** Backoff mezi pokusy v ms (default [400, 1000]). */
  backoffMs?: number[];
  /** Pro logování. */
  label?: string;
};

export async function withNetworkRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: WithNetworkRetryOptions = {},
): Promise<T> {
  const attempts = options.attempts ?? 3;
  const backoffMs = options.backoffMs ?? [400, 1000];
  const label = options.label ?? 'network';

  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      const canRetry = attempt < attempts - 1 && isRetryableNetworkError(error);
      if (!canRetry) throw error;
      const delay = backoffMs[Math.min(attempt, backoffMs.length - 1)] ?? 1000;
      console.log(
        `[${label}] retryable error (attempt ${attempt + 1}/${attempts}), wait ${delay}ms:`,
        error,
      );
      await sleep(delay);
    }
  }
  throw lastError;
}

/** Pomocník: Error se statusem pro HTTP odpovědi. */
export function httpError(message: string, status: number): Error & { status: number } {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}
