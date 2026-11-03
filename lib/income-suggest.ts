/**
 * Návrh očekávaného příjmu z importovaných výpisů (kategorie Mzda).
 * Proměnlivá výplata (±pár tisíc) → průměr posledních 3 měsíců s výplatou.
 */
import { mainCategoryName } from '@/lib/category-normalize';
import { transactionDateYmd } from '@/lib/transaction-date';
import { isIncomeForReport, type Transaction } from '@/store/finance-store';

export type IncomeSuggestion = {
  /** Průměr za posledních N měsíců s výplatou (zaokrouhleno na stovky). */
  average: number;
  /** Částky výplat za jednotlivé měsíce (od nejnovějšího). */
  monthly: { ym: string; amount: number }[];
  /** Obvyklý den výplaty (medián). */
  payday: number | null;
};

export function suggestIncomeFromSalary(transactions: Transaction[], months = 3): IncomeSuggestion | null {
  const byMonth = new Map<string, number>();
  const days: number[] = [];
  for (const t of transactions) {
    if (!isIncomeForReport(t)) continue;
    if (mainCategoryName(t.category, t.subcategory) !== 'Mzda') continue;
    const ymd = transactionDateYmd(t.date);
    if (!ymd) continue;
    const ym = ymd.slice(0, 7);
    byMonth.set(ym, (byMonth.get(ym) ?? 0) + (Number(t.amount) || 0));
    const d = parseInt(ymd.slice(8, 10), 10);
    if (d) days.push(d);
  }
  const monthly = [...byMonth.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, months)
    .map(([ym, amount]) => ({ ym, amount }));
  if (monthly.length < 2) return null;
  const avg = monthly.reduce((s, m) => s + m.amount, 0) / monthly.length;
  days.sort((a, b) => a - b);
  const payday = days.length ? days[Math.floor(days.length / 2)]! : null;
  return { average: Math.round(avg / 100) * 100, monthly, payday };
}
