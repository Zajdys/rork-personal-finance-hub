import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useFocusRefresh } from '@/hooks/useFocusRefresh';
import { useFinanceStore, getMonthTransactions, isIncomeForReport, isExpenseForReport, isRefundTransaction, isTransferLikeTransaction, type Transaction } from '@/store/finance-store';
import { useSettingsStore } from '@/store/settings-store';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/store/auth-store';
import { appLocale } from '@/lib/app-locale';
import { formatMoney, formatMoneyWithSymbol } from '@/lib/format-money';
import { useLanguageStore } from '@/store/language-store';
import { filterTransactionsByPeriod, filterTransfersByPeriod, type FinancePeriod } from '@/lib/period-transactions';
import { SwipeableTransactionRow } from '@/components/SwipeableTransactionRow';
import { compareTxDateDesc, transactionDateYmd, ymdToLocalDateNoon } from '@/lib/transaction-date';
import { BackButton } from '@/components/BackButton';
import { OverviewFilterBadge } from '@/components/OverviewFilterBadge';
import { useFilteredTransactions } from '@/hooks/use-filtered-transactions';
import { useOverviewFiltersStore } from '@/store/overview-filters-store';

function transactionsWord(count: number, t: ReturnType<typeof useLanguageStore.getState>['t']): string {
  const n100 = count % 100;
  if (count === 1) return t('transactionsWordOne');
  if (n100 >= 12 && n100 <= 14) return t('transactionsWordMany');
  const n10 = count % 10;
  if (n10 >= 2 && n10 <= 4) return t('transactionsWordFew');
  return t('transactionsWordMany');
}

function bulkDeleteMessage(count: number, t: ReturnType<typeof useLanguageStore.getState>['t']): string {
  if (count === 1) return t('bulkDeleteConfirmOne', { count });
  if (count >= 2 && count <= 4) return t('bulkDeleteConfirmFew', { count });
  return t('bulkDeleteConfirmMany', { count });
}

/** Stejné defaultní čtení kategorie jako `rowToTransaction` (prázdné = Ostatní). */
function displayCategory(t: Transaction): string {
  const c = (t.category ?? '').trim();
  return c || 'Ostatní';
}

/** Jde o „odpadní“ kategorii v DB (různé zápisy). */
function isOtherCategoryLabel(s: string): boolean {
  const u = s.trim();
  if (!u) return true;
  const lower = u.toLowerCase();
  return (
    u === 'Ostatní' ||
    lower === 'ostatní' ||
    lower === 'ostatni' ||
    lower === 'other' ||
    lower === 'misc' ||
    lower === 'jiné' ||
    lower === 'jine'
  );
}

/** Filtrování podle názvu kategorie sjednocené s dashboardem (vč. Ostatní / other / prázdné). */
function transactionMatchesCategory(t: Transaction, requestedCategory: string): boolean {
  const req = (requestedCategory || '').trim();
  const display = displayCategory(t);
  if (display === req) return true;
  if (isOtherCategoryLabel(req) && isOtherCategoryLabel(display)) return true;
  return false;
}

function parseYyyyMm(ym: string | undefined): { y: number; m: number } | null {
  if (!ym || typeof ym !== 'string') return null;
  const [yStr, mStr] = ym.split('-');
  const y = parseInt(yStr ?? '', 10);
  const m = parseInt(mStr ?? '', 10);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;
  return { y, m };
}

export default function CategoryDetailScreen() {
  const params = useLocalSearchParams<{
    category: string;
    type: 'income' | 'expense';
    month?: string;
    period?: string;
  }>();
  const rawCat = Array.isArray(params.category) ? params.category[0] : params.category;
  const rawType = Array.isArray(params.type) ? params.type[0] : params.type;
  const rawMonth = Array.isArray(params.month) ? params.month[0] : params.month;
  const rawPeriod = Array.isArray(params.period) ? params.period[0] : params.period;
  const category = (() => {
    const c = (rawCat ?? '').trim();
    if (!c) return '';
    try {
      return decodeURIComponent(c);
    } catch {
      return c;
    }
  })();
  const type: 'income' | 'expense' = rawType === 'income' ? 'income' : 'expense';
  const storeMonth = useOverviewFiltersStore((s) => s.selectedMonth);
  const monthYm = (rawMonth ?? '').trim() || storeMonth || undefined;
  const periodForDetail: FinancePeriod | undefined =
    rawPeriod === 'week' || rawPeriod === 'month' || rawPeriod === 'year' ? rawPeriod : undefined;
  const { user } = useAuth();
  const { t, language } = useLanguageStore();
  const { getAllCategories, financialGoals, deleteTransaction, deleteTransactions, isLoaded, loadTransactionsFromSupabase } =
    useFinanceStore();
  const { getCurrentCurrency } = useSettingsStore();
  const { colors } = useTheme();
  const numberLocale = appLocale(language);

  const filteredAll = useFilteredTransactions();
  const [listLoading, setListLoading] = useState(!isLoaded);
  const [listError, setListError] = useState<string | null>(null);

  const transactions = useMemo(() => {
    if (!category) return [];
    const all = filteredAll;
    const ym = parseYyyyMm(monthYm);
    const viewingTransfers = category === 'Převod';
    const viewingExcludedInvestice = category === 'Investice' && type === 'expense';
    const viewingExcluded = viewingTransfers || viewingExcludedInvestice;
    const byType = viewingExcluded
      ? all.filter((t) => {
          if (!isTransferLikeTransaction(t) || t.type !== type) return false;
          if (viewingExcludedInvestice) return t.category === 'Investice';
          return t.category !== 'Investice';
        })
      : all.filter((t) => {
          if (type === 'income') return isIncomeForReport(t);
          return isExpenseForReport(t) || isRefundTransaction(t);
        });
    const byTypeAndDate =
      ym !== null
        ? getMonthTransactions(byType, ym.y, ym.m)
        : periodForDetail
          ? viewingExcluded
            ? filterTransfersByPeriod(all, type, periodForDetail).filter((t) =>
                viewingExcludedInvestice
                  ? t.category === 'Investice'
                  : t.category !== 'Investice',
              )
            : filterTransactionsByPeriod(byType, type, periodForDetail)
          : byType;
    const byCategory = viewingExcluded
      ? byTypeAndDate
      : byTypeAndDate.filter((t) => transactionMatchesCategory(t, category));
    return [...byCategory].sort(compareTxDateDesc);
  }, [filteredAll, category, type, monthYm, periodForDetail]);

  useFocusRefresh(
    useCallback(async () => {
      if (!user?.id || !category) {
        setListError(!user?.id ? t('categorySignInToLoad') : null);
        setListLoading(false);
        return;
      }
      setListError(null);
      setListLoading(true);
      const result = await loadTransactionsFromSupabase();
      if (!result.ok) {
        setListError(result.error ?? t('auth.genericError'));
      }
      setListLoading(false);
    }, [user?.id, category, loadTransactionsFromSupabase, t]),
    { focusKey: `${category ?? ''}|${type ?? ''}|${monthYm ?? ''}|${periodForDetail}` },
  );

  useEffect(() => {
    if (isLoaded) setListLoading(false);
  }, [isLoaded]);

  const allCategories = getAllCategories(type || 'expense');
  const categoryInfo = allCategories[category || ''] || { icon: '📦', color: '#6B7280' };
  
  const currentCurrency = getCurrentCurrency();
  const insets = useSafeAreaInsets();
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const displayTransactions = useMemo(
    () => transactions.filter((t) => t.amount != null && t.amount !== 0),
    [transactions],
  );

  const totalAmount = useMemo(
    () =>
      displayTransactions.reduce((sum, t) => {
        if (isRefundTransaction(t)) return sum - t.amount;
        return sum + t.amount;
      }, 0),
    [displayTransactions],
  );

  const categoryGoal =
    type === 'expense'
      ? financialGoals.find(
          (goal) => goal.category === category && goal.type === 'spending_limit',
        )
      : undefined;

  const budgetPercentage = categoryGoal
    ? Math.round((totalAmount / categoryGoal.targetAmount) * 100)
    : null;
  
  const formatDate = (date: string | Date) => {
    const d = ymdToLocalDateNoon(transactionDateYmd(date));
    const day = d.getDate();
    const month = d.getMonth() + 1;
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
  };

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAllInCategory = useCallback(() => {
    setSelectedIds(new Set(displayTransactions.map((t) => t.id)));
  }, [displayTransactions]);

  const exitSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const handleDeleteOne = useCallback(
    (id: string) => {
      deleteTransaction(id);
    },
    [deleteTransaction],
  );

  const confirmBulkDelete = useCallback(() => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    Alert.alert(
      t('bulkDeleteTransactionsTitle'),
      bulkDeleteMessage(ids.length, t),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: () => {
            deleteTransactions(ids);
            exitSelection();
          },
        },
      ],
    );
  }, [selectedIds, deleteTransactions, exitSelection, t]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen 
        options={{
          headerShown: false,
        }}
      />
      
      <LinearGradient
        colors={[categoryInfo.color, categoryInfo.color + 'CC']}
        style={styles.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <BackButton color="white" size={24} style={styles.backButton} />
        
        <View style={styles.headerContent}>
          <Text style={styles.categoryIcon}>{categoryInfo.icon}</Text>
          <Text style={styles.headerTitle}>{category}</Text>
          <OverviewFilterBadge onAccent style={{ marginTop: 6, alignSelf: 'center' }} />
          <Text style={styles.headerSubtitle}>
            {listLoading
              ? t('categoryLoading')
              : `${displayTransactions.length} ${displayTransactions.length === 1 ? t('categoryTransactionOne') : t('categoryTransactionMany')}`}
          </Text>
          <Text style={styles.totalAmount}>
            {listLoading
              ? '…'
              : formatMoneyWithSymbol(totalAmount, numberLocale, currentCurrency.symbol)}
          </Text>
          {!listLoading && categoryGoal && budgetPercentage !== null && (
            <View style={styles.budgetInfoContainer}>
              <Text style={styles.budgetInfoText}>
                {t('categoryDetailBudgetLine', {
                  percent: budgetPercentage,
                  amount: formatMoney(categoryGoal.targetAmount, numberLocale),
                  symbol: currentCurrency.symbol,
                })}
              </Text>
              {budgetPercentage > 100 && (
                <Text style={styles.overBudgetText}>
                  {t('categoryDetailBudgetExceeded', {
                    amount: formatMoney(totalAmount - categoryGoal.targetAmount, numberLocale),
                    symbol: currentCurrency.symbol,
                  })}
                </Text>
              )}
            </View>
          )}
        </View>
      </LinearGradient>

      {displayTransactions.length > 0 && !listLoading && (
        <View style={[styles.listSelectBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <Text style={[styles.listSelectTitle, { color: colors.text }]}>{t('transactions')}</Text>
          <View style={styles.listSelectActions}>
            {selectionMode && (
              <TouchableOpacity onPress={selectAllInCategory} hitSlop={8}>
                <Text style={[styles.listSelectLink, { color: colors.primary }]}>{t('dashboardSelectAll')}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => {
                if (selectionMode) exitSelection();
                else setSelectionMode(true);
              }}
              hitSlop={8}
            >
              <Text style={[styles.listSelectLink, { color: colors.primary }]}>
                {selectionMode ? t('cancel') : t('dashboardSelect')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      
      <ScrollView 
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: selectionMode ? 100 + insets.bottom : 0 }}
      >
        <View style={styles.transactionsContainer}>
          {listLoading ? (
            <View style={styles.emptyState}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : listError ? (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyStateText, { color: colors.text }]}>
                {listError}
              </Text>
            </View>
          ) : displayTransactions.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>
                {t('fgNoExpensesInCategory')}
              </Text>
            </View>
          ) : (
            displayTransactions.map((transaction) => (
              <View key={transaction.id} style={styles.transactionSwipeWrap}>
                <SwipeableTransactionRow
                  transaction={transaction}
                  onDelete={handleDeleteOne}
                  currencySymbol={currentCurrency.symbol}
                  subtitle={formatDate(transaction.date)}
                  selectionMode={selectionMode}
                  selected={selectedIds.has(transaction.id)}
                  onToggleSelection={() => toggleSelect(transaction.id)}
                />
              </View>
            ))
          )}
        </View>
      </ScrollView>
      {selectionMode && displayTransactions.length > 0 && !listLoading && (
        <View
          style={[
            styles.bulkToolbar,
            {
              paddingBottom: Math.max(insets.bottom, 12) + 8,
              backgroundColor: colors.surface,
              borderTopColor: colors.border,
            },
          ]}
        >
          <Text style={[styles.bulkToolbarLabel, { color: colors.text }]}>
            {t('dashboardSelectedCount', {
              count: selectedIds.size,
              transactionsWord: transactionsWord(selectedIds.size, t),
            })}
          </Text>
          <TouchableOpacity
            style={[styles.bulkDeleteBtn, selectedIds.size === 0 && { opacity: 0.45 }]}
            onPress={confirmBulkDelete}
            disabled={selectedIds.size === 0}
            activeOpacity={0.85}
          >
            <Text style={styles.bulkDeleteBtnText}>{t('dashboardDeleteSelected')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listSelectBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  listSelectTitle: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  listSelectActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  listSelectLink: {
    fontSize: 15,
    fontWeight: '600',
  },
  bulkToolbar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  bulkToolbarLabel: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  bulkDeleteBtn: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  bulkDeleteBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  header: {
    paddingTop: 60,
    paddingBottom: 32,
    paddingHorizontal: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerContent: {
    alignItems: 'center',
  },
  categoryIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'white',
    opacity: 0.9,
    marginBottom: 16,
  },
  totalAmount: {
    fontSize: 32,
    fontWeight: 'bold',
    color: 'white',
  },
  budgetInfoContainer: {
    marginTop: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  budgetInfoText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
    textAlign: 'center',
  },
  overBudgetText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'white',
    textAlign: 'center',
    marginTop: 4,
  },
  scrollView: {
    flex: 1,
  },
  transactionsContainer: {
    padding: 20,
  },
  transactionSwipeWrap: {
    marginBottom: 12,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },
  transactionCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  transactionLeft: {
    flex: 1,
  },
  transactionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  transactionDate: {
    fontSize: 14,
  },
  transactionAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 12,
  },
});
