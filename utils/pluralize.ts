/**
 * Czech plural helper (1 / 2–4 / 5+).
 * Note: teens 11–14 intentionally use "few" when abs is 2–4 only;
 * for teens use abs % 100 checks at call sites if needed.
 */
export function plural(n: number, one: string, few: string, many: string): string {
  const num = typeof n === 'number' && Number.isFinite(n) ? n : Number(n);
  const abs = Math.abs(Number.isFinite(num) ? num : 0);
  if (abs === 1) return one;
  if (abs >= 2 && abs <= 4) return few;
  return many; // 0, 5+, NaN/undefined → many
}
