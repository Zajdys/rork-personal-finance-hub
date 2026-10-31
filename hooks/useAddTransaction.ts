import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { useFinanceStore } from '@/store/finance-store';
import { useBuddyStore } from '@/store/buddy-store';
import { useLanguageStore } from '@/store/language-store';
import { parseMoneyInput } from '@/lib/parse-money-input';
import { convertForeignAmount } from '@/lib/cnb-exchange-rates';
import { randomUUID } from '@/lib/random-uuid';
import { toYyyyMmDd } from '@/lib/transaction-date';
import {
  formatCategoryDisplay,
  resolveCategoryFieldsForWrite,
} from '@/lib/category-normalize';
import { logAndGetUserFacingError } from '@/lib/user-facing-error';
import { getAuthUserId } from '@/lib/supabase-transactions';
import { upsertUserCategoryRule } from '@/lib/user-category-rules';
import {
  createPersonalRecurringWithFirstTx,
  type PersonalRecurringFrequency,
} from '@/lib/personal-recurring';
import { showToast } from '@/store/toast-store';

export type AddTransactionInput = {
  type: 'income' | 'expense';
  amount: string;
  title: string;
  category: string;
  subcategory?: string | null;
  /** YYYY-MM-DD; výchozí dnes */
  date?: string;
  currency?: string;
  /** null / undefined = jednorázově */
  frequency?: PersonalRecurringFrequency | null;
};

export type AddTransactionResult = { ok: true } | { ok: false; reason: 'validation' | 'fx' | 'unknown' };

/**
 * Sdílené uložení transakce (tab Přidat + QuickAdd sheet).
 * Validace → FX → normalizeCategory → store (await mirror) → toast.
 */
export function useAddTransaction() {
  const { addTransaction, addTransactions } = useFinanceStore();
  const { addPoints } = useBuddyStore();
  const { t } = useLanguageStore();
  const [isSaving, setIsSaving] = useState(false);

  const saveTransaction = useCallback(
    async (input: AddTransactionInput): Promise<AddTransactionResult> => {
      if (isSaving) return { ok: false, reason: 'unknown' };

      const categoryRaw = input.category.trim();
      // Popis je nepovinný – bez něj použijeme podkategorii / kategorii (např. „Streaming“).
      const title = input.title.trim() || (input.subcategory ?? '').trim() || categoryRaw;
      if (!input.amount || !categoryRaw) {
        Alert.alert(t('errorMessage'), t('fillAllFields'));
        return { ok: false, reason: 'validation' };
      }

      const numAmount = parseMoneyInput(input.amount);
      if (numAmount == null || numAmount <= 0) {
        Alert.alert(t('errorMessage'), t('enterValidAmount'));
        return { ok: false, reason: 'validation' };
      }

      const currency = (input.currency || 'CZK').toUpperCase();
      const dateYmd = input.date || toYyyyMmDd(new Date());
      let amountCzk = numAmount;
      let originalAmount: number | null = null;
      let originalCurrency: string | null = null;
      let exchangeRate: number | null = null;

      setIsSaving(true);
      try {
        if (currency !== 'CZK') {
          try {
            const fx = await convertForeignAmount({
              originalAmount: numAmount,
              originalCurrency: currency,
              date: dateYmd,
            });
            amountCzk = fx.amountCzk;
            originalAmount = fx.originalAmount;
            originalCurrency = fx.originalCurrency;
            exchangeRate = fx.exchangeRate;
          } catch (e) {
            Alert.alert(
              t('errorMessage'),
              e instanceof Error ? e.message : logAndGetUserFacingError('fx-convert', e),
            );
            return { ok: false, reason: 'fx' };
          }
        }

        const resolved = resolveCategoryFieldsForWrite({
          category: categoryRaw,
          subcategory: input.type === 'expense' ? input.subcategory ?? null : null,
          title,
          type: input.type,
        });
        const category = resolved.category;
        const subcategory = resolved.subcategory;
        const resolvedTitle = resolved.title;
        const frequency = input.frequency ?? null;

        if (frequency) {
          const userId = await getAuthUserId();
          if (!userId) {
            Alert.alert(t('errorMessage'), t('personalRecurring.needLogin'));
            return { ok: false, reason: 'unknown' };
          }
          const { rule, transactionId, error } = await createPersonalRecurringWithFirstTx(userId, {
            type: input.type,
            title: resolvedTitle,
            amount: amountCzk,
            currency: 'CZK',
            category,
            subcategory,
            frequency,
            startDate: dateYmd,
          });
          if (error || !rule || !transactionId) {
            Alert.alert(
              t('errorMessage'),
              error?.message ?? logAndGetUserFacingError('personal-recurring', error),
            );
            return { ok: false, reason: 'unknown' };
          }
          // Pravidelná platba = chvíle, kdy dává smysl požádat o notifikace (připomínky).
          setTimeout(() => {
            void import('@/lib/reschedule-all-local-notifications').then((m) =>
              m.askNotificationsInContext(),
            );
          }, 1200);
          addTransactions(
            [
              {
                id: transactionId,
                type: input.type,
                amount: amountCzk,
                title: resolvedTitle,
                category,
                subcategory,
                date: dateYmd,
                source: 'manual',
                recurringId: rule.id,
                originalAmount,
                originalCurrency,
                exchangeRate,
              },
            ],
            { fromRemote: true },
          );
        } else {
          await addTransaction({
            id: randomUUID(),
            type: input.type,
            amount: amountCzk,
            title: resolvedTitle,
            category,
            subcategory,
            date: dateYmd,
            source: 'manual',
            originalAmount,
            originalCurrency,
            exchangeRate,
          });
        }

        addPoints(5);

        const displayAmt = `${amountCzk.toLocaleString('cs-CZ')} Kč`;
        const catLabel =
          input.type === 'expense'
            ? formatCategoryDisplay(category, subcategory, { withIcon: false }).replace(' · ', ' › ')
            : category;
        showToast({
          type: 'success',
          message:
            input.type === 'income'
              ? `✓ Příjem ${displayAmt} · ${catLabel}`
              : `✓ Výdaj ${displayAmt} · ${catLabel}`,
        });

        // Učení kategorie + párování plateb + rozpočty běží na pozadí,
        // ať se formulář zavře hned po uložení transakce.
        const latestTxs = useFinanceStore.getState().transactions;
        const newTxSnapshot = latestTxs[latestTxs.length - 1];
        void (async () => {
          if (input.type === 'expense' && category !== 'Převod') {
            try {
              const userId = await getAuthUserId();
              if (userId) {
                const { error } = await upsertUserCategoryRule(
                  userId,
                  resolvedTitle,
                  category,
                  subcategory,
                );
                if (error) console.warn('[useAddTransaction] category rule', error.message);
              }
            } catch (e) {
              console.warn('[useAddTransaction] category rule', e);
            }
          }
          try {
            const uid = await getAuthUserId();
            if (uid) {
              const { runAfterTransactionsSideEffects } = await import(
                '@/lib/after-transactions-side-effects'
              );
              await runAfterTransactionsSideEffects({
                userId: uid,
                newTransactions: newTxSnapshot ? [newTxSnapshot] : undefined,
              });
            }
          } catch (e) {
            console.warn('[useAddTransaction] side effects', e);
          }
        })();

        return { ok: true };
      } catch (e) {
        Alert.alert(t('errorMessage'), logAndGetUserFacingError('add-transaction', e));
        return { ok: false, reason: 'unknown' };
      } finally {
        setIsSaving(false);
      }
    },
    [addTransaction, addTransactions, addPoints, t, isSaving],
  );

  return { saveTransaction, isSaving };
}
