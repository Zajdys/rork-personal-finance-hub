/**
 * Unit self-test: FX math + lookback (bez supabase importu).
 * Run: bun scripts/cnb-exchange-rates-selftest.bun.ts
 */

function roundCzk(n: number): number {
  return Math.round(n * 100) / 100;
}

function convertToCzk(originalAmount: number, perUnit: number): number {
  const origCents = Math.round(Math.abs(originalAmount) * 100);
  const rateE6 = Math.round(perUnit * 1_000_000);
  const czkCents = Math.round((origCents * rateE6) / 1_000_000);
  return czkCents / 100;
}

function daysBetweenYmd(later: string, earlier: string): number {
  const [y1, m1, d1] = later.slice(0, 10).split('-').map(Number);
  const [y2, m2, d2] = earlier.slice(0, 10).split('-').map(Number);
  const t1 = Date.UTC(y1!, m1! - 1, d1!);
  const t2 = Date.UTC(y2!, m2! - 1, d2!);
  return Math.round((t1 - t2) / 86_400_000);
}

const MAX_RATE_LOOKBACK_DAYS = 7;

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

console.log('=== CNB FX math self-test ===');

// 124,29 × 24,29 = 3019,0041 → 3019,00 Kč
assert(convertToCzk(124.29, 24.29) === 3019, `124.29*24.29=${convertToCzk(124.29, 24.29)}`);
assert(convertToCzk(10, 24.29) === 242.9, '10 EUR');
assert(roundCzk(1000 * (13.583 / 100)) === 135.83, 'JPY 1000');
assert(convertToCzk(1000, 13.583 / 100) === 135.83, 'JPY convert');

assert(daysBetweenYmd('2026-09-09', '2026-09-08') === 1, '1 day gap');
assert(daysBetweenYmd('2026-09-09', '2026-09-02') === 7, '7 day gap');
assert(daysBetweenYmd('2026-09-09', '2026-09-01') === 8, '8 day gap');
assert(daysBetweenYmd('2026-09-09', '2026-08-07') === 33, 'Aug→Sep gap');

// Lookback: víkend OK (≤7), měsíc starý NE
assert(
  daysBetweenYmd('2026-09-09', '2026-09-08') <= MAX_RATE_LOOKBACK_DAYS,
  'weekend lookback ok',
);
assert(
  daysBetweenYmd('2026-09-09', '2026-08-07') > MAX_RATE_LOOKBACK_DAYS,
  'Aug 7 must force CNB fetch',
);

console.log('OK');
