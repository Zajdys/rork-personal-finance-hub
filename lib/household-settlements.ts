/**
 * Saldo a vyrovnání domácnosti: balance = Σ(zaplatil) − Σ(nese), minus převody.
 * Podíly přes allocateRecurringMemberShares (exact); zaokrouhlení až na výstup.
 */

import { listRecurringOccurrencesInMonth, type RecurringFrequency } from '@/lib/recurring-expense-cycle';
import {
  allocateRecurringMemberShares,
  clampMySharePct,
  type RecurringSplitType,
} from '@/lib/household-recurring-shares';
import {
  clampSplitPercent,
  normalizeSharedSplitType,
  type SharedExpenseSplitType,
} from '@/lib/household-shared-expenses';

export type ExpensePaymentMode = 'each_own_share' | 'single_payer';

export type HouseholdSettlement = {
  id: string;
  householdId: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  note: string | null;
  createdBy: string;
  createdAt: string;
};

export type RecurringPaymentPeriod = {
  paymentMode: ExpensePaymentMode;
  payerUserId: string | null;
  /** YYYY-MM-DD — platnost od tohoto dne včetně. */
  effectiveFrom: string;
};

export type RecurringExpenseSettlementInput = {
  amount: number;
  splitType: RecurringSplitType;
  myShare: number;
  createdBy: string | null;
  addedBy: string | null;
  /** Aktuální režim (sloupec recurring_expenses) — fallback bez historie. */
  paymentMode: ExpensePaymentMode;
  payerUserId: string | null;
  /** Historie režimů; prázdné = použij paymentMode / payerUserId. */
  paymentPeriods?: RecurringPaymentPeriod[];
  frequency: string;
  dueDay: number | null;
  dueWeekday: number | null;
  dueMonth: number | null;
  /** ISO timestamp založení položky — od tohoto měsíce se počítají výskyty do dneška. */
  createdAt: string | null;
};

export type SharedExpenseSettlementInput = {
  amount: number;
  splitType: SharedExpenseSplitType;
  splitPercent: number;
  paidBy: string;
  addedBy: string | null;
  paymentMode: ExpensePaymentMode;
  expenseDate: string;
};

export type HouseholdMemberRef = {
  userId: string;
  name: string;
};

export type HouseholdSimplifiedTransfer = {
  fromUserId: string;
  fromName: string;
  toUserId: string;
  toName: string;
  /** Celé Kč pro UI. */
  amountDisplay: number;
  /** Přesná částka převodu (pro uložení při plném vyrovnání). */
  amountExact: number;
};

/** Zbytkové saldo |x| < 1 Kč považujeme za vyrovnané. */
export const SETTLEMENT_BALANCE_ZERO_THRESHOLD_KC = 1;

const EPS = 1e-6;

export function normalizeExpensePaymentMode(raw: unknown): ExpensePaymentMode {
  return raw === 'single_payer' ? 'single_payer' : 'each_own_share';
}

function recurringOwnerId(item: { createdBy: string | null; addedBy: string | null }): string | null {
  return item.createdBy ?? item.addedBy ?? null;
}

/** Podíly u společného výdaje — stejná logika jako u pravidelných (owner = plátce / paidBy). */
export function allocateSharedMemberShares(opts: {
  amount: number;
  splitType: SharedExpenseSplitType;
  splitPercent: number;
  memberIds: string[];
  paidByUserId: string;
}): Map<string, { shareExact: number; shareDisplay: number }> {
  const split: RecurringSplitType =
    opts.splitType === 'me'
      ? 'mine'
      : opts.splitType === 'custom'
        ? 'shared_custom'
        : 'shared_half';
  const mySharePct =
    opts.splitType === 'me'
      ? 100
      : opts.splitType === 'half'
        ? 50
        : clampMySharePct(clampSplitPercent(opts.splitPercent));
  return allocateRecurringMemberShares({
    amount: opts.amount,
    split,
    mySharePct,
    memberIds: opts.memberIds,
    myShareOwnerUserId: opts.paidByUserId,
  });
}

function initExactBalances(memberIds: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const id of memberIds) m.set(id, 0);
  return m;
}

function isoDateFromDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function recurringOccurrenceFields(item: RecurringExpenseSettlementInput) {
  return {
    frequency: item.frequency as RecurringFrequency,
    dueDay: item.dueDay ?? item.dueWeekday ?? 1,
    dueWeekday: item.dueWeekday,
    dueMonth: item.dueMonth,
  };
}

/**
 * Všechny splatnosti od měsíce založení položky do asOf (včetně).
 * Vyloučí due_date před created_at::date a splatnosti po asOf.
 */
export function listRecurringOccurrencesThroughToday(
  item: RecurringExpenseSettlementInput,
  asOf: Date = new Date(),
): string[] {
  const todayYmd = isoDateFromDate(asOf);
  const createdYmd = item.createdAt
    ? isoDateFromDate(new Date(item.createdAt))
    : null;

  let startY = asOf.getFullYear();
  let startM = asOf.getMonth() + 1;
  if (item.createdAt) {
    const created = new Date(item.createdAt);
    if (!Number.isNaN(created.getTime())) {
      startY = created.getFullYear();
      startM = created.getMonth() + 1;
    }
  }

  const endY = asOf.getFullYear();
  const endM = asOf.getMonth() + 1;
  const fields = recurringOccurrenceFields(item);
  const out: string[] = [];

  let y = startY;
  let m = startM;
  while (y < endY || (y === endY && m <= endM)) {
    for (const occ of listRecurringOccurrencesInMonth(fields, y, m)) {
      if (occ > todayYmd) continue;
      if (createdYmd && occ < createdYmd) continue;
      out.push(occ);
    }
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }

  return out;
}

function applySinglePayerExpense(
  balances: Map<string, number>,
  memberIds: string[],
  amount: number,
  payerUserId: string | null,
  shares: Map<string, { shareExact: number; shareDisplay: number }>,
): void {
  if (!payerUserId || !balances.has(payerUserId)) return;
  const amountNum = Math.abs(Number(amount) || 0);
  if (amountNum <= EPS) return;

  balances.set(payerUserId, (balances.get(payerUserId) ?? 0) + amountNum);
  for (const id of memberIds) {
    const borne = shares.get(id)?.shareExact ?? 0;
    if (borne > EPS) {
      balances.set(id, (balances.get(id) ?? 0) - borne);
    }
  }
}

/** Režim platby platný k due_date (nejnovější effective_from ≤ due). */
export function resolvePaymentPeriodAtDate(
  periods: readonly RecurringPaymentPeriod[] | undefined,
  dueDateYmd: string,
  fallback: { paymentMode: ExpensePaymentMode; payerUserId: string | null },
): { paymentMode: ExpensePaymentMode; payerUserId: string | null } {
  if (!periods || periods.length === 0) return fallback;
  let best: RecurringPaymentPeriod | null = null;
  for (const p of periods) {
    if (p.effectiveFrom > dueDateYmd) continue;
    if (!best || p.effectiveFrom > best.effectiveFrom) best = p;
  }
  if (!best) return fallback;
  return { paymentMode: best.paymentMode, payerUserId: best.payerUserId };
}

export function mapPaymentPeriodRow(row: Record<string, unknown>): RecurringPaymentPeriod {
  return {
    paymentMode: normalizeExpensePaymentMode(row.payment_mode),
    payerUserId:
      row.payer_user_id != null && row.payer_user_id !== '' ? String(row.payer_user_id) : null,
    effectiveFrom: String(row.effective_from ?? '').slice(0, 10),
  };
}

export function applyRecurringToBalancesExact(
  balances: Map<string, number>,
  memberIds: string[],
  item: RecurringExpenseSettlementInput,
  asOf: Date = new Date(),
): void {
  const occDates = listRecurringOccurrencesThroughToday(item, asOf);
  if (occDates.length === 0) return;

  const shares = allocateRecurringMemberShares({
    amount: item.amount,
    split: item.splitType,
    mySharePct: item.myShare,
    memberIds,
    myShareOwnerUserId: recurringOwnerId(item),
  });

  const fallback = { paymentMode: item.paymentMode, payerUserId: item.payerUserId };
  for (const dueDate of occDates) {
    const period = resolvePaymentPeriodAtDate(item.paymentPeriods, dueDate, fallback);
    if (period.paymentMode !== 'single_payer') continue;
    applySinglePayerExpense(balances, memberIds, item.amount, period.payerUserId, shares);
  }
}

export function applySharedToBalancesExact(
  balances: Map<string, number>,
  memberIds: string[],
  item: SharedExpenseSettlementInput,
  asOf: Date = new Date(),
): void {
  if (item.paymentMode !== 'single_payer') return;
  const todayYmd = isoDateFromDate(asOf);
  if (item.expenseDate > todayYmd) return;
  const shares = allocateSharedMemberShares({
    amount: item.amount,
    splitType: normalizeSharedSplitType(item.splitType),
    splitPercent: item.splitPercent,
    memberIds,
    paidByUserId: item.paidBy,
  });
  applySinglePayerExpense(balances, memberIds, item.amount, item.paidBy, shares);
}

export function applySettlementsToBalancesExact(
  balances: Map<string, number>,
  settlements: readonly HouseholdSettlement[],
): void {
  for (const st of settlements) {
    if (balances.has(st.fromUserId)) {
      balances.set(st.fromUserId, (balances.get(st.fromUserId) ?? 0) + st.amount);
    }
    if (balances.has(st.toUserId)) {
      balances.set(st.toUserId, (balances.get(st.toUserId) ?? 0) - st.amount);
    }
  }
}

export function computeHouseholdBalancesExact(params: {
  memberIds: string[];
  recurring: readonly RecurringExpenseSettlementInput[];
  shared: readonly SharedExpenseSettlementInput[];
  settlements: readonly HouseholdSettlement[];
  /** Konec období pro splatnosti (typicky dnes). */
  asOf?: Date;
}): Map<string, number> {
  const asOf = params.asOf ?? new Date();
  const balances = initExactBalances(params.memberIds);

  for (const item of params.recurring) {
    applyRecurringToBalancesExact(balances, params.memberIds, item, asOf);
  }
  for (const item of params.shared) {
    applySharedToBalancesExact(balances, params.memberIds, item, asOf);
  }
  applySettlementsToBalancesExact(balances, params.settlements);

  return balances;
}

export function sumExactBalances(balances: Map<string, number>): number {
  let s = 0;
  for (const v of balances.values()) s += v;
  return s;
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function balanceTreatedAsZero(b: number): boolean {
  return Math.abs(b) < SETTLEMENT_BALANCE_ZERO_THRESHOLD_KC;
}

/** Kolik Kč uložit — plné vyrovnání (beze změny předvyplnění) = amountExact. */
export function settlementAmountToSave(params: {
  enteredAmount: number;
  prefillDisplayKc: number;
  amountExact: number;
}): number {
  const entered = roundMoney(params.enteredAmount);
  const prefill = Math.round(params.prefillDisplayKc);
  if (Math.abs(entered - prefill) < 0.001) {
    return roundMoney(params.amountExact);
  }
  return entered;
}

/** Greedy min-cash-flow — stejný princip jako u split skupin. */
export function simplifyHouseholdDebts(
  members: readonly HouseholdMemberRef[],
  balancesExact: Map<string, number>,
): HouseholdSimplifiedTransfer[] {
  const nameById = new Map(members.map((m) => [m.userId, m.name]));

  const debtors = members
    .map((m) => {
      let balance = balancesExact.get(m.userId) ?? 0;
      if (balanceTreatedAsZero(balance)) balance = 0;
      return { userId: m.userId, balance };
    })
    .filter((b) => b.balance < -EPS)
    .sort((a, b) => a.balance - b.balance);

  const creditors = members
    .map((m) => {
      let balance = balancesExact.get(m.userId) ?? 0;
      if (balanceTreatedAsZero(balance)) balance = 0;
      return { userId: m.userId, balance };
    })
    .filter((b) => b.balance > EPS)
    .sort((a, b) => b.balance - a.balance);

  const transfers: HouseholdSimplifiedTransfer[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i]!;
    const creditor = creditors[j]!;
    const owe = -debtor.balance;
    const due = creditor.balance;
    const amountExact = roundMoney(Math.min(owe, due));
    if (amountExact >= SETTLEMENT_BALANCE_ZERO_THRESHOLD_KC - EPS) {
      transfers.push({
        fromUserId: debtor.userId,
        fromName: nameById.get(debtor.userId) ?? '—',
        toUserId: creditor.userId,
        toName: nameById.get(creditor.userId) ?? '—',
        amountDisplay: Math.round(amountExact),
        amountExact,
      });
    }
    debtor.balance += amountExact;
    creditor.balance -= amountExact;
    if (balanceTreatedAsZero(debtor.balance) || Math.abs(debtor.balance) < EPS) i += 1;
    if (balanceTreatedAsZero(creditor.balance) || Math.abs(creditor.balance) < EPS) j += 1;
  }

  return transfers;
}

/** Sekci vyrovnání zobraz jen když může vzniknout dluh (2+ členů a aspoň jeden single_payer). */
export function householdSettlementSectionVisible(params: {
  memberCount: number;
  recurring: readonly Pick<RecurringExpenseSettlementInput, 'paymentMode' | 'paymentPeriods'>[];
  /** Alespoň jeden společný výdaj v domácnosti s single_payer (libovolný měsíc). */
  sharedHasSinglePayer?: boolean;
}): boolean {
  if (params.memberCount <= 1) return false;
  const anyRecurringSingle = params.recurring.some(
    (r) =>
      r.paymentMode === 'single_payer' ||
      (r.paymentPeriods?.some((p) => p.paymentMode === 'single_payer') ?? false),
  );
  return anyRecurringSingle || params.sharedHasSinglePayer === true;
}

export function isHouseholdBalanceSettled(balancesExact: Map<string, number>): boolean {
  for (const v of balancesExact.values()) {
    if (!balanceTreatedAsZero(v)) return false;
  }
  return true;
}

export function mapHouseholdSettlementRow(row: Record<string, unknown>): HouseholdSettlement {
  return {
    id: String(row.id ?? ''),
    householdId: String(row.household_id ?? ''),
    fromUserId: String(row.from_user_id ?? ''),
    toUserId: String(row.to_user_id ?? ''),
    amount: Number(row.amount) || 0,
    note: typeof row.note === 'string' && row.note.length > 0 ? row.note : null,
    createdBy: String(row.created_by ?? ''),
    createdAt: typeof row.created_at === 'string' ? row.created_at : '',
  };
}

export function recurringRowToSettlementInput(
  row: Record<string, unknown>,
  paymentPeriods?: RecurringPaymentPeriod[],
): RecurringExpenseSettlementInput {
  const frequency = String(row.frequency ?? 'monthly');
  const dueDay = row.due_day != null && row.due_day !== '' ? Number(row.due_day) : null;
  const dueWeekday =
    row.due_weekday != null && row.due_weekday !== '' ? Number(row.due_weekday) : null;
  const dueMonth = row.due_month != null && row.due_month !== '' ? Number(row.due_month) : null;
  return {
    amount: Number(row.amount) || 0,
    splitType: (row.split_type === 'shared_half' || row.split_type === 'shared_custom'
      ? row.split_type
      : 'mine') as RecurringSplitType,
    myShare: clampMySharePct(Number(row.my_share ?? 100)),
    createdBy: row.created_by != null && row.created_by !== '' ? String(row.created_by) : null,
    addedBy: row.added_by != null && row.added_by !== '' ? String(row.added_by) : null,
    paymentMode: normalizeExpensePaymentMode(row.payment_mode),
    payerUserId:
      row.payer_user_id != null && row.payer_user_id !== '' ? String(row.payer_user_id) : null,
    paymentPeriods: paymentPeriods && paymentPeriods.length > 0 ? paymentPeriods : undefined,
    frequency,
    dueDay: Number.isFinite(dueDay as number) ? dueDay : null,
    dueWeekday: Number.isFinite(dueWeekday as number) ? dueWeekday : null,
    dueMonth: Number.isFinite(dueMonth as number) ? dueMonth : null,
    createdAt:
      row.created_at != null && row.created_at !== '' ? String(row.created_at) : null,
  };
}

export function sharedExpenseToSettlementInput(item: {
  amount: number;
  splitType: SharedExpenseSplitType;
  splitPercent: number;
  paidBy: string;
  paymentMode: ExpensePaymentMode;
  date: string;
  addedBy?: string | null;
}): SharedExpenseSettlementInput {
  return {
    amount: item.amount,
    splitType: item.splitType,
    splitPercent: item.splitPercent,
    paidBy: item.paidBy,
    addedBy: item.addedBy ?? null,
    paymentMode: item.paymentMode,
    expenseDate: item.date,
  };
}
