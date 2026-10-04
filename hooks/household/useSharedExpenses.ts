import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Keyboard, PanResponder } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import {
  SHARED_EXPENSE_CATEGORIES,
  clampSplitPercent,
  mapSharedExpenseRow,
  monthBounds,
  type SharedExpense,
  type SharedExpenseSplitType,
} from '@/lib/household-shared-expenses';
import {
  normalizeExpensePaymentMode,
  type ExpensePaymentMode,
} from '@/lib/household-settlements';
import {
  deleteStoredReceipt,
  resolveReceiptDisplayUrl,
  uploadSharedExpenseReceipt,
} from '@/lib/receipt-upload';
import { hasSupabaseSession, logSupabaseDataError } from '@/lib/supabase-session';
import { useAuth } from '@/store/auth-store';
import { useLanguageStore } from '@/store/language-store';
import { parseDecimalInput, parseMoneyInput } from '@/lib/parse-money-input';
import type { Member } from '@/components/household/types';
import {
  formatSupabaseError,
  friendlyCatchMessage,
  LOAD_TIMEOUT_MS,
  withTimeout,
} from './utils';

type UseSharedExpensesParams = {
  householdId: string | null;
  members: Member[];
  fetchSharedExpensesForSettlement: (hid: string) => Promise<void>;
};

export function useSharedExpenses({
  householdId,
  members,
  fetchSharedExpensesForSettlement,
}: UseSharedExpensesParams) {
  const { t } = useLanguageStore();
  const { user } = useAuth();

  const [sharedExpenses, setSharedExpenses] = useState<SharedExpense[]>([]);
  const [sharedHasSinglePayerAny, setSharedHasSinglePayerAny] = useState(false);
  const [sharedMonth, setSharedMonth] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [sharedModalOpen, setSharedModalOpen] = useState(false);
  const [editingSharedId, setEditingSharedId] = useState<string | null>(null);
  const [newSharedName, setNewSharedName] = useState('');
  const [newSharedAmount, setNewSharedAmount] = useState('');
  const [newSharedCategory, setNewSharedCategory] = useState<string>(SHARED_EXPENSE_CATEGORIES[0]!.name);
  const [newSharedDate, setNewSharedDate] = useState(() => new Date());
  const [showSharedDatePicker, setShowSharedDatePicker] = useState(false);
  const [newSharedPaidBy, setNewSharedPaidBy] = useState<string>('');
  const [newSharedPaymentMode, setNewSharedPaymentMode] = useState<ExpensePaymentMode>('each_own_share');
  const [newSharedSplitType, setNewSharedSplitType] = useState<SharedExpenseSplitType>('half');
  const [newSharedSplitPercent, setNewSharedSplitPercent] = useState('50');
  const [newSharedReceiptUri, setNewSharedReceiptUri] = useState<string | null>(null);
  const [newSharedExistingReceiptUrl, setNewSharedExistingReceiptUrl] = useState<string | null>(null);
  const [sharedReceiptFullscreenUri, setSharedReceiptFullscreenUri] = useState<string | null>(null);
  const [isSavingShared, setIsSavingShared] = useState(false);

  const sharedSplitTypeOptions = useMemo(
    () =>
      [
        { id: 'me' as const, label: t('hhSplitMine') },
        { id: 'half' as const, label: t('hhSplitHalf') },
        { id: 'custom' as const, label: t('hhSplitCustom') },
      ] as const,
    [t]
  );

  const clearData = useCallback(() => {
    setSharedExpenses([]);
    setSharedHasSinglePayerAny(false);
  }, []);

  const resetSharedFormToDefaults = useCallback(() => {
    setEditingSharedId(null);
    setNewSharedName('');
    setNewSharedAmount('');
    setNewSharedCategory(SHARED_EXPENSE_CATEGORIES[0]!.name);
    setNewSharedDate(new Date());
    setShowSharedDatePicker(false);
    setNewSharedPaidBy(user?.id ?? '');
    setNewSharedPaymentMode('each_own_share');
    setNewSharedSplitType('half');
    setNewSharedSplitPercent('50');
    setNewSharedReceiptUri(null);
    setNewSharedExistingReceiptUrl(null);
  }, [user?.id]);

  const closeSharedModal = useCallback(() => {
    Keyboard.dismiss();
    resetSharedFormToDefaults();
    setSharedModalOpen(false);
  }, [resetSharedFormToDefaults]);

  const sharedSheetPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 10 && g.dy > Math.abs(g.dx),
        onPanResponderRelease: (_e, g) => {
          if (g.dy > 56) closeSharedModal();
        },
      }),
    [closeSharedModal]
  );

  const fetchSharedExpenses = useCallback(async (hid: string, month: Date) => {
    if (!(await hasSupabaseSession())) return;
    const { start, end } = monthBounds(month);
    let result;
    try {
      result = await withTimeout(
        supabase
          .from('shared_expenses')
          .select('*')
          .eq('household_id', hid)
          .gte('expense_date', start)
          .lte('expense_date', end)
          .order('expense_date', { ascending: false }),
        LOAD_TIMEOUT_MS,
        'shared_expenses'
      );
    } catch (e) {
      logSupabaseDataError('Failed to load shared expenses', e);
      return;
    }
    const { data, error } = result;
    if (error) {
      logSupabaseDataError('Failed to load shared expenses', error);
      return;
    }
    setSharedExpenses((data ?? []).map((row) => mapSharedExpenseRow(row as Record<string, unknown>)));

    try {
      const anySingle = await withTimeout(
        supabase
          .from('shared_expenses')
          .select('id')
          .eq('household_id', hid)
          .eq('payment_mode', 'single_payer')
          .limit(1),
        LOAD_TIMEOUT_MS,
        'shared_expenses.payment_mode',
      );
      setSharedHasSinglePayerAny((anySingle.data?.length ?? 0) > 0);
    } catch {
      setSharedHasSinglePayerAny(
        (data ?? []).some(
          (row) => normalizeExpensePaymentMode((row as { payment_mode?: unknown }).payment_mode) === 'single_payer',
        ),
      );
    }
  }, []);

  useEffect(() => {
    if (!householdId) return;
    void fetchSharedExpenses(householdId, sharedMonth);
  }, [householdId, sharedMonth, fetchSharedExpenses]);

  const shiftSharedMonth = (delta: number) => {
    setSharedMonth((prev) => {
      const next = new Date(prev);
      next.setMonth(next.getMonth() + delta);
      return next;
    });
  };
  const openSharedCreate = () => {
    resetSharedFormToDefaults();
    setNewSharedPaidBy(user?.id ?? members[0]?.userId ?? '');
    setSharedModalOpen(true);
  };

  const pickSharedReceiptFromCamera = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('errorMessage'), t('cameraPermissionNeeded'));
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]?.uri) {
        setNewSharedReceiptUri(result.assets[0].uri);
      }
    } catch {
      Alert.alert(t('error'), t('cameraError'));
    }
  }, [t]);

  const pickSharedReceiptFromGallery = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('errorMessage'), t('galleryPermissionNeeded'));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]?.uri) {
        setNewSharedReceiptUri(result.assets[0].uri);
      }
    } catch {
      Alert.alert(t('error'), t('galleryError'));
    }
  }, [t]);

  const pickSharedReceipt = useCallback(() => {
    Alert.alert(t('hhAttachReceipt'), undefined, [
      { text: t('takePhoto'), onPress: () => void pickSharedReceiptFromCamera() },
      { text: t('editProfile.gallery'), onPress: () => void pickSharedReceiptFromGallery() },
      { text: t('cancel'), style: 'cancel' },
    ]);
  }, [pickSharedReceiptFromCamera, pickSharedReceiptFromGallery, t]);

  const openSharedReceiptFullscreen = useCallback(
    async (receiptUrl: string) => {
      const url = await resolveReceiptDisplayUrl(receiptUrl);
      if (url) {
        setSharedReceiptFullscreenUri(url);
        return;
      }
      Alert.alert(t('error'), t('hhReceiptOpenFailed'));
    },
    [t],
  );

  const openSharedEdit = (item: SharedExpense) => {
    setEditingSharedId(item.id);
    setNewSharedName(item.name);
    setNewSharedAmount(String(item.amount));
    setNewSharedCategory(item.category);
    const [y, mo, da] = item.date.split('-').map(Number);
    setNewSharedDate(y && mo && da ? new Date(y, mo - 1, da) : new Date());
    setNewSharedPaidBy(item.paidBy);
    setNewSharedPaymentMode(item.paymentMode);
    setNewSharedSplitType(item.splitType);
    setNewSharedSplitPercent(String(item.splitPercent));
    setNewSharedReceiptUri(null);
    setNewSharedExistingReceiptUrl(item.receiptUrl ?? null);
    setSharedModalOpen(true);
  };

  const upsertSharedExpense = async () => {
    if (isSavingShared) return;
    if (!householdId || !user) return;
    setIsSavingShared(true);
    try {
      const amountValue = parseMoneyInput(newSharedAmount);
      if (!newSharedName.trim() || amountValue == null || amountValue <= 0) {
        Alert.alert(t('error'), t('hhFillNameAmount'));
        return;
      }
      const payerForDb =
        newSharedPaymentMode === 'single_payer'
          ? newSharedPaidBy
          : user.id;
      if (newSharedPaymentMode === 'single_payer' && !payerForDb) {
        Alert.alert(t('error'), t('hhSelectPayer'));
        return;
      }

      let splitType = newSharedSplitType;
      let splitPercent = 50;
      if (splitType === 'me') {
        splitPercent = 100;
      } else if (splitType === 'half') {
        splitPercent = 50;
      } else {
        const raw = parseDecimalInput(newSharedSplitPercent, 2);
        if (raw == null) {
          Alert.alert(t('error'), t('hhInvalidSharePercent'));
          return;
        }
        splitPercent = clampSplitPercent(raw);
      }

      const expenseDate = `${newSharedDate.getFullYear()}-${String(newSharedDate.getMonth() + 1).padStart(2, '0')}-${String(newSharedDate.getDate()).padStart(2, '0')}`;
      const payload = {
        name: newSharedName.trim(),
        amount: amountValue,
        category: newSharedCategory,
        payer_user_id: payerForDb,
        expense_date: expenseDate,
        split_type: splitType,
        split_percent: splitPercent,
        payment_mode: newSharedPaymentMode,
      };

      let expenseId = editingSharedId;

      if (editingSharedId) {
        const { error } = await supabase.from('shared_expenses').update(payload).eq('id', editingSharedId);
        if (error) {
          Alert.alert(t('error'), t('hhEditExpenseFailed', { detail: formatSupabaseError(error) }));
          return;
        }
      } else {
        const { data: inserted, error } = await supabase
          .from('shared_expenses')
          .insert({
            household_id: householdId,
            ...payload,
            added_by: user.id,
          })
          .select('id')
          .single();
        if (error) {
          Alert.alert(t('error'), t('hhAddExpenseFailed', { detail: formatSupabaseError(error) }));
          return;
        }
        expenseId = inserted.id;
      }

      if (newSharedReceiptUri && expenseId) {
        const { storagePath, error: uploadErr } = await uploadSharedExpenseReceipt({
          householdId,
          expenseId,
          localUri: newSharedReceiptUri,
        });
        if (uploadErr) {
          Alert.alert(t('error'), t('hhReceiptUploadFailed'));
        } else {
          const { error: receiptErr } = await supabase
            .from('shared_expenses')
            .update({ receipt_url: storagePath })
            .eq('id', expenseId);
          if (receiptErr) {
            Alert.alert(t('error'), t('hhReceiptUploadFailed'));
          }
        }
      }

      await fetchSharedExpenses(householdId, sharedMonth);
      await fetchSharedExpensesForSettlement(householdId);
      closeSharedModal();
    } finally {
      setIsSavingShared(false);
    }
  };

  const deleteSharedExpense = (id: string) => {
    Alert.alert(t('hhDeleteExpenseTitle'), t('hhDeleteExpenseConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              const existing = sharedExpenses.find((e) => e.id === id);
              if (existing?.receiptUrl) {
                await deleteStoredReceipt(existing.receiptUrl);
              }
              const delResult = await withTimeout(
                supabase.from('shared_expenses').delete().eq('id', id),
                LOAD_TIMEOUT_MS,
                'shared_expenses.delete'
              );
              const { error } = delResult;
              if (error) {
                Alert.alert(t('error'), t('hhDeleteExpenseFailed', { detail: formatSupabaseError(error) }));
                return;
              }
              setSharedExpenses((prev) => prev.filter((e) => e.id !== id));
              if (householdId) await fetchSharedExpenses(householdId, sharedMonth);
            } catch (e) {
              Alert.alert(t('error'), friendlyCatchMessage('household', e));
            }
          })();
        },
      },
    ]);
  };

  return {
    data: {
      sharedExpenses,
      sharedHasSinglePayerAny,
      sharedMonth,
      sharedModalOpen,
      editingSharedId,
      newSharedName,
      newSharedAmount,
      newSharedCategory,
      newSharedDate,
      showSharedDatePicker,
      newSharedPaidBy,
      newSharedPaymentMode,
      newSharedSplitType,
      newSharedSplitPercent,
      newSharedReceiptUri,
      newSharedExistingReceiptUrl,
      sharedReceiptFullscreenUri,
      isSavingShared,
      sharedSplitTypeOptions,
      sharedSheetPanResponder,
    },
    loading: false,
    error: null as string | null,
    setSharedExpenses,
    setSharedMonth,
    setNewSharedName,
    setNewSharedAmount,
    setNewSharedCategory,
    setNewSharedDate,
    setShowSharedDatePicker,
    setNewSharedPaidBy,
    setNewSharedPaymentMode,
    setNewSharedSplitType,
    setNewSharedSplitPercent,
    setNewSharedReceiptUri,
    setNewSharedExistingReceiptUrl,
    setSharedReceiptFullscreenUri,
    clearData,
    fetchSharedExpenses,
    resetSharedFormToDefaults,
    closeSharedModal,
    shiftSharedMonth,
    openSharedCreate,
    pickSharedReceiptFromCamera,
    pickSharedReceiptFromGallery,
    pickSharedReceipt,
    openSharedReceiptFullscreen,
    openSharedEdit,
    upsertSharedExpense,
    deleteSharedExpense,
  };
}
