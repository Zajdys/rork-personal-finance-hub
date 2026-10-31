import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Svg, { Circle } from 'react-native-svg';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useFocusRefresh } from '@/hooks/useFocusRefresh';
import { useAuth } from '@/store/auth-store';
import { useTheme } from '@/hooks/use-theme';
import { usePlanStore } from '@/store/plan-store';
import {
  fetchGoalContributions,
  fetchSavingsGoal,
  monthlySavingsNeed,
  type PlanContribution,
  type PlanSavingsGoal,
} from '@/lib/supabase-plan';
import { parseMoneyInput } from '@/lib/parse-money-input';
import { formatKčGrouped } from '@/lib/quick-setup';
import { showToast } from '@/store/toast-store';
import { safeGoBack } from '@/lib/safe-back';

function formatKc(n: number): string {
  return `${Math.round(n).toLocaleString('cs-CZ')} Kč`;
}

function CircularProgress({
  pct,
  size,
  stroke,
  trackColor,
  progressColor,
  centerColor,
}: {
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

export default function PlanGoalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const addContribution = usePlanStore((s) => s.addContribution);
  const archiveGoal = usePlanStore((s) => s.archiveGoal);
  const updateGoal = usePlanStore((s) => s.updateGoal);
  const refreshPlan = usePlanStore((s) => s.refreshPlan);

  const [goal, setGoal] = useState<PlanSavingsGoal | null>(null);
  const [contribs, setContribs] = useState<PlanContribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<'deposit' | 'withdraw' | 'edit' | null>(null);
  const [amountStr, setAmountStr] = useState('');
  const [note, setNote] = useState('');
  const [editName, setEditName] = useState('');
  const [editTarget, setEditTarget] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!user?.id || !id) return;
    setLoading(true);
    const [g, c] = await Promise.all([
      fetchSavingsGoal(user.id, id),
      fetchGoalContributions(user.id, id),
    ]);
    setGoal(g);
    setContribs(c);
    if (g) {
      setEditName(g.name);
      setEditTarget(formatKčGrouped(String(Math.round(g.targetAmount))));
    }
    setLoading(false);
  }, [user?.id, id]);

  useFocusRefresh(reload);

  const current = useMemo(
    () => contribs.reduce((s, c) => s + (Number(c.amount) || 0), 0),
    [contribs],
  );
  const target = goal?.targetAmount ?? 0;
  const pct = target > 0 ? (current / target) * 100 : 0;
  const need = goal ? monthlySavingsNeed(target, current, goal.deadline) : null;

  const submitMoney = async () => {
    if (!user?.id || !goal) return;
    const n = parseMoneyInput(amountStr);
    if (n == null || n <= 0) {
      Alert.alert('Neplatná částka');
      return;
    }
    const signed = modalMode === 'withdraw' ? -n : n;
    if (modalMode === 'withdraw' && n > current) {
      Alert.alert('Nelze vybrat víc, než je naspořeno');
      return;
    }
    setBusy(true);
    const { error } = await addContribution({
      userId: user.id,
      goalId: goal.id,
      amount: signed,
      note: note.trim() || null,
    });
    setBusy(false);
    if (error) {
      showToast({ type: 'error', message: 'Operace selhala' });
      return;
    }
    setModalMode(null);
    setAmountStr('');
    setNote('');
    await reload();
    void refreshPlan();
    showToast({
      type: 'success',
      message: modalMode === 'withdraw' ? 'Výběr uložen' : 'Vklad uložen',
    });
  };

  const submitEdit = async () => {
    if (!user?.id || !goal) return;
    const t = parseMoneyInput(editTarget);
    if (!editName.trim() || t == null || t <= 0) {
      Alert.alert('Vyplň název a cílovou částku');
      return;
    }
    setBusy(true);
    const { error } = await updateGoal({
      userId: user.id,
      id: goal.id,
      name: editName.trim(),
      emoji: goal.emoji,
      color: goal.color,
      targetAmount: t,
      deadline: goal.deadline,
    });
    setBusy(false);
    if (error) {
      showToast({ type: 'error', message: 'Uložení selhalo' });
      return;
    }
    setModalMode(null);
    await reload();
    void refreshPlan();
    showToast({ type: 'success', message: 'Cíl upraven' });
  };

  const onArchive = () => {
    if (!user?.id || !goal) return;
    Alert.alert('Archivovat cíl?', goal.name, [
      { text: 'Zrušit', style: 'cancel' },
      {
        text: 'Archivovat',
        style: 'destructive',
        onPress: () => {
          void archiveGoal(user.id, goal.id).then(({ error }) => {
            if (error) showToast({ type: 'error', message: 'Archivace selhala' });
            else {
              showToast({ type: 'success', message: 'Cíl archivován' });
              safeGoBack();
            }
          });
        },
      },
    ]);
  };

  const cardBg = isDark ? '#1F2937' : '#FFFFFF';

  if (loading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Cíl" variant="gradient" />
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      </View>
    );
  }

  if (!goal) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Cíl" variant="gradient" />
        <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 40 }}>
          Cíl nenalezen
        </Text>
        <TouchableOpacity onPress={() => router.replace('/(tabs)/plan')}>
          <Text style={{ color: colors.primary, textAlign: 'center', marginTop: 12 }}>Zpět na Plán</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={goal.kind === 'emergency_fund' ? 'Rezerva' : goal.name}
        variant="gradient"
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.hero, { backgroundColor: cardBg }]}>
          <Text style={styles.emoji}>{goal.emoji}</Text>
          {goal.kind === 'emergency_fund' ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Rezerva</Text>
            </View>
          ) : null}
          <CircularProgress
            pct={pct}
            size={100}
            stroke={8}
            trackColor={colors.muted}
            progressColor={goal.color}
            centerColor={colors.text}
          />
          <Text style={[styles.amounts, { color: colors.text }]}>
            {formatKc(current)} / {formatKc(target)}
          </Text>
          {need != null && need > 0 ? (
            <Text style={{ color: colors.primary, fontWeight: '700', marginTop: 4 }}>
              Odkládej {formatKc(need)} měsíčně
            </Text>
          ) : null}
          {goal.deadline ? (
            <Text style={{ color: colors.textSecondary, marginTop: 4 }}>
              do{' '}
              {new Date(`${goal.deadline}T12:00:00`).toLocaleDateString('cs-CZ', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </Text>
          ) : null}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#10B981' }]}
            onPress={() => {
              setAmountStr('');
              setNote('');
              setModalMode('deposit');
            }}
          >
            <Text style={styles.actionText}>+ Vložit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#EF4444' }]}
            onPress={() => {
              setAmountStr('');
              setNote('');
              setModalMode('withdraw');
            }}
          >
            <Text style={styles.actionText}>− Vybrat</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtnOutline, { borderColor: colors.border }]}
            onPress={() => setModalMode('edit')}
          >
            <Text style={{ color: colors.text, fontWeight: '700' }}>Upravit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtnOutline, { borderColor: colors.border }]}
            onPress={onArchive}
          >
            <Text style={{ color: '#EF4444', fontWeight: '700' }}>Archivovat</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.section, { color: colors.text }]}>Historie</Text>
        <View style={[styles.list, { backgroundColor: cardBg }]}>
          {contribs.length === 0 ? (
            <Text style={{ color: colors.textSecondary, textAlign: 'center', padding: 20 }}>
              Zatím žádné pohyby
            </Text>
          ) : (
            contribs.map((c) => (
              <View key={c.id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: '600' }}>
                    {c.amount >= 0 ? 'Vklad' : 'Výběr'}
                    {c.note ? ` · ${c.note}` : ''}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                    {new Date(c.createdAt).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' })}
                  </Text>
                </View>
                <Text
                  style={{
                    fontWeight: '800',
                    color: c.amount >= 0 ? '#10B981' : '#EF4444',
                  }}
                >
                  {c.amount >= 0 ? '+' : ''}
                  {formatKc(c.amount)}
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <Modal
        visible={modalMode != null}
        transparent
        animationType="slide"
        onRequestClose={() => setModalMode(null)}
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => setModalMode(null)} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={[styles.sheet, { backgroundColor: colors.background }]}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>
                {modalMode === 'deposit'
                  ? 'Vložit'
                  : modalMode === 'withdraw'
                    ? 'Vybrat'
                    : 'Upravit cíl'}
              </Text>
              {modalMode === 'edit' ? (
                <>
                  <TextInput
                    value={editName}
                    onChangeText={setEditName}
                    placeholder="Název"
                    placeholderTextColor={colors.textSecondary}
                    style={[
                      styles.input,
                      {
                        color: colors.text,
                        borderColor: colors.border,
                        backgroundColor: colors.surface,
                      },
                    ]}
                  />
                  <TextInput
                    value={editTarget}
                    onChangeText={(t) => setEditTarget(formatKčGrouped(t))}
                    keyboardType="number-pad"
                    placeholder="Cílová částka"
                    placeholderTextColor={colors.textSecondary}
                    style={[
                      styles.input,
                      {
                        color: colors.text,
                        borderColor: colors.border,
                        backgroundColor: colors.surface,
                      },
                    ]}
                  />
                  <TouchableOpacity
                    style={[styles.save, { backgroundColor: colors.primary, opacity: busy ? 0.7 : 1 }]}
                    onPress={() => void submitEdit()}
                    disabled={busy}
                  >
                    <Text style={styles.saveText}>Uložit</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <TextInput
                    value={amountStr}
                    onChangeText={(t) => setAmountStr(formatKčGrouped(t))}
                    keyboardType="number-pad"
                    placeholder="Částka"
                    placeholderTextColor={colors.textSecondary}
                    style={[
                      styles.input,
                      {
                        color: colors.text,
                        borderColor: colors.border,
                        backgroundColor: colors.surface,
                      },
                    ]}
                  />
                  <TextInput
                    value={note}
                    onChangeText={setNote}
                    placeholder="Poznámka (volitelné)"
                    placeholderTextColor={colors.textSecondary}
                    style={[
                      styles.input,
                      {
                        color: colors.text,
                        borderColor: colors.border,
                        backgroundColor: colors.surface,
                      },
                    ]}
                  />
                  <TouchableOpacity
                    style={[
                      styles.save,
                      {
                        backgroundColor: modalMode === 'withdraw' ? '#EF4444' : '#10B981',
                        opacity: busy ? 0.7 : 1,
                      },
                    ]}
                    onPress={() => void submitMoney()}
                    disabled={busy}
                  >
                    <Text style={styles.saveText}>{busy ? '…' : 'Potvrdit'}</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  hero: {
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  emoji: { fontSize: 40 },
  badge: {
    backgroundColor: 'rgba(16,185,129,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeText: { color: '#10B981', fontWeight: '800', fontSize: 12 },
  ringCenter: { alignItems: 'center', justifyContent: 'center' },
  ringPct: { fontSize: 18, fontWeight: '800' },
  amounts: { fontSize: 20, fontWeight: '800', marginTop: 8 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  actionBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  actionText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  actionBtnOutline: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  section: { fontSize: 17, fontWeight: '800', marginTop: 20, marginBottom: 8 },
  list: { borderRadius: 16, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.25)',
  },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 36,
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 10,
  },
  save: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
