/**
 * Self-test: subscription detection rules (digitální předplatné).
 * Run: bun scripts/subscription-detect-selftest.bun.ts
 */
// @ts-nocheck — bun selftest; .ts imports mimo app tsc rozpočet
import {
  detectSubscriptionCandidates,
  findConsecutiveSubscriptionRun,
  isCardMerchantSubscriptionEligible,
  isDigitalSubscriptionCandidate,
  isGenericBankPaymentLabel,
  isSubscriptionFeeLabel,
  isSubscriptionRunActive,
  collectSubscriptionClusterTxIds,
  resolveSubscriptionAmountMode,
  SUBSCRIPTION_AMOUNT_TOLERANCE,
  SUBSCRIPTION_MIN_OCCURRENCES,
} from '../lib/subscription-detect.ts';
import { normalizeMerchantKey } from '../lib/normalize-merchant-key.ts';
import { resolveSubscriptionBrand } from '../lib/subscription-brands.ts';
import { lookupMerchantDictionary } from '../lib/merchant-dictionary.ts';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

assert(SUBSCRIPTION_MIN_OCCURRENCES === 2, 'min occurrences 2');
assert(SUBSCRIPTION_AMOUNT_TOLERANCE === 0.15, 'tolerance 15%');

assert(isGenericBankPaymentLabel('Odchozí okamžitá úhrada'), 'generic odchozi');
assert(isSubscriptionFeeLabel('Poplatek · Cursor'), 'revolut fee');
assert(isSubscriptionFeeLabel('Poplatek · ANTHROPIC'), 'revolut fee anthropic');
assert(!isSubscriptionFeeLabel('Cursor'), 'cursor not fee');

assert(
  !isCardMerchantSubscriptionEligible({
    amount: 12,
    title: 'Poplatek · Cursor',
    category: 'Bankovní poplatky',
    date: '2026-09-01',
    type: 'expense',
  }),
  'fee row ineligible',
);

assert(
  !isDigitalSubscriptionCandidate({
    amount: 12,
    title: 'Poplatek · Cursor',
    date: '2026-09-01',
    type: 'expense',
  }),
  'fee not digital candidate even without category',
);

assert(
  normalizeMerchantKey('OPENAI *CHATGPT SUBSCR') === 'OPENAI CHATGPT SUBSCR',
  `chatgpt key ${normalizeMerchantKey('OPENAI *CHATGPT SUBSCR')}`,
);
assert(
  resolveSubscriptionBrand('OPENAI CHATGPT SUBSCR')?.key === 'CHATGPT',
  'alias OPENAI CHATGPT SUBSCR → CHATGPT',
);

assert(lookupMerchantDictionary('PREHRAJ.TO') === 'Předplatné', 'prehraj dict');
assert(resolveSubscriptionBrand('PREHRAJ.TO')?.key === 'PREHRAJ.TO', 'prehraj brand');

assert(
  isDigitalSubscriptionCandidate({
    amount: 149,
    title: 'PREHRAJ.TO',
    category: 'Bydlení',
    date: '2026-09-01',
    type: 'expense',
  }),
  'prehraj brand overrides Bydlení exclude',
);

assert(
  !isDigitalSubscriptionCandidate({
    amount: 899,
    title: 'Vodafone Czech Rep.',
    category: 'Telefon a internet',
    date: '2026-08-01',
    type: 'expense',
  }),
  'vodafone still blocked',
);

assert(normalizeMerchantKey('Vodafone Czech Rep.') === 'VODAFONE', 'vodafone merge');
assert(
  normalizeMerchantKey('GOOGLE *YouTubePremium') === 'GOOGLE YOUTUBE',
  'youtube key',
);

// Apple: shluk 79 Kč mezi jinými nákupy
const appleMixed = [
  { id: 'a1', amount: 79, title: 'APPLE.COM/BILL', date: '2025-10-23', type: 'expense' as const },
  { id: 'a2', amount: 2799, title: 'APPLE.COM/BILL', date: '2025-11-05', type: 'expense' as const },
  { id: 'a3', amount: 79, title: 'APPLE.COM/BILL', date: '2025-11-23', type: 'expense' as const },
  { id: 'a4', amount: 9, title: 'APPLE.COM/BILL', date: '2025-12-01', type: 'expense' as const },
  { id: 'a5', amount: 79, title: 'APPLE.COM/BILL', date: '2025-12-23', type: 'expense' as const },
  { id: 'a6', amount: 79, title: 'APPLE.COM/BILL', date: '2026-01-23', type: 'expense' as const },
  { id: 'a7', amount: 599, title: 'APPLE.COM/BILL', date: '2026-02-10', type: 'expense' as const },
  { id: 'a8', amount: 79, title: 'APPLE.COM/BILL', date: '2026-02-23', type: 'expense' as const },
  { id: 'a9', amount: 79, title: 'APPLE.COM/BILL', date: '2026-03-23', type: 'expense' as const },
  { id: 'a10', amount: 79, title: 'APPLE.COM/BILL', date: '2026-04-23', type: 'expense' as const },
  { id: 'a11', amount: 79, title: 'APPLE.COM/BILL', date: '2026-05-23', type: 'expense' as const },
  { id: 'a12', amount: 79, title: 'APPLE.COM/BILL', date: '2026-06-23', type: 'expense' as const },
  { id: 'a13', amount: 79, title: 'APPLE.COM/BILL', date: '2026-07-23', type: 'expense' as const },
  { id: 'a14', amount: 79, title: 'APPLE.COM/BILL', date: '2026-08-23', type: 'expense' as const },
  { id: 'a15', amount: 79, title: 'APPLE.COM/BILL', date: '2026-09-23', type: 'expense' as const },
];
const appleDet = detectSubscriptionCandidates(appleMixed, { asOfYmd: '2026-10-03' });
assert(appleDet.length === 1, `apple candidates ${JSON.stringify(appleDet)}`);
assert(appleDet[0]!.name === 'Apple (iCloud)', `name ${appleDet[0]!.name}`);
assert(appleDet[0]!.amount === 79, `apple amt ${appleDet[0]!.amount}`);
assert(appleDet[0]!.sampleTxIds.length >= 8, `apple run len ${appleDet[0]!.sampleTxIds.length}`);

// Cursor USD ↔ EUR → CZK clustering
const cursorFx = [
  {
    id: 'c1',
    amount: 520,
    originalAmount: 24.2,
    originalCurrency: 'USD',
    title: 'Cursor',
    date: '2026-08-01',
    source: 'revolut',
    type: 'expense' as const,
  },
  {
    id: 'c2',
    amount: 510,
    originalAmount: 20.8,
    originalCurrency: 'EUR',
    title: 'Cursor',
    date: '2026-09-01',
    source: 'revolut',
    type: 'expense' as const,
  },
];
assert(resolveSubscriptionAmountMode(cursorFx) === 'czk', 'mixed FX → czk mode');
const cursorDet = detectSubscriptionCandidates(cursorFx, { asOfYmd: '2026-10-03' });
assert(cursorDet.length === 1, `cursor ${JSON.stringify(cursorDet)}`);
assert(cursorDet[0]!.name === 'Cursor', 'cursor name');
// Částka = poslední platba (ne průměr)
assert(Math.abs(cursorDet[0]!.amount - 510) < 0.01, `cursor last 510 got ${cursorDet[0]!.amount}`);

const anthropic = [
  {
    id: 'an1',
    amount: 530,
    originalAmount: 21.78,
    originalCurrency: 'EUR',
    title: 'ANTHROPIC',
    date: '2026-08-15',
    source: 'revolut',
    type: 'expense' as const,
  },
  {
    id: 'an2',
    amount: 526,
    originalAmount: 21.78,
    originalCurrency: 'EUR',
    title: 'Claude.ai',
    date: '2026-09-15',
    source: 'revolut',
    type: 'expense' as const,
  },
];
assert(resolveSubscriptionAmountMode(anthropic) === 'original', 'same EUR → original');
const anthDet = detectSubscriptionCandidates(anthropic, { asOfYmd: '2026-10-03' });
assert(anthDet.length === 1 && anthDet[0]!.name === 'Anthropic', `anth ${JSON.stringify(anthDet)}`);
assert(Math.abs(anthDet[0]!.amount - 526) < 0.01, `anth last 526 got ${anthDet[0]!.amount}`);

// Non-digital junk
assert(
  !isDigitalSubscriptionCandidate({
    amount: 5000,
    title: 'muj.cez.cz',
    category: 'Energie',
    date: '2026-09-01',
    type: 'expense',
  }),
  'cez energie blocked',
);
assert(
  !isDigitalSubscriptionCandidate({
    amount: 17107,
    title: 'HÁJEK JAN',
    category: 'Splátky úvěrů',
    date: '2026-09-01',
    type: 'expense',
  }),
  'mortgage transfer blocked',
);
assert(
  !isCardMerchantSubscriptionEligible({
    amount: 5000,
    title: 'muj.cez.cz',
    category: 'Předplatné',
    date: '2026-09-01',
    type: 'expense',
  }),
  '5000 CZK at max excluded',
);
assert(
  isDigitalSubscriptionCandidate({
    amount: 79,
    title: 'APPLE.COM/BILL',
    category: 'Elektronika',
    date: '2026-09-01',
    type: 'expense',
  }),
  'apple whitelist overrides Elektronika',
);

// ChatGPT zrušené (poslední 02/2026) — banka má novější tx → asOf = poslední banka
const chatgptCancelled = [
  {
    id: 'g1',
    amount: 249,
    title: 'OPENAI *CHATGPT SUBSCR',
    date: '2026-01-15',
    source: 'cs',
    type: 'expense' as const,
  },
  {
    id: 'g2',
    amount: 249,
    title: 'OPENAI *CHATGPT SUBSCR',
    date: '2026-02-15',
    source: 'cs',
    type: 'expense' as const,
  },
  {
    id: 'later',
    amount: 120,
    title: 'TESCO',
    date: '2026-09-20',
    source: 'cs',
    type: 'expense' as const,
  },
];
assert(
  detectSubscriptionCandidates(chatgptCancelled, { asOfYmd: '2026-10-03' }).length === 0,
  'cancelled chatgpt not suggested',
);
assert(
  !isSubscriptionRunActive(
    chatgptCancelled.filter((t) => /CHATGPT|OPENAI/i.test(t.title)),
    '2026-09-20',
  ),
  'chatgpt run inactive vs last bank date',
);

// Dlouho bez importu: aktivita vůči poslední tx banky (ne vůči „dnes“)
const staleImport = [
  {
    id: 'c1',
    amount: 520,
    originalAmount: 24.2,
    originalCurrency: 'USD',
    title: 'Cursor',
    date: '2026-07-01',
    source: 'revolut',
    type: 'expense' as const,
  },
  {
    id: 'c2',
    amount: 510,
    originalAmount: 20.8,
    originalCurrency: 'EUR',
    title: 'Cursor',
    date: '2026-08-01',
    source: 'revolut',
    type: 'expense' as const,
  },
  {
    id: 'other',
    amount: 80,
    title: 'LIDL',
    date: '2026-08-10',
    source: 'revolut',
    type: 'expense' as const,
  },
];
assert(
  detectSubscriptionCandidates(staleImport, { asOfYmd: '2026-12-01' }).length === 1,
  'stale import: Cursor still active vs last Revolut tx',
);

// YouTube aktivní
const yt = [
  { id: 'y1', amount: 389, title: 'GOOGLE *YouTubePremium', date: '2026-08-29', type: 'expense' as const },
  { id: 'y2', amount: 389, title: 'Google YouTubePremium', date: '2026-09-29', type: 'expense' as const },
];
const ytDet = detectSubscriptionCandidates(yt, { asOfYmd: '2026-10-03' });
assert(ytDet.length === 1 && ytDet[0]!.amount === 389, `yt ${JSON.stringify(ytDet)}`);

// Poplatek nesmí vytvořit Cursor návrh
const feeNoise = [
  ...cursorFx,
  {
    id: 'fee',
    amount: 12,
    title: 'Poplatek · Cursor',
    category: 'Bankovní poplatky',
    date: '2026-09-01',
    type: 'expense' as const,
  },
];
assert(detectSubscriptionCandidates(feeNoise, { asOfYmd: '2026-10-03' }).length === 1, 'fee ignored');

const revolutVarying = [
  { id: 'r1', amount: 300, title: 'REVOLUT', date: '2026-01-05', type: 'expense' as const },
  { id: 'r2', amount: 1500, title: 'REVOLUT', date: '2026-02-05', type: 'expense' as const },
  { id: 'r3', amount: 800, title: 'REVOLUT', date: '2026-03-05', type: 'expense' as const },
];
assert(detectSubscriptionCandidates(revolutVarying).length === 0, 'revolut varying');

const onlyTwo = [
  { id: 'a', amount: 79, title: 'APPLE.COM/BILL', date: '2026-08-23', type: 'expense' as const },
  { id: 'b', amount: 79, title: 'APPLE.COM/BILL', date: '2026-09-23', type: 'expense' as const },
];
assert(!!findConsecutiveSubscriptionRun(onlyTwo), '≥2 ok');
assert(collectSubscriptionClusterTxIds(onlyTwo).size === 2, 'cluster ids');

console.log('subscription-detect-selftest: OK');
