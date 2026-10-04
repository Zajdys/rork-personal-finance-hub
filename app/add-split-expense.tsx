import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Check } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/use-theme';
import { useLanguageStore } from '@/store/language-store';
import {
  DEFAULT_SPLIT_EXPENSE_CATEGORY,
  SPLIT_EXPENSE_CATEGORIES,
  type SplitExpenseCategoryId,
} from '@/lib/split-expense-categories';
import {
  buildShareInputsFromForm,
  prefillShareValuesFromExpense,
  validateSplitShareInputs,
  type SplitExpenseSplitType,
} from '@/lib/split-groups';
import { syncSplitExpenseReceipt } from '@/lib/split-expense-receipt-sync';
import { SplitExpenseReceiptField } from '@/components/SplitExpenseReceiptField';
import { safeGoBack } from '@/lib/safe-back';
import { BackButton } from '@/components/BackButton';
import { parseMoneyInput } from '@/lib/parse-money-input';
import {
  useSplitGroupsStore,
  type SplitExpense,
} from '@/store/split-groups-store';

const SPLIT_TYPES: SplitExpenseSplitType[] = ['equal', 'exact', 'percentage', 'shares'];

function prefillFromExpense(expense: SplitExpense): {
  amount: string;
  description: string;
  paidBy: string;
  splitType: SplitExpenseSplitType;
  category: SplitExpenseCategoryId;
  selectedIds: Set<string>;
  shareValues: Record<string, string>;
} {
  return {
    amount: String(expense.amount),
    description: expense.description,
    paidBy: expense.paid_by,
    splitType: expense.split_type,
    category: expense.category ?? DEFAULT_SPLIT_EXPENSE_CATEGORY,
    selectedIds: new Set(expense.shares.map((s) => s.member_id)),
    shareValues: prefillShareValuesFromExpense(expense),
  };
}

export default function AddSplitExpenseScreen() {
  const { groupId: groupIdParam, expenseId: expenseIdParam } = useLocalSearchParams<{
    groupId: string;
    expenseId?: string;
  }>();
  const groupId = Array.isArray(groupIdParam) ? groupIdParam[0] : groupIdParam;
  const expenseId = Array.isArray(expenseIdParam) ? expenseIdParam[0] : expenseIdParam;
  const isEdit = Boolean(expenseId);

  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { t, language } = useLanguageStore();

  const groups = useSplitGroupsStore((s) => s.groups);
  const fetchGroups = useSplitGroupsStore((s) => s.fetchGroups);
  const membersForGroup = useSplitGroupsStore((s) => s.membersForGroup);
  const expensesByGroupId = useSplitGroupsStore((s) => s.expensesByGroupId);
  const fetchExpensesForGroup = useSplitGroupsStore((s) => s.fetchExpensesForGroup);
  const addExpense = useSplitGroupsStore((s) => s.addExpense);
  const updateExpense = useSplitGroupsStore((s) => s.updateExpense);
  const setExpenseReceiptUrl = useSplitGroupsStore((s) => s.setExpenseReceiptUrl);

  const group = groups.find((g) => g.id === groupId);
  const members = useMemo(
    () => (groupId ? membersForGroup(groupId) : []),
    [groupId, membersForGroup],
  );
  const existingExpense =
    isEdit && groupId && expenseId
      ? (expensesByGroupId[groupId] ?? []).find((e) => e.id === expenseId)
      : undefined;

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [paidBy, setPaidBy] = useState<string | null>(null);
  const [splitType, setSplitType] = useState<SplitExpenseSplitType>('equal');
  const [category, setCategory] = useState<SplitExpenseCategoryId>(DEFAULT_SPLIT_EXPENSE_CATEGORY);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [shareValues, setShareValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(!isEdit);
  const [pendingReceiptUri, setPendingReceiptUri] = useState<string | null>(null);
  const [removeStoredReceipt, setRemoveStoredReceipt] = useState(false);
  const [storedReceiptPath, setStoredReceiptPath] = useState<string | null>(null);

  useEffect(() => {
    if (!groups.length) void fetchGroups();
  }, [groups.length, fetchGroups]);

  useEffect(() => {
    if (!isEdit || !groupId) return;
    if (!existingExpense) void fetchExpensesForGroup(groupId);
  }, [isEdit, groupId, existingExpense, fetchExpensesForGroup]);

  useEffect(() => {
    if (!isEdit) return;
    if (!existingExpense || hydrated) return;
    const prefill = prefillFromExpense(existingExpense);
    setAmount(prefill.amount);
    setDescription(prefill.description);
    setPaidBy(prefill.paidBy);
    setSplitType(prefill.splitType);
    setCategory(prefill.category);
    setSelectedIds(prefill.selectedIds);
    setShareValues(prefill.shareValues);
    setStoredReceiptPath(existingExpense.receipt_url ?? null);
    setPendingReceiptUri(null);
    setRemoveStoredReceipt(false);
    setHydrated(true);
  }, [isEdit, existingExpense, hydrated]);

  useEffect(() => {
    if (isEdit) return;
    if (!members.length) return;
    if (!paidBy) setPaidBy(members[0].id);
    setSelectedIds((prev) => {
      if (prev.size > 0) return prev;
      return new Set(members.map((m) => m.id));
    });
  }, [members, paidBy, isEdit]);

  const parsedAmount = useMemo(() => {
    return parseMoneyInput(amount) ?? 0;
  }, [amount]);

  const splitTypeLabel = useCallback(
    (type: SplitExpenseSplitType) => {
      switch (type) {
        case 'equal':
          return t('splitTypeEqual');
        case 'exact':
          return t('splitTypeExact');
        case 'percentage':
          return t('splitTypePercentage');
        case 'shares':
          return t('splitTypeShares');
      }
    },
    [t],
  );

  const toggleMember = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        if (splitType === 'shares') {
          setShareValues((vals) => (vals[id] ? vals : { ...vals, [id]: '1' }));
        }
      }
      return next;
    });
  };

  const participantIds = useMemo(
    () => members.filter((m) => selectedIds.has(m.id)).map((m) => m.id),
    [members, selectedIds],
  );

  const shareInputs = useMemo(
    () => buildShareInputsFromForm(splitType, participantIds, shareValues),
    [splitType, participantIds, shareValues],
  );

  const shareValidation = useMemo(
    () => validateSplitShareInputs(parsedAmount, splitType, shareInputs),
    [parsedAmount, splitType, shareInputs],
  );

  const canSave = useMemo(() => {
    if (!(parsedAmount > 0) || !paidBy || participantIds.length === 0) return false;
    return shareValidation.valid;
  }, [parsedAmount, paidBy, participantIds.length, shareValidation.valid]);

  useEffect(() => {
    if (splitType !== 'shares') return;
    setShareValues((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const id of participantIds) {
        if (!next[id]) {
          next[id] = '1';
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [splitType, participantIds]);

  const shareInputSuffix = useMemo(() => {
    switch (splitType) {
      case 'exact':
        return group?.currency ?? 'CZK';
      case 'percentage':
        return '%';
      case 'shares':
        return t('splitExpenseShareInputLabel');
      default:
        return '';
    }
  }, [group?.currency, splitType, t]);

  const validationMessage = useMemo(() => {
    if (splitType === 'equal' || participantIds.length === 0 || !(parsedAmount > 0)) return null;
    const symbol = group?.currency ?? 'CZK';

    if (splitType === 'exact') {
      const sum = shareValidation.exactSum ?? 0;
      const diff = shareValidation.exactDiff ?? 0;
      if (shareValidation.valid) {
        return { text: t('splitExpenseExactBalanced', { sum: sum.toLocaleString(), symbol }), ok: true };
      }
      return {
        text: t('splitExpenseExactSum', {
          sum: sum.toLocaleString(),
          diff: Math.abs(diff).toLocaleString(),
          symbol,
        }),
        ok: false,
      };
    }

    if (splitType === 'percentage') {
      const sum = shareValidation.percentageSum ?? 0;
      const diff = shareValidation.percentageDiff ?? 0;
      if (shareValidation.valid) {
        return { text: t('splitExpensePercentageBalanced'), ok: true };
      }
      return {
        text: t('splitExpensePercentageSum', {
          sum: sum.toLocaleString(),
          diff: Math.abs(diff).toLocaleString(),
        }),
        ok: false,
      };
    }

    if (shareValidation.valid) return null;
    return { text: t('splitExpenseShareValuesRequired'), ok: false };
  }, [group?.currency, parsedAmount, participantIds.length, shareValidation, splitType, t]);

  const handleSave = async () => {
    if (!groupId) return;
    if (!(parsedAmount > 0)) {
      Alert.alert(t('error'), t('splitExpenseAmountRequired'));
      return;
    }
    if (!paidBy) {
      Alert.alert(t('error'), t('splitExpensePaidByRequired'));
      return;
    }
    const participants = members.filter((m) => selectedIds.has(m.id));
    if (!participants.length) {
      Alert.alert(t('error'), t('splitExpenseMembersRequired'));
      return;
    }

    const shares = buildShareInputsFromForm(splitType, participants.map((m) => m.id), shareValues);
    const validation = validateSplitShareInputs(parsedAmount, splitType, shares);
    if (!validation.valid) {
      Alert.alert(t('error'), t('splitExpenseShareValuesRequired'));
      return;
    }

    setSaving(true);
    const payload = {
      groupId,
      paidBy,
      amount: parsedAmount,
      description: description.trim() || t('splitGroupsUntitledExpense'),
      date: existingExpense?.date,
      splitType,
      category,
      shares,
    };
    const { expense, error } =
      isEdit && expenseId
        ? await updateExpense({ ...payload, expenseId })
        : await addExpense(payload);
    if (error || !expense) {
      setSaving(false);
      Alert.alert(t('error'), error ?? t('splitGroupsCreateFailed'));
      return;
    }

    const receiptSync = await syncSplitExpenseReceipt({
      groupId,
      expenseId: expense.id,
      pendingLocalUri: pendingReceiptUri,
      existingReceiptPath: storedReceiptPath,
      removeStored: removeStoredReceipt,
    });
    setSaving(false);
    if (receiptSync.error) {
      Alert.alert(t('error'), t('splitExpenseReceiptUploadFailed'));
    } else if (receiptSync.receiptPath !== storedReceiptPath) {
      setExpenseReceiptUrl({
        groupId,
        expenseId: expense.id,
        receiptUrl: receiptSync.receiptPath,
      });
    }
    safeGoBack();
  };

  const shareHint =
    splitType === 'exact'
      ? t('splitExpenseHintExact')
      : splitType === 'percentage'
        ? t('splitExpenseHintPercentage')
        : splitType === 'shares'
          ? t('splitExpenseHintShares')
          : null;

  if (isEdit && !hydrated) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <LinearGradient
        colors={[colors.gradientStart, colors.gradientEnd]}
        style={[styles.header, { paddingTop: insets.top + 12 }]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.headerRow}>
          <BackButton color="white" size={24} style={styles.headerBtn} />
          <View style={styles.headerTitles}>
            <Text style={styles.headerTitle}>
              {isEdit ? t('splitGroupsEditExpense') : t('splitGroupsNewExpense')}
            </Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {group?.name ?? t('splitGroups')}
            </Text>
          </View>
          <View style={styles.headerBtn} />
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.label, { color: colors.textSecondary }]}>{t('amount')}</Text>
        <TextInput
          style={[
            styles.input,
            styles.amountInput,
            {
              backgroundColor: colors.card,
              color: colors.text,
              borderColor: colors.border,
            },
          ]}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={colors.textSecondary}
        />

        <Text style={[styles.label, { color: colors.textSecondary }]}>{t('description')}</Text>
        <TextInput
          style={[
            styles.input,
            { backgroundColor: colors.card, color: colors.text, borderColor: colors.border },
          ]}
          value={description}
          onChangeText={setDescription}
          placeholder={t('enterDescription')}
          placeholderTextColor={colors.textSecondary}
        />

        <Text style={[styles.label, { color: colors.textSecondary }]}>{t('category')}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryRow}
        >
          {SPLIT_EXPENSE_CATEGORIES.map((cat) => {
            const active = category === cat.id;
            return (
              <TouchableOpacity
                key={cat.id}
                style={[
                  styles.categoryChip,
                  {
                    backgroundColor: isDark ? colors.muted : colors.card,
                    borderColor: active ? colors.primary : 'transparent',
                  },
                ]}
                onPress={() => setCategory(cat.id)}
              >
                <Text style={styles.categoryEmoji}>{cat.emoji}</Text>
                <Text
                  style={[styles.categoryLabel, { color: active ? colors.primary : colors.text }]}
                >
                  {language === 'en' ? cat.labelEn : cat.labelCs}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <Text style={[styles.label, { color: colors.textSecondary }]}>{t('splitExpensePaidBy')}</Text>
        <View style={styles.chipWrap}>
          {members.map((m) => {
            const active = paidBy === m.id;
            return (
              <TouchableOpacity
                key={m.id}
                style={[
                  styles.chip,
                  {
                    backgroundColor: active ? colors.primary : isDark ? colors.muted : colors.card,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => setPaidBy(m.id)}
              >
                <Text style={{ color: active ? colors.onPrimary : colors.text, fontWeight: '600' }}>
                  {m.display_name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.label, { color: colors.textSecondary }]}>{t('splitExpenseSplitType')}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.splitTypeRow}
        >
          {SPLIT_TYPES.map((type) => {
            const active = splitType === type;
            return (
              <TouchableOpacity
                key={type}
                style={[
                  styles.splitTypeChip,
                  {
                    backgroundColor: active ? colors.primary : isDark ? colors.muted : colors.card,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => setSplitType(type)}
              >
                <Text style={{ color: active ? colors.onPrimary : colors.text, fontWeight: '600', fontSize: 13 }}>
                  {splitTypeLabel(type)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <Text style={[styles.label, { color: colors.textSecondary }]}>{t('splitExpenseParticipants')}</Text>
        {shareHint ? (
          <Text style={[styles.hint, { color: colors.textSecondary }]}>{shareHint}</Text>
        ) : null}
        {validationMessage ? (
          <Text
            style={[
              styles.validationBanner,
              {
                color: validationMessage.ok ? colors.success : colors.error,
                backgroundColor: validationMessage.ok ? `${colors.success}18` : `${colors.error}18`,
              },
            ]}
          >
            {validationMessage.text}
          </Text>
        ) : null}

        {members.map((m) => {
          const selected = selectedIds.has(m.id);
          return (
            <View
              key={m.id}
              style={[
                styles.memberRow,
                { backgroundColor: colors.card, borderColor: selected ? colors.primary : colors.border },
              ]}
            >
              <TouchableOpacity style={styles.memberCheck} onPress={() => toggleMember(m.id)}>
                <View
                  style={[
                    styles.checkbox,
                    {
                      borderColor: selected ? colors.primary : colors.border,
                      backgroundColor: selected ? colors.primary : 'transparent',
                    },
                  ]}
                >
                  {selected ? <Check color={colors.onPrimary} size={14} /> : null}
                </View>
                <Text style={[styles.memberName, { color: colors.text }]}>{m.display_name}</Text>
              </TouchableOpacity>
              {selected && splitType !== 'equal' ? (
                <View style={styles.shareInputWrap}>
                  <TextInput
                    style={[
                      styles.shareInput,
                      {
                        backgroundColor: isDark ? colors.muted : colors.background,
                        color: colors.text,
                        borderColor: colors.border,
                      },
                    ]}
                    value={shareValues[m.id] ?? (splitType === 'shares' ? '1' : '')}
                    onChangeText={(v) => {
                      const cleaned =
                        splitType === 'shares' ? v.replace(/[^\d]/g, '') : v.replace(/[^\d.,]/g, '');
                      setShareValues((prev) => ({ ...prev, [m.id]: cleaned }));
                    }}
                    keyboardType={splitType === 'shares' ? 'number-pad' : 'decimal-pad'}
                    placeholder={
                      splitType === 'percentage'
                        ? '0'
                        : splitType === 'shares'
                          ? '1'
                          : '0'
                    }
                    placeholderTextColor={colors.textSecondary}
                  />
                  {shareInputSuffix ? (
                    <Text style={[styles.shareInputSuffix, { color: colors.textSecondary }]}>
                      {shareInputSuffix}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })}

        <SplitExpenseReceiptField
          receiptPath={removeStoredReceipt ? null : storedReceiptPath}
          pendingLocalUri={pendingReceiptUri}
          onPendingLocalUriChange={(uri) => {
            setPendingReceiptUri(uri);
            if (uri) setRemoveStoredReceipt(false);
          }}
          onRemoveStored={() => {
            setRemoveStoredReceipt(true);
            setPendingReceiptUri(null);
          }}
        />

        <TouchableOpacity
          style={[
            styles.primaryBtn,
            {
              backgroundColor: colors.primary,
              opacity: saving || !canSave ? 0.5 : 1,
            },
          ]}
          onPress={() => void handleSave()}
          disabled={saving || !canSave}
        >
          {saving ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={[styles.primaryBtnText, { color: colors.onPrimary }]}>
              {isEdit ? t('save') : t('splitGroupsAddExpense')}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitles: { flex: 1, alignItems: 'center' },
  headerTitle: { color: 'white', fontSize: 18, fontWeight: '700' },
  headerSubtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 2 },
  scrollContent: { padding: 16 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 12 },
  categoryRow: { flexDirection: 'row', gap: 8, paddingVertical: 2, paddingRight: 8 },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  categoryEmoji: { fontSize: 18 },
  categoryLabel: { fontSize: 13, fontWeight: '600' },
  hint: { fontSize: 12, marginBottom: 8 },
  validationBanner: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
  splitTypeRow: { flexDirection: 'row', gap: 8, paddingVertical: 2, paddingRight: 8 },
  splitTypeChip: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  amountInput: { fontSize: 28, fontWeight: '700' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 10,
  },
  memberCheck: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberName: { fontSize: 15, fontWeight: '600' },
  shareInputWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  shareInput: {
    width: 72,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    textAlign: 'right',
    fontSize: 15,
  },
  shareInputSuffix: { fontSize: 12, fontWeight: '600', minWidth: 28 },
  primaryBtn: {
    marginTop: 24,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: { fontSize: 16, fontWeight: '700' },
});

