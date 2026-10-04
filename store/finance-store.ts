import { create } from 'zustand';
import { Alert, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { computeLoanDetailOverview } from '@/lib/loan-math';
import {
  findBestMatchingLoan,
  recurringExpenseMatchesLoanRule,
  subtractMonths,
} from '@/lib/household-loan-sync';
import {
  compareTxBillingDateAsc,
  compareTxDateDesc,
  dayOfMonthFromYmd,
  toYyyyMmDd,
  transactionBookingOrDateYmd,
  transactionDateYmd,
  yyyyMmLocalToday,
} from '@/lib/transaction-date';
import {
  resolveSubscriptionBrand,
  SUBSCRIPTION_CATEGORY,
} from '@/lib/subscription-brands';
import {
  detectSubscriptionCandidates,
  subscriptionMerchantGroupKey,
} from '@/lib/subscription-detect';
import {
  deleteTransactionsRemote,
  deleteTransactionRemote,
  fetchTransactionsRemote,
  getAuthUserId,
  loadTransactionsFromAsyncStorage,
  upsertTransactionsRemote,
} from '@/lib/supabase-transactions';
import {
  deleteLoanRemote,
  FINANCE_LOANS_KEY,
  loadLoansWithLocalMigration,
  parseLocalLoansJson,
  upsertLoansRemote,
} from '@/lib/supabase-loans';
import {
  deleteIgnoredSuggestionRemote,
  deleteSubscriptionRemote,
  FINANCE_SUBSCRIPTIONS_KEY,
  IGNORED_DETECTED_SUBSCRIPTIONS_KEY,
  isIgnoredSuggestionMatch,
  loadSubscriptionsWithLocalMigration,
  matchesExistingSubscription,
  merchantKeyForSubscriptionName,
  type IgnoredSubscriptionSuggestion,
  upsertIgnoredSuggestionRemote,
  upsertSubscriptionsRemote,
} from '@/lib/supabase-subscriptions';
import { loadOwnerBanksWithLocalMigration } from '@/lib/owner-bank-accounts-supabase';
import type { OwnerBankStored } from '@/lib/owner-accounts-storage';
import { getAllOwnerAccountNumbers } from '@/lib/owner-accounts-storage';
import { logAndGetUserFacingError } from '@/lib/user-facing-error';
import { deleteReceiptFromStorage } from '@/lib/receipt-upload';

export interface Transaction {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  title: string;
  /** Volitelné aliasy pro zobrazení (import / API) */
  description?: string;
  name?: string;
  merchant?: string;
  category: string;
  /** Kalendářní den v lokální časové zóně, formát YYYY-MM-DD (zaúčtování) */
  date: string;
  /**
   * Datum valuty (YYYY-MM-DD), pokud výpis rozlišuje.
   * DB sloupec `booking_date`.
   */
  bookingDate?: string | null;
  /** Výchozí manual; bank = import z výpisu */
  source?: string;
  importBatchId?: string | null;
  /** Veřejná URL účtenky ve Storage (bucket `receipts`) */
  receiptUrl?: string;
  /** Deduplikace importů v Supabase */
  uniqueKey?: string;
  /** Bankovní ID pohybu (RB/KB kód transakce, Fio ID) — pro unique_key / external_id */
  bankTransactionId?: string;
  /** DB `external_id` (např. raiffeisenbank:9042758451) */
  externalId?: string;
  /** Číslo protiúčtu z importu (návrh vlastních účtů / reclassify) */
  counterpartyAccount?: string;
  counterpartyName?: string;
  /** Kartová vratka — type income, ale v souhrnech snižuje výdaje */
  isRefund?: boolean;
  /**
   * Odkud kategorie pochází (DB `category_source`):
   * user | crowd | dictionary | keyword | transfer | import
   */
  categorySource?:
    | 'user'
    | 'crowd'
    | 'dictionary'
    | 'keyword'
    | 'transfer'
    | 'import';
  /** Normalizovaný klíč obchodníka (DB `merchant_key`) — párování s user_category_rules */
  merchantKey?: string | null;
  /**
   * Původní částka v `originalCurrency` (DB `original_amount`).
   * `amount` je vždy CZK. Null u čistě českých transakcí.
   */
  originalAmount?: number | null;
  /** ISO kód původní měny (EUR, USD, …); null = CZK */
  originalCurrency?: string | null;
  /** Kurz ČNB: CZK za 1 jednotku originalCurrency */
  exchangeRate?: number | null;
}

/**
 * Transakce už persistovaná v Supabase — `id` je UUID z DB
 * (výstup `insertBankImportTransactionsRemote` / `rowToTransaction`),
 * ne lokálně generované id před insertem.
 */
export type RemotePersistedTransaction = Transaction & {
  id: string;
};

export interface MonthlyReport {
  month: string; // YYYY-MM format
  totalIncome: number;
  totalExpenses: number;
  balance: number;
  topExpenseCategory: string;
  savingsRate: number;
  transactionCount: number;
  categoryBreakdown: CategoryExpense[];
  insights: string[];
}

export type RecurrenceFrequency = 'monthly' | 'yearly';

export interface RecurringConfig {
  isRecurring: boolean;
  frequency: RecurrenceFrequency; // currently supported: monthly/yearly
  dayOfMonth?: number; // 1-31 for monthly/yearly billing day
}

export interface FinancialGoal {
  id: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  category?: string;
  deadline?: Date;
  type: 'saving' | 'spending_limit';
  recurring?: RecurringConfig;
}

export interface CategoryExpense {
  category: string;
  amount: number;
  percentage: number;
  icon: string;
  color: string;
}

export type SubscriptionSource = 'bank' | 'manual';
export type SubscriptionFrequency = 'monthly' | 'yearly';
export interface SubscriptionItem {
  id: string;
  name: string;
  amount: number;
  /** ISO měna (CZK, EUR, …) — default CZK */
  currency?: string;
  frequency?: SubscriptionFrequency;
  category: string;
  dayOfMonth: number;
  nextPaymentDate?: string | null;
  merchantKey?: string | null;
  source: SubscriptionSource;
  active: boolean;
  /** Nezapočítává se do součtu; zobrazeno jako pozastaveno */
  paused?: boolean;
}

export type { IgnoredSubscriptionSuggestion };

export const EXPENSE_CATEGORIES = {
  'Jídlo a nápoje': { icon: '🍽️', color: '#EF4444' },
  'Nájem a bydlení': { icon: '🏠', color: '#8B5CF6' },
  'Bydlení': { icon: '🏡', color: '#7C3AED' },
  'Oblečení': { icon: '👕', color: '#F59E0B' },
  'Oblečení a obuv': { icon: '👟', color: '#D97706' },
  'Doprava': { icon: '🚗', color: '#10B981' },
  'Zábava': { icon: '🎬', color: '#EC4899' },
  'Zábava a kultura': { icon: '🎭', color: '#DB2777' },
  'Cestování a ubytování': { icon: '✈️', color: '#0EA5E9' },
  'Elektronika': { icon: '💻', color: '#6366F1' },
  'Domácnost a nábytek': { icon: '🛋️', color: '#A16207' },
  'Zdraví': { icon: '⚕️', color: '#06B6D4' },
  'Sport': { icon: '⚽', color: '#22C55E' },
  'Sport a zdraví': { icon: '🏃', color: '#14B8A6' },
  'Vzdělání': { icon: '📚', color: '#6366F1' },
  'Nákupy': { icon: '🛍️', color: '#F97316' },
  'Služby': { icon: '🔧', color: '#84CC16' },
  'Telefon a internet': { icon: '📱', color: '#3B82F6' },
  'Splátky úvěrů': { icon: '🏦', color: '#0F766E' },
  'Bankovní poplatky': { icon: '🏛', color: '#78716C' },
  'Výběr hotovosti': { icon: '💵', color: '#64748B' },
  'Platby lidem': { icon: '👥', color: '#8B5CF6' },
  Předplatné: { icon: '📺', color: '#A855F7' },
  /** Převod na broker / nákup aktiv — nezapočítává se do součtu výdajů. */
  Investice: { icon: '📈', color: '#9CA3AF' },
  Převod: { icon: '🔄', color: '#9CA3AF' },
  'Ostatní': { icon: '📦', color: '#6B7280' },
} as const;

export const INCOME_CATEGORIES = {
  'Mzda': { icon: '💼', color: '#10B981' },
  'Freelance': { icon: '💻', color: '#8B5CF6' },
  'Investice': { icon: '📈', color: '#F59E0B' },
  'Dary': { icon: '🎁', color: '#EC4899' },
  'Vklad hotovosti': { icon: '💵', color: '#65A30D' },
  Předplatné: { icon: '📺', color: '#A855F7' },
  Převod: { icon: '🔄', color: '#9CA3AF' },
  'Ostatní': { icon: '💰', color: '#6B7280' },
} as const;

/** Povolené výdajové kategorie pro AI / slovník (bez Převod — strukturální). */
export const CLASSIFIABLE_EXPENSE_CATEGORIES = Object.keys(EXPENSE_CATEGORIES).filter(
  (c) => c !== 'Převod',
) as string[];


export interface CustomCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
  type: 'income' | 'expense';
}

export type LoanType = 'mortgage' | 'car' | 'personal' | 'student' | 'other';

export interface LoanItem {
  id: string;
  loanType: LoanType;
  loanAmount: number;
  interestRate: number;
  monthlyPayment: number;
  /** Celková doba splácení v měsících (n). Legacy záznamy: může chybět → použije se remainingMonths. */
  termMonths?: number;
  /** @deprecated Pro nové závazky používej termMonths. Zůstává pro zpětnou kompatibilitu. */
  remainingMonths: number;
  startDate: Date;
  name?: string;
  color?: string;
  emoji?: string;
  isFixed?: boolean;
  fixedYears?: number;
  fixedEndDate?: Date;
  fixationStartDate?: Date;
  currentBalance?: number;
  /** Akontace / záloha odečtená od celkové částky při výpočtu jistiny (volitelné). */
  downPayment?: number;
  /** Počet zaplacených splátek (např. z Domácnosti). */
  paymentsMade?: number;
  /** Datum první započtené splátky (odhad při prvním záznamu „Zaplaceno“). */
  installmentStartDate?: Date;
}

export type LoanProgressResult = {
  paidMonths: number;
  totalMonths: number;
  percentage: number;
  totalPaid: number;
  remainingAmount: number;
  totalInterestPaid?: number;
  principalPercentPaid?: number;
};

/**
 * Převody mezi vlastními účty, vklady hotovosti a výdajové Investice —
 * nezapočítávat do reportů. Příjmová kategorie Investice se počítá normálně.
 *
 * Oddělené od INVESTMENTS_IN_TOTALS (constants/feature-flags.ts): ten řídí
 * tržní hodnotu broker portfolií v dashboardu / NW — bankovní výdaj „Investice“
 * zůstává mimo součty vždy přes tuto funkci.
 */
export function isTransferLikeTransaction(t: Transaction): boolean {
  if (t.category === 'Převod' || t.category === 'Vklad hotovosti') return true;
  if (t.category === 'Investice' && t.type === 'expense') return true;
  const ty = (t as { type?: string }).type;
  return ty === 'transfer';
}

/** Transakce započítané do příjmů v reportech / dashboardu (bez vratek a vkladů hotovosti). */
export function isIncomeForReport(t: Transaction): boolean {
  return t.type === 'income' && !t.isRefund && !isTransferLikeTransaction(t);
}

/** Transakce započítané do výdajů v reportech / dashboardu (hrubé — bez odečtu vratek). */
export function isExpenseForReport(t: Transaction): boolean {
  return t.type === 'expense' && !isTransferLikeTransaction(t);
}

/** Kartová vratka (type income + isRefund). */
export function isRefundTransaction(t: Transaction): boolean {
  return !!t.isRefund && t.type === 'income' && !isTransferLikeTransaction(t);
}

/** Čistý výdaj: výdaje minus vratky (stejný měsíc / seznam). */
export function netExpenseAmount(transactions: Transaction[]): number {
  let sum = 0;
  for (const t of transactions) {
    if (isExpenseForReport(t)) sum += t.amount;
    else if (isRefundTransaction(t)) sum -= t.amount;
  }
  return sum;
}

/** Odfiltruje převody z libovolného seznamu transakcí pro reporty. */
export function excludeTransfersFromReports<T extends Transaction>(transactions: T[]): T[] {
  return transactions.filter((t) => !isTransferLikeTransaction(t));
}

/** Transakce v kalendářním měsíci (month = 1–12). Pro dashboard vždy aktuální měsíc; pro report libovolný rok/měsíc. */
export function getMonthTransactions(
  transactions: Transaction[],
  year: number,
  month: number,
): Transaction[] {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  return transactions.filter((t) => {
    const date = typeof t.date === 'string' ? transactionDateYmd(t.date) : '';
    return date.startsWith(prefix);
  });
}

/** Měsíční přehled z libovolného seznamu transakcí (např. Supabase na dashboardu). */
export function computeMonthlyReportFromTransactions(
  transactions: Transaction[],
  month: string,
  allExpenseCategories: { [key: string]: { icon: string; color: string } },
): MonthlyReport {
  const [yStr, mStr] = month.split('-');
  const y = parseInt(yStr ?? '', 10);
  const mo = parseInt(mStr ?? '', 10);
  const monthTransactionsRaw =
    Number.isFinite(y) && Number.isFinite(mo) ? getMonthTransactions(transactions, y, mo) : [];
  const monthTransactions = excludeTransfersFromReports(monthTransactionsRaw);

  const totalIncome = monthTransactions
    .filter(isIncomeForReport)
    .reduce((sum, t) => sum + t.amount, 0);
  const totalExpenses = netExpenseAmount(monthTransactions);
  const balance = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? Math.round((balance / totalIncome) * 100) : 0;

  const categoryTotals: { [key: string]: number } = {};
  for (const transaction of monthTransactions) {
    if (isExpenseForReport(transaction)) {
      const category = transaction.category || 'Ostatní';
      categoryTotals[category] = (categoryTotals[category] || 0) + transaction.amount;
    } else if (isRefundTransaction(transaction)) {
      const category = transaction.category || 'Ostatní';
      categoryTotals[category] = (categoryTotals[category] || 0) - transaction.amount;
    }
  }

  const categoryBreakdown = Object.entries(categoryTotals)
    .filter(([, amount]) => amount > 0.009)
    .map(([category, amount]) => ({
      category,
      amount,
      percentage: totalExpenses > 0 ? Math.round((amount / totalExpenses) * 100) : 0,
      icon: allExpenseCategories[category]?.icon || '📦',
      color: allExpenseCategories[category]?.color || '#6B7280',
    }))
    .sort((a, b) => b.amount - a.amount);

  const topExpenseCategory =
    categoryBreakdown.find((c) => c.category !== 'Ostatní')?.category ??
    categoryBreakdown[0]?.category ??
    'Žádné výdaje';
  /** Insight „vysoké výdaje“: podíl bez fixních kategorií Splátky úvěrů / Bydlení. */
  const highCategoryExcluded = new Set(['Splátky úvěrů', 'Bydlení']);
  const variableForInsight = categoryBreakdown.filter((c) => !highCategoryExcluded.has(c.category));
  const variableInsightTotal = variableForInsight.reduce((s, c) => s + c.amount, 0);
  const topCategoryForInsight =
    variableInsightTotal > 0
      ? [...variableForInsight]
          .filter((c) => c.category !== 'Ostatní')
          .sort((a, b) => b.amount - a.amount)[0] ??
        [...variableForInsight].sort((a, b) => b.amount - a.amount)[0]
      : undefined;
  const topCategoryInsightPct =
    topCategoryForInsight && variableInsightTotal > 0
      ? Math.round((topCategoryForInsight.amount / variableInsightTotal) * 100)
      : 0;
  const insights: string[] = [];
  if (savingsRate > 20) {
    insights.push('🎉 Skvělá míra úspor! Šetříš více než 20 % příjmů.');
  } else if (savingsRate < 10 && totalIncome > 0) {
    insights.push('⚠️ Nízká míra úspor. Zkus snížit výdaje nebo zvýšit příjmy.');
  }
  if (topCategoryForInsight && topCategoryInsightPct > 40 && topCategoryForInsight.amount >= 2000) {
    insights.push(
      `💡 ${topCategoryForInsight.category} tvoří ${topCategoryInsightPct}% výdajů. Zvaž optimalizaci.`,
    );
  }
  if (balance < 0) {
    insights.push('🚨 Tento měsíc výdaje převyšují příjmy!');
  }

  return {
    month,
    totalIncome,
    totalExpenses,
    balance,
    topExpenseCategory,
    savingsRate,
    transactionCount: monthTransactions.length,
    categoryBreakdown,
    insights,
  };
}

/** Rozpad výdajů podle kategorií za měsíc z libovolného seznamu transakcí. */
export function computeCategoryExpensesForTransactionsMonth(
  transactions: Transaction[],
  monthYm: string,
  financialGoals: FinancialGoal[],
  customCategories: CustomCategory[],
): CategoryExpense[] {
  const [yStr, mStr] = monthYm.split('-');
  const y = parseInt(yStr ?? '', 10);
  const mo = parseInt(mStr ?? '', 10);
  if (!Number.isFinite(y) || !Number.isFinite(mo)) return [];
  const monthTx = excludeTransfersFromReports(getMonthTransactions(transactions, y, mo));
  const allExpense = mergeAllCategories('expense', customCategories);
  return computeCategoryExpensesFromMonthTransactions(monthTx, financialGoals, allExpense);
}

function sliceRecentTransactionsInMonth(
  transactions: Transaction[],
  monthPrefix: string,
  limit = 5,
): Transaction[] {
  return transactions
    .filter((t) => transactionDateYmd(t.date).startsWith(monthPrefix))
    .sort(compareTxDateDesc)
    .slice(0, limit);
}

function mergeAllCategories(
  type: 'income' | 'expense',
  customCategories: CustomCategory[],
): { [key: string]: { icon: string; color: string } } {
  const defaultCategories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const custom = customCategories
    .filter((c) => c.type === type)
    .reduce(
      (acc, c) => {
        acc[c.name] = { icon: c.icon, color: c.color };
        return acc;
      },
      {} as { [key: string]: { icon: string; color: string } },
    );
  return { ...defaultCategories, ...custom };
}

/** Rozpad výdajů podle kategorií jen z transakcí daného měsíce (již odfiltrovaný měsíc). */
function computeCategoryExpensesFromMonthTransactions(
  currentMonthTx: Transaction[],
  financialGoals: FinancialGoal[],
  allCategories: { [key: string]: { icon: string; color: string } },
): CategoryExpense[] {
  const totalExpenses = netExpenseAmount(currentMonthTx);

  if (totalExpenses <= 0) return [];

  const categoryTotals: { [key: string]: number } = {};
  for (const transaction of currentMonthTx) {
    if (isExpenseForReport(transaction)) {
      const category = transaction.category || 'Ostatní';
      categoryTotals[category] = (categoryTotals[category] || 0) + transaction.amount;
    } else if (isRefundTransaction(transaction)) {
      const category = transaction.category || 'Ostatní';
      categoryTotals[category] = (categoryTotals[category] || 0) - transaction.amount;
    }
  }

  return Object.entries(categoryTotals)
    .filter(([, amount]) => amount > 0.009)
    .map(([category, amount]) => {
      const categoryGoal = financialGoals.find(
        (goal) => goal.type === 'spending_limit' && goal.category === category,
      );

      /** Podíl kategorie na celkových výdajích měsíce (součet řádků ≈ 100 %). */
      const percentage =
        totalExpenses > 0 ? Math.round((amount / totalExpenses) * 100) : 0;

      let color = allCategories[category]?.color || '#6B7280';
      if (
        categoryGoal &&
        categoryGoal.targetAmount > 0 &&
        amount > categoryGoal.targetAmount
      ) {
        color = '#EF4444';
      }

      return {
        category,
        amount,
        percentage,
        icon: allCategories[category]?.icon || '📦',
        color,
      };
    })
    .sort((a, b) => b.amount - a.amount);
}

function computeCategoryExpensesForMonth(
  transactions: Transaction[],
  financialGoals: FinancialGoal[],
  monthPrefix: string,
  allCategories: { [key: string]: { icon: string; color: string } },
): CategoryExpense[] {
  const [yStr, mStr] = monthPrefix.split('-');
  const y = parseInt(yStr ?? '', 10);
  const m = parseInt(mStr ?? '', 10);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return [];
  const currentMonthTx = excludeTransfersFromReports(getMonthTransactions(transactions, y, m));
  return computeCategoryExpensesFromMonthTransactions(currentMonthTx, financialGoals, allCategories);
}

interface FinanceState {
  transactions: Transaction[];
  totalIncome: number;
  totalExpenses: number;
  balance: number;
  totalTransactions: number;
  recentTransactions: Transaction[];
  categoryExpenses: CategoryExpense[];
  monthlyReports: MonthlyReport[];
  financialGoals: FinancialGoal[];
  subscriptions: SubscriptionItem[];
  customCategories: CustomCategory[];
  loans: LoanItem[];
  /** Vlastní bankovní účty (Supabase owner_bank_accounts), UI: bank → účty. */
  ownerBanks: OwnerBankStored[];
  /** Skryté návrhy z výpisů (Supabase ignored_subscription_suggestions). */
  ignoredSubscriptionSuggestions: IgnoredSubscriptionSuggestion[];
  /**
   * @deprecated legacy AsyncStorage IDs — ponecháno prázdné po migraci do DB.
   */
  ignoredDetectedSubscriptionIds: string[];
  isLoaded: boolean;
  /**
   * Monotónní čítač — bump po mutaci tx (až když má smysl refetch Přehledu).
   * Dashboard poslouchá a znovu načte remote list.
   */
  dashboardTxRevision: number;
  /** Zavolej po úspěšném remote zápisu tx (nebo po fromRemote importu). */
  notifyDashboardTransactionsChanged: () => void;
  addTransaction: (transaction: Transaction) => void;
  /**
   * Dávka už persistovaná v Supabase (např. bank import).
   * `opts.fromRemote: true` je povinné — přeskočí mirror upsert.
   */
  addTransactions: (
    transactions: RemotePersistedTransaction[],
    opts: { fromRemote: true },
  ) => void;
  updateTransaction: (
    id: string,
    updates: Partial<Omit<Transaction, 'id'>>,
    opts?: { skipNotify?: boolean },
  ) => void;
  deleteTransaction: (id: string) => void;
  deleteTransactions: (ids: string[]) => void;
  /** month: 1–12 */
  deleteTransactionsByMonth: (year: number, month: number) => void;
  updateTotals: () => void;
  getCategoryExpenses: () => CategoryExpense[];
  getExpensesByCategory: (category: string) => Transaction[];
  getIncomesByCategory: (category: string) => Transaction[];
  generateMonthlyReport: (month: string) => MonthlyReport;
  getCurrentMonthReport: () => MonthlyReport;
  addFinancialGoal: (goal: FinancialGoal) => void;
  updateFinancialGoal: (id: string, updates: Partial<FinancialGoal>) => void;
  deleteFinancialGoal: (id: string) => void;
  reorderFinancialGoals: (goals: FinancialGoal[]) => void;
  getDetectedSubscriptions: () => SubscriptionItem[];
  dismissDetectedSubscriptionSuggestion: (suggestion: {
    merchantKey: string;
    amount: number;
    name?: string;
    currency?: string;
  }) => Promise<IgnoredSubscriptionSuggestion | null>;
  restoreIgnoredSubscriptionSuggestion: (id: string) => Promise<void>;
  addSubscription: (sub: SubscriptionItem) => void;
  updateSubscription: (id: string, updates: Partial<SubscriptionItem>) => void;
  deleteSubscription: (
    id: string,
    opts?: { hideSuggestion?: boolean },
  ) => Promise<void>;
  /** Cloud předplatná (+ jednorázová migrace z AsyncStorage). */
  loadSubscriptionsFromSupabase: () => Promise<{ ok: boolean; error?: string }>;
  addCustomCategory: (category: CustomCategory) => void;
  deleteCustomCategory: (id: string) => void;
  getAllCategories: (type: 'income' | 'expense') => { [key: string]: { icon: string; color: string } };
  addLoan: (loan: LoanItem) => void;
  updateLoan: (id: string, updates: Partial<LoanItem>) => void;
  deleteLoan: (id: string) => void;
  getLoanProgress: (id: string) => LoanProgressResult;
  /** Označení „Zaplaceno“ u pravidelného výdaje v Domácnosti → přičte splátku k závazku. */
  recordLoanPaymentFromRecurring: (payload: { name: string; amount: number; category: string }) => void;
  undoLastLoanPayment: (id: string) => void;
  /** AsyncStorage → Supabase upsert (bez duplicit). */
  syncTransactionsToSupabase: () => Promise<{ ok: boolean; error?: string }>;
  /**
   * Načte transakce z cloudu a nahradí lokální stav (zdroj pravdy = DB, stejně jako dashboard).
   * Při startu smaže zastaralé lokální kopie, které v DB už nejsou.
   */
  loadTransactionsFromSupabase: () => Promise<{ ok: boolean; error?: string }>;
  /** Cloud loans (+ jednorázová migrace z AsyncStorage). DB = zdroj pravdy. */
  loadLoansFromSupabase: () => Promise<{ ok: boolean; error?: string }>;
  /** Cloud vlastní účty (+ jednorázová migrace z AsyncStorage). DB = zdroj pravdy. */
  loadOwnerBanksFromSupabase: () => Promise<{ ok: boolean; error?: string }>;
  /** Po uložení / sync — nahraď ownerBanks ve store. */
  replaceOwnerBanks: (banks: OwnerBankStored[]) => void;
  /** Flat čísla vlastních účtů pro isOwnCounterpartyAccount. */
  getOwnerAccountNumbers: () => string[];
  /** Nahraď store transakcemi z remote fetch (dashboard) — detekce předplatného čte totéž. */
  replaceTransactionsFromRemote: (remote: Transaction[]) => void;
  loadData: () => Promise<void>;
  saveData: () => Promise<void>;
}

function normalizeTitle(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/\d{2,}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Seskupení detekce: kanonický brand key, jinak merchant_key. */
function subscriptionGroupKey(t: Transaction): string {
  return subscriptionMerchantGroupKey(t);
}

/**
 * Oprava uložených předplatných: displayName + Předplatné,
 * dayOfMonth z poslední platby (booking_date).
 */
function normalizeStoredSubscription(
  s: SubscriptionItem,
  transactions: Transaction[],
): SubscriptionItem {
  const brand = resolveSubscriptionBrand(s.name);
  const name = brand ? brand.brand.displayName : s.name;
  const category = brand ? SUBSCRIPTION_CATEGORY : s.category;

  let dayOfMonth = s.dayOfMonth;
  const matching = transactions.filter((t) => {
    if (!isExpenseForReport(t)) return false;
    const gKey = subscriptionGroupKey(t);
    if (brand && gKey === brand.key) return true;
    return normalizeTitle(t.title) === normalizeTitle(s.name);
  });
  if (matching.length > 0) {
    matching.sort(compareTxBillingDateAsc);
    const last = matching[matching.length - 1]!;
    const fromBooking = dayOfMonthFromYmd(transactionBookingOrDateYmd(last));
    if (fromBooking >= 1 && fromBooking <= 31) dayOfMonth = fromBooking;
  }

  return {
    ...s,
    name,
    category,
    dayOfMonth,
    active: s.active !== false,
    paused: Boolean(s.paused),
  };
}

function subscriptionsChanged(before: SubscriptionItem[], after: SubscriptionItem[]): boolean {
  if (before.length !== after.length) return true;
  for (let i = 0; i < before.length; i++) {
    const a = before[i]!;
    const b = after[i]!;
    if (
      a.id !== b.id ||
      a.name !== b.name ||
      a.category !== b.category ||
      a.dayOfMonth !== b.dayOfMonth
    ) {
      return true;
    }
  }
  return false;
}

async function mirrorUpsertTransactions(txs: Transaction[]) {
  if (!txs.length) return;
  const userId = await getAuthUserId();
  if (!userId) return;
  const { error } = await upsertTransactionsRemote(txs, userId);
  if (error) {
    console.warn('[finance] supabase upsert raw:', error);
    Alert.alert('Chyba synchronizace', logAndGetUserFacingError('finance-upsert', error));
  }
}

async function mirrorDeleteTransactionIds(ids: string[]) {
  if (!ids.length) return;
  const userId = await getAuthUserId();
  if (!userId) return;
  const { error } = await deleteTransactionsRemote(ids, userId);
  if (error) {
    console.warn('[finance] supabase delete raw:', error);
    Alert.alert('Chyba synchronizace', logAndGetUserFacingError('finance-delete', error));
  }
}

async function mirrorUpsertLoans(loans: LoanItem[]) {
  if (!loans.length) return;
  const userId = await getAuthUserId();
  if (!userId) return;
  const { error } = await upsertLoansRemote(loans, userId);
  if (error) {
    console.warn('[finance] loans upsert raw:', error);
    Alert.alert('Chyba synchronizace', logAndGetUserFacingError('loans-upsert', error));
  }
}

async function mirrorDeleteLoan(id: string) {
  const userId = await getAuthUserId();
  if (!userId) return;
  const { error } = await deleteLoanRemote(id, userId);
  if (error) {
    console.warn('[finance] loans delete raw:', error);
    Alert.alert('Chyba synchronizace', logAndGetUserFacingError('loans-delete', error));
  }
}

async function mirrorDeleteOne(id: string) {
  const userId = await getAuthUserId();
  if (!userId) return;
  const { error } = await deleteTransactionRemote(id, userId);
  if (error) {
    console.warn('[finance] supabase delete raw:', error);
    Alert.alert('Chyba synchronizace', logAndGetUserFacingError('finance-delete-one', error));
  }
}

export const useFinanceStore = create<FinanceState>((set, get) => {
  const queueSubscriptionNotificationSync = () => {
    if (Platform.OS === 'web') return;
    setTimeout(() => {
      import('@/lib/reschedule-all-local-notifications')
        .then((m) => m.rescheduleAllLocalNotificationsIfPushEnabled())
        .catch((e) => console.warn('rescheduleAllLocalNotificationsIfPushEnabled', e));
    }, 0);
  };

  return {
  transactions: [],
  totalIncome: 0,
  totalExpenses: 0,
  balance: 0,
  totalTransactions: 0,
  recentTransactions: [],
  categoryExpenses: [],
  monthlyReports: [],
  financialGoals: [],
  subscriptions: [],
  customCategories: [],
  loans: [],
  ownerBanks: [],
  ignoredSubscriptionSuggestions: [],
  ignoredDetectedSubscriptionIds: [],
  isLoaded: false,
  dashboardTxRevision: 0,

  notifyDashboardTransactionsChanged: () => {
    set((state) => ({ dashboardTxRevision: state.dashboardTxRevision + 1 }));
  },

  addTransaction: (transaction: Transaction) => {
    set((state) => {
      const newTransactions = [...state.transactions, transaction];
      return {
        transactions: newTransactions,
        recentTransactions: sliceRecentTransactionsInMonth(newTransactions, yyyyMmLocalToday()),
        totalTransactions: newTransactions.length,
      } as Partial<FinanceState>;
    });
    get().updateTotals();
    get().saveData();
    void mirrorUpsertTransactions([transaction]).finally(() => {
      get().notifyDashboardTransactionsChanged();
    });
  },

  addTransactions: (incoming: RemotePersistedTransaction[], opts: { fromRemote: true }) => {
    if (!incoming.length) return;
    if (!opts?.fromRemote) {
      console.warn('[finance] addTransactions vyžaduje { fromRemote: true }');
      return;
    }
    set((state) => {
      const newTransactions = [...state.transactions, ...incoming];
      return {
        transactions: newTransactions,
        recentTransactions: sliceRecentTransactionsInMonth(newTransactions, yyyyMmLocalToday()),
        totalTransactions: newTransactions.length,
      } as Partial<FinanceState>;
    });
    get().updateTotals();
    get().saveData();
    // Remote už zapsán jinde (bank-import) — Přehled ať refetchne
    get().notifyDashboardTransactionsChanged();
  },

  updateTransaction: (
    id: string,
    updates: Partial<Omit<Transaction, 'id'>>,
    opts?: { skipNotify?: boolean },
  ) => {
    let updated: Transaction | undefined;
    let changed = false;
    set((state) => {
      const newTransactions = state.transactions.map((t) => {
        if (t.id !== id) return t;
        const nextUpdates = { ...updates };
        // Ruční změna kategorie → zdroj 'user' (ochrana před automatickým přepočtem)
        if (
          nextUpdates.category != null &&
          nextUpdates.category !== t.category &&
          nextUpdates.categorySource === undefined
        ) {
          nextUpdates.categorySource = 'user';
        }
        const next = { ...t, ...nextUpdates, id };
        const keys = Object.keys(nextUpdates) as (keyof typeof nextUpdates)[];
        const same = keys.every((k) => t[k as keyof Transaction] === next[k as keyof Transaction]);
        if (same) return t;
        changed = true;
        updated = next;
        return next;
      });
      if (!changed) return state;
      return {
        transactions: newTransactions,
        recentTransactions: sliceRecentTransactionsInMonth(newTransactions, yyyyMmLocalToday()),
        totalTransactions: newTransactions.length,
      } as Partial<FinanceState>;
    });
    if (!changed || !updated) return;
    get().updateTotals();
    get().saveData();
    const afterMirror = () => {
      if (!opts?.skipNotify) get().notifyDashboardTransactionsChanged();
    };
    void mirrorUpsertTransactions([updated]).finally(afterMirror);
  },

  deleteTransaction: (id: string) => {
    const removed = get().transactions.find((t) => t.id === id);
    if (removed?.receiptUrl) void deleteReceiptFromStorage(removed.receiptUrl);
    set((state) => {
      const newTransactions = state.transactions.filter((t) => t.id !== id);
      return {
        transactions: newTransactions,
        recentTransactions: sliceRecentTransactionsInMonth(newTransactions, yyyyMmLocalToday()),
        totalTransactions: newTransactions.length,
      } as Partial<FinanceState>;
    });
    get().updateTotals();
    get().saveData();
    void mirrorDeleteOne(id).finally(() => {
      get().notifyDashboardTransactionsChanged();
    });
  },

  deleteTransactions: (ids: string[]) => {
    if (!ids.length) return;
    const idSet = new Set(ids);
    for (const t of get().transactions) {
      if (idSet.has(t.id) && t.receiptUrl) void deleteReceiptFromStorage(t.receiptUrl);
    }
    set((state) => {
      const newTransactions = state.transactions.filter((t) => !idSet.has(t.id));
      return {
        transactions: newTransactions,
        recentTransactions: sliceRecentTransactionsInMonth(newTransactions, yyyyMmLocalToday()),
        totalTransactions: newTransactions.length,
      } as Partial<FinanceState>;
    });
    get().updateTotals();
    get().saveData();
    void mirrorDeleteTransactionIds(ids).finally(() => {
      get().notifyDashboardTransactionsChanged();
    });
  },

  deleteTransactionsByMonth: (year: number, month: number) => {
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    const idsToRemove = get()
      .transactions.filter((t) => transactionDateYmd(t.date).startsWith(prefix))
      .map((t) => t.id);
    set((state) => {
      const newTransactions = state.transactions.filter(
        (t) => !transactionDateYmd(t.date).startsWith(prefix),
      );
      return {
        transactions: newTransactions,
        recentTransactions: sliceRecentTransactionsInMonth(newTransactions, yyyyMmLocalToday()),
        totalTransactions: newTransactions.length,
      } as Partial<FinanceState>;
    });
    get().updateTotals();
    get().saveData();
    void mirrorDeleteTransactionIds(idsToRemove).finally(() => {
      get().notifyDashboardTransactionsChanged();
    });
  },

  updateTotals: () => {
    set((state) => {
      const now = new Date();
      const currentMonthTx = excludeTransfersFromReports(
        getMonthTransactions(
          state.transactions,
          now.getFullYear(),
          now.getMonth() + 1,
        ),
      );

      const totalIncome = currentMonthTx
        .filter(isIncomeForReport)
        .reduce((sum, t) => sum + t.amount, 0);

      const totalExpenses = netExpenseAmount(currentMonthTx);

      const balance = totalIncome - totalExpenses;
      const allExpense = mergeAllCategories('expense', state.customCategories);
      const categoryExpenses = computeCategoryExpensesFromMonthTransactions(
        currentMonthTx,
        state.financialGoals,
        allExpense,
      );

      return {
        totalIncome,
        totalExpenses,
        balance,
        categoryExpenses,
        recentTransactions: [...currentMonthTx].sort(compareTxDateDesc).slice(0, 5),
        totalTransactions: currentMonthTx.length,
      } as Partial<FinanceState>;
    });
  },

  getCategoryExpenses: () => {
    const state = get();
    const allExpense = mergeAllCategories('expense', state.customCategories);
    return computeCategoryExpensesForMonth(
      state.transactions,
      state.financialGoals,
      yyyyMmLocalToday(),
      allExpense,
    );
  },

  getExpensesByCategory: (category: string) => {
    const state = get();
    const now = new Date();
    const monthTx = excludeTransfersFromReports(
      getMonthTransactions(state.transactions, now.getFullYear(), now.getMonth() + 1),
    );
    return monthTx
      .filter(
        (t) =>
          (isExpenseForReport(t) || isRefundTransaction(t)) && t.category === category,
      )
      .sort(compareTxDateDesc);
  },

  getIncomesByCategory: (category: string) => {
    const state = get();
    const now = new Date();
    const monthTx = excludeTransfersFromReports(
      getMonthTransactions(state.transactions, now.getFullYear(), now.getMonth() + 1),
    );
    return monthTx
      .filter((t) => isIncomeForReport(t) && t.category === category)
      .sort(compareTxDateDesc);
  },

  generateMonthlyReport: (month: string) => {
    const state = get();
    return computeMonthlyReportFromTransactions(
      state.transactions,
      month,
      get().getAllCategories('expense'),
    );
  },

  getCurrentMonthReport: () => {
    return get().generateMonthlyReport(yyyyMmLocalToday());
  },

  addFinancialGoal: (goal: FinancialGoal) => {
    set((state) => ({
      financialGoals: [...state.financialGoals, goal],
    }));
    get().saveData();
  },

  updateFinancialGoal: (id: string, updates: Partial<FinancialGoal>) => {
    set((state) => ({
      financialGoals: state.financialGoals.map(goal => 
        goal.id === id ? { ...goal, ...updates } : goal
      ),
    }));
    get().saveData();
  },

  deleteFinancialGoal: (id: string) => {
    console.log('Store: Deleting financial goal with ID:', id);
    const state = get();
    const goalToDelete = state.financialGoals.find(goal => goal.id === id);
    console.log('Store: Goal to delete:', goalToDelete);
    
    if (!goalToDelete) {
      console.warn('Store: Goal not found for deletion:', id);
      return;
    }
    
    const updatedGoals = state.financialGoals.filter(goal => goal.id !== id);
    console.log('Store: Updated goals count:', updatedGoals.length, 'vs original:', state.financialGoals.length);
    
    set(() => ({
      financialGoals: updatedGoals,
    }));
    
    get().saveData();
    console.log('Store: Financial goal deleted and data saved');
  },

  reorderFinancialGoals: (goals: FinancialGoal[]) => {
    set({ financialGoals: goals });
    get().saveData();
  },

  getDetectedSubscriptions: () => {
    const state = get();
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);
    const sixMonthsYmd = toYyyyMmDd(sixMonthsAgo);

    // Pouze návrhy do UI — NIKDY neměnit category u transakcí.
    const candidates = detectSubscriptionCandidates(state.transactions, {
      sinceYmd: sixMonthsYmd,
    });

    return candidates
      .map((c) => {
        const item: SubscriptionItem = {
          id: `detected-${c.groupKey}-${c.amount}`,
          name: c.name,
          amount: c.amount,
          currency: 'CZK',
          frequency: 'monthly',
          category: c.category,
          dayOfMonth: c.dayOfMonth,
          merchantKey: c.groupKey,
          source: 'bank',
          active: true,
          paused: false,
        };
        return item;
      })
      .filter((s) => {
        const key = s.merchantKey || merchantKeyForSubscriptionName(s.name);
        if (
          matchesExistingSubscription(state.subscriptions || [], key, s.name, s.amount)
        ) {
          return false;
        }
        if (
          isIgnoredSuggestionMatch(
            state.ignoredSubscriptionSuggestions || [],
            key,
            s.amount,
          )
        ) {
          return false;
        }
        return true;
      });
  },

  dismissDetectedSubscriptionSuggestion: async (suggestion) => {
    const merchantKey =
      suggestion.merchantKey.trim() ||
      merchantKeyForSubscriptionName(suggestion.name || '');
    if (!merchantKey) return null;
    const userId = await getAuthUserId();
    if (!userId) {
      Alert.alert('Chyba', 'Pro skrytí návrhu se musíš přihlásit.');
      return null;
    }
    const { ignored, error } = await upsertIgnoredSuggestionRemote(userId, {
      merchantKey,
      amount: suggestion.amount,
      currency: suggestion.currency || 'CZK',
      displayName: suggestion.name ?? null,
    });
    if (error) {
      Alert.alert('Chyba', logAndGetUserFacingError('ignore-subscription', error));
      return null;
    }
    if (ignored) {
      set((state) => {
        const rest = (state.ignoredSubscriptionSuggestions || []).filter(
          (i) => i.id !== ignored.id,
        );
        return { ignoredSubscriptionSuggestions: [ignored, ...rest] };
      });
    }
    return ignored;
  },

  restoreIgnoredSubscriptionSuggestion: async (id: string) => {
    const trimmed = id.trim();
    if (!trimmed) return;
    const userId = await getAuthUserId();
    if (!userId) return;
    const { error } = await deleteIgnoredSuggestionRemote(trimmed, userId);
    if (error) {
      Alert.alert('Chyba', logAndGetUserFacingError('restore-ignored-sub', error));
      return;
    }
    set((state) => ({
      ignoredSubscriptionSuggestions: (state.ignoredSubscriptionSuggestions || []).filter(
        (i) => i.id !== trimmed,
      ),
    }));
  },

  addSubscription: (sub: SubscriptionItem) => {
    const brand = resolveSubscriptionBrand(sub.name);
    const id =
      sub.id &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        sub.id,
      )
        ? sub.id
        : (globalThis.crypto?.randomUUID?.() ??
          `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`.replace(/[xy]/g, (ch) => {
            const r = (Math.random() * 16) | 0;
            const v = ch === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
          }));
    const normalized: SubscriptionItem = {
      ...sub,
      id,
      name: brand ? brand.brand.displayName : sub.name.trim(),
      category: brand ? SUBSCRIPTION_CATEGORY : sub.category,
      currency: (sub.currency || 'CZK').toUpperCase(),
      frequency: sub.frequency === 'yearly' ? 'yearly' : 'monthly',
      merchantKey:
        sub.merchantKey?.trim() ||
        (brand ? brand.key : merchantKeyForSubscriptionName(sub.name)),
      paused: sub.paused ?? false,
      active: sub.active !== false,
    };
    set((state) => ({ subscriptions: [...state.subscriptions, normalized] }));
    void (async () => {
      const userId = await getAuthUserId();
      if (!userId) return;
      const { error } = await upsertSubscriptionsRemote([normalized], userId);
      if (error) {
        Alert.alert('Chyba synchronizace', logAndGetUserFacingError('sub-add', error));
      }
    })();
    queueSubscriptionNotificationSync();
  },

  updateSubscription: (id: string, updates: Partial<SubscriptionItem>) => {
    let updated: SubscriptionItem | null = null;
    set((state) => ({
      subscriptions: state.subscriptions.map((s) => {
        if (s.id !== id) return s;
        const next = { ...s, ...updates };
        const brand = resolveSubscriptionBrand(next.name);
        if (brand) {
          next.name = brand.brand.displayName;
          next.merchantKey = brand.key;
          if (!updates.category || updates.category === s.category) {
            next.category = SUBSCRIPTION_CATEGORY;
          }
        } else if (updates.name) {
          next.merchantKey = merchantKeyForSubscriptionName(next.name);
        }
        if (updates.currency) next.currency = updates.currency.toUpperCase();
        if (updates.frequency) {
          next.frequency = updates.frequency === 'yearly' ? 'yearly' : 'monthly';
        }
        updated = next;
        return next;
      }),
    }));
    if (updated) {
      const row = updated;
      void (async () => {
        const userId = await getAuthUserId();
        if (!userId) return;
        const { error } = await upsertSubscriptionsRemote([row], userId);
        if (error) {
          Alert.alert('Chyba synchronizace', logAndGetUserFacingError('sub-update', error));
        }
      })();
    }
    queueSubscriptionNotificationSync();
  },

  deleteSubscription: async (id: string, opts) => {
    const existing = get().subscriptions.find((s) => s.id === id);
    set((state) => ({ subscriptions: state.subscriptions.filter((s) => s.id !== id) }));
    const userId = await getAuthUserId();
    if (userId) {
      const { error } = await deleteSubscriptionRemote(id, userId);
      if (error) {
        Alert.alert('Chyba synchronizace', logAndGetUserFacingError('sub-delete', error));
      }
      if (opts?.hideSuggestion && existing) {
        const key =
          existing.merchantKey?.trim() || merchantKeyForSubscriptionName(existing.name);
        await get().dismissDetectedSubscriptionSuggestion({
          merchantKey: key,
          amount: existing.amount,
          name: existing.name,
          currency: existing.currency || 'CZK',
        });
      }
    }
    queueSubscriptionNotificationSync();
  },

  loadSubscriptionsFromSupabase: async () => {
    const userId = await getAuthUserId();
    if (!userId) return { ok: false, error: 'not authenticated' };
    const { subscriptions, ignored, error, migratedSubs, migratedIgnored } =
      await loadSubscriptionsWithLocalMigration(userId);
    if (error) console.warn('[loadSubscriptionsFromSupabase]', error.message);
    set({
      subscriptions,
      ignoredSubscriptionSuggestions: ignored,
      ignoredDetectedSubscriptionIds: [],
    });
    console.log(
      '[loadSubscriptionsFromSupabase] count',
      subscriptions.length,
      'ignored',
      ignored.length,
      'migratedSubs',
      migratedSubs,
      'migratedIgnored',
      migratedIgnored,
    );
    queueSubscriptionNotificationSync();
    return { ok: !error, error: error?.message };
  },

  addCustomCategory: (category: CustomCategory) => {
    set((state) => ({
      customCategories: [...state.customCategories, category],
    }));
    get().saveData();
  },

  deleteCustomCategory: (id: string) => {
    set((state) => ({
      customCategories: state.customCategories.filter(c => c.id !== id),
    }));
    get().saveData();
  },

  getAllCategories: (type: 'income' | 'expense') => {
    const state = get();
    const defaultCategories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    const customCategories = state.customCategories
      .filter(c => c.type === type)
      .reduce((acc, c) => {
        acc[c.name] = { icon: c.icon, color: c.color };
        return acc;
      }, {} as { [key: string]: { icon: string; color: string } });
    
    return { ...defaultCategories, ...customCategories };
  },

  addLoan: (loan: LoanItem) => {
    set((state) => ({
      loans: [...state.loans, loan],
    }));
    void mirrorUpsertLoans([loan]);
  },

  updateLoan: (id: string, updates: Partial<LoanItem>) => {
    let updated: LoanItem | undefined;
    set((state) => {
      const loans = state.loans.map((loan) => {
        if (loan.id !== id) return loan;
        updated = { ...loan, ...updates };
        return updated;
      });
      return { loans };
    });
    if (updated) void mirrorUpsertLoans([updated]);
  },

  deleteLoan: (id: string) => {
    set((state) => ({
      loans: state.loans.filter((loan) => loan.id !== id),
    }));
    void mirrorDeleteLoan(id);
  },

  getLoanProgress: (id: string): LoanProgressResult => {
    const state = get();
    const loan = state.loans.find((l) => l.id === id);
    if (!loan) {
      return { paidMonths: 0, totalMonths: 0, percentage: 0, totalPaid: 0, remainingAmount: 0 };
    }

    const overview = computeLoanDetailOverview(loan);
    if (overview.totalMonths <= 0 || loan.loanAmount <= 0) {
      return { paidMonths: 0, totalMonths: 0, percentage: 0, totalPaid: 0, remainingAmount: 0 };
    }

    return {
      paidMonths: overview.paidMonths,
      totalMonths: overview.totalMonths,
      percentage: overview.principalPercentPaid,
      totalPaid: overview.principalPaid,
      remainingAmount: overview.remainingPrincipal,
      totalInterestPaid: overview.interestPaid,
      principalPercentPaid: overview.principalPercentPaid,
    };
  },

  recordLoanPaymentFromRecurring: (payload: { name: string; amount: number; category: string }) => {
    if (!recurringExpenseMatchesLoanRule(payload.name, payload.category)) return;
    const loans = get().loans;
    const match = findBestMatchingLoan(loans, payload.name, payload.amount);
    if (!match) return;
    const prev = match.paymentsMade ?? 0;
    const next = prev + 1;
    let installmentStartDate = match.installmentStartDate;
    if (!installmentStartDate) {
      installmentStartDate = subtractMonths(new Date(), next);
    }
    get().updateLoan(match.id, { paymentsMade: next, installmentStartDate });
  },

  undoLastLoanPayment: (id: string) => {
    const loan = get().loans.find(l => l.id === id);
    if (!loan) return;
    const pm = loan.paymentsMade ?? 0;
    if (pm <= 0) return;
    const next = pm - 1;
    get().updateLoan(id, {
      paymentsMade: next === 0 ? undefined : next,
      installmentStartDate: next === 0 ? undefined : loan.installmentStartDate,
    });
  },

  syncTransactionsToSupabase: async () => {
    const userId = await getAuthUserId();
    if (!userId) return { ok: false, error: 'Nepřihlášen' };
    const txs = await loadTransactionsFromAsyncStorage();
    const { error } = await upsertTransactionsRemote(txs, userId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  },

  loadTransactionsFromSupabase: async () => {
    const userId = await getAuthUserId();
    if (!userId) return { ok: false, error: 'Nepřihlášen' };
    const { transactions: remote, error } = await fetchTransactionsRemote(userId);
    if (error) return { ok: false, error: error.message };
    // Zdroj pravdy = DB (jako dashboard). Neuchovávat orphaned AsyncStorage záznamy.
    const merged = [...(remote ?? [])].sort(compareTxDateDesc);
    console.log('[loadTransactionsFromSupabase] count', merged.length);
    set({
      transactions: merged,
      recentTransactions: sliceRecentTransactionsInMonth(merged, yyyyMmLocalToday()),
      totalTransactions: merged.length,
    } as Partial<FinanceState>);
    get().updateTotals();
    await get().saveData();
    return { ok: true };
  },

  loadLoansFromSupabase: async () => {
    const userId = await getAuthUserId();
    if (!userId) return { ok: false, error: 'Nepřihlášen' };
    const { loans, error, migrated } = await loadLoansWithLocalMigration(userId);
    if (error && loans.length === 0) return { ok: false, error: error.message };
    if (error) console.warn('[loadLoansFromSupabase]', error.message);
    console.log('[loadLoansFromSupabase] count', loans.length, 'migrated', migrated);
    set({ loans });
    return { ok: true };
  },

  loadOwnerBanksFromSupabase: async () => {
    const userId = await getAuthUserId();
    if (!userId) return { ok: false, error: 'Nepřihlášen' };
    const { banks, error, migrated } = await loadOwnerBanksWithLocalMigration(userId);
    if (error && banks.length === 0) return { ok: false, error: error.message };
    if (error) console.warn('[loadOwnerBanksFromSupabase]', error.message);
    console.log('[loadOwnerBanksFromSupabase] count', banks.length, 'migrated', migrated);
    set({ ownerBanks: banks });
    return { ok: true };
  },

  replaceOwnerBanks: (banks: OwnerBankStored[]) => {
    set({ ownerBanks: banks });
  },

  getOwnerAccountNumbers: () => getAllOwnerAccountNumbers(get().ownerBanks),

  replaceTransactionsFromRemote: (remote: Transaction[]) => {
    const merged = [...remote].sort(compareTxDateDesc);
    set({
      transactions: merged,
      recentTransactions: sliceRecentTransactionsInMonth(merged, yyyyMmLocalToday()),
      totalTransactions: merged.length,
    } as Partial<FinanceState>);
    get().updateTotals();
    void get().saveData();
  },

  loadData: async () => {
    try {
      const [
        transactionsData,
        goalsData,
        reportsData,
        customCategoriesData,
        loansData,
      ] = await Promise.all([
        AsyncStorage.getItem('finance_transactions'),
        AsyncStorage.getItem('finance_goals'),
        AsyncStorage.getItem('finance_reports'),
        AsyncStorage.getItem('finance_custom_categories'),
        AsyncStorage.getItem('finance_loans'),
      ]);
      
      let transactions: Transaction[] = [];
      if (transactionsData) {
        try {
          const parsed = JSON.parse(transactionsData);
          if (Array.isArray(parsed)) {
            transactions = parsed.map((t: any) => ({
              ...t,
              date: transactionDateYmd(t.date),
            }));
            transactions = transactions.map((t) => {
              const tx = t as Transaction & { description?: string; name?: string; merchant?: string };
              return {
                ...t,
                title:
                  (tx.title || tx.description || tx.name || tx.merchant || '').trim() || 'Bez názvu',
              };
            });
          } else {
            console.warn('Transactions data is not an array, clearing...');
            await AsyncStorage.removeItem('finance_transactions');
          }
        } catch (error) {
          console.error('Failed to parse transactions data:', error);
          console.error('Corrupted data preview:', transactionsData?.substring(0, 100));
          await AsyncStorage.removeItem('finance_transactions');
        }
      }
      
      let financialGoals: FinancialGoal[] = [];
      if (goalsData) {
        try {
          const parsed = JSON.parse(goalsData);
          if (Array.isArray(parsed)) {
            financialGoals = parsed.map((g: any) => ({
              ...g,
              deadline: g.deadline ? new Date(g.deadline) : undefined,
              recurring: g.recurring ? {
                isRecurring: Boolean(g.recurring.isRecurring),
                frequency: (g.recurring.frequency ?? 'monthly') as RecurrenceFrequency,
                dayOfMonth: typeof g.recurring.dayOfMonth === 'number' ? g.recurring.dayOfMonth : undefined,
              } : undefined,
            }));
          } else {
            console.warn('Financial goals data is not an array, clearing...');
            await AsyncStorage.removeItem('finance_goals');
          }
        } catch (error) {
          console.error('Failed to parse financial goals data:', error);
          console.error('Corrupted data preview:', goalsData?.substring(0, 100));
          await AsyncStorage.removeItem('finance_goals');
        }
      }
      
      let monthlyReports: MonthlyReport[] = [];
      if (reportsData) {
        try {
          const parsed = JSON.parse(reportsData);
          if (Array.isArray(parsed)) {
            monthlyReports = parsed;
          } else {
            console.warn('Monthly reports data is not an array, clearing...');
            await AsyncStorage.removeItem('finance_reports');
          }
        } catch (error) {
          console.error('Failed to parse monthly reports data:', error);
          console.error('Corrupted data preview:', reportsData?.substring(0, 100));
          await AsyncStorage.removeItem('finance_reports');
        }
      }

      let customCategories: CustomCategory[] = [];
      if (customCategoriesData) {
        try {
          const parsed = JSON.parse(customCategoriesData);
          if (Array.isArray(parsed)) {
            customCategories = parsed;
          } else {
            console.warn('Custom categories data is not an array, clearing...');
            await AsyncStorage.removeItem('finance_custom_categories');
          }
        } catch (error) {
          console.error('Failed to parse custom categories data:', error);
          console.error('Corrupted data preview:', customCategoriesData?.substring(0, 100));
          await AsyncStorage.removeItem('finance_custom_categories');
        }
      }

      let loans: LoanItem[] = parseLocalLoansJson(loansData);

      set({
        transactions,
        financialGoals,
        monthlyReports,
        subscriptions: [],
        customCategories,
        loans,
        ignoredSubscriptionSuggestions: [],
        ignoredDetectedSubscriptionIds: [],
        isLoaded: true,
      });

      get().updateTotals();
      queueSubscriptionNotificationSync();
      console.log('Finance data loaded successfully');

      try {
        const remoteResult = await get().loadTransactionsFromSupabase();
        if (!remoteResult.ok) {
          console.warn('[finance] Supabase transakce přeskočeny:', remoteResult.error);
        } else {
          // Verzovaný přepočet kategorií na pozadí (neblokuje UI)
          void (async () => {
            try {
              const userId = await getAuthUserId();
              if (!userId) return;
              const { ensureCategorizationUpToDate } = await import('@/lib/categorization');
              const { ran, updated, categoryChanged } = await ensureCategorizationUpToDate(userId);
              if (ran) {
                console.log('[finance] categorization v10', { updated, categoryChanged });
              }
              if (ran && updated > 0) {
                await get().loadTransactionsFromSupabase();
              }
            } catch (e) {
              console.warn('[finance] categorization upgrade:', e);
            }
          })();
        }
      } catch (e) {
        console.warn('[finance] Supabase sync po načtení lokálních dat:', e);
      }

      try {
        const subsResult = await get().loadSubscriptionsFromSupabase();
        if (!subsResult.ok) {
          console.warn('[finance] Supabase subscriptions přeskočeny:', subsResult.error);
        } else {
          const st = get();
          const next = st.subscriptions.map((s) =>
            normalizeStoredSubscription(s, st.transactions),
          );
          if (subscriptionsChanged(st.subscriptions, next)) {
            set({ subscriptions: next });
            const userId = await getAuthUserId();
            if (userId) {
              void upsertSubscriptionsRemote(next, userId);
            }
            queueSubscriptionNotificationSync();
          }
        }
      } catch (e) {
        console.warn('[finance] subscriptions sync po načtení:', e);
      }

      try {
        const loansResult = await get().loadLoansFromSupabase();
        if (!loansResult.ok) {
          console.warn('[finance] Supabase loans přeskočeny:', loansResult.error);
        }
      } catch (e) {
        console.warn('[finance] loans sync po načtení:', e);
      }

      try {
        const ownerBanksResult = await get().loadOwnerBanksFromSupabase();
        if (!ownerBanksResult.ok) {
          console.warn('[finance] Supabase owner banks přeskočeny:', ownerBanksResult.error);
        }
      } catch (e) {
        console.warn('[finance] owner banks sync po načtení:', e);
      }
    } catch (error) {
      console.error('Failed to load finance data:', error);
      set({ isLoaded: true });
    }
  },

  saveData: async () => {
    try {
      const state = get();
      await Promise.all([
        AsyncStorage.setItem('finance_transactions', JSON.stringify(state.transactions)),
        AsyncStorage.setItem('finance_goals', JSON.stringify(state.financialGoals)),
        AsyncStorage.setItem('finance_reports', JSON.stringify(state.monthlyReports)),
        AsyncStorage.setItem('finance_custom_categories', JSON.stringify(state.customCategories)),
        // loans / předplatná: zdroj pravdy = Supabase (ne AsyncStorage)
        AsyncStorage.removeItem(FINANCE_LOANS_KEY),
        AsyncStorage.removeItem(FINANCE_SUBSCRIPTIONS_KEY),
        AsyncStorage.removeItem(IGNORED_DETECTED_SUBSCRIPTIONS_KEY),
      ]);
      console.log('Finance data saved successfully');
    } catch (error) {
      console.error('Failed to save finance data:', error);
    }
  },
};
}); 