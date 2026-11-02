/**
 * Jeden výpočet měsíčního plánu pro Plán i Přehled — všude stejná čísla.
 *
 * Model:
 *  - Pravidelné platby (fixní) = úvěry + aktivní pravidelné výdaje (přepočet na měsíc).
 *    Skutečnost = výdaje s recurringId, spárované s pravidelnou platbou (částka/kategorie/název),
 *    spárované v plánu, nebo kategorie Úvěry / Bydlení / Předplatné.
 *  - Běžné výdaje (variabilní) = ostatní výdaje bez převodů, minus vratky.
 *    Dělí se na „v rozpočtech“ (kategorie s rozpočtem) a „ostatní“.
 *  - Zbývá utratit = příjem − pravidelné platby (víc z plánu / zaplaceného) − spoření − běžné výdaje.
 */
import { mainCategoryName, normalizeCategory } from '@/lib/category-normalize';
import { monthlySavingsNeed, recurringToMonthly, type UserBudget } from '@/lib/supabase-plan';
import type { PersonalRecurringRule } from '@/lib/personal-recurring';
import {
  getMonthTransactions,
  isExpenseForReport,
  isIncomeForReport,
  isRefundTransaction,
  type LoanItem,
  type Transaction,
} from '@/store/finance-store';

export type MonthPlanGoal = { id: string; targetAmount: number; deadline?: string | null };

export type MonthPlanInput = {
  transactions: Transaction[];
  year: number;
  /** 1–12 */
  month: number;
  expectedIncome: number;
  loans: LoanItem[];
  recurringRules: PersonalRecurringRule[];
  budgets: UserBudget[];
  goals: MonthPlanGoal[];
  goalCurrentAmount: (goalId: string) => number;
  /** Transakce spárované s platbou z plánu (plan-payment-match). */
  linkedTxIds?: ReadonlySet<string>;
  now?: Date;
};

export type MonthPlanBudgetRow = {
  budget: UserBudget;
  spent: number;
  remaining: number;
  pct: number;
};

export type MonthPlan = {
  incomePlanned: number;
  incomeActual: number;
  /** Základ pro výpočet: větší z plánovaného a skutečného příjmu (bez plánu jen skutečný). */
  incomeBase: number;
  hasIncomePlan: boolean;

  fixedPlanned: number;
  fixedPaid: number;
  fixedRemaining: number;

  budgetsPlanned: number;
  budgetsSpent: number;
  budgetRows: MonthPlanBudgetRow[];
  overBudgetCount: number;
  okBudgetCount: number;

  otherSpent: number;
  variableSpent: number;

  savingsPlanned: number;

  /** Kolik je k dispozici na běžné výdaje (příjem − pravidelné − spoření). */
  variableCap: number;
  /** Kolik ještě můžeš utratit. */
  leftToSpend: number;
  /** Plán: příjem − pravidelné − rozpočty − spoření (nerozpočtované peníze). */
  unallocated: number;

  isCurrentMonth: boolean;
  daysLeft: number;
  /** Na den do konce měsíce (jen aktuální měsíc a kladný zůstatek). */
  perDay: number | null;
};

/** Kategorie, které jsou ze své podstaty pravidelné (nájem, energie, telefon, předplatné, splátky). */
const FIXED_MAIN_CATEGORIES = new Set(['Úvěry', 'Bydlení', 'Předplatné']);

export function isFixedPaymentTransaction(t: Transaction, linkedTxIds?: ReadonlySet<string>): boolean {
  if (t.recurringId) return true;
  if (linkedTxIds?.has(t.id)) return true;
  return FIXED_MAIN_CATEGORIES.has(mainCategoryName(t.category, t.subcategory));
}

function normTitle(s: string | undefined | null): string {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Výdaj odpovídá pravidelné platbě: stejná hlavní kategorie a částka ±15 %, nebo shodný název. */
function matchesRule(t: Transaction, r: PersonalRecurringRule): boolean {
  const amt = Number(t.amount) || 0;
  const ra = Number(r.amount) || 0;
  const amountOk = ra > 0 && Math.abs(amt - ra) <= Math.max(1, ra * 0.15);
  const sameCat = mainCategoryName(t.category, t.subcategory) === mainCategoryName(r.category, r.subcategory);
  const rt = normTitle(r.title);
  const tt = normTitle(t.title);
  const titleOk = rt.length >= 3 && tt.includes(rt);
  return (amountOk && sameCat) || (titleOk && amountOk) || (titleOk && sameCat);
}

function occurrencesPerMonth(r: PersonalRecurringRule): number {
  return r.frequency === 'weekly' ? 5 : 1;
}

function budgetMatches(t: Transaction, b: UserBudget): boolean {
  const n = normalizeCategory(t.category, t.subcategory);
  if (n.category !== b.category) return false;
  if (b.subcategory && (n.subcategory ?? null) !== b.subcategory) return false;
  return true;
}

export function computeMonthPlan(input: MonthPlanInput): MonthPlan {
  const now = input.now ?? new Date();
  const monthTx = getMonthTransactions(input.transactions, input.year, input.month);

  let incomeActual = 0;
  let fixedPaid = 0;
  let variableGross = 0;
  let refunds = 0;
  const variableTx: Transaction[] = [];

  // Výdaje spárované s pravidelnou platbou podle částky / kategorie / názvu (i bez recurringId z importu).
  const ruleMatchedTx = new Set<string>();
  const expenseRules = input.recurringRules.filter((r) => r.active && r.type === 'expense');
  for (const r of expenseRules) {
    let left = occurrencesPerMonth(r);
    for (const t of monthTx) {
      if (left <= 0) break;
      if (!isExpenseForReport(t) || t.recurringId === r.id) {
        if (t.recurringId === r.id) left -= 1;
        continue;
      }
      if (t.recurringId || ruleMatchedTx.has(t.id)) continue;
      if (matchesRule(t, r)) {
        ruleMatchedTx.add(t.id);
        left -= 1;
      }
    }
  }

  for (const t of monthTx) {
    const amt = Number(t.amount) || 0;
    if (isIncomeForReport(t)) {
      incomeActual += amt;
      continue;
    }
    if (isRefundTransaction(t)) {
      refunds += amt;
      continue;
    }
    if (!isExpenseForReport(t)) continue;
    if (ruleMatchedTx.has(t.id) || isFixedPaymentTransaction(t, input.linkedTxIds)) {
      fixedPaid += amt;
    } else {
      variableGross += amt;
      variableTx.push(t);
    }
  }

  const loansMonthly = input.loans.reduce((s, l) => s + (Number(l.monthlyPayment) || 0), 0);
  const recurringMonthly = input.recurringRules
    .filter((r) => r.active && r.type === 'expense')
    .reduce((s, r) => s + recurringToMonthly(r.amount, r.frequency), 0);
  const fixedPlanned = loansMonthly + recurringMonthly;

  // Rozpočty: každá variabilní transakce max. do jednoho rozpočtu (přednost má rozpočet s podkategorií).
  const sortedBudgets = [...input.budgets].sort(
    (a, b) => (b.subcategory ? 1 : 0) - (a.subcategory ? 1 : 0),
  );
  const spentById = new Map<string, number>();
  let budgetsSpent = 0;
  const variableIds = new Set(variableTx.map((t) => t.id));
  for (const t of monthTx) {
    if (!isExpenseForReport(t)) continue;
    const hit = sortedBudgets.find((b) => budgetMatches(t, b));
    if (!hit) continue;
    const amt = Number(t.amount) || 0;
    // Řádek rozpočtu ukazuje vše v kategorii; do součtu „Rozpočty“ jdou jen běžné výdaje.
    spentById.set(hit.id, (spentById.get(hit.id) ?? 0) + amt);
    if (variableIds.has(t.id)) budgetsSpent += amt;
  }
  const budgetRows: MonthPlanBudgetRow[] = input.budgets.map((b) => {
    const spent = spentById.get(b.id) ?? 0;
    const amount = Number(b.amount) || 0;
    return {
      budget: b,
      spent,
      remaining: amount - spent,
      pct: amount > 0 ? (spent / amount) * 100 : 0,
    };
  });
  const budgetsPlanned = input.budgets.reduce((s, b) => s + (Number(b.amount) || 0), 0);
  const overBudgetCount = budgetRows.filter((r) => r.budget.amount > 0 && r.spent > r.budget.amount).length;

  const variableSpent = Math.max(0, variableGross - refunds);
  const otherSpent = Math.max(0, variableSpent - budgetsSpent);

  let savingsPlanned = 0;
  for (const g of input.goals) {
    const need = monthlySavingsNeed(g.targetAmount, input.goalCurrentAmount(g.id), g.deadline ?? null);
    if (need != null && need > 0) savingsPlanned += need;
  }

  const hasIncomePlan = input.expectedIncome > 0;
  // Když přišlo víc, než je v plánu, počítáme se skutečností.
  const incomeBase = hasIncomePlan ? Math.max(input.expectedIncome, incomeActual) : incomeActual;
  const fixedEffective = Math.max(fixedPlanned, fixedPaid);
  const variableCap = incomeBase - fixedEffective - savingsPlanned;
  const leftToSpend = variableCap - variableSpent;
  const unallocated = incomeBase - fixedPlanned - budgetsPlanned - savingsPlanned;

  const isCurrentMonth = input.year === now.getFullYear() && input.month === now.getMonth() + 1;
  const daysInMonth = new Date(input.year, input.month, 0).getDate();
  const daysLeft = isCurrentMonth ? Math.max(1, daysInMonth - now.getDate() + 1) : 0;
  const perDay = isCurrentMonth && leftToSpend > 0 ? leftToSpend / daysLeft : null;

  return {
    incomePlanned: input.expectedIncome,
    incomeActual,
    incomeBase,
    hasIncomePlan,
    fixedPlanned,
    fixedPaid,
    fixedRemaining: Math.max(0, fixedPlanned - fixedPaid),
    budgetsPlanned,
    budgetsSpent,
    budgetRows,
    overBudgetCount,
    okBudgetCount: budgetRows.length - overBudgetCount,
    otherSpent,
    variableSpent,
    savingsPlanned,
    variableCap,
    leftToSpend,
    unallocated,
    isCurrentMonth,
    daysLeft,
    perDay,
  };
}
