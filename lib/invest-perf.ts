/**
 * Dočasné měření načítání Investic — prefix `[invest-perf]`.
 * V produkci (ne __DEV__) nic neloguje (finanční data).
 */
type PerfRun = {
  id: string;
  t0: number;
  marks: { name: string; ms: number; detail?: Record<string, unknown> }[];
};

let active: PerfRun | null = null;

function now(): number {
  const p = globalThis.performance;
  if (p && typeof p.now === 'function') return p.now();
  return Date.now();
}

export function investPerfStart(label = 'load'): string {
  const id = `${label}-${Date.now().toString(36)}`;
  if (!__DEV__) {
    active = null;
    return id;
  }
  active = { id, t0: now(), marks: [] };
  console.log(`[invest-perf] START ${id}`);
  return id;
}

export function investPerfMark(
  name: string,
  detail?: Record<string, unknown>,
  runId?: string,
): void {
  if (!__DEV__ || !active || (runId && active.id !== runId)) return;
  const ms = Math.round((now() - active.t0) * 10) / 10;
  active.marks.push({ name, ms, detail });
  const extra = detail ? ` ${JSON.stringify(detail)}` : '';
  console.log(`[invest-perf] +${ms}ms ${name}${extra}`);
}

export function investPerfEnd(runId?: string): void {
  if (!__DEV__ || !active || (runId && active.id !== runId)) {
    active = null;
    return;
  }
  const total = Math.round((now() - active.t0) * 10) / 10;
  console.log(`[invest-perf] END ${active.id} total=${total}ms`, {
    marks: active.marks.map((m) => ({
      name: m.name,
      ms: m.ms,
      ...(m.detail ?? {}),
    })),
  });
  active = null;
}

/** Měření async bloku — vrací výsledek fn. */
export async function investPerfSpan<T>(
  name: string,
  fn: () => Promise<T>,
  detail?: Record<string, unknown>,
): Promise<T> {
  const t0 = now();
  try {
    const result = await fn();
    const ms = Math.round((now() - t0) * 10) / 10;
    investPerfMark(name, { ...detail, durationMs: ms });
    return result;
  } catch (e) {
    const ms = Math.round((now() - t0) * 10) / 10;
    investPerfMark(`${name}:error`, { ...detail, durationMs: ms });
    throw e;
  }
}
