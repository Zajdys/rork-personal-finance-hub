import type { Transaction } from '@/store/finance-store';
import {
  isIncomeForReport,
  isExpenseForReport,
  isRefundTransaction,
  isTransferLikeTransaction,
} from '@/store/finance-store';
import {
  transactionDateYmd,
  transactionToLocalDateNoon,
  yyyyMmLocalFromDate,
} from '@/lib/transaction-date';

export type FinancePeriod = 'week' | 'month' | 'year';

function inPeriod(
  transactions: Transaction[],
  period: FinancePeriod,
  referenceDate: Date,
): Transaction[] {
  if (period === 'month') {
    const prefix = yyyyMmLocalFromDate(referenceDate);
    return transactions.filter((t) => transactionDateYmd(t.date).startsWith(prefix));
  }
  if (period === 'week') {
    const end = new Date(referenceDate);
    end.setHours(23, 59, 59, 999);
    const start = new Date(referenceDate);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return transactions.filter((t) => {
      const d = transactionToLocalDateNoon(transactionDateYmd(t.date));
      return d >= start && d <= end;
    });
  }
  const y = referenceDate.getFullYear();
  const yPrefix = `${y}-`;
  return transactions.filter((t) => transactionDateYmd(t.date).startsWith(yPrefix));
}

/**
 * Filtruje příjmy/výdaje podle období (lokální kalendář).
 * Týden = posledních 7 kalendářních dní včetně dne reference.
 * U výdajů zahrnuje i vratky (is_refund), aby je šlo odečíst v detailu kategorie.
 * Převody (Převod) jsou vyloučené — použij filterTransfersByPeriod.
 */
export function filterTransactionsByPeriod(
  transactions: Transaction[],
  type: 'income' | 'expense',
  period: FinancePeriod,
  referenceDate: Date = new Date(),
): Transaction[] {
  const list = transactions.filter((t) =>
    type === 'income'
      ? isIncomeForReport(t)
      : isExpenseForReport(t) || isRefundTransaction(t),
  );
  return inPeriod(list, period, referenceDate);
}

/** Převody (kategorie Převod) v období — pro zobrazení mimo součty. */
export function filterTransfersByPeriod(
  transactions: Transaction[],
  type: 'income' | 'expense',
  period: FinancePeriod,
  referenceDate: Date = new Date(),
): Transaction[] {
  const list = transactions.filter(
    (t) => isTransferLikeTransaction(t) && t.type === type,
  );
  return inPeriod(list, period, referenceDate);
}
