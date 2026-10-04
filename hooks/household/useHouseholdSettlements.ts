import { useCallback, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { supabase } from '@/lib/supabase';
import {
  mapSharedExpenseRow,
} from '@/lib/household-shared-expenses';
import {
  computeHouseholdBalancesExact,
  householdSettlementSectionVisible,
  isHouseholdBalanceSettled,
  mapHouseholdSettlementRow,
  sharedExpenseToSettlementInput,
  simplifyHouseholdDebts,
  settlementAmountToSave,
  type HouseholdSettlement,
  type RecurringExpenseSettlementInput,
  type SharedExpenseSettlementInput,
} from '@/lib/household-settlements';
import { hasSupabaseSession, logSupabaseDataError } from '@/lib/supabase-session';
import { parseMoneyInput } from '@/lib/parse-money-input';
import { useAuth } from '@/store/auth-store';
import { useLanguageStore } from '@/store/language-store';
import type { Member } from '@/components/household/types';
import { formatSupabaseError, LOAD_TIMEOUT_MS, withTimeout } from './utils';

type UseHouseholdSettlementsParams = {
  householdId: string | null;
  members: Member[];
  recurringSettlementInputs: RecurringExpenseSettlementInput[];
  sharedHasSinglePayerAny: boolean;
};

export function useHouseholdSettlements({
  householdId,
  members,
  recurringSettlementInputs,
  sharedHasSinglePayerAny,
}: UseHouseholdSettlementsParams) {
  const { t } = useLanguageStore();
  const { user } = useAuth();

  const [householdSettlements, setHouseholdSettlements] = useState<HouseholdSettlement[]>([]);
  const [sharedForSettlementBalance, setSharedForSettlementBalance] = useState<
    SharedExpenseSettlementInput[]
  >([]);
  const [settlementsHistoryOpen, setSettlementsHistoryOpen] = useState(false);
  const [settleModal, setSettleModal] = useState<{
    fromUserId: string;
    toUserId: string;
    amountExact: number;
    prefillDisplayKc: number;
  } | null>(null);
  const [settleAmountText, setSettleAmountText] = useState('');
  const [settleNoteText, setSettleNoteText] = useState('');
  const [isSavingSettlement, setIsSavingSettlement] = useState(false);

  const memberIds = useMemo(() => members.map((m) => m.userId), [members]);
  const sharedSettlementInputs = sharedForSettlementBalance;

  const settlementSectionVisible = useMemo(
    () =>
      householdSettlementSectionVisible({
        memberCount: members.length,
        recurring: recurringSettlementInputs,
        sharedHasSinglePayer: sharedHasSinglePayerAny,
      }),
    [members.length, recurringSettlementInputs, sharedHasSinglePayerAny],
  );

  const householdBalancesExact = useMemo(() => {
    if (memberIds.length === 0) return new Map<string, number>();
    return computeHouseholdBalancesExact({
      memberIds,
      recurring: recurringSettlementInputs,
      shared: sharedSettlementInputs,
      settlements: householdSettlements,
    });
  }, [memberIds, recurringSettlementInputs, sharedSettlementInputs, householdSettlements]);

  const simplifiedHouseholdDebts = useMemo(
    () => simplifyHouseholdDebts(members, householdBalancesExact),
    [members, householdBalancesExact],
  );

  const householdSettled = useMemo(
    () => isHouseholdBalanceSettled(householdBalancesExact),
    [householdBalancesExact],
  );

  const fetchHouseholdSettlements = useCallback(async (hid: string) => {
    if (!(await hasSupabaseSession())) return;
    let result;
    try {
      result = await withTimeout(
        supabase
          .from('household_settlements')
          .select('*')
          .eq('household_id', hid)
          .order('created_at', { ascending: false }),
        LOAD_TIMEOUT_MS,
        'household_settlements',
      );
    } catch (e) {
      logSupabaseDataError('Failed to load household settlements', e);
      return;
    }
    const { data, error } = result;
    if (error) {
      logSupabaseDataError('Failed to load household settlements', error);
      return;
    }
    setHouseholdSettlements((data ?? []).map((row) => mapHouseholdSettlementRow(row as Record<string, unknown>)));
  }, []);

  const fetchSharedExpensesForSettlement = useCallback(async (hid: string) => {
    if (!(await hasSupabaseSession())) return;
    const today = new Date();
    const end = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    let result;
    try {
      result = await withTimeout(
        supabase
          .from('shared_expenses')
          .select('*')
          .eq('household_id', hid)
          .lte('expense_date', end)
          .order('expense_date', { ascending: false }),
        LOAD_TIMEOUT_MS,
        'shared_expenses.settlement',
      );
    } catch (e) {
      logSupabaseDataError('Failed to load shared expenses for settlement', e);
      return;
    }
    const { data, error } = result;
    if (error) {
      logSupabaseDataError('Failed to load shared expenses for settlement', error);
      return;
    }
    setSharedForSettlementBalance(
      (data ?? []).map((row) =>
        sharedExpenseToSettlementInput(mapSharedExpenseRow(row as Record<string, unknown>)),
      ),
    );
  }, []);

  const openSettleTransfer = (
    fromUserId: string,
    toUserId: string,
    amountExact: number,
    prefillDisplayKc: number,
  ) => {
    setSettleModal({ fromUserId, toUserId, amountExact, prefillDisplayKc });
    setSettleAmountText(String(prefillDisplayKc));
    setSettleNoteText('');
  };

  const submitHouseholdSettlement = async () => {
    if (!settleModal || !householdId || !user || isSavingSettlement) return;
    const amountValue = parseMoneyInput(settleAmountText);
    if (amountValue == null || amountValue <= 0) {
      Alert.alert(t('error'), t('hhInvalidSettlementAmount'));
      return;
    }
    if (amountValue > settleModal.amountExact + 0.001) {
      Alert.alert(t('error'), t('hhSettlementAmountTooHigh', { max: settleModal.prefillDisplayKc }));
      return;
    }
    const amountToSave = settlementAmountToSave({
      enteredAmount: amountValue,
      prefillDisplayKc: settleModal.prefillDisplayKc,
      amountExact: settleModal.amountExact,
    });
    setIsSavingSettlement(true);
    try {
      const { error } = await supabase.from('household_settlements').insert({
        household_id: householdId,
        from_user_id: settleModal.fromUserId,
        to_user_id: settleModal.toUserId,
        amount: amountToSave,
        note: settleNoteText.trim() || null,
        created_by: user.id,
      });
      if (error) {
        Alert.alert(t('error'), t('hhSettlementSaveFailed', { detail: formatSupabaseError(error) }));
        return;
      }
      setSettleModal(null);
      await fetchHouseholdSettlements(householdId);
      await fetchSharedExpensesForSettlement(householdId);
    } finally {
      setIsSavingSettlement(false);
    }
  };

  const deleteHouseholdSettlement = (st: HouseholdSettlement) => {
    if (st.createdBy !== user?.id) return;
    Alert.alert(t('hhDeleteSettlementTitle'), t('hhDeleteSettlementConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            const { error } = await supabase.from('household_settlements').delete().eq('id', st.id);
            if (error) {
              Alert.alert(t('error'), t('hhDeleteSettlementFailed', { detail: formatSupabaseError(error) }));
              return;
            }
            if (householdId) await fetchHouseholdSettlements(householdId);
          })();
        },
      },
    ]);
  };

  return {
    data: {
      householdSettlements,
      sharedForSettlementBalance,
      sharedSettlementInputs,
      settlementsHistoryOpen,
      settleModal,
      settleAmountText,
      settleNoteText,
      isSavingSettlement,
      settlementSectionVisible,
      householdBalancesExact,
      simplifiedHouseholdDebts,
      householdSettled,
    },
    loading: false,
    error: null as string | null,
    setSettlementsHistoryOpen,
    setSettleModal,
    setSettleAmountText,
    setSettleNoteText,
    fetchHouseholdSettlements,
    fetchSharedExpensesForSettlement,
    openSettleTransfer,
    submitHouseholdSettlement,
    deleteHouseholdSettlement,
  };
}
