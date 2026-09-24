/**
 * Run: bun scripts/household-settlements-selftest.bun.ts
 */
import {
  applySettlementsToBalancesExact,
  computeHouseholdBalancesExact,
  isHouseholdBalanceSettled,
  listRecurringOccurrencesThroughToday,
  settlementAmountToSave,
  simplifyHouseholdDebts,
  sumExactBalances,
  type RecurringExpenseSettlementInput,
  type SharedExpenseSettlementInput,
} from '../lib/household-settlements.ts';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

const members = [
  { userId: 'aaa-user', name: 'Anna' },
  { userId: 'bbb-user', name: 'Bob' },
];
const memberIds = members.map((m) => m.userId);

const recurringHalf: RecurringExpenseSettlementInput = {
  amount: 1000,
  splitType: 'shared_half',
  myShare: 50,
  createdBy: 'aaa-user',
  addedBy: 'aaa-user',
  paymentMode: 'single_payer',
  payerUserId: 'aaa-user',
  frequency: 'monthly',
  dueDay: 1,
  dueWeekday: null,
  dueMonth: null,
  createdAt: '2026-09-01T00:00:00Z',
};

const sharedHalf: SharedExpenseSettlementInput = {
  amount: 200,
  splitType: 'half',
  splitPercent: 50,
  paidBy: 'aaa-user',
  addedBy: 'aaa-user',
  paymentMode: 'single_payer',
  expenseDate: '2026-09-10',
};

const asOfSep = new Date('2026-09-20T12:00:00');

console.log('=== household settlements self-test ===');

const bal1 = computeHouseholdBalancesExact({
  memberIds,
  recurring: [recurringHalf],
  shared: [sharedHalf],
  settlements: [],
  asOf: asOfSep,
});
assert(Math.abs(sumExactBalances(bal1)) < 1e-4, `balances must sum to 0, got ${sumExactBalances(bal1)}`);
assert(Math.abs((bal1.get('aaa-user') ?? 0) - 600) < 1e-4, `Anna expected +600, got ${bal1.get('aaa-user')}`);
assert(Math.abs((bal1.get('bbb-user') ?? 0) + 600) < 1e-4, `Bob expected -600, got ${bal1.get('bbb-user')}`);

const debts = simplifyHouseholdDebts(members, bal1);
assert(debts.length === 1, `expected 1 transfer, got ${debts.length}`);
assert(debts[0]!.fromUserId === 'bbb-user' && debts[0]!.toUserId === 'aaa-user', 'transfer direction');
assert(debts[0]!.amountDisplay === 600, `amount 600, got ${debts[0]!.amountDisplay}`);
assert(debts[0]!.amountExact === 600, `amountExact 600, got ${debts[0]!.amountExact}`);

assert(isHouseholdBalanceSettled(new Map([
  ['aaa-user', 0.5],
  ['bbb-user', -0.5],
])), 'sub-1kc residual is settled');
assert(!isHouseholdBalanceSettled(new Map([
  ['aaa-user', 1],
  ['bbb-user', -1],
])), '1kc debt not settled');

const halfKcBal = new Map<string, number>([
  ['aaa-user', 9001.5],
  ['bbb-user', -9001.5],
]);
const halfDebts = simplifyHouseholdDebts(members, halfKcBal);
assert(halfDebts.length === 1, 'one transfer for 9001.5');
assert(halfDebts[0]!.amountDisplay === 9002, 'UI shows 9002');
assert(halfDebts[0]!.amountExact === 9001.5, 'exact 9001.5');

const savedFull = settlementAmountToSave({
  enteredAmount: 9002,
  prefillDisplayKc: 9002,
  amountExact: 9001.5,
});
assert(savedFull === 9001.5, `full settle saves exact, got ${savedFull}`);

const savedPartial = settlementAmountToSave({
  enteredAmount: 4000,
  prefillDisplayKc: 9002,
  amountExact: 9001.5,
});
assert(savedPartial === 4000, 'partial uses entered');

const afterFullSettle = new Map(halfKcBal);
applySettlementsToBalancesExact(afterFullSettle, [
  {
    id: 'half',
    householdId: 'h',
    fromUserId: 'bbb-user',
    toUserId: 'aaa-user',
    amount: savedFull,
    note: null,
    createdBy: 'bbb-user',
    createdAt: '2026-09-16T12:00:00Z',
  },
]);
assert(isHouseholdBalanceSettled(afterFullSettle), 'after exact full settle: Vyrovnáno');
assert(Math.abs(afterFullSettle.get('aaa-user') ?? 0) < 1e-6, 'Anna balance exactly 0');
assert(Math.abs(afterFullSettle.get('bbb-user') ?? 0) < 1e-6, 'Bob balance exactly 0');
assert(simplifyHouseholdDebts(members, afterFullSettle).length === 0, 'no settle buttons');

const balEachOwn = computeHouseholdBalancesExact({
  memberIds,
  recurring: [{ ...recurringHalf, paymentMode: 'each_own_share' }],
  shared: [{ ...sharedHalf, paymentMode: 'each_own_share' }],
  settlements: [],
  asOf: asOfSep,
});
assert(Math.abs(sumExactBalances(balEachOwn)) < 1e-4, 'each_own_share sum 0');
assert(Math.abs(balEachOwn.get('aaa-user') ?? 0) < 1e-4 && Math.abs(balEachOwn.get('bbb-user') ?? 0) < 1e-4, 'each_own all zero');

const mineSingleMember: RecurringExpenseSettlementInput = {
  amount: 500,
  splitType: 'mine',
  myShare: 100,
  createdBy: 'aaa-user',
  addedBy: 'aaa-user',
  paymentMode: 'single_payer',
  payerUserId: 'aaa-user',
  frequency: 'monthly',
  dueDay: 5,
  dueWeekday: null,
  dueMonth: null,
  createdAt: '2026-08-01T00:00:00Z',
};
const balSolo = computeHouseholdBalancesExact({
  memberIds: ['aaa-user'],
  recurring: [mineSingleMember],
  shared: [],
  settlements: [],
  asOf: asOfSep,
});
assert(Math.abs(sumExactBalances(balSolo)) < 1e-4, 'solo payer+bearer sum 0');
assert(Math.abs(balSolo.get('aaa-user') ?? 0) < 1e-4, 'solo balance 0');

const balAfterSettle = computeHouseholdBalancesExact({
  memberIds,
  recurring: [recurringHalf],
  shared: [],
  settlements: [
    {
      id: '1',
      householdId: 'h',
      fromUserId: 'bbb-user',
      toUserId: 'aaa-user',
      amount: 500,
      note: null,
      createdBy: 'bbb-user',
      createdAt: '2026-09-15T12:00:00Z',
    },
  ],
  asOf: asOfSep,
});
assert(Math.abs(sumExactBalances(balAfterSettle)) < 1e-4, 'after partial settlement sum 0');
assert(Math.abs(balAfterSettle.get('aaa-user') ?? 0) < 1e-4, 'Anna +0 after 500 settle on 500 debt half');

/** Výdaj v září, vyrovnání v říjnu — kumulativní saldo musí být 0; stejné bez ohledu na „zvolený měsíc“ v UI. */
const septShared: SharedExpenseSettlementInput = {
  amount: 1000,
  splitType: 'half',
  splitPercent: 50,
  paidBy: 'aaa-user',
  addedBy: 'aaa-user',
  paymentMode: 'single_payer',
  expenseDate: '2026-09-05',
};

const asOfOct = new Date('2026-10-25T12:00:00');

const debtOct = computeHouseholdBalancesExact({
  memberIds,
  recurring: [],
  shared: [septShared],
  settlements: [],
  asOf: asOfOct,
});
assert(!isHouseholdBalanceSettled(debtOct), 'debt before October settlement');
assert(Math.abs((debtOct.get('aaa-user') ?? 0) - 500) < 1e-4, 'Anna +500 from Sept expense');

const octSettlement = {
  id: '2',
  householdId: 'h',
  fromUserId: 'bbb-user',
  toUserId: 'aaa-user',
  amount: 500,
  note: 'říjen',
  createdBy: 'bbb-user',
  createdAt: '2026-10-12T10:00:00Z',
};

const settledOct = computeHouseholdBalancesExact({
  memberIds,
  recurring: [],
  shared: [septShared],
  settlements: [octSettlement],
  asOf: asOfOct,
});
assert(isHouseholdBalanceSettled(settledOct), 'settled after October payment');
assert(Math.abs(sumExactBalances(settledOct)) < 1e-4, 'cross-month settled sum 0');

/** Stejné saldo při stejném asOf — simulace přepnutí měsíce v seznamu nemění výpočet. */
const settledOctDuplicate = computeHouseholdBalancesExact({
  memberIds,
  recurring: [],
  shared: [septShared],
  settlements: [octSettlement],
  asOf: asOfOct,
});
assert(
  Math.abs((settledOctDuplicate.get('aaa-user') ?? 0) - (settledOct.get('aaa-user') ?? 0)) < 1e-4,
  'balance identical on repeat compute (month picker irrelevant)',
);

const elektroCreatedMay31: RecurringExpenseSettlementInput = {
  amount: 5000,
  splitType: 'shared_half',
  myShare: 50,
  createdBy: 'aaa-user',
  addedBy: 'aaa-user',
  paymentMode: 'single_payer',
  payerUserId: 'aaa-user',
  frequency: 'monthly',
  dueDay: 20,
  dueWeekday: null,
  dueMonth: null,
  createdAt: '2026-05-31T10:00:00Z',
};

const asOfSep16 = new Date('2026-09-16T12:00:00');

const elektroOcc = listRecurringOccurrencesThroughToday(elektroCreatedMay31, asOfSep16);
assert(!elektroOcc.includes('2026-05-20'), 'May 20 before creation excluded');
assert(!elektroOcc.includes('2026-09-20'), 'September 20 after asOf excluded');
assert(elektroOcc.length === 3, `expected 3 occurrences, got ${elektroOcc.join(', ')}`);

const annaElektroBal = computeHouseholdBalancesExact({
  memberIds,
  recurring: [elektroCreatedMay31],
  shared: [],
  settlements: [],
  asOf: asOfSep16,
});
assert(Math.abs((annaElektroBal.get('aaa-user') ?? 0) - 7500) < 1e-4, `Anna elektro saldo expected 7500, got ${annaElektroBal.get('aaa-user')}`);

/** Změna režimu od data X nezasáhne starší výskyty. */
const switchedMode: RecurringExpenseSettlementInput = {
  amount: 1000,
  splitType: 'shared_half',
  myShare: 50,
  createdBy: 'aaa-user',
  addedBy: 'aaa-user',
  paymentMode: 'single_payer',
  payerUserId: 'aaa-user',
  paymentPeriods: [
    {
      paymentMode: 'each_own_share',
      payerUserId: null,
      effectiveFrom: '2026-06-01',
    },
    {
      paymentMode: 'single_payer',
      payerUserId: 'aaa-user',
      effectiveFrom: '2026-08-01',
    },
  ],
  frequency: 'monthly',
  dueDay: 15,
  dueWeekday: null,
  dueMonth: null,
  createdAt: '2026-06-01T00:00:00Z',
};

const asOfAug20 = new Date('2026-08-20T12:00:00');
const switchedBal = computeHouseholdBalancesExact({
  memberIds,
  recurring: [switchedMode],
  shared: [],
  settlements: [],
  asOf: asOfAug20,
});
// Výskyty 15.6 a 15.7 = each_own → 0; 15.8 = single_payer → Anna +500
assert(
  Math.abs((switchedBal.get('aaa-user') ?? 0) - 500) < 1e-4,
  `period switch: Anna +500 (only Aug), got ${switchedBal.get('aaa-user')}`,
);
assert(Math.abs(sumExactBalances(switchedBal)) < 1e-4, 'period switch sums to 0');

/** 3 členové + shared_half: autor neplatí dvojnásobek (rovný díl). */
{
  const three = ['aaa-user', 'bbb-user', 'ccc-user'];
  const bal3 = computeHouseholdBalancesExact({
    memberIds: three,
    recurring: [
      {
        amount: 900,
        splitType: 'shared_half',
        myShare: 50,
        createdBy: 'aaa-user',
        addedBy: 'aaa-user',
        paymentMode: 'single_payer',
        payerUserId: 'aaa-user',
        frequency: 'monthly',
        dueDay: 1,
        dueWeekday: null,
        dueMonth: null,
        createdAt: '2026-09-01T00:00:00Z',
      },
    ],
    shared: [],
    settlements: [],
    asOf: asOfSep,
  });
  // Anna zaplatila 900, každý nese 300 → Anna +600
  assert(Math.abs((bal3.get('aaa-user') ?? 0) - 600) < 1e-4, `3-way Anna +600, got ${bal3.get('aaa-user')}`);
  assert(Math.abs((bal3.get('bbb-user') ?? 0) + 300) < 1e-4, `3-way Bob -300, got ${bal3.get('bbb-user')}`);
  assert(Math.abs((bal3.get('ccc-user') ?? 0) + 300) < 1e-4, `3-way Ccc -300, got ${bal3.get('ccc-user')}`);
  assert(Math.abs(sumExactBalances(bal3)) < 1e-4, '3-way sum 0');
}

console.log('OK — all assertions passed');
