/**
 * Self-test: amount clusters for subscription detection.
 * Run: bun scripts/subscription-amount-clusters-selftest.bun.ts
 */
import { clusterTransactionsByAmount } from '../lib/subscription-amount-clusters.ts';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function countMonthlyGaps(txs: { date: string }[]): number {
  let n = 0;
  for (let i = 1; i < txs.length; i++) {
    const d1 = new Date(txs[i - 1]!.date + 'T12:00:00');
    const d2 = new Date(txs[i]!.date + 'T12:00:00');
    const diff = Math.abs((+d2 - +d1) / 86400000);
    if (diff >= 25 && diff <= 35) n++;
  }
  return n;
}

function detect(txs: { amount: number; date: string }[]) {
  const out: { amount: number; n: number }[] = [];
  for (const cluster of clusterTransactionsByAmount(txs)) {
    if (cluster.length < 3) continue;
    const sorted = [...cluster].sort((a, b) => a.date.localeCompare(b.date));
    if (countMonthlyGaps(sorted) < 2) continue;
    const avg = cluster.reduce((s, t) => s + t.amount, 0) / cluster.length;
    out.push({ amount: Math.round(avg * 100) / 100, n: cluster.length });
  }
  return out;
}

const apple = [
  { amount: 79, date: '2026-05-25' },
  { amount: 2799, date: '2026-06-10' },
  { amount: 79, date: '2026-06-24' },
  { amount: 79, date: '2026-07-29' },
  { amount: 79, date: '2026-08-25' },
];

const clusters = clusterTransactionsByAmount(apple);
assert(clusters.length === 2, `expect 2 clusters, got ${clusters.length}`);
assert(
  clusters.some((c) => c.length === 4 && c.every((t) => t.amount === 79)),
  '79×4 cluster',
);
assert(clusters.some((c) => c.length === 1 && c[0]!.amount === 2799), '2799 alone');

const appleDet = detect(apple);
assert(appleDet.length === 1 && appleDet[0]!.amount === 79, `Apple: ${JSON.stringify(appleDet)}`);

const yt = [
  { amount: 389, date: '2026-05-27' },
  { amount: 389, date: '2026-06-27' },
  { amount: 389, date: '2026-07-28' },
  { amount: 389, date: '2026-08-27' },
];
const ytDet = detect(yt);
assert(ytDet.length === 1 && ytDet[0]!.amount === 389, `YT: ${JSON.stringify(ytDet)}`);

// Old whole-group average still fails on mixed Apple
const allAvg = apple.reduce((s, t) => s + t.amount, 0) / apple.length;
assert(
  !apple.every((a) => Math.abs(a.amount - allAvg) / allAvg < 0.15),
  'old avg method must still fail',
);

console.log('OK subscription-amount-clusters-selftest', { appleDet, ytDet });
