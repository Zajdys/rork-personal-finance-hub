import {
  getMonthTransactions,
  isExpenseForReport,
  isIncomeForReport,
  isRefundTransaction,
  isTransferLikeTransaction,
  netExpenseAmount,
  type Transaction,
} from '@/store/finance-store';
import { addMonthsToYyyyMm, yyyyMmLocalToday } from '@/lib/transaction-date';

export const RECOMMENDATION_INCOME_THRESHOLD = 1000;

export type RecommendationIncomeSource = 'transactions' | 'onboarding';

/** @deprecated Prefer `computeProfileRecommendations` for the profile screen. */
export function resolveRecommendationBaseIncome(
  transactionIncome: number,
  onboardingIncome: number,
  threshold = RECOMMENDATION_INCOME_THRESHOLD,
): { baseIncome: number; source: RecommendationIncomeSource } {
  const tx = Number.isFinite(transactionIncome) ? transactionIncome : 0;
  const onboarding = Number.isFinite(onboardingIncome) ? onboardingIncome : 0;

  if (tx >= threshold) {
    return { baseIncome: tx, source: 'transactions' };
  }
  return { baseIncome: onboarding, source: 'onboarding' };
}

/** @deprecated Prefer `computeProfileRecommendations`. */
export function computeFinancialRecommendations(baseIncome: number): {
  invest: number;
  reserve: number;
} {
  const base = Number.isFinite(baseIncome) ? baseIncome : 0;
  return {
    invest: Math.round(base * 0.15),
    reserve: Math.round(base * 0.2),
  };
}

export type ProfileRecommendations = {
  /** false = méně než 2 ukončené měsíce s daty → sekci skrýt */
  visible: boolean;
  /** 15 % mediánu příjmu */
  setAside: number;
  /** 3× medián měsíčních výdajů */
  reserveTarget: number;
  /** Medián příjmu (stejná hodnota jako dřív avgIncome v UI). */
  avgIncome: number;
  /** Medián výdajů. */
  avgExpenses: number;
  monthsUsed: number;
};

function parseYm(ym: string): { y: number; m: number } | null {
  const [yStr, mStr] = ym.split('-');
  const y = parseInt(yStr ?? '', 10);
  const m = parseInt(mStr ?? '', 10);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;
  return { y, m };
}

function monthHasReportData(txs: Transaction[]): boolean {
  return txs.some(
    (t) => isIncomeForReport(t) || isExpenseForReport(t) || isRefundTransaction(t),
  );
}

/** Medián čísel; při sudém počtu průměr dvou prostředních. */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Doporučení z mediánu za poslední 3 ukončené měsíce (bez aktuálního).
 * Stejný filtr jako dashboard: bez Převod / Vklad hotovosti / výdajové Investice,
 * výdaje = netExpenseAmount (po odečtení refundací).
 * Viditelné jen při ≥ 2 měsících s daty.
 */
export function computeProfileRecommendations(
  transactions: Transaction[],
  todayYm: string = yyyyMmLocalToday(),
): ProfileRecommendations {
  const empty: ProfileRecommendations = {
    visible: false,
    setAside: 0,
    reserveTarget: 0,
    avgIncome: 0,
    avgExpenses: 0,
    monthsUsed: 0,
  };

  const monthStats: { income: number; expenses: number }[] = [];
  for (let i = 1; i <= 3; i++) {
    const ym = addMonthsToYyyyMm(todayYm, -i);
    const parsed = parseYm(ym);
    if (!parsed) continue;
    // isTransferLikeTransaction = Převod + Vklad hotovosti + výdajová Investice (+ type transfer)
    const raw = getMonthTransactions(transactions, parsed.y, parsed.m).filter(
      (t) => !isTransferLikeTransaction(t),
    );
    if (!monthHasReportData(raw)) continue;
    const income = raw.filter(isIncomeForReport).reduce((s, t) => s + t.amount, 0);
    const expenses = netExpenseAmount(raw);
    monthStats.push({ income, expenses });
  }

  if (monthStats.length < 2) return empty;

  const medIncome = median(monthStats.map((m) => m.income));
  const medExpenses = median(monthStats.map((m) => m.expenses));

  return {
    visible: true,
    setAside: Math.round(medIncome * 0.15),
    reserveTarget: Math.round(medExpenses * 3),
    avgIncome: medIncome,
    avgExpenses: medExpenses,
    monthsUsed: monthStats.length,
  };
}
