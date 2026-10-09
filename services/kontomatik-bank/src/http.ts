/** Outbound HTTP / promise timeouts — nikdy nenechat Bun.serve idle cutnout spojení. */

export const OUTBOUND_TIMEOUT_MS = 10_000;

export class OutboundTimeoutError extends Error {
  readonly step: string;
  constructor(step: string, message?: string) {
    super(message ?? `${step} timeout after ${OUTBOUND_TIMEOUT_MS}ms`);
    this.name = 'OutboundTimeoutError';
    this.step = step;
  }
}

export class OutboundError extends Error {
  readonly step: string;
  constructor(step: string, message: string) {
    super(message);
    this.name = 'OutboundError';
    this.step = step;
  }
}

function isAbortOrTimeout(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const name = String((e as { name?: string }).name ?? '');
  return name === 'TimeoutError' || name === 'AbortError';
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message.slice(0, 300);
  return String(e).slice(0, 300);
}

/** fetch s AbortSignal.timeout — timeout → OutboundTimeoutError. */
export async function fetchWithTimeout(
  step: string,
  input: string | URL | Request,
  init?: RequestInit,
  ms = OUTBOUND_TIMEOUT_MS,
): Promise<Response> {
  try {
    return await fetch(input, {
      ...init,
      signal: AbortSignal.timeout(ms),
    });
  } catch (e) {
    if (isAbortOrTimeout(e)) {
      throw new OutboundTimeoutError(step, `${step} timeout after ${ms}ms`);
    }
    throw new OutboundError(step, errorMessage(e));
  }
}

/** Libovolný Promise (Supabase) s timeoutem. */
export async function withTimeout<T>(
  step: string,
  promise: PromiseLike<T>,
  ms = OUTBOUND_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promise).finally(() => {
        if (timer !== undefined) clearTimeout(timer);
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new OutboundTimeoutError(step, `${step} timeout after ${ms}ms`));
        }, ms);
      }),
    ]);
  } catch (e) {
    if (e instanceof OutboundTimeoutError || e instanceof OutboundError) throw e;
    if (isAbortOrTimeout(e)) {
      throw new OutboundTimeoutError(step, `${step} timeout after ${ms}ms`);
    }
    throw e;
  }
}

/** Mapuj outbound chyby na JSON odpověď; ostatní → internal 500. (loguje volající) */
export function responseFromCaughtError(route: string, stepFallback: string, e: unknown): Response {
  void route;
  void stepFallback;
  if (e instanceof OutboundTimeoutError) {
    return Response.json({ error: 'upstream_timeout' }, { status: 504 });
  }
  if (e instanceof OutboundError) {
    return Response.json({ error: 'upstream_error' }, { status: 502 });
  }
  return Response.json({ error: 'internal' }, { status: 500 });
}
