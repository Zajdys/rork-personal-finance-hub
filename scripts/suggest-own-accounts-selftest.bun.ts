/**
 * Self-test: own-account suggestions from import.
 * Run: bun scripts/suggest-own-accounts-selftest.bun.ts
 */
import {
  buildOwnAccountSuggestions,
  findOwnAccountCandidates,
  findPooledTransferCandidates,
  findRevolutCardTopupCandidates,
  findTransactionIdsMatchingAccounts,
  namesMatchOwner,
  normalizePersonNameKey,
  isPooledCounterpartyAccount,
} from '../lib/suggest-own-accounts.ts';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

assert(normalizePersonNameKey('Jan Hájek') === normalizePersonNameKey('HÁJEK JAN'), 'name key');
assert(normalizePersonNameKey('Jan Hájek') === normalizePersonNameKey('Hájek Jan'), 'name key 2');
assert(normalizePersonNameKey('Ing. Jan Hájek') === normalizePersonNameKey('HÁJEK JAN'), 'strip titles');
assert(namesMatchOwner('JAN HÁJEK', 'Jan Hájek'), 'match');
assert(namesMatchOwner('HÁJEK JAN', 'Jan Hájek'), 'match word order');
assert(!namesMatchOwner('Anna Medveďová', 'Jan Hájek'), 'no match anna');
assert(!namesMatchOwner('Jakub Matas', 'Jan Hájek'), 'no match jakub');

assert(isPooledCounterpartyAccount('2001141349/0800'), 'revolut pooled');
assert(!isPooledCounterpartyAccount('283199805/0600'), 'not pooled');

// Name match: 1 tx is enough; cards/ATM (no CP account) never suggested
const txs = [
  {
    title: 'HÁJEK JAN',
    description: 'HÁJEK JAN\n283199805/0600',
    type: 'expense' as const,
    counterpartyAccount: '283199805/0600',
    counterpartyName: 'HÁJEK JAN',
  },
  ...Array.from({ length: 47 }, () => ({
    title: 'Jan Hájek',
    description: 'Jan Hájek\n767628012/5500',
    type: 'expense' as const,
    counterpartyAccount: '767628012/5500',
    counterpartyName: 'Jan Hájek',
  })),
  ...Array.from({ length: 12 }, () => ({
    title: 'Hájek Jan',
    description: 'Hájek Jan\n4059123003/0800',
    type: 'expense' as const,
    counterpartyAccount: '4059123003/0800',
    counterpartyName: 'Hájek Jan',
  })),
  ...Array.from({ length: 31 }, () => ({
    title: 'JAN HÁJEK',
    description: 'JAN HÁJEK\n110125955/0100',
    type: 'expense' as const,
    counterpartyAccount: '110125955/0100',
    counterpartyName: 'JAN HÁJEK',
  })),
  ...Array.from({ length: 5 }, () => ({
    title: 'Anna Medveďová',
    description: 'Anna\n1234567890/0800',
    type: 'expense' as const,
    counterpartyAccount: '1234567890/0800',
    counterpartyName: 'Anna Medveďová',
  })),
  // Kartová platba — jméno držitele, ale BEZ protiúčtu → nenavrhovat
  {
    title: 'Albert',
    description: 'Platba kartou\nJAN HÁJEK',
    type: 'expense' as const,
    counterpartyAccount: null,
    counterpartyName: 'JAN HÁJEK',
  },
  // Sběrný Revolut — nikdy jako vlastní účet
  {
    title: 'Revolut',
    description: '2001141349/0800',
    type: 'expense' as const,
    counterpartyAccount: '2001141349/0800',
    counterpartyName: 'REVOLUT LTD',
  },
];

const cands = findOwnAccountCandidates({
  txs,
  ownerName: 'Jan Hájek',
  existingAccounts: [],
  dismissedKeys: [],
});

assert(cands.length === 4, `expect 4 candidates, got ${cands.length}: ${JSON.stringify(cands)}`);
assert(
  cands.every((c) => !/anna|matas|revolut/i.test(c.counterpartyName)),
  'no foreign / pooled names',
);
assert(cands.find((c) => c.accountNumber.includes('283199805'))?.count === 1, 'single tx name match');
assert(cands.find((c) => c.accountNumber.includes('767628012'))?.count === 47, '47 count');
assert(!cands.some((c) => c.accountNumber.includes('2001141349')), 'pooled excluded from own');

const dismissed = findOwnAccountCandidates({
  txs,
  ownerName: 'Jan Hájek',
  existingAccounts: [],
  dismissedKeys: [cands[0]!.key],
});
assert(dismissed.length === 3, 'dismissed one');

const existing = findOwnAccountCandidates({
  txs,
  ownerName: 'Jan Hájek',
  existingAccounts: ['767628012/5500'],
  dismissedKeys: [],
});
assert(!existing.some((c) => c.accountNumber.includes('767628012')), 'existing excluded');

const ids = findTransactionIdsMatchingAccounts(
  [
    {
      id: '1',
      category: 'Ostatní',
      counterpartyAccount: '767628012/5500',
    },
    { id: '2', category: 'Jídlo a nápoje', counterpartyAccount: null },
    {
      id: '3',
      category: 'Převod',
      counterpartyAccount: '767628012/5500',
    },
  ],
  ['767628012/5500'],
);
assert(ids.length === 1 && ids[0] === '1', `reclassify ids ${JSON.stringify(ids)}`);

// Obousměrný tok BEZ shody jména se už nenavrhuje
const biOnly = buildOwnAccountSuggestions({
  txs: [
    {
      id: 'b1',
      type: 'expense',
      counterpartyAccount: '111222333/0100',
      counterpartyName: 'Anna Medveďová',
    },
    {
      id: 'b2',
      type: 'income',
      counterpartyAccount: '111222333/0100',
      counterpartyName: 'Anna Medveďová',
    },
  ],
  ownerName: 'Jan Hájek',
  existingAccounts: [],
  dismissedKeys: [],
});
assert(biOnly.length === 0, `bidirectional without name match must be empty, got ${biOnly.length}`);

const built = buildOwnAccountSuggestions({
  txs: [
    {
      id: 'n1',
      type: 'expense',
      counterpartyAccount: '283199805/0600',
      counterpartyName: 'HÁJEK JAN',
    },
    {
      id: 'b1',
      type: 'expense',
      counterpartyAccount: '111222333/0100',
      counterpartyName: 'Někdo Jiný',
    },
    {
      id: 'b2',
      type: 'income',
      counterpartyAccount: '111222333/0100',
      counterpartyName: 'Někdo Jiný',
    },
  ],
  ownerName: 'Jan Hájek',
  existingAccounts: [],
  dismissedKeys: [],
});
assert(built.length === 1, `buildOwn got ${built.length}`);
assert(built[0]!.accountNumber.includes('283199805'), 'only name match');

assert(buildOwnAccountSuggestions({
  txs: built.map((c) => ({
    counterpartyAccount: c.accountNumber,
    counterpartyName: c.counterpartyName,
  })),
  ownerName: '',
  existingAccounts: [],
  dismissedKeys: [],
}).length === 0, 'no owner name → no suggestions');

const pooled = findPooledTransferCandidates([
  {
    id: 'p1',
    type: 'expense',
    amount: 500,
    date: '2026-01-01',
    title: 'Revolut',
    counterpartyAccount: '2001141349/0800',
    category: 'Ostatní',
  },
  {
    id: 'p2',
    type: 'expense',
    amount: 100,
    date: '2026-01-02',
    title: 'Revolut',
    counterpartyAccount: '2001141349/0800',
    category: 'Převod',
  },
]);
assert(pooled.length === 1 && pooled[0]!.id === 'p1', 'pooled candidates');
assert(pooled[0]!.serviceLabel === 'Revolut', 'pooled label');

const revolutCards = findRevolutCardTopupCandidates([
  {
    id: 'r1',
    type: 'expense',
    amount: 2000,
    date: '2026-01-03',
    title: 'Revolut**1234',
    counterpartyAccount: null,
    category: 'Ostatní',
  },
  {
    id: 'r2',
    type: 'expense',
    amount: 50,
    date: '2026-01-04',
    title: 'Albert',
    counterpartyAccount: null,
    category: 'Jídlo a nápoje',
  },
  {
    id: 'r3',
    type: 'expense',
    amount: 100,
    date: '2026-01-05',
    title: 'Revolut via CS',
    counterpartyAccount: '2001141349/0800',
    category: 'Ostatní',
  },
]);
assert(revolutCards.length === 1 && revolutCards[0]!.id === 'r1', 'revolut card topup only');

console.log(
  'OK suggest-own-accounts-selftest',
  cands.map((c) => `${c.accountNumber} ${c.count}`),
);
