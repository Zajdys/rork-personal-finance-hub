/**
 * Self-test: subscription detection rules.
 * Run: bun scripts/subscription-detect-selftest.bun.ts
 */
import {
  detectSubscriptionCandidates,
  findConsecutiveSubscriptionRun,
  isCardMerchantSubscriptionEligible,
  isGenericBankPaymentLabel,
  collectSubscriptionClusterTxIds,
} from '../lib/subscription-detect.ts';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

assert(isGenericBankPaymentLabel('Odchozí okamžitá úhrada'), 'generic odchozi');
assert(!isGenericBankPaymentLabel('APPLE.COM/BILL'), 'apple not generic');
assert(!isGenericBankPaymentLabel('NETFLIX.COM'), 'netflix not generic');

assert(
  !isCardMerchantSubscriptionEligible({
    amount: 498,
    title: 'Odchozí okamžitá úhrada',
    date: '2026-08-01',
    type: 'expense',
  }),
  'odchozi without counterparty still ineligible (generic)',
);

assert(
  !isCardMerchantSubscriptionEligible({
    amount: 170,
    title: '4482838073/0800',
    date: '2026-08-01',
    type: 'expense',
    counterpartyAccount: '4482838073/0800',
  }),
  'counterparty ignored',
);

assert(
  isCardMerchantSubscriptionEligible({
    amount: 79,
    title: 'APPLE.COM/BILL',
    date: '2026-08-23',
    bookingDate: '2026-08-23',
    type: 'expense',
  }),
  'apple eligible',
);

assert(
  !isCardMerchantSubscriptionEligible({
    amount: 6000,
    title: 'APPLE.COM/BILL',
    date: '2026-08-23',
    type: 'expense',
  }),
  'over 5000 ineligible',
);

const varying = [
  { amount: 170, title: 'APPLE.COM/BILL', date: '2026-05-23', type: 'expense' as const },
  { amount: 310, title: 'APPLE.COM/BILL', date: '2026-06-23', type: 'expense' as const },
  { amount: 386, title: 'APPLE.COM/BILL', date: '2026-07-23', type: 'expense' as const },
];
assert(findConsecutiveSubscriptionRun(varying) === null, 'varying amounts no run');

const onlyTwo = [
  { id: 'a', amount: 79, title: 'APPLE.COM/BILL', date: '2026-05-23', bookingDate: '2026-05-23', type: 'expense' as const },
  { id: 'b', amount: 79, title: 'APPLE.COM/BILL', date: '2026-06-23', bookingDate: '2026-06-23', type: 'expense' as const },
];
assert(findConsecutiveSubscriptionRun(onlyTwo) === null, 'need ≥3 occurrences');

const apple = [
  { id: '1', amount: 79, title: 'APPLE.COM/BILL', date: '2026-05-25', bookingDate: '2026-05-23', type: 'expense' as const },
  { id: '2', amount: 2799, title: 'APPLE.COM/BILL', date: '2026-06-10', bookingDate: '2026-06-10', type: 'expense' as const },
  { id: '3', amount: 79, title: 'APPLE.COM/BILL', date: '2026-06-24', bookingDate: '2026-06-23', type: 'expense' as const },
  { id: '4', amount: 79, title: 'APPLE.COM/BILL', date: '2026-07-24', bookingDate: '2026-07-23', type: 'expense' as const },
  { id: '5', amount: 79, title: 'APPLE.COM/BILL', date: '2026-08-25', bookingDate: '2026-08-23', type: 'expense' as const },
];
const run = findConsecutiveSubscriptionRun(
  [...apple].sort((a, b) => (a.bookingDate! > b.bookingDate! ? 1 : -1)),
);
assert(!!run && run.length >= 3, `apple run len ${run?.length}`);
assert(run!.every((t) => t.amount === 79), 'run only 79');

const revolutVarying = [
  { id: 'r1', amount: 300, title: 'REVOLUT', date: '2026-01-05', type: 'expense' as const },
  { id: 'r2', amount: 1500, title: 'REVOLUT', date: '2026-02-05', type: 'expense' as const },
  { id: 'r3', amount: 10530, title: 'REVOLUT', date: '2026-03-05', type: 'expense' as const },
  { id: 'r4', amount: 800, title: 'REVOLUT', date: '2026-04-05', type: 'expense' as const },
];
assert(detectSubscriptionCandidates(revolutVarying).length === 0, 'revolut varying must not detect');

const tesco = [
  { id: 't1', amount: 6.6, title: 'TESCO', date: '2026-01-10', type: 'expense' as const },
  { id: 't2', amount: 420, title: 'TESCO', date: '2026-02-10', type: 'expense' as const },
  { id: 't3', amount: 1243, title: 'TESCO', date: '2026-03-10', type: 'expense' as const },
];
assert(detectSubscriptionCandidates(tesco).length === 0, 'tesco varying must not detect');

const odchoziStale = [
  { amount: 498, title: 'Odchozí okamžitá úhrada', date: '2026-07-01', type: 'expense' as const },
  { amount: 498, title: 'Odchozí okamžitá úhrada', date: '2026-08-01', type: 'expense' as const },
  { amount: 498, title: 'Odchozí okamžitá úhrada', date: '2026-08-30', type: 'expense' as const },
];
const bad = detectSubscriptionCandidates(odchoziStale);
assert(bad.length === 0, `odchozi must not detect, got ${JSON.stringify(bad)}`);

const detected = detectSubscriptionCandidates(apple);
assert(detected.length === 1, `expect 1 apple sub, got ${detected.length}`);
assert(detected[0]!.name === 'Apple (iCloud)', `name ${detected[0]!.name}`);
assert(detected[0]!.dayOfMonth === 23, `day ${detected[0]!.dayOfMonth}`);
assert(detected[0]!.category === 'Předplatné', 'category');
assert(detected[0]!.sampleTxIds.every((id) => ['3', '4', '5'].includes(id)), 'only consecutive 79 Kč ids');
assert(!detected[0]!.sampleTxIds.includes('2'), '2799 not in cluster');
assert(!detected[0]!.sampleTxIds.includes('1'), 'isolated 79 before breakout not in run');

const clusterIds = collectSubscriptionClusterTxIds(apple);
assert(clusterIds.has('3') && clusterIds.has('4') && clusterIds.has('5') && !clusterIds.has('2') && !clusterIds.has('1'), 'cluster ids');

console.log('subscription-detect-selftest: OK');
