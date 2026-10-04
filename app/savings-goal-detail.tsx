import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, Stack } from 'expo-router';
import { StackHeaderBackButton } from '@/components/BackButton';
import { Trash2 } from 'lucide-react-native';
import { useSettingsStore } from '@/store/settings-store';
import { useLanguageStore } from '@/store/language-store';
import {
  useSavingsGoalsStore,
  getGoalCurrentAmount,
  type SavingsContribution,
} from '@/store/savings-goals-store';
import { daysUntilDeadline, formatGoalDeadlineCs } from '@/lib/savings-goal-utils';
import { safeGoBack } from '@/lib/safe-back';
import { parseMoneyInput } from '@/lib/parse-money-input';
import { AsyncButton } from '@/components/AsyncButton';
import { useAsyncAction } from '@/hooks/use-async-action';

export default function SavingsGoalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isDarkMode, getCurrentCurrency } = useSettingsStore();
  const { t } = useLanguageStore();
  const goals = useSavingsGoalsStore((s) => s.goals);
  const addContribution = useSavingsGoalsStore((s) => s.addContribution);
  const deleteGoal = useSavingsGoalsStore((s) => s.deleteGoal);
  const sym = getCurrentCurrency().symbol;

  const goal = goals.find((g) => g.id === id);

  const [modalOpen, setModalOpen] = useState(false);
  const [amountStr, setAmountStr] = useState('');

  const primaryText = isDarkMode ? '#F9FAFB' : '#0F172A';
  const subtleText = isDarkMode ? '#94A3B8' : '#6B7280';
  const cardColor = isDarkMode ? '#1F2937' : '#FFFFFF';
  const inputBorder = isDarkMode ? '#334155' : '#E2E8F0';

  const current = goal ? getGoalCurrentAmount(goal) : 0;
  const target = goal?.targetAmount ?? 0;
  const progressPct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  const remaining = Math.max(0, target - current);
  const reached = current >= target && target > 0;
  const daysLeft = goal ? daysUntilDeadline(goal.deadline) : 0;

  const sortedContributions = useMemo(() => {
    if (!goal) return [];
    return [...goal.contributions].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [goal]);

  const daysWord =
    daysLeft === 1 ? t('sgDayOne') : daysLeft >= 2 && daysLeft <= 4 ? t('sgDayFew') : t('sgDayMany');

  const { run: submitContribution } = useAsyncAction(async () => {
    if (!goal) return;
    const n = parseMoneyInput(amountStr);
    if (n == null || n <= 0) {
      Alert.alert(t('error'), t('sgInvalidAmount'));
      return;
    }
    addContribution(goal.id, n);
    setAmountStr('');
    setModalOpen(false);
  });

  const { run: runDeleteGoal } = useAsyncAction(async () => {
    if (!goal) return;
    deleteGoal(goal.id);
    safeGoBack();
  });

  const confirmDelete = () => {
    Alert.alert(t('sgDeleteTitle'), t('sgDeleteConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: () => {
          void runDeleteGoal();
        },
      },
    ]);
  };

  if (!goal) {
    return (
      <View style={[styles.centered, { backgroundColor: isDarkMode ? '#0F172A' : '#F8FAFC' }]}>
        <Stack.Screen
          options={{
            title: t('sgGoalTitle'),
            headerLeft: ({ tintColor }) => (
              <StackHeaderBackButton tintColor={tintColor ?? 'white'} />
            ),
          }}
        />
        <Text style={{ color: primaryText }}>{t('sgGoalNotFound')}</Text>
        <TouchableOpacity onPress={() => safeGoBack()} style={styles.backLink}>
          <Text style={styles.backLinkText}>{t('back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const formatContribDate = (c: SavingsContribution) =>
    new Date(c.createdAt).toLocaleString('cs-CZ', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <>
      <Stack.Screen
        options={{
          title: goal.name,
          headerLeft: ({ tintColor }) => (
            <StackHeaderBackButton tintColor={tintColor ?? 'white'} />
          ),
        }}
      />
      <ScrollView
        style={[styles.root, { backgroundColor: isDarkMode ? '#0F172A' : '#F8FAFC' }]}
        contentContainerStyle={styles.content}
      >
        {reached && (
          <LinearGradient
            colors={['#F59E0B', '#EA580C']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.celebrateCard}
          >
            <Text style={styles.celebrateEmoji}>🎉</Text>
            <Text style={styles.celebrateTitle}>{t('sgCongrats')}</Text>
            <Text style={styles.celebrateBody}>
              {t('sgCongratsBody', { name: goal.name })}
            </Text>
          </LinearGradient>
        )}

        <View style={[styles.card, { backgroundColor: cardColor }]}>
          <View style={styles.goalHeader}>
            <View style={[styles.bigEmojiWrap, { backgroundColor: `${goal.color}22` }]}>
              <Text style={styles.bigEmoji}>{goal.emoji}</Text>
            </View>
            <View style={styles.goalHeaderText}>
              <Text style={[styles.goalName, { color: primaryText }]}>{goal.name}</Text>
              <Text style={[styles.deadlineLine, { color: subtleText }]}>
                {t('sgDeadline', { date: formatGoalDeadlineCs(goal.deadline) })}
              </Text>
            </View>
          </View>

          <View style={[styles.progressTrack, { backgroundColor: isDarkMode ? '#334155' : '#E2E8F0' }]}>
            <View
              style={[
                styles.progressFill,
                { width: `${progressPct}%`, backgroundColor: goal.color },
              ]}
            />
          </View>
          <Text style={[styles.progressPct, { color: subtleText }]}>
            {t('sgProgressDone', { percent: progressPct.toFixed(0) })}
          </Text>

          <View style={styles.statsRow}>
            <View style={[styles.statBox, { backgroundColor: isDarkMode ? '#0B1220' : '#F1F5F9' }]}>
              <Text style={[styles.statLabel, { color: subtleText }]}>{t('sgSaved')}</Text>
              <Text style={[styles.statValue, { color: primaryText }]}>
                {current.toLocaleString('cs-CZ')} {sym}
              </Text>
            </View>
            <View style={[styles.statBox, { backgroundColor: isDarkMode ? '#0B1220' : '#F1F5F9' }]}>
              <Text style={[styles.statLabel, { color: subtleText }]}>{t('sgTarget')}</Text>
              <Text style={[styles.statValue, { color: primaryText }]}>
                {target.toLocaleString('cs-CZ')} {sym}
              </Text>
            </View>
          </View>

          <Text style={[styles.remainLine, { color: primaryText }]}>
            {t('sgRemaining', { amount: remaining.toLocaleString('cs-CZ'), symbol: sym })}
          </Text>
          <Text style={[styles.daysLine, { color: daysLeft < 0 ? '#EF4444' : subtleText }]}>
            {daysLeft < 0
              ? t('sgDeadlinePassed', { days: Math.abs(daysLeft) })
              : daysLeft === 0
                ? t('sgDeadlineToday')
                : t('sgDaysLeft', { count: daysLeft, daysWord })}
          </Text>

          <TouchableOpacity onPress={() => setModalOpen(true)} activeOpacity={0.9}>
            <LinearGradient
              colors={['#10B981', '#059669']}
              style={styles.addMoneyBtn}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.addMoneyBtnText}>{t('sgAddContribution')}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <View style={[styles.card, { backgroundColor: cardColor }]}>
          <Text style={[styles.historyTitle, { color: primaryText }]}>{t('sgHistory')}</Text>
          {sortedContributions.length === 0 ? (
            <Text style={[styles.emptyHist, { color: subtleText }]}>
              {t('sgNoContributions')}
            </Text>
          ) : (
            sortedContributions.map((c) => (
              <View
                key={c.id}
                style={[styles.histRow, { borderBottomColor: isDarkMode ? '#334155' : '#E5E7EB' }]}
              >
                <Text style={[styles.histDate, { color: subtleText }]}>{formatContribDate(c)}</Text>
                <Text style={[styles.histAmount, { color: goal.color }]}>
                  +{c.amount.toLocaleString('cs-CZ')} {sym}
                </Text>
              </View>
            ))
          )}
        </View>

        <TouchableOpacity style={styles.deleteBtn} onPress={confirmDelete}>
          <Trash2 color="#EF4444" size={20} />
          <Text style={styles.deleteBtnText}>{t('sgDeleteGoal')}</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={modalOpen} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setModalOpen(false)}
        >
          <View style={[styles.modalBox, { backgroundColor: cardColor }]} onStartShouldSetResponder={() => true}>
            <Text style={[styles.modalTitle, { color: primaryText }]}>{t('sgHowMuchAdd')}</Text>
            <TextInput
              value={amountStr}
              onChangeText={setAmountStr}
              placeholder={t('sgAmountPlaceholder', { symbol: sym })}
              placeholderTextColor={subtleText}
              keyboardType="decimal-pad"
              style={[styles.modalInput, { color: primaryText, borderColor: inputBorder }]}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setModalOpen(false)}>
                <Text style={styles.modalCancelText}>{t('cancel')}</Text>
              </TouchableOpacity>
              <AsyncButton
                variant="success"
                label={t('addAction')}
                loadingLabel={t('hhNotifSaving')}
                onPress={submitContribution}
                contentStyle={styles.modalOk}
                textStyle={styles.modalOkText}
              />
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  backLink: { marginTop: 16 },
  backLinkText: { color: '#2563EB', fontWeight: '600' },
  celebrateCard: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    alignItems: 'center',
  },
  celebrateEmoji: { fontSize: 48, marginBottom: 8 },
  celebrateTitle: { fontSize: 22, fontWeight: '800', color: 'white', marginBottom: 8 },
  celebrateBody: { fontSize: 15, color: 'rgba(255,255,255,0.95)', textAlign: 'center', lineHeight: 22 },
  card: {
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  goalHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  bigEmojiWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigEmoji: { fontSize: 36 },
  goalHeaderText: { flex: 1 },
  goalName: { fontSize: 20, fontWeight: '800' },
  deadlineLine: { fontSize: 14, marginTop: 4 },
  progressTrack: { height: 12, borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 999 },
  progressPct: { fontSize: 13, marginTop: 8, fontWeight: '600' },
  statsRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  statBox: { flex: 1, borderRadius: 14, padding: 12 },
  statLabel: { fontSize: 12, marginBottom: 4 },
  statValue: { fontSize: 16, fontWeight: '700' },
  remainLine: { fontSize: 17, fontWeight: '700', marginTop: 16 },
  daysLine: { fontSize: 14, marginTop: 6 },
  addMoneyBtn: { marginTop: 18, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  addMoneyBtnText: { color: 'white', fontSize: 16, fontWeight: '700' },
  historyTitle: { fontSize: 17, fontWeight: '700', marginBottom: 12 },
  emptyHist: { fontSize: 14, lineHeight: 20 },
  histRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  histDate: { fontSize: 14 },
  histAmount: { fontSize: 15, fontWeight: '700' },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  deleteBtnText: { color: '#EF4444', fontSize: 16, fontWeight: '600' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  modalBox: { borderRadius: 20, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  modalInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    marginBottom: 16,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, alignItems: 'center' },
  modalCancel: { paddingVertical: 10, paddingHorizontal: 12 },
  modalCancelText: { color: '#6B7280', fontWeight: '600' },
  modalOk: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 20 },
  modalOkText: { color: 'white', fontWeight: '700' },
});
