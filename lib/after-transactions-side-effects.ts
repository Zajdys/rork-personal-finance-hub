/**
 * Společné side-effecty po přidání / importu / syncu transakcí:
 * párování „Co tě čeká“ + upozornění na rozpočty.
 */
import {
  formatPlanMatchToast,
  matchPlanPaymentsForUser,
} from '@/lib/plan-payment-match';
import { checkBudgetThresholdNotifications } from '@/lib/budget-notifications';
import { showToast } from '@/store/toast-store';
import { useRevenueCatStore } from '@/store/revenuecat-store';
import { isDevForcePremium } from '@/constants/premium';
import { fetchHouseholdHasPremium } from '@/lib/household-premium';
import type { Transaction } from '@/store/finance-store';

export async function runAfterTransactionsSideEffects(params: {
  userId: string;
  /** Nově přidané transakce (preferováno pro párování). */
  newTransactions?: Transaction[];
}): Promise<void> {
  const { userId, newTransactions } = params;
  if (!userId) return;

  try {
    const matches = await matchPlanPaymentsForUser(userId, newTransactions);
    if (matches.length > 0) {
      showToast({ type: 'success', message: formatPlanMatchToast(matches) });
    }
  } catch (e) {
    console.warn('[after-tx] plan match', e);
  }

  try {
    // Upozornění na rozpočty jsou Premium (vlastní nebo přes domácnost).
    const premium =
      useRevenueCatStore.getState().isPremium ||
      isDevForcePremium() ||
      (await fetchHouseholdHasPremium().catch(() => false));
    if (premium) await checkBudgetThresholdNotifications(userId);
  } catch (e) {
    console.warn('[after-tx] budget notif', e);
  }
}
