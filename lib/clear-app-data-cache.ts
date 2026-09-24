import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFinanceStore } from '@/store/finance-store';
import { useInvestmentStore } from '@/store/investment-store';
import { useSplitGroupsStore } from '@/store/split-groups-store';

/** Lokální cache finančních dat — ne auth, ne theme/language/PIN/bank tokeny. */
export const APP_DATA_CACHE_KEYS = [
  'finance_transactions',
  'finance_goals',
  'finance_reports',
  'finance_subscriptions',
  'finance_custom_categories',
  'finance_loans',
  'ignored_detected_subscriptions',
  'etoro_positions',
] as const;

/**
 * Smaže cache dat v AsyncStorage a znovu načte finance / investice / split groups ze serveru.
 */
export async function clearAppDataCacheAndRefetch(userId: string | null | undefined): Promise<void> {
  await AsyncStorage.multiRemove([...APP_DATA_CACHE_KEYS]);

  await useFinanceStore.getState().loadData();

  if (!userId) return;

  await Promise.all([
    useInvestmentStore.getState().fetchPortfolios(userId),
    useSplitGroupsStore.getState().fetchGroups(),
  ]);

  const portfolioIds = useInvestmentStore.getState().portfolios.map((p) => p.id);
  if (portfolioIds.length > 0) {
    await useInvestmentStore.getState().fetchPositions(portfolioIds);
  }
}
