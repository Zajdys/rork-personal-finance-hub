import { useMemo } from 'react';
import { bankLabelForImportSource } from '@/lib/import-batches';
import { formatYyyyMmTitle } from '@/lib/app-locale';
import { useFinanceStore, type Transaction } from '@/store/finance-store';
import { useLanguageStore } from '@/store/language-store';
import { useOverviewFiltersStore } from '@/store/overview-filters-store';
import { appLocale } from '@/lib/app-locale';

/** Aplikuje filtr bank podle `source`. Prázdný výběr = vše; při konkrétní bance `manual` vypadne (není ve výběru). */
export function filterTransactionsBySources(
  transactions: Transaction[],
  selectedSources: readonly string[],
): Transaction[] {
  if (selectedSources.length === 0) return transactions;
  const wanted = new Set(selectedSources.map((s) => s.trim().toLowerCase()).filter(Boolean));
  if (wanted.size === 0) return transactions;
  return transactions.filter((t) => {
    const src = (t.source ?? '').trim().toLowerCase();
    if (!src) return false;
    return wanted.has(src);
  });
}

export function useFilteredTransactions(): Transaction[] {
  const transactions = useFinanceStore((s) => s.transactions);
  const selectedSourceFilters = useOverviewFiltersStore((s) => s.selectedSourceFilters);
  return useMemo(
    () => filterTransactionsBySources(transactions, selectedSourceFilters),
    [transactions, selectedSourceFilters],
  );
}

/** Text štítku aktivního filtru, např. „Revolut · září 2026“ nebo „Všechny banky“. */
export function useOverviewFilterLabel(): string {
  const selectedSourceFilters = useOverviewFiltersStore((s) => s.selectedSourceFilters);
  const selectedMonth = useOverviewFiltersStore((s) => s.selectedMonth);
  const { t, language } = useLanguageStore();
  const numberLocale = appLocale(language);

  return useMemo(() => {
    const monthTitle = formatYyyyMmTitle(selectedMonth, numberLocale);
    if (selectedSourceFilters.length === 0) {
      return t('dashboardAllBanks');
    }
    const banks = selectedSourceFilters
      .map((s) => (s === 'manual' ? t('dashboardSourceManual') : bankLabelForImportSource(s)))
      .join(', ');
    return `${banks} · ${monthTitle}`;
  }, [selectedSourceFilters, selectedMonth, numberLocale, t]);
}
