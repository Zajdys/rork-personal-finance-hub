/**
 * Podíly členů na pravidelném výdaji domácnosti.
 *
 * - shareExact: nezaokrouhlené (procenta, agregace)
 * - shareDisplay: celé Kč (UI); zbytek po 1 Kč rotací od hash(expense_id)
 *
 * - mine: 100 % autorovi
 * - shared_half („Rovným dílem“): částka / počet členů — autor nemá zvláštní postavení
 * - shared_custom: my_share % autorovi, zbytek rovně mezi ostatní
 */

export type RecurringSplitType = 'mine' | 'shared_half' | 'shared_custom';

export type MemberShareAmounts = {
  shareExact: number;
  shareDisplay: number;
};

export function clampMySharePct(n: number): number {
  if (!Number.isFinite(n)) return 100;
  return Math.min(100, Math.max(0, Math.round(n)));
}

const EPS = 1e-9;

function sortedUniqueIds(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

/** Stabilní 32bit hash řetězce (FNV-1a) — pro rotaci zbytku. */
export function stableStringHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Offset do seřazených členů: hash(expenseId) % n. Bez id → 0. */
export function remainderRotateOffset(
  expenseId: string | null | undefined,
  memberCount: number,
): number {
  if (memberCount <= 0) return 0;
  if (!expenseId) return 0;
  return stableStringHash(expenseId) % memberCount;
}

/**
 * Exact → celé Kč; Σ display == round(amount).
 * Zbytek po 1 Kč od indexu hash(expenseId) % n (cyklicky).
 */
function exactMapToDisplay(
  exactById: Map<string, number>,
  amount: number,
  expenseId?: string | null,
): Map<string, number> {
  const amountInt = Math.round(Math.abs(Number(amount) || 0));
  const ids = sortedUniqueIds([...exactById.keys()]);
  const display = new Map<string, number>();
  let sumFloor = 0;
  for (const id of ids) {
    const f = Math.floor(exactById.get(id) ?? 0);
    display.set(id, f);
    sumFloor += f;
  }
  let rem = amountInt - sumFloor;
  if (rem <= 0 || ids.length === 0) return display;

  const offset = remainderRotateOffset(expenseId, ids.length);
  for (let i = 0; i < rem; i++) {
    const id = ids[(offset + i) % ids.length]!;
    display.set(id, (display.get(id) ?? 0) + 1);
  }
  return display;
}

function emptyShares(ids: string[]): Map<string, MemberShareAmounts> {
  const out = new Map<string, MemberShareAmounts>();
  for (const id of ids) out.set(id, { shareExact: 0, shareDisplay: 0 });
  return out;
}

/**
 * Alokace podílů.
 * - mine: 100 % autorovi (myShareOwnerUserId), ostatní 0
 * - shared_half: částka / počet členů (všichni stejně)
 * - shared_custom: my_share % autorovi, zbytek rovně mezi ostatní
 * - expenseId: volitelné — rotace zaokrouhlovacího zbytku (deterministická)
 */
export function allocateRecurringMemberShares(opts: {
  amount: number;
  split: RecurringSplitType;
  mySharePct: number;
  memberIds: string[];
  /** Vlastník my_share % = autor výdaje (created_by / added_by). U shared_half se ignoruje. */
  myShareOwnerUserId: string | null;
  /** Stabilní id výdaje — rotace zbytku Kč. */
  expenseId?: string | null;
}): Map<string, MemberShareAmounts> {
  const amountNum = Math.abs(Number(opts.amount) || 0);
  const ids = sortedUniqueIds(opts.memberIds);
  if (ids.length === 0 || amountNum <= 0) return emptyShares(ids);

  const exact = new Map<string, number>();
  for (const id of ids) exact.set(id, 0);

  const owner =
    opts.myShareOwnerUserId && exact.has(opts.myShareOwnerUserId)
      ? opts.myShareOwnerUserId
      : ids[0]!;

  if (opts.split === 'mine') {
    exact.set(owner, amountNum);
  } else if (opts.split === 'shared_half') {
    const each = amountNum / ids.length;
    for (const id of ids) exact.set(id, each);
  } else {
    // shared_custom
    const others = ids.filter((id) => id !== owner);
    if (others.length === 0) {
      exact.set(owner, amountNum);
    } else {
      const pct = clampMySharePct(opts.mySharePct);
      const ownerExact = (amountNum * pct) / 100;
      exact.set(owner, ownerExact);
      const rest = amountNum - ownerExact;
      const each = rest / others.length;
      for (const id of others) exact.set(id, each);
    }
  }

  const display = exactMapToDisplay(exact, amountNum, opts.expenseId);
  const out = new Map<string, MemberShareAmounts>();
  for (const id of ids) {
    out.set(id, {
      shareExact: exact.get(id) ?? 0,
      shareDisplay: display.get(id) ?? 0,
    });
  }
  return out;
}

/** @deprecated použij allocateRecurringMemberShares — vrací shareDisplay. */
export function allocateRecurringMemberSharesKc(opts: {
  amount: number;
  split: RecurringSplitType;
  mySharePct: number;
  memberIds: string[];
  authorUserId: string | null;
  expenseId?: string | null;
}): Map<string, number> {
  const shares = allocateRecurringMemberShares({
    ...opts,
    myShareOwnerUserId: opts.authorUserId,
  });
  const out = new Map<string, number>();
  for (const [id, s] of shares) out.set(id, s.shareDisplay);
  return out;
}

export function memberShareExact(
  amount: number,
  split: RecurringSplitType,
  mySharePct: number,
  memberIds: string[],
  myShareOwnerUserId: string | null,
  userId: string | undefined,
  expenseId?: string | null,
): number {
  if (!userId) return 0;
  return (
    allocateRecurringMemberShares({
      amount,
      split,
      mySharePct,
      memberIds,
      myShareOwnerUserId,
      expenseId,
    }).get(userId)?.shareExact ?? 0
  );
}

export function memberShareDisplay(
  amount: number,
  split: RecurringSplitType,
  mySharePct: number,
  memberIds: string[],
  myShareOwnerUserId: string | null,
  userId: string | undefined,
  expenseId?: string | null,
): number {
  if (!userId) return 0;
  return (
    allocateRecurringMemberShares({
      amount,
      split,
      mySharePct,
      memberIds,
      myShareOwnerUserId,
      expenseId,
    }).get(userId)?.shareDisplay ?? 0
  );
}

/** @deprecated alias pro memberShareDisplay */
export function memberShareKc(
  amount: number,
  split: RecurringSplitType,
  mySharePct: number,
  memberIds: string[],
  authorUserId: string | null,
  userId: string | undefined,
  expenseId?: string | null,
): number {
  return memberShareDisplay(
    amount,
    split,
    mySharePct,
    memberIds,
    authorUserId,
    userId,
    expenseId,
  );
}

/** Progress z exact podílů (ne ze zaokrouhlených Kč). */
export function recurringPaidAmountPercent(
  amount: number,
  shares: Map<string, MemberShareAmounts>,
  paidUserIds: ReadonlySet<string> | readonly string[],
): number {
  const total = Math.abs(Number(amount) || 0);
  if (total <= EPS) return 0;
  const paidSet = paidUserIds instanceof Set ? paidUserIds : new Set(paidUserIds);
  let paidSum = 0;
  for (const [uid, share] of shares) {
    if (share.shareExact > EPS && paidSet.has(uid)) paidSum += share.shareExact;
  }
  return Math.min(100, Math.round((paidSum / total) * 100));
}

/** Hotovo = všichni s nenulovým exact podílem zaplatili. */
export function isRecurringItemFullyPaid(
  shares: Map<string, MemberShareAmounts>,
  paidUserIds: ReadonlySet<string> | readonly string[],
): boolean {
  const paidSet = paidUserIds instanceof Set ? paidUserIds : new Set(paidUserIds);
  const responsible = [...shares.entries()]
    .filter(([, s]) => s.shareExact > EPS)
    .map(([id]) => id);
  if (responsible.length === 0) return false;
  return responsible.every((id) => paidSet.has(id));
}

export function sumPaidMemberSharesExact(
  shares: Map<string, MemberShareAmounts>,
  paidUserIds: ReadonlySet<string> | readonly string[],
): number {
  const paidSet = paidUserIds instanceof Set ? paidUserIds : new Set(paidUserIds);
  let sum = 0;
  for (const [uid, share] of shares) {
    if (share.shareExact > EPS && paidSet.has(uid)) sum += share.shareExact;
  }
  return sum;
}

export function sumPaidMemberSharesDisplay(
  shares: Map<string, MemberShareAmounts>,
  paidUserIds: ReadonlySet<string> | readonly string[],
): number {
  const paidSet = paidUserIds instanceof Set ? paidUserIds : new Set(paidUserIds);
  let sum = 0;
  for (const [uid, share] of shares) {
    if (share.shareExact > EPS && paidSet.has(uid)) sum += share.shareDisplay;
  }
  return sum;
}

/** @deprecated použij sumPaidMemberSharesExact / Display */
export function sumPaidMemberSharesKc(
  shares: Map<string, number> | Map<string, MemberShareAmounts>,
  paidUserIds: ReadonlySet<string> | readonly string[],
): number {
  const paidSet = paidUserIds instanceof Set ? paidUserIds : new Set(paidUserIds);
  let sum = 0;
  for (const [uid, share] of shares) {
    if (typeof share === 'number') {
      if (share > EPS && paidSet.has(uid)) sum += share;
    } else if (share.shareExact > EPS && paidSet.has(uid)) {
      sum += share.shareDisplay;
    }
  }
  return sum;
}

/**
 * ZAPLACENO / NEZAPLACENO na souhrnu: exact agregace, display tak, aby součet == total.
 * Preferuje Math.round(paidExact); NEZAPLACENO dorovná zbytek.
 */
export function paidUnpaidDisplayFromExact(
  paidExact: number,
  totalAmount: number,
): { paidDisplay: number; unpaidDisplay: number } {
  const totalInt = Math.round(Math.abs(Number(totalAmount) || 0));
  const paidDisplay = Math.round(Math.max(0, paidExact));
  const clampedPaid = Math.min(totalInt, Math.max(0, paidDisplay));
  return { paidDisplay: clampedPaid, unpaidDisplay: totalInt - clampedPaid };
}
