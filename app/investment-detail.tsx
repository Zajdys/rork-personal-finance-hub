import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useFocusRefresh } from '@/hooks/useFocusRefresh';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker from '@react-native-community/datetimepicker';
import Svg, { Circle } from 'react-native-svg';
import { Plus, Check, AlertTriangle, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/store/auth-store';
import { useLanguageStore } from '@/store/language-store';
import { useTheme } from '@/hooks/use-theme';
import { pluralMěsic } from '@/lib/plural-cs';
import {
  fetchUserInvestmentGoal,
  fetchUserMonthlyIncomeFromSupabase,
  updateUserInvestmentGoal,
} from '@/lib/user-profile-supabase';
import {
  buildLast12MonthBuckets,
  combinedNoteForMonth,
  countDistinctCalendarMonthsWithRecords,
  deleteInvestmentRecordsInMonth,
  fetchInvestmentRecords,
  filterHistoryBuckets,
  insertInvestmentRecord,
  replaceInvestmentMonthAggregate,
  sumAmounts,
  sumInCalendarMonth,
  type InvestmentRecordRow,
} from '@/lib/investment-reserve-records';
import { toYyyyMmDd } from '@/lib/transaction-date';
import { parseMoneyInput } from '@/lib/parse-money-input';

const PURPLE = ['#8B5CF6', '#5B21B6'] as const;

type GraphMode = 'monthly' | 'total';

function formatKc(n: number): string {
  return `${Math.round(n).toLocaleString('cs-CZ')} Kč`;
}

function monthStatusIcon(amount: number, goal: number): 'ok' | 'warn' | 'zero' {
  if (amount <= 0) return 'zero';
  if (amount >= goal) return 'ok';
  return 'warn';
}

function CircularProgress({ pct, size, stroke, trackColor, progressColor, centerColor }: {
  pct: number;
  size: number;
  stroke: number;
  trackColor: string;
  progressColor: string;
  centerColor: string;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * (1 - clamped / 100);
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={progressColor}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={dash}
          strokeLinecap="round"
        />
      </Svg>
      <View style={[StyleSheet.absoluteFillObject, styles.ringCenter]}>
        <Text style={[styles.ringPct, { color: centerColor }]}>{Math.round(clamped)}%</Text>
      </View>
    </View>
  );
}

function formatEstimateMonthsLabel(
  monthsWithRecords: number,
  target: number,
  totalSaved: number,
  t: ReturnType<typeof useLanguageStore.getState>['t'],
): string {
  if (target <= 0) return '—';
  if (totalSaved >= target) return t('goalCompleted');
  const avg = monthsWithRecords > 0 ? totalSaved / monthsWithRecords : 0;
  if (avg <= 0) return '—';
  const remaining = Math.max(0, target - totalSaved);
  const m = Math.ceil(remaining / avg);
  if (m == null || m <= 0) return t('goalCompleted');
  return t('goalApproxMonths', { count: m, monthsWord: pluralMěsic(m) });
}

export default function InvestmentDetailScreen() {
  const { user } = useAuth();
  const { t } = useLanguageStore();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const [monthlyIncome, setMonthlyIncome] = useState(0);
  const [records, setRecords] = useState<InvestmentRecordRow[]>([]);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [amountStr, setAmountStr] = useState('');
  const [note, setNote] = useState('');
  const [pickedDate, setPickedDate] = useState(() => new Date());
  const [showDate, setShowDate] = useState(false);

  const [editYm, setEditYm] = useState<string | null>(null);
  const [editMonthLabel, setEditMonthLabel] = useState('');
  const [editAmountStr, setEditAmountStr] = useState('');
  const [editNote, setEditNote] = useState('');

  const [investmentGoalDb, setInvestmentGoalDb] = useState<number | null>(null);
  const [goalInputStr, setGoalInputStr] = useState('');
  const [graphMode, setGraphMode] = useState<GraphMode>('monthly');
  const [goalSaving, setGoalSaving] = useState(false);

  const reload = useCallback(async () => {
    if (!user?.id) return;
    const [inc, rec, goal] = await Promise.all([
      fetchUserMonthlyIncomeFromSupabase(user.id),
      fetchInvestmentRecords(user.id),
      fetchUserInvestmentGoal(user.id),
    ]);
    setMonthlyIncome(inc);
    setRecords(rec);
    setInvestmentGoalDb(goal);
    setGoalInputStr(goal != null ? String(Math.round(goal)) : '');
  }, [user?.id]);

  const { refresh } = useFocusRefresh(
    useCallback(async () => {
      await reload();
    }, [reload]),
  );

  const goalMonth = useMemo(() => monthlyIncome * 0.15, [monthlyIncome]);
  const defaultTotalGoal = useMemo(() => monthlyIncome * 0.15 * 12, [monthlyIncome]);
  const effectiveTotalGoal = useMemo(
    () => (investmentGoalDb != null && investmentGoalDb > 0 ? investmentGoalDb : defaultTotalGoal),
    [investmentGoalDb, defaultTotalGoal],
  );
  const now = new Date();
  const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const investedThisMonth = useMemo(
    () => sumInCalendarMonth(records, currentYm),
    [records, currentYm],
  );
  const totalInvested = useMemo(() => sumAmounts(records), [records]);
  const progressPctMonthly = goalMonth > 0 ? (investedThisMonth / goalMonth) * 100 : 0;
  const progressPctTotal =
    effectiveTotalGoal > 0 ? Math.min(100, (totalInvested / effectiveTotalGoal) * 100) : 0;
  const progressPct = graphMode === 'monthly' ? progressPctMonthly : progressPctTotal;
  const monthsWithRecords = useMemo(() => countDistinctCalendarMonthsWithRecords(records), [records]);
  const avgPerMonth = monthsWithRecords > 0 ? totalInvested / monthsWithRecords : 0;
  const estimateLabel = useMemo(
    () => formatEstimateMonthsLabel(monthsWithRecords, effectiveTotalGoal, totalInvested, t),
    [monthsWithRecords, effectiveTotalGoal, totalInvested, t],
  );
  const allBuckets = useMemo(() => buildLast12MonthBuckets(), []);
  const historyBuckets = useMemo(
    () => filterHistoryBuckets(allBuckets, currentYm, records),
    [allBuckets, currentYm, records],
  );

  const shadowSoft = isDark ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.08)';

  const openAddModal = () => {
    setAmountStr('');
    setNote('');
    setPickedDate(new Date());
    setShowDate(false);
    setAddModalOpen(true);
  };

  const openEditModal = (ym: string, label: string) => {
    const sum = sumInCalendarMonth(records, ym);
    const combined = combinedNoteForMonth(records, ym);
    setEditYm(ym);
    setEditMonthLabel(label);
    setEditAmountStr(sum > 0 ? String(Math.round(sum)) : '');
    setEditNote(combined);
    setEditModalOpen(true);
  };

  const confirmDeleteMonth = (ym: string, label: string) => {
    Alert.alert(
      t('deleteRecordsTitle'),
      t('deleteRecordsConfirm', { label }),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: async () => {
            if (!user?.id) return;
            const { error } = await deleteInvestmentRecordsInMonth(user.id, ym);
            if (error) {
              Alert.alert(t('error'), error.message);
              return;
            }
            void refresh({ force: true });
          },
        },
      ],
    );
  };

  const saveAdd = async () => {
    if (!user?.id) return;
    const amount = parseMoneyInput(amountStr);
    if (amount == null || amount <= 0) {
      Alert.alert(t('error'), t('enterValidAmountGtZero'));
      return;
    }
    const dateStr = toYyyyMmDd(pickedDate);
    const { error } = await insertInvestmentRecord({
      userId: user.id,
      amount,
      note: note.trim() || null,
      date: dateStr,
    });
    if (error) {
      Alert.alert(t('saveFailed'), error.message);
      return;
    }
    setAddModalOpen(false);
    void refresh({ force: true });
  };

  const saveEdit = async () => {
    if (!user?.id || !editYm) return;
    const amount = parseMoneyInput(editAmountStr);
    if (amount == null || amount < 0) {
      Alert.alert(t('error'), t('enterValidAmountOrZero'));
      return;
    }
    if (amount === 0) {
      const { error } = await deleteInvestmentRecordsInMonth(user.id, editYm);
      if (error) {
        Alert.alert(t('error'), error.message);
        return;
      }
    } else {
      const { error } = await replaceInvestmentMonthAggregate({
        userId: user.id,
        ym: editYm,
        amount,
        note: editNote.trim() || null,
      });
      if (error) {
        Alert.alert(t('saveFailed'), error.message);
        return;
      }
    }
    setEditModalOpen(false);
    setEditYm(null);
    void refresh({ force: true });
  };

  const onDateChange = (_: unknown, d?: Date) => {
    setShowDate(Platform.OS === 'ios');
    if (d) setPickedDate(d);
  };

  const saveInvestmentGoal = async () => {
    if (!user?.id) return;
    const trimmed = goalInputStr.trim();
    let value: number | null = null;
    if (trimmed !== '') {
      const n = parseMoneyInput(trimmed);
      if (n == null || n <= 0) {
        Alert.alert(t('error'), t('enterValidGoalOrClear'));
        return;
      }
      value = n;
    }
    setGoalSaving(true);
    const { error } = await updateUserInvestmentGoal(user.id, value);
    setGoalSaving(false);
    if (error) {
      Alert.alert(t('saveFailed'), error.message);
      return;
    }
    void refresh({ force: true });
  };

  return (
    <>
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={{ paddingBottom: 32 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient colors={[...PURPLE]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, { shadowColor: shadowSoft }]}>
          <Text style={styles.heroTitle}>{t('investHeroTitle')}</Text>
          <Text style={styles.heroSub}>{t('investHeroSub')}</Text>
        </LinearGradient>

        <View style={[styles.goalCard, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: shadowSoft }]}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>{t('goalTargetAmount')}</Text>
          <TextInput
            value={goalInputStr}
            onChangeText={setGoalInputStr}
            keyboardType="decimal-pad"
            placeholder={defaultTotalGoal > 0 ? t('goalDefaultPrefix', { amount: formatKc(defaultTotalGoal) }) : t('goalEnterTarget')}
            placeholderTextColor={colors.textSecondary}
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface, marginBottom: 8 }]}
          />
          <Text style={[styles.goalHint, { color: colors.textSecondary }]}>
            {t('goalInvestHint')}
          </Text>
          <TouchableOpacity
            style={[styles.saveGoalBtn, { backgroundColor: colors.primary, opacity: goalSaving ? 0.65 : 1 }]}
            onPress={() => void saveInvestmentGoal()}
            disabled={goalSaving}
          >
            <Text style={[styles.saveGoalBtnText, { color: colors.onPrimary }]}>{t('goalSaveTarget')}</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: shadowSoft }]}>
          <View style={[styles.segmented, { backgroundColor: colors.muted }]}>
            {(
              [
                { id: 'monthly' as const, label: t('goalMonthly') },
                { id: 'total' as const, label: t('goalTotal') },
              ] as const
            ).map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.segment, graphMode === item.id && { backgroundColor: colors.primary }]}
                onPress={() => setGraphMode(item.id)}
              >
                <Text
                  style={[
                    styles.segmentText,
                    { color: colors.textSecondary },
                    graphMode === item.id && { color: colors.onPrimary, fontWeight: '700' },
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {graphMode === 'monthly' ? (
            <>
              <Text style={[styles.label, { color: colors.textSecondary, marginTop: 16 }]}>{t('goalThisMonth')}</Text>
              <Text style={[styles.bigValue, { color: colors.text }]}>{formatKc(goalMonth)}</Text>
              <Text style={[styles.muted, { color: colors.textSecondary }]}>{t('goalFifteenPercent')}</Text>
            </>
          ) : (
            <>
              <Text style={[styles.label, { color: colors.textSecondary, marginTop: 16 }]}>{t('goalTotalTarget')}</Text>
              <Text style={[styles.bigValue, { color: colors.text }]}>{formatKc(effectiveTotalGoal)}</Text>
              <Text style={[styles.muted, { color: colors.textSecondary }]}>
                {investmentGoalDb != null && investmentGoalDb > 0 ? t('goalCustom') : t('goalDefaultInvest')}
              </Text>
            </>
          )}

          <View style={styles.ringWrap}>
            <CircularProgress
              pct={progressPct}
              size={140}
              stroke={12}
              trackColor={isDark ? '#3f3f46' : '#E4E4E7'}
              progressColor={colors.primary}
              centerColor={colors.text}
            />
          </View>
          <Text style={[styles.centerLine, { color: colors.text }]}>
            {graphMode === 'monthly' ? (
              <>
                {t('goalThisMonthLine', { amount: formatKc(investedThisMonth), goal: formatKc(goalMonth) })}
              </>
            ) : (
              <>
                {t('goalTotalLine', { amount: formatKc(totalInvested), goal: formatKc(effectiveTotalGoal) })}
              </>
            )}
          </Text>

          <View style={styles.statsRow}>
            <View style={[styles.statCard, { backgroundColor: colors.muted }]}>
              <Text style={[styles.statTitle, { color: colors.textSecondary }]}>{t('investTotalInvested')}</Text>
              <Text style={[styles.statValue, { color: colors.text }]} numberOfLines={2}>
                {formatKc(totalInvested)}
              </Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: colors.muted }]}>
              <Text style={[styles.statTitle, { color: colors.textSecondary }]}>{t('reserveAvgPerMonth')}</Text>
              <Text style={[styles.statValue, { color: colors.text }]} numberOfLines={2}>
                {monthsWithRecords > 0 ? formatKc(avgPerMonth) : '—'}
              </Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: colors.muted }]}>
              <Text style={[styles.statTitle, { color: colors.textSecondary }]}>{t('reserveEstimateToGoal')}</Text>
              <Text style={[styles.statValue, { color: colors.text }]} numberOfLines={2}>
                {estimateLabel}
              </Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: colors.primary }]}
          onPress={openAddModal}
          activeOpacity={0.88}
        >
          <Plus color={colors.onPrimary} size={22} />
          <Text style={[styles.addBtnText, { color: colors.onPrimary }]}>+ {t('addInvestment')}</Text>
        </TouchableOpacity>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('reserveHistory')}</Text>
          {historyBuckets.length === 0 ? (
            <Text style={[styles.emptyHist, { color: colors.textSecondary }]}>{t('reserveNoHistory')}</Text>
          ) : (
            historyBuckets.map(({ ym, label }) => {
              const sum = sumInCalendarMonth(records, ym);
              const goal = goalMonth;
              const st = monthStatusIcon(sum, goal);
              return (
                <View
                  key={ym}
                  style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <TouchableOpacity
                    style={styles.rowMain}
                    onPress={() => openEditModal(ym, label)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.rowTitle, { color: colors.text }]}>{label}</Text>
                    <Text style={[styles.rowMeta, { color: colors.textSecondary }]}>
                      Investováno: {formatKc(sum)} · Cíl: {formatKc(goal)}
                    </Text>
                    <View style={styles.statusRow}>
                      {st === 'ok' ? (
                        <Check color="#22C55E" size={22} />
                      ) : st === 'warn' ? (
                        <AlertTriangle color="#F59E0B" size={22} />
                      ) : (
                        <Text style={[styles.zeroHint, { color: colors.textSecondary }]}>{t('reserveBelowGoal')}</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteHit}
                    onPress={() => confirmDeleteMonth(ym, label)}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <X color="#EF4444" size={24} />
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      <Modal visible={addModalOpen} animationType="slide" transparent onRequestClose={() => setAddModalOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalScrim} activeOpacity={1} onPress={() => setAddModalOpen(false)} />
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{t('addInvestment')}</Text>
            <Text style={[styles.label, { color: colors.textSecondary }]}>{t('amount')} (Kč)</Text>
            <TextInput
              value={amountStr}
              onChangeText={setAmountStr}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={colors.textSecondary}
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
            />
            <Text style={[styles.label, { color: colors.textSecondary }]}>{t('description')}</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder={t('investNotePlaceholder')}
              placeholderTextColor={colors.textSecondary}
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
            />
            <Text style={[styles.label, { color: colors.textSecondary }]}>{t('date')}</Text>
            <TouchableOpacity
              style={[styles.dateBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
              onPress={() => setShowDate(true)}
            >
              <Text style={{ color: colors.text }}>{pickedDate.toLocaleDateString('cs-CZ')}</Text>
            </TouchableOpacity>
            {showDate ? (
              <DateTimePicker value={pickedDate} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={onDateChange} />
            ) : null}
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtnGhost, { borderColor: colors.border }]} onPress={() => setAddModalOpen(false)}>
                <Text style={{ color: colors.text }}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtnPrimary, { backgroundColor: colors.primary }]} onPress={() => void saveAdd()}>
                <Text style={{ color: colors.onPrimary, fontWeight: '700' }}>{t('save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={editModalOpen} animationType="slide" transparent onRequestClose={() => setEditModalOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalScrim} activeOpacity={1} onPress={() => setEditModalOpen(false)} />
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{t('edit')}</Text>
            <Text style={[styles.editSubtitle, { color: colors.textSecondary }]}>{editMonthLabel}</Text>
            <Text style={[styles.label, { color: colors.textSecondary }]}>{t('amount')} (Kč)</Text>
            <TextInput
              value={editAmountStr}
              onChangeText={setEditAmountStr}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={colors.textSecondary}
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
            />
            <Text style={[styles.label, { color: colors.textSecondary }]}>{t('description')}</Text>
            <TextInput
              value={editNote}
              onChangeText={setEditNote}
              placeholder={t('investNotePlaceholder')}
              placeholderTextColor={colors.textSecondary}
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
            />
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              Částka 0 smaže všechny záznamy v tomto měsíci. Uložením se měsíc sloučí do jednoho řádku (1. den měsíce).
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtnGhost, { borderColor: colors.border }]} onPress={() => setEditModalOpen(false)}>
                <Text style={{ color: colors.text }}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtnPrimary, { backgroundColor: colors.primary }]} onPress={() => void saveEdit()}>
                <Text style={{ color: colors.onPrimary, fontWeight: '700' }}>{t('save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hero: {
    marginHorizontal: 20,
    marginTop: 12,
    borderRadius: 16,
    padding: 22,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 4,
  },
  heroTitle: { fontSize: 22, fontWeight: '800', color: '#fff' },
  heroSub: { fontSize: 14, color: 'rgba(255,255,255,0.9)', marginTop: 8, lineHeight: 20 },
  goalCard: {
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 16,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 2,
  },
  goalHint: { fontSize: 12, lineHeight: 17, marginBottom: 12 },
  saveGoalBtn: { alignItems: 'center', paddingVertical: 12, borderRadius: 12 },
  saveGoalBtnText: { fontSize: 15, fontWeight: '700' },
  segmented: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: 10,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
  },
  statsRow: { flexDirection: 'row', gap: 8, marginTop: 20 },
  statCard: { flex: 1, borderRadius: 12, padding: 10, minWidth: 0 },
  statTitle: { fontSize: 10, fontWeight: '600', marginBottom: 6 },
  statValue: { fontSize: 13, fontWeight: '800', lineHeight: 18 },
  card: {
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 16,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 2,
  },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  bigValue: { fontSize: 26, fontWeight: '800' },
  muted: { fontSize: 13, marginTop: 4 },
  ringWrap: { alignItems: 'center', marginTop: 20, marginBottom: 8, overflow: 'visible' },
  ringCenter: { alignItems: 'center', justifyContent: 'center' },
  ringPct: { fontSize: 22, fontWeight: '800' },
  centerLine: { textAlign: 'center', fontSize: 15, marginTop: 4 },
  addBtn: {
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 16,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  addBtnText: { fontSize: 16, fontWeight: '800' },
  section: { marginHorizontal: 20, marginTop: 28 },
  sectionTitle: { fontSize: 17, fontWeight: '700', marginBottom: 12 },
  emptyHist: { fontSize: 14, marginBottom: 8 },
  row: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  rowMain: { flex: 1, padding: 14, paddingRight: 8 },
  deleteHit: { justifyContent: 'center', paddingHorizontal: 14 },
  rowTitle: { fontSize: 15, fontWeight: '700' },
  rowMeta: { fontSize: 13, marginTop: 4 },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 6 },
  zeroHint: { fontSize: 12, fontStyle: 'italic' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 28,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', marginBottom: 6 },
  editSubtitle: { fontSize: 15, fontWeight: '600', marginBottom: 14 },
  hint: { fontSize: 12, lineHeight: 17, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 14,
  },
  dateBtn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalBtnGhost: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  modalBtnPrimary: { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 12 },
});
