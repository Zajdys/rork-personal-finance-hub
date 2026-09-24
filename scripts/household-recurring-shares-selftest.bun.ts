/**
 * Run: bun scripts/household-recurring-shares-selftest.bun.ts
 *
 * shared_half = rovný díl; Σ display == round(amount);
 * zbytek rotuje podle hash(expenseId) % n (po 1 Kč).
 */
import {
  allocateRecurringMemberShares,
  remainderRotateOffset,
  type RecurringSplitType,
} from '../lib/household-recurring-shares.ts';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function idsFor(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `user-${String.fromCharCode(97 + i)}`);
}

function sumDisplay(shares: Map<string, { shareExact: number; shareDisplay: number }>): number {
  let s = 0;
  for (const v of shares.values()) s += v.shareDisplay;
  return s;
}

function sumExact(shares: Map<string, { shareExact: number; shareDisplay: number }>): number {
  let s = 0;
  for (const v of shares.values()) s += v.shareExact;
  return s;
}

function expectedDisplay(
  amount: number,
  n: number,
  expenseId: string,
  memberIds: string[],
): number[] {
  const amountInt = Math.round(amount);
  const exactEach = amount / n;
  const floorEach = Math.floor(exactEach);
  const rem = amountInt - floorEach * n;
  const offset = remainderRotateOffset(expenseId, n);
  const out = Array.from({ length: n }, () => floorEach);
  for (let i = 0; i < rem; i++) {
    out[(offset + i) % n]! += 1;
  }
  // memberIds are sorted lex — same order as allocate
  const sorted = [...memberIds].sort((a, b) => a.localeCompare(b));
  assert(sorted.every((id, i) => id === memberIds[i]), 'idsFor must be pre-sorted');
  return out;
}

console.log('=== household recurring shares self-test ===');

for (const n of [2, 3, 4, 5] as const) {
  for (const amount of [1000, 1001, 17, 99] as const) {
    const memberIds = idsFor(n);
    const expenseId = `exp-n${n}-a${amount}`;
    const shares = allocateRecurringMemberShares({
      amount,
      split: 'shared_half',
      mySharePct: 50,
      memberIds,
      myShareOwnerUserId: memberIds[memberIds.length - 1]!,
      expenseId,
    });

    const amountInt = Math.round(amount);
    const displaySum = sumDisplay(shares);
    assert(
      displaySum === amountInt,
      `shared_half n=${n} amount=${amount}: Σ display ${displaySum} !== ${amountInt}`,
    );
    assert(
      Math.abs(sumExact(shares) - amount) < 1e-9,
      `shared_half n=${n} amount=${amount}: Σ exact !== amount`,
    );

    const exactEach = amount / n;
    for (const id of memberIds) {
      const row = shares.get(id)!;
      assert(
        Math.abs(row.shareExact - exactEach) < 1e-9,
        `shared_half n=${n}: ${id} exact ${row.shareExact} !== ${exactEach}`,
      );
    }

    const expected = expectedDisplay(amount, n, expenseId, memberIds);
    for (let i = 0; i < n; i++) {
      assert(
        shares.get(memberIds[i]!)!.shareDisplay === expected[i],
        `display n=${n} amount=${amount} i=${i}: got ${shares.get(memberIds[i]!)!.shareDisplay} expected ${expected[i]}`,
      );
    }

    // Determinismus: stejný výdaj → stejný výsledek
    const again = allocateRecurringMemberShares({
      amount,
      split: 'shared_half',
      mySharePct: 50,
      memberIds,
      myShareOwnerUserId: memberIds[0]!,
      expenseId,
    });
    for (const id of memberIds) {
      assert(
        again.get(id)!.shareDisplay === shares.get(id)!.shareDisplay,
        `deterministic n=${n} amount=${amount} ${id}`,
      );
    }
  }
}

// Rotace: různé expenseId → různý start (u amount s rem > 0)
{
  const memberIds = idsFor(3);
  const amount = 1001; // floor 333×3=999, rem=2
  const a = allocateRecurringMemberShares({
    amount,
    split: 'shared_half',
    mySharePct: 50,
    memberIds,
    myShareOwnerUserId: null,
    expenseId: 'expense-alpha',
  });
  const b = allocateRecurringMemberShares({
    amount,
    split: 'shared_half',
    mySharePct: 50,
    memberIds,
    myShareOwnerUserId: null,
    expenseId: 'expense-beta',
  });
  const offA = remainderRotateOffset('expense-alpha', 3);
  const offB = remainderRotateOffset('expense-beta', 3);
  if (offA !== offB) {
    const displaysA = memberIds.map((id) => a.get(id)!.shareDisplay);
    const displaysB = memberIds.map((id) => b.get(id)!.shareDisplay);
    assert(
      displaysA.join(',') !== displaysB.join(','),
      'different expenseId with different offset should change display distribution',
    );
  }
  assert(sumDisplay(a) === 1001 && sumDisplay(b) === 1001, 'rotation preserves sum');
}

// Spravedlnost: 10 výdajů se stejnými členy — rozdíl v počtu zbytkových Kč ≤ 1.
// Id volíme tak, aby offsety hash % 3 byly rovnoměrné (0,1,2,…); algoritmus pak
// zaručí max−min ≤ 1. Náhodné řetězce by test flákaly.
{
  const memberIds = idsFor(3);
  const amount = 100; // 100/3 → floor 33, rem=1 → jedna zbytková Kč na výdaj
  const remainderHits = new Map<string, number>();
  for (const id of memberIds) remainderHits.set(id, 0);

  const expenseIds: string[] = [];
  let probe = 0;
  for (let slot = 0; slot < 10; slot++) {
    const want = slot % 3;
    for (;;) {
      const candidate = `fairness-exp-${probe++}`;
      if (remainderRotateOffset(candidate, 3) === want) {
        expenseIds.push(candidate);
        break;
      }
      if (probe > 50_000) throw new Error('could not find expenseId for offset');
    }
  }

  for (const expenseId of expenseIds) {
    const shares = allocateRecurringMemberShares({
      amount,
      split: 'shared_half',
      mySharePct: 50,
      memberIds,
      myShareOwnerUserId: null,
      expenseId,
    });
    assert(sumDisplay(shares) === 100, `fairness sum ${expenseId}`);
    const floorEach = Math.floor(amount / 3);
    for (const id of memberIds) {
      const extra = shares.get(id)!.shareDisplay - floorEach;
      if (extra > 0) {
        remainderHits.set(id, (remainderHits.get(id) ?? 0) + extra);
      }
    }
  }

  const hits = memberIds.map((id) => remainderHits.get(id) ?? 0);
  const maxH = Math.max(...hits);
  const minH = Math.min(...hits);
  assert(
    maxH - minH <= 1,
    `fairness remainder hits spread ${maxH - minH} > 1 (hits=${hits.join(',')})`,
  );
}

// rem > 1: 5 členů, amount 17 → floor 3×5=15, rem=2 — po jedné koruně dvěma členům
{
  const memberIds = idsFor(5);
  const expenseId = 'rem-gt1';
  const shares = allocateRecurringMemberShares({
    amount: 17,
    split: 'shared_half',
    mySharePct: 50,
    memberIds,
    myShareOwnerUserId: null,
    expenseId,
  });
  assert(sumDisplay(shares) === 17, 'rem>1 sum');
  const displays = memberIds.map((id) => shares.get(id)!.shareDisplay);
  const threes = displays.filter((d) => d === 3).length;
  const fours = displays.filter((d) => d === 4).length;
  assert(threes === 3 && fours === 2, `rem>1 split got 3s=${threes} 4s=${fours}`);
}

// 3 členové: autor nesmí platit dvojnásobek
{
  const memberIds = ['aaa', 'bbb', 'ccc'];
  const shares = allocateRecurringMemberShares({
    amount: 900,
    split: 'shared_half',
    mySharePct: 50,
    memberIds,
    myShareOwnerUserId: 'aaa',
    expenseId: 'eq-900',
  });
  assert(shares.get('aaa')!.shareExact === 300, '3-way author exact 300');
  assert(shares.get('bbb')!.shareExact === 300, '3-way b exact 300');
  assert(shares.get('ccc')!.shareExact === 300, '3-way c exact 300');
  assert(sumDisplay(shares) === 900, '3-way display sum 900');
}

// mine: 100 % autorovi
{
  const memberIds = ['aaa', 'bbb', 'ccc'];
  const shares = allocateRecurringMemberShares({
    amount: 500,
    split: 'mine' as RecurringSplitType,
    mySharePct: 100,
    memberIds,
    myShareOwnerUserId: 'bbb',
    expenseId: 'mine-500',
  });
  assert(shares.get('bbb')!.shareExact === 500 && shares.get('bbb')!.shareDisplay === 500, 'mine owner');
  assert(shares.get('aaa')!.shareExact === 0 && shares.get('ccc')!.shareExact === 0, 'mine others 0');
  assert(sumDisplay(shares) === 500, 'mine display sum');
}

// shared_custom: my_share autorovi, zbytek rovně ostatním
{
  const memberIds = ['aaa', 'bbb', 'ccc'];
  const shares = allocateRecurringMemberShares({
    amount: 1000,
    split: 'shared_custom',
    mySharePct: 40,
    memberIds,
    myShareOwnerUserId: 'aaa',
    expenseId: 'custom-1000',
  });
  assert(Math.abs(shares.get('aaa')!.shareExact - 400) < 1e-9, 'custom author 40%');
  assert(Math.abs(shares.get('bbb')!.shareExact - 300) < 1e-9, 'custom other 30%');
  assert(Math.abs(shares.get('ccc')!.shareExact - 300) < 1e-9, 'custom other 30%');
  assert(sumDisplay(shares) === 1000, 'custom display sum');
}

console.log('OK — all assertions passed');
