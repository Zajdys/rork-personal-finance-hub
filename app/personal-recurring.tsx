import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  Pressable,
  Platform,
} from 'react-native';
import { Stack } from 'expo-router';
import { Pause, Play, Pencil, Trash2, MoreHorizontal, Plus, Check } from 'lucide-react-native';
import { useFinanceStore, type Transaction } from '@/store/finance-store';
import {
  addUnmatchedPair,
  findPaymentInMonth,
  linkedPaymentsInMonth,
  loadUnmatchedPairs,
  markRecurringPaidOn,
  occurrenceInMonth,
} from '@/lib/recurring-checklist';
import { QuickAddTransactionSheet } from '@/components/QuickAddTransactionSheet';
import { TouchableOpacity as AddButton } from 'react-native';
import { useAuth } from '@/store/auth-store';
import { useTheme } from '@/hooks/use-theme';
import { useLanguageStore } from '@/store/language-store';
import { useSettingsStore } from '@/store/settings-store';
import { ScreenHeader } from '@/components/ScreenHeader';
import { EmptyState } from '@/components/EmptyState';
import {
  RecurringFrequencyField,
  type PersonalRecurringChoice,
} from '@/components/RecurringFrequencyField';
import {
  deletePersonalRecurringRule,
  fetchPersonalRecurringRules,
  updatePersonalRecurringRule,
  type PersonalRecurringRule,
  type PersonalRecurringFrequency,
} from '@/lib/personal-recurring';
import { appLocale } from '@/lib/app-locale';
import { formatMoneyWithSymbol } from '@/lib/format-money';
import { parseMoneyInput } from '@/lib/parse-money-input';

function frequencyLabelKey(
  freq: PersonalRecurringFrequency,
):
  | 'personalRecurring.everyWeek'
  | 'personalRecurring.everyMonth'
  | 'personalRecurring.everyQuarter'
  | 'personalRecurring.everyHalfYear'
  | 'personalRecurring.everyYear' {
  switch (freq) {
    case 'weekly':
      return 'personalRecurring.everyWeek';
    case 'quarterly':
      return 'personalRecurring.everyQuarter';
    case 'biannual':
      return 'personalRecurring.everyHalfYear';
    case 'yearly':
      return 'personalRecurring.everyYear';
    case 'monthly':
    default:
      return 'personalRecurring.everyMonth';
  }
}

export default function PersonalRecurringScreen() {
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const { t, language } = useLanguageStore();
  const { getCurrentCurrency } = useSettingsStore();
  const currency = getCurrentCurrency();
  const numberLocale = appLocale(language);

  const [rules, setRules] = useState<PersonalRecurringRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuRule, setMenuRule] = useState<PersonalRecurringRule | null>(null);
  const [editRule, setEditRule] = useState<PersonalRecurringRule | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editFrequency, setEditFrequency] = useState<PersonalRecurringChoice>('monthly');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!user?.id) {
      setRules([]);
      setLoading(false);
      return;
    }
    // Při obnově po zaškrtnutí / úpravě seznam nemizí (bez celoobrazovkového načítání).
    if (!opts?.silent) setLoading(true);
    const { rules: next, error } = await fetchPersonalRecurringRules(user.id);
    if (error) console.warn('[personal-recurring] list', error.message);
    setRules(next);
    setLoading(false);
  }, [user?.id]);

  // Rychlé přidání přímo na této obrazovce (globální sheet z tabů se přes stack na iOS nezobrazí)
  const [addOpen, setAddOpen] = useState(false);
  const [addType, setAddType] = useState<'income' | 'expense'>('expense');
  const closeAdd = useCallback(() => {
    setAddOpen(false);
    void load({ silent: true });
  }, [load]);

  useEffect(() => {
    void load();
  }, [load]);

  const openEdit = (rule: PersonalRecurringRule) => {
    setMenuRule(null);
    setEditRule(rule);
    setEditTitle(rule.title);
    setEditAmount(String(rule.amount));
    setEditFrequency(rule.frequency);
  };

  const saveEdit = async () => {
    if (!user?.id || !editRule) return;
    const amount = parseMoneyInput(editAmount);
    if (!editTitle.trim() || amount == null || amount <= 0 || !editFrequency) {
      Alert.alert(t('errorMessage'), t('fillAllFields'));
      return;
    }
    setSaving(true);
    const { error } = await updatePersonalRecurringRule(user.id, editRule.id, {
      title: editTitle.trim(),
      amount,
      frequency: editFrequency,
    });
    setSaving(false);
    if (error) {
      Alert.alert(t('errorMessage'), error.message);
      return;
    }
    setEditRule(null);
    void load({ silent: true });
  };

  const togglePause = async (rule: PersonalRecurringRule) => {
    if (!user?.id) return;
    setMenuRule(null);
    const { error } = await updatePersonalRecurringRule(user.id, rule.id, {
      active: !rule.active,
    });
    if (error) Alert.alert(t('errorMessage'), error.message);
    else void load({ silent: true });
  };

  const confirmDelete = (rule: PersonalRecurringRule) => {
    setMenuRule(null);
    Alert.alert(t('personalRecurring.deleteTitle'), t('personalRecurring.deleteBody'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            if (!user?.id) return;
            const { error } = await deletePersonalRecurringRule(user.id, rule.id);
            if (error) Alert.alert(t('errorMessage'), error.message);
            else void load({ silent: true });
          })();
        },
      },
    ]);
  };

  const sorted = useMemo(
    () =>
      [...rules].sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1;
        return a.nextDate.localeCompare(b.nextDate);
      }),
    [rules],
  );

  // --- Zaplaceno tento měsíc (jako v Domácnosti) ---
  const transactions = useFinanceStore((st) => st.transactions);
  const addTransactions = useFinanceStore((st) => st.addTransactions);
  const deleteTransaction = useFinanceStore((st) => st.deleteTransaction);
  const nowD = new Date();
  const curY = nowD.getFullYear();
  const curM = nowD.getMonth() + 1;
  const [busyId, setBusyId] = useState<string | null>(null);
  const [unmatched, setUnmatched] = useState<Set<string>>(new Set());
  useEffect(() => {
    void loadUnmatchedPairs().then(setUnmatched);
  }, []);

  const monthStatus = useMemo(() => {
    const used = new Set<string>();
    const map = new Map<string, { due: string; paid: Transaction | null }>();
    for (const r of sorted) {
      if (!r.active || r.type !== 'expense') continue;
      const due = occurrenceInMonth(r, curY, curM);
      const paid = findPaymentInMonth(r, transactions, curY, curM, used, unmatched);
      if (paid) used.add(paid.id);
      if (!due && !paid) continue;
      map.set(r.id, { due: due ?? String(paid?.date ?? '').slice(0, 10), paid });
    }
    return map;
  }, [sorted, transactions, curY, curM, unmatched]);

  const paidCount = useMemo(
    () => Array.from(monthStatus.values()).filter((v) => v.paid).length,
    [monthStatus],
  );

  const fmtDay = (ymd: string) => {
    const [y, m, d] = ymd.split('-').map(Number);
    if (!y || !m || !d) return ymd;
    return new Date(y, m - 1, d).toLocaleDateString(numberLocale, { day: 'numeric', month: 'numeric' });
  };

  const togglePaid = useCallback(
    async (rule: PersonalRecurringRule) => {
      if (!user?.id) return;
      const st = monthStatus.get(rule.id);
      if (!st) return;
      if (st.paid) {
        if (st.paid.recurringId !== rule.id) {
          // Spárováno automaticky s platbou z výpisu / ručním výdajem.
          const paidTx = st.paid;
          Alert.alert(
            'Odškrtnout platbu?',
            `Platbu jsme spárovali s výdajem „${paidTx.title ?? ''}“ (${fmtDay(String(paidTx.date).slice(0, 10))}). Pokud to není ona, odškrtni ji — výdaj zůstane v přehledu.`,
            [
              { text: 'Nechat zaplacené', style: 'cancel' },
              {
                text: 'Odškrtnout',
                style: 'destructive',
                onPress: () => {
                  void addUnmatchedPair(rule.id, paidTx.id).then(setUnmatched);
                },
              },
            ],
          );
          return;
        }
        // Odškrtnutí vlastní fajfky: hned, bez dotazu (smaže výdaj vytvořený fajfkou, i případné duplicity).
        const linked = linkedPaymentsInMonth(rule, transactions, curY, curM);
        const paidYmd = String(st.paid.date).slice(0, 10);
        for (const tx of linked) deleteTransaction(tx.id);
        if (rule.nextDate.slice(0, 10) > paidYmd) {
          setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, nextDate: paidYmd } : r)));
          void updatePersonalRecurringRule(user.id, rule.id, { nextDate: paidYmd }).then(() =>
            load({ silent: true }),
          );
        }
        return;
      }
      setBusyId(rule.id);
      const { tx, error } = await markRecurringPaidOn(user.id, rule, st.due);
      setBusyId(null);
      if (error) {
        Alert.alert(t('errorMessage'), error.message);
        return;
      }
      if (tx) addTransactions([tx], { fromRemote: true });
      void load({ silent: true });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.id, monthStatus, addTransactions, deleteTransaction, load, t, transactions, curY, curM],
  );

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#111827' : '#F8FAFC' }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader
        title={t('personalRecurring.title')}
        subtitle={t('personalRecurring.subtitle')}
        variant="gradient"
        right={
          <AddButton
            onPress={() => {
              setAddType('expense');
              setAddOpen(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Přidat pravidelnou platbu"
            hitSlop={10}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: 'rgba(255,255,255,0.2)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Plus color="#fff" size={20} />
          </AddButton>
        }
      />

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : sorted.length === 0 ? (
        <EmptyState
          title={t('personalRecurring.emptyTitle')}
          description={t('personalRecurring.emptyBody')}
        />
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            monthStatus.size > 0 ? (
              <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: '600', marginBottom: 10 }}>
                {`${nowD.toLocaleDateString(numberLocale, { month: 'long' }).replace(/^./, (c) => c.toUpperCase())}: zaplaceno ${paidCount} z ${monthStatus.size}`}
              </Text>
            ) : null
          }
          renderItem={({ item }) => {
            const nextLabel = (() => {
              try {
                const [y, m, d] = item.nextDate.split('-').map(Number);
                return new Date(y!, m! - 1, d!).toLocaleDateString(numberLocale, {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                });
              } catch {
                return item.nextDate;
              }
            })();
            return (
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    opacity: item.active ? 1 : 0.55,
                  },
                ]}
              >
                {monthStatus.has(item.id) ? (
                  <TouchableOpacity
                    onPress={() => void togglePaid(item)}
                    disabled={busyId === item.id}
                    hitSlop={10}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: Boolean(monthStatus.get(item.id)?.paid) }}
                    accessibilityLabel={`${item.title} zaplaceno`}
                    style={[
                      styles.checkCircle,
                      monthStatus.get(item.id)?.paid
                        ? { backgroundColor: '#10B981', borderColor: '#10B981' }
                        : { borderColor: colors.border },
                    ]}
                  >
                    {busyId === item.id ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : monthStatus.get(item.id)?.paid ? (
                      <Check color="#fff" size={16} strokeWidth={3} />
                    ) : null}
                  </TouchableOpacity>
                ) : null}
                <View style={styles.cardMain}>
                  <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>
                    {formatMoneyWithSymbol(item.amount, numberLocale, currency.symbol)} ·{' '}
                    {t(frequencyLabelKey(item.frequency))}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>
                    {!item.active
                      ? t('personalRecurring.paused')
                      : monthStatus.get(item.id)?.paid
                        ? `✓ zaplaceno ${fmtDay(String(monthStatus.get(item.id)!.paid!.date).slice(0, 10))}${monthStatus.get(item.id)!.paid!.recurringId === item.id ? '' : ' · podle výpisu'}`
                        : monthStatus.has(item.id)
                          ? `splatné ${fmtDay(monthStatus.get(item.id)!.due)} · odškrtni, až zaplatíš`
                          : t('personalRecurring.nextDate', { date: nextLabel })}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setMenuRule(item)}
                  hitSlop={10}
                  style={[styles.moreBtn, { backgroundColor: colors.muted }]}
                >
                  <MoreHorizontal color={colors.textSecondary} size={18} />
                </TouchableOpacity>
              </View>
            );
          }}
        />
      )}

      <Modal visible={!!menuRule} transparent animationType="fade" onRequestClose={() => setMenuRule(null)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuRule(null)}>
          <View style={[styles.menuSheet, { backgroundColor: colors.background }]}>
            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => menuRule && openEdit(menuRule)}
            >
              <Pencil color={colors.text} size={18} />
              <Text style={[styles.menuText, { color: colors.text }]}>{t('edit')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => menuRule && void togglePause(menuRule)}
            >
              {menuRule?.active ? (
                <Pause color={colors.text} size={18} />
              ) : (
                <Play color={colors.text} size={18} />
              )}
              <Text style={[styles.menuText, { color: colors.text }]}>
                {menuRule?.active
                  ? t('personalRecurring.pause')
                  : t('personalRecurring.resume')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => menuRule && confirmDelete(menuRule)}
            >
              <Trash2 color="#EF4444" size={18} />
              <Text style={[styles.menuText, { color: '#EF4444' }]}>{t('delete')}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={!!editRule} transparent animationType="slide" onRequestClose={() => setEditRule(null)}>
        <View style={styles.editRoot}>
          <Pressable style={styles.menuBackdrop} onPress={() => setEditRule(null)} />
          <View style={[styles.editSheet, { backgroundColor: colors.background }]}>
            <Text style={[styles.editTitle, { color: colors.text }]}>
              {t('personalRecurring.editTitle')}
            </Text>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{t('description')}</Text>
            <TextInput
              value={editTitle}
              onChangeText={setEditTitle}
              style={[
                styles.input,
                { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            />
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{t('amount')}</Text>
            <TextInput
              value={editAmount}
              onChangeText={setEditAmount}
              keyboardType="decimal-pad"
              style={[
                styles.input,
                { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            />
            <RecurringFrequencyField
              value={editFrequency}
              onChange={(v) => {
                if (v) setEditFrequency(v);
              }}
            />
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }]}
              onPress={() => void saveEdit()}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveBtnText}>{t('save')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <QuickAddTransactionSheet
        visible={addOpen}
        onClose={closeAdd}
        type={addType}
        allowTypeToggle
        onTypeChange={setAddType}
        defaultFrequency="monthly"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: 16, paddingBottom: 40 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    marginBottom: 10,
    gap: 10,
  },
  cardMain: { flex: 1, minWidth: 0 },
  checkCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  moreBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  menuSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
    gap: 4,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  menuText: { fontSize: 16, fontWeight: '600' },
  editRoot: { flex: 1, justifyContent: 'flex-end' },
  editSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
  },
  editTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12, textAlign: 'center' },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginTop: 10, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  saveBtn: {
    marginTop: 16,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
