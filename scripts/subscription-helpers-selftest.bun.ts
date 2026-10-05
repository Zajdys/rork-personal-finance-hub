/**
 * Run: bun scripts/subscription-helpers-selftest.bun.ts
 */
import { daysUntilNextPayment, nextBillingDatesAfter } from '../lib/subscription-helpers.ts';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

console.log('=== subscription-helpers self-test ===');

// due_day 31 v dubnu (30 dní) → 30.4., ne květen
const apr15 = new Date(2026, 3, 15, 18, 0, 0);
const nextApr = nextBillingDatesAfter(apr15, 31, 1)[0]!;
assert(ymd(nextApr) === '2026-04-30', `Apr 15 + due 31 → 2026-04-30 got ${ymd(nextApr)}`);
assert(daysUntilNextPayment(31, apr15) === 15, `days Apr15→30 = 15 got ${daysUntilNextPayment(31, apr15)}`);

// poslední den krátkého měsíce = „dnes“ (0), i odpoledne
const apr30pm = new Date(2026, 3, 30, 20, 0, 0);
assert(daysUntilNextPayment(31, apr30pm) === 0, `Apr 30 due 31 → 0 got ${daysUntilNextPayment(31, apr30pm)}`);

// únor → 28.2.2026
const feb10 = new Date(2026, 1, 10, 9, 0, 0);
const nextFeb = nextBillingDatesAfter(feb10, 31, 1)[0]!;
assert(ymd(nextFeb) === '2026-02-28', `Feb due 31 → 2026-02-28 got ${ymd(nextFeb)}`);

// po posledním dni krátkého měsíce → další měsíc
const may1 = new Date(2026, 4, 1, 10, 0, 0);
const nextMay = nextBillingDatesAfter(may1, 31, 1)[0]!;
assert(ymd(nextMay) === '2026-05-31', `May 1 due 31 → 2026-05-31 got ${ymd(nextMay)}`);

console.log('OK subscription-helpers self-test');
