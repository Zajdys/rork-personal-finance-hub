import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { ChevronLeft, ChevronRight, Plus, Target, Wallet, ChevronRight as ChevronRightIcon } from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusRefresh } from '@/hooks/useFocusRefresh';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/store/auth-store';
import { getMonthTransactions, useFinanceStore, type LoanItem } from '@/store/finance-store';
import { usePlanStore } from '@/store/plan-store';
import { PremiumGate, openPaywall } from '@/components/PremiumGate';
import { usePremium } from '@/hooks/usePremium';
import { askNotificationsInContext } from '@/lib/reschedule-all-local-notifications';
import { FREE_BUDGET_LIMIT } from '@/constants/premium';
import { CategoryPicker } from '@/components/CategoryPicker';
import { EmptyState } from '@/components/EmptyState';
import { RecurringFrequencyField } from '@/components/RecurringFrequencyField';
import { useFilteredTransactions } from '@/hooks/use-filtered-transactions';
import { loadQuickSetupStatus, formatKčGrouped } from '@/lib/quick-setup';
import { monthlySavingsNeed, recurringToMonthly, type UserBudget } from '@/lib/supabase-plan';
import { mainCategoryName, normalizeCategory } from '@/lib/category-normalize';
import { getExpenseCategoryDef } from '@/constants/categories';
import {
  fetchPersonalRecurringRules,
  markPersonalRecurringPaid,
  skipPersonalRecurringOccurrence,
  updatePersonalRecurringRule,
  type PersonalRecurringFrequency,
  type PersonalRecurringRule,
} from '@/lib/personal-recurring';
import { parseMoneyInput } from '@/lib/parse-money-input';
import { toYyyyMmDd } from '@/lib/transaction-date';
import { formatZaDni, formatZbyvaDni } from '@/lib/plural-cs';
import {
  SAVINGS_GOAL_EMOJI_OPTIONS,
  SAVINGS_GOAL_COLOR_OPTIONS,
} from '@/constants/savings-goal-templates';
import { showToast } from '@/store/toast-store';
import { normalizeFrequency } from '@/lib/recurring-expense-cycle';
import {
  loanOccurrenceKey,
  loadPlanPaymentLinks,
  recordManualPlanPaymentLink,
  recurringOccurrenceKey,
} from '@/lib/plan-payment-match';

const BUDGET_EMOJI_OPTIONS: string[] = Array.from(new Set([
  ...SAVINGS_GOAL_EMOJI_OPTIONS,
  '🍽️',
  '🛒',
  '⛽',
  '🎬',
  '👕',
  '💊',
  '📦',
  '🏠',
  '⚡',
  '📱',
]));

function ymLabel(y: number, m0: number): string {
  const d = new Date(y, m0, 1);
  const s = d.toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatKc(n: number): string {
  return `${Math.round(n).toLocaleString('cs-CZ')} Kč`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function daysUntil(date: Date, now = new Date()): number {
  const a = startOfDay(now).getTime();
  const b = startOfDay(date).getTime();
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
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

function budgetBarColor(pct: number): string {
  if (pct > 100) return '#EF4444';
  if (pct >= 75) return '#F59E0B';
  return '#10B981';
}

function budgetDisplayEmoji(b: UserBudget): string {
  if (b.emoji) return b.emoji;
  return getExpenseCategoryDef(b.category)?.icon ?? '📦';
}

function budgetDisplayLabel(b: UserBudget): string {
  if (b.label?.trim()) return b.label.trim();
  return b.category;
}

function nextLoanDueDate(loan: LoanItem, now: Date): Date | null {
  const start =
    loan.startDate instanceof Date ? loan.startDate : new Date(loan.startDate as string);
  if (!Number.isFinite(start.getTime())) return null;
  const day = start.getDate();
  const paid = Math.max(0, Math.floor(loan.paymentsMade ?? 0));
  const anchorRaw = loan.installmentStartDate;
  const anchor =
    anchorRaw instanceof Date
      ? anchorRaw
      : anchorRaw
        ? new Date(anchorRaw as string)
        : start;
  const base = Number.isFinite(anchor.getTime()) ? anchor : start;
  const due = new Date(base.getFullYear(), base.getMonth() + paid, 1, 12, 0, 0, 0);
  const last = new Date(due.getFullYear(), due.getMonth() + 1, 0).getDate();
  due.setDate(Math.min(day, last));
  const today = startOfDay(now);
  while (due < today) {
    due.setMonth(due.getMonth() + 1);
    const last2 = new Date(due.getFullYear(), due.getMonth() + 1, 0).getDate();
    due.setDate(Math.min(day, last2));
  }
  return due;
}

type UpcomingPay = {
  id: string;
  sourceId: string;
  title: string;
  amount: number;
  date: Date;
  kind: 'loan' | 'recurring';
  emoji: string;
  category?: string;
  subcategory?: string | null;
  frequency?: PersonalRecurringFrequency;
  dueDay?: number;
};

export default function PlanScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isHouseholdPremium } = usePremium();
  const { user } = useAuth();

  const loans = useFinanceStore((s) => s.loans);
  const updateLoan = useFinanceStore((s) => s.updateLoan);
  const markLoanPaymentPaid = useFinanceStore((s) => s.markLoanPaymentPaid);
  const loadTransactionsFromSupabase = useFinanceStore((s) => s.loadTransactionsFromSupabase);
  const filteredTx = useFilteredTransactions();

  const {
    budgets,
    goals,
    isLoading,
    loadPlan,
    goalCurrentAmount,
    upsertBudget,
    removeBudget,
    createGoal,
  } = usePlanStore();

  const now = new Date();
  const [viewY, setViewY] = useState(now.getFullYear());
  const [viewM, setViewM] = useState(now.getMonth());
  const [expectedIncome, setExpectedIncome] = useState(0);
  const [incomeLoaded, setIncomeLoaded] = useState(false);
  const [upcoming, setUpcoming] = useState<UpcomingPay[]>([]);
  const [recurringRules, setRecurringRules] = useState<PersonalRecurringRule[]>([]);
  const [recurringMonthly, setRecurringMonthly] = useState(0);

  const [budgetSheet, setBudgetSheet] = useState(false);
  const [editBudgetId, setEditBudgetId] = useState<string | null>(null);
  const [budgetCat, setBudgetCat] = useState('');
  const [budgetSub, setBudgetSub] = useState<string | null>(null);
  const [budgetAmount, setBudgetAmount] = useState('');
  const [budgetLabel, setBudgetLabel] = useState('');
  const [budgetEmoji, setBudgetEmoji] = useState('📦');

  const [goalSheet, setGoalSheet] = useState(false);
  const [goalName, setGoalName] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalEmoji, setGoalEmoji] = useState('💰');
  const [goalColor, setGoalColor] = useState('#10B981');
  const [goalDeadline, setGoalDeadline] = useState<Date | null>(null);
  const [showGoalDate, setShowGoalDate] = useState(false);
  const [savingSheet, setSavingSheet] = useState(false);

  const [paySheet, setPaySheet] = useState<UpcomingPay | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payDueDay, setPayDueDay] = useState('15');
  const [payFrequency, setPayFrequency] = useState<PersonalRecurringFrequency>('monthly');

  const reload = useCallback(async () => {
    if (!user?.id) return;
    await loadPlan(user.id);
    const status = await loadQuickSetupStatus(user.id);
    setExpectedIncome(status.expectedMonthlyIncome ?? 0);
    setIncomeLoaded(true);

    const { rules } = await fetchPersonalRecurringRules(user.id);
    const activeExp = (rules ?? []).filter((r) => r.active && r.type === 'expense');
    setRecurringRules(activeExp);
    setRecurringMonthly(
      activeExp.reduce((s, r) => s + recurringToMonthly(r.amount, r.frequency), 0),
    );

    const horizon = new Date();
    horizon.setDate(horizon.getDate() + 30);
    horizon.setHours(23, 59, 59, 999);
    const today0 = startOfDay(now);
    const items: UpcomingPay[] = [];
    const links = await loadPlanPaymentLinks(user.id);

    for (const loan of loans ?? []) {
      const pay = Number(loan.monthlyPayment) || 0;
      if (pay <= 0) continue;
      const cand = nextLoanDueDate(loan, now);
      if (!cand || cand < today0 || cand > horizon) continue;
      const occKey = loanOccurrenceKey(loan.id, toYyyyMmDd(cand));
      if (links.byOccurrence[occKey]) continue;
      items.push({
        id: `loan-${loan.id}`,
        sourceId: loan.id,
        title: loan.name || 'Závazek',
        amount: pay,
        date: cand,
        kind: 'loan',
        emoji: loan.emoji || '💳',
        dueDay: cand.getDate(),
      });
    }

    for (const r of activeExp) {
      const next = new Date(`${r.nextDate}T12:00:00`);
      if (Number.isNaN(next.getTime())) continue;
      if (next < today0 || next > horizon) continue;
      const occKey = recurringOccurrenceKey(r.id, r.nextDate);
      if (links.byOccurrence[occKey]) continue;
      const def = getExpenseCategoryDef(mainCategoryName(r.category, r.subcategory));
      items.push({
        id: `rec-${r.id}`,
        sourceId: r.id,
        title: r.title,
        amount: r.amount,
        date: next,
        kind: 'recurring',
        emoji: def?.icon ?? '🔁',
        category: r.category,
        subcategory: r.subcategory,
        frequency: r.frequency,
        dueDay: next.getDate(),
      });
    }

    items.sort((a, b) => a.date.getTime() - b.date.getTime());
    setUpcoming(items);
  }, [user?.id, loadPlan, loans]);

  const { notifyRefreshed } = useFocusRefresh(reload);
  // První načtení + při změně závazků; focus-refresh pak do 30 s neopakuje (dřív se vše načítalo 2×).
  useEffect(() => {
    notifyRefreshed();
    void reload();
  }, [reload, notifyRefreshed]);

  const monthTx = useMemo(
    () => getMonthTransactions(filteredTx, viewY, viewM + 1),
    [filteredTx, viewY, viewM],
  );

  const actualIncome = useMemo(
    () =>
      monthTx
        .filter((t) => t.type === 'income')
        .reduce((s, t) => s + (Number(t.amount) || 0), 0),
    [monthTx],
  );

  const spentForBudget = useCallback(
    (b: UserBudget) => {
      let sum = 0;
      for (const t of monthTx) {
        if (t.type !== 'expense') continue;
        const n = normalizeCategory(t.category, t.subcategory);
        if (n.category !== b.category) continue;
        if (b.subcategory) {
          if ((n.subcategory ?? null) !== b.subcategory) continue;
        }
        sum += Number(t.amount) || 0;
      }
      return sum;
    },
    [monthTx],
  );

  const totalSpentMonth = useMemo(
    () =>
      monthTx
        .filter((t) => t.type === 'expense')
        .reduce((s, t) => s + (Number(t.amount) || 0), 0),
    [monthTx],
  );

  const loansMonthly = useMemo(
    () => (loans ?? []).reduce((s, l) => s + (Number(l.monthlyPayment) || 0), 0),
    [loans],
  );

  const budgetsSum = useMemo(
    () => budgets.reduce((s, b) => s + (Number(b.amount) || 0), 0),
    [budgets],
  );

  const savingsMonthlySum = useMemo(() => {
    let sum = 0;
    for (const g of goals) {
      const cur = goalCurrentAmount(g.id);
      const need = monthlySavingsNeed(g.targetAmount, cur, g.deadline);
      if (need != null && need > 0) sum += need;
    }
    return sum;
  }, [goals, goalCurrentAmount]);

  const regularPayments = loansMonthly + recurringMonthly;
  const freeMoney =
    expectedIncome > 0
      ? expectedIncome - regularPayments - budgetsSum - savingsMonthlySum
      : null;

  const daysInMonth = new Date(viewY, viewM + 1, 0).getDate();
  const isCurrentMonth = viewY === now.getFullYear() && viewM === now.getMonth();
  const daysLeft = isCurrentMonth ? Math.max(0, daysInMonth - now.getDate()) : 0;
  const planSpendCap =
    expectedIncome > 0 ? expectedIncome - regularPayments - savingsMonthlySum : budgetsSum;

  const sortedGoals = useMemo(() => {
    const active = [...goals];
    active.sort((a, b) => {
      if (a.kind === 'emergency_fund' && b.kind !== 'emergency_fund') return -1;
      if (b.kind === 'emergency_fund' && a.kind !== 'emergency_fund') return 1;
      return 0;
    });
    return active;
  }, [goals]);

  const shiftMonth = (delta: number) => {
    const d = new Date(viewY, viewM + delta, 1);
    setViewY(d.getFullYear());
    setViewM(d.getMonth());
  };

  const openAddBudget = () => {
    if (!isHouseholdPremium && budgets.length >= FREE_BUDGET_LIMIT) {
      openPaywall(router, 'budgets');
      return;
    }
    setEditBudgetId(null);
    setBudgetCat('');
    setBudgetSub(null);
    setBudgetAmount('');
    setBudgetLabel('');
    setBudgetEmoji('📦');
    setBudgetSheet(true);
  };

  const openEditBudget = (b: UserBudget) => {
    setEditBudgetId(b.id);
    setBudgetCat(b.category);
    setBudgetSub(b.subcategory);
    setBudgetAmount(formatKčGrouped(String(Math.round(b.amount))));
    setBudgetLabel(b.label ?? '');
    setBudgetEmoji(b.emoji || getExpenseCategoryDef(b.category)?.icon || '📦');
    setBudgetSheet(true);
  };

  // Při změně kategorie v add módu doplň výchozí emoji
  useEffect(() => {
    if (!budgetSheet || editBudgetId) return;
    if (!budgetCat) return;
    const def = getExpenseCategoryDef(budgetCat);
    if (def?.icon) setBudgetEmoji((prev) => (prev === '📦' || !prev ? def.icon : prev));
  }, [budgetCat, budgetSheet, editBudgetId]);

  const saveBudget = async () => {
    if (!user?.id) return;
    const n = normalizeCategory(budgetCat, budgetSub);
    const amt = parseMoneyInput(budgetAmount);
    if (!n.category) {
      Alert.alert('Chybí kategorie', 'Vyber kategorii rozpočtu.');
      return;
    }
    if (amt == null || amt <= 0) {
      Alert.alert('Neplatná částka', 'Zadej kladný měsíční limit.');
      return;
    }
    setSavingSheet(true);
    const { error } = await upsertBudget({
      userId: user.id,
      id: editBudgetId ?? undefined,
      category: n.category,
      subcategory: n.subcategory,
      amount: amt,
      label: budgetLabel.trim() || null,
      emoji: budgetEmoji.trim() || null,
    });
    setSavingSheet(false);
    if (error) {
      showToast({ type: 'error', message: 'Nepodařilo se uložit rozpočet' });
      return;
    }
    setBudgetSheet(false);
    showToast({ type: 'success', message: 'Rozpočet uložen' });
    if (!editBudgetId) setTimeout(() => void askNotificationsInContext(), 1000);
  };

  const deleteBudgetFromSheet = () => {
    if (!editBudgetId || !user?.id) return;
    const label = budgetLabel.trim() || budgetCat || 'rozpočet';
    Alert.alert('Smazat rozpočet?', label, [
      { text: 'Zrušit', style: 'cancel' },
      {
        text: 'Smazat',
        style: 'destructive',
        onPress: () => {
          void removeBudget(user.id, editBudgetId).then(({ error }) => {
            if (error) showToast({ type: 'error', message: 'Smazání selhalo' });
            else {
              setBudgetSheet(false);
              showToast({ type: 'success', message: 'Rozpočet smazán' });
            }
          });
        },
      },
    ]);
  };

  const saveGoal = async () => {
    if (!user?.id) return;
    const amt = parseMoneyInput(goalTarget);
    if (!goalName.trim()) {
      Alert.alert('Chybí název', 'Zadej název cíle.');
      return;
    }
    if (amt == null || amt <= 0) {
      Alert.alert('Neplatná částka', 'Zadej cílovou částku.');
      return;
    }
    setSavingSheet(true);
    const { error } = await createGoal({
      userId: user.id,
      name: goalName.trim(),
      emoji: goalEmoji,
      color: goalColor,
      targetAmount: amt,
      deadline: goalDeadline ? toYyyyMmDd(goalDeadline) : null,
    });
    setSavingSheet(false);
    if (error) {
      showToast({ type: 'error', message: 'Nepodařilo se vytvořit cíl' });
      return;
    }
    setGoalSheet(false);
    setGoalName('');
    setGoalTarget('');
    setGoalDeadline(null);
    showToast({ type: 'success', message: 'Cíl vytvořen' });
  };

  const openPaySheet = (p: UpcomingPay) => {
    setPaySheet(p);
    setPayAmount(formatKčGrouped(String(Math.round(p.amount))));
    setPayDueDay(String(p.dueDay ?? p.date.getDate()));
    setPayFrequency(p.frequency ?? 'monthly');
  };

  const savePayEdits = async () => {
    if (!user?.id || !paySheet) return;
    const amt = parseMoneyInput(payAmount);
    if (amt == null || amt <= 0) {
      Alert.alert('Neplatná částka');
      return;
    }
    const day = Math.min(31, Math.max(1, parseInt(payDueDay, 10) || 15));
    setSavingSheet(true);
    try {
      if (paySheet.kind === 'loan') {
        const loan = loans.find((l) => l.id === paySheet.sourceId);
        if (loan) {
          const start =
            loan.startDate instanceof Date ? loan.startDate : new Date(loan.startDate as string);
          const nextStart = Number.isFinite(start.getTime())
            ? new Date(start.getFullYear(), start.getMonth(), day, 12)
            : new Date(now.getFullYear(), now.getMonth(), day, 12);
          updateLoan(loan.id, { monthlyPayment: amt, startDate: nextStart });
        }
      } else {
        const rule = recurringRules.find((r) => r.id === paySheet.sourceId);
        const base = rule?.nextDate ?? toYyyyMmDd(paySheet.date);
        const [y, m] = base.split('-').map(Number);
        const last = new Date(y!, m! - 1 + 1, 0).getDate();
        const nextDate = `${y}-${String(m).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
        const freq = normalizeFrequency(payFrequency);
        await updatePersonalRecurringRule(user.id, paySheet.sourceId, {
          amount: amt,
          nextDate,
          frequency: freq,
        });
      }
      setPaySheet(null);
      showToast({ type: 'success', message: 'Platba upravena' });
      await reload();
    } catch {
      showToast({ type: 'error', message: 'Uložení selhalo' });
    } finally {
      setSavingSheet(false);
    }
  };

  const markPayPaid = async () => {
    if (!user?.id || !paySheet) return;
    setSavingSheet(true);
    try {
      const occKey =
        paySheet.kind === 'loan'
          ? loanOccurrenceKey(paySheet.sourceId, toYyyyMmDd(paySheet.date))
          : recurringOccurrenceKey(paySheet.sourceId, toYyyyMmDd(paySheet.date));
      if (paySheet.kind === 'loan') {
        markLoanPaymentPaid(paySheet.sourceId);
        await recordManualPlanPaymentLink(user.id, occKey, null);
        showToast({ type: 'success', message: 'Splátka označena jako zaplacená' });
      } else {
        const { error } = await markPersonalRecurringPaid(user.id, paySheet.sourceId);
        if (error) throw error;
        await recordManualPlanPaymentLink(user.id, occKey, null);
        await loadTransactionsFromSupabase();
        showToast({ type: 'success', message: 'Platba zaznamenána' });
      }
      setPaySheet(null);
      await reload();
    } catch {
      showToast({ type: 'error', message: 'Nepodařilo se označit' });
    } finally {
      setSavingSheet(false);
    }
  };

  const cancelPay = async () => {
    if (!user?.id || !paySheet) return;
    if (paySheet.kind === 'loan') {
      setPaySheet(null);
      return;
    }
    Alert.alert('Zrušit platbu?', 'Tento výskyt se přeskočí (bez transakce).', [
      { text: 'Zpět', style: 'cancel' },
      {
        text: 'Přeskočit',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setSavingSheet(true);
            const { error } = await skipPersonalRecurringOccurrence(user.id, paySheet.sourceId);
            setSavingSheet(false);
            if (error) {
              showToast({ type: 'error', message: 'Přeskočení selhalo' });
              return;
            }
            setPaySheet(null);
            showToast({ type: 'success', message: 'Platba přeskočena' });
            await reload();
          })();
        },
      },
    ]);
  };

  const cardBg = isDark ? '#1F2937' : '#FFFFFF';
  const muted = colors.textSecondary;

  const renderGoalCard = (g: (typeof sortedGoals)[0], wide: boolean) => {
    const cur = goalCurrentAmount(g.id);
    const pct = g.targetAmount > 0 ? (cur / g.targetAmount) * 100 : 0;
    const need = monthlySavingsNeed(g.targetAmount, cur, g.deadline);
    return (
      <TouchableOpacity
        key={g.id}
        style={[
          styles.goalCard,
          wide && styles.goalCardWide,
          { backgroundColor: cardBg, width: wide ? '100%' : undefined },
        ]}
        onPress={() => router.push({ pathname: '/plan-goal-detail', params: { id: g.id } })}
      >
        {g.kind === 'emergency_fund' ? (
          <View style={styles.reserveBadge}>
            <Text style={styles.reserveBadgeText}>Rezerva</Text>
          </View>
        ) : null}
        {wide ? (
          <View style={styles.goalWideRow}>
            <Text style={styles.goalEmoji}>{g.emoji}</Text>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[styles.goalName, { color: colors.text, textAlign: 'left', minHeight: 0 }]} numberOfLines={2}>
                {g.name}
              </Text>
              <Text style={[styles.goalAmounts, { color: muted, textAlign: 'left' }]}>
                {formatKc(cur)} / {formatKc(g.targetAmount)}
              </Text>
              {need != null && need > 0 ? (
                <Text style={[styles.goalNeed, { color: colors.primary, textAlign: 'left' }]}>
                  Odkládej {formatKc(need)} měsíčně
                </Text>
              ) : null}
            </View>
            <CircularProgress
              pct={pct}
              size={64}
              stroke={6}
              trackColor={colors.muted}
              progressColor={g.color}
              centerColor={colors.text}
            />
          </View>
        ) : (
          <>
            <Text style={styles.goalEmoji}>{g.emoji}</Text>
            <Text style={[styles.goalName, { color: colors.text }]} numberOfLines={2}>
              {g.name}
            </Text>
            <CircularProgress
              pct={pct}
              size={64}
              stroke={6}
              trackColor={colors.muted}
              progressColor={g.color}
              centerColor={colors.text}
            />
            <Text style={[styles.goalAmounts, { color: muted }]}>
              {formatKc(cur)} / {formatKc(g.targetAmount)}
            </Text>
            {need != null && need > 0 ? (
              <Text style={[styles.goalNeed, { color: colors.primary }]}>
                Odkládej {formatKc(need)} měsíčně
              </Text>
            ) : null}
            {g.deadline ? (
              <Text style={[styles.goalDeadline, { color: muted }]}>
                do{' '}
                {new Date(`${g.deadline}T12:00:00`).toLocaleDateString('cs-CZ', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </Text>
            ) : null}
          </>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={[colors.gradientStart, colors.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.header, { paddingTop: insets.top + 12 }]}
        >
          <Text style={styles.headerTitle}>Plán</Text>
          <Text style={styles.headerSub}>Příjem, rozpočty a spoření na jednom místě</Text>
        </LinearGradient>

        <View style={styles.scrollInner}>
          {/* Měsíční plán */}
          <View style={[styles.card, { backgroundColor: cardBg }]}>
            <View style={styles.monthRow}>
              <TouchableOpacity onPress={() => shiftMonth(-1)} hitSlop={12}>
                <ChevronLeft color={colors.primary} size={24} />
              </TouchableOpacity>
              <Text style={[styles.monthLabel, { color: colors.text }]}>{ymLabel(viewY, viewM)}</Text>
              <TouchableOpacity onPress={() => shiftMonth(1)} hitSlop={12}>
                <ChevronRight color={colors.primary} size={24} />
              </TouchableOpacity>
            </View>

            {!incomeLoaded ? (
              <View style={{ paddingVertical: 28, alignItems: 'center' }}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : expectedIncome <= 0 ? (
              <EmptyState
                title="Nastav příjem"
                description="Bez očekávaného příjmu neumíme spočítat volné peníze."
                icon={<Wallet color={colors.primary} size={28} />}
                actionLabel="Nastav příjem"
                onAction={() => router.push('/quick-setup')}
              />
            ) : (
              <>
                <PlanLine
                  label="Příjem plán"
                  value={formatKc(expectedIncome)}
                  hint={actualIncome > 0 ? `reálně ${formatKc(actualIncome)}` : undefined}
                  color={colors.text}
                  muted={muted}
                />
                <PlanLine label="− Pravidelné platby" value={formatKc(regularPayments)} color={colors.text} muted={muted} />
                <PlanLine label="− Rozpočty" value={formatKc(budgetsSum)} color={colors.text} muted={muted} />
                <PlanLine label="− Spoření" value={formatKc(savingsMonthlySum)} color={colors.text} muted={muted} />
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <PlanLine
                  label="= Volné peníze"
                  value={formatKc(freeMoney ?? 0)}
                  color={(freeMoney ?? 0) >= 0 ? '#10B981' : '#EF4444'}
                  muted={muted}
                  bold
                />
                {planSpendCap > 0 ? (
                  <Text style={[styles.progressHint, { color: muted }]}>
                    Utraceno {formatKc(totalSpentMonth)} z {formatKc(planSpendCap)}
                    {isCurrentMonth && daysLeft > 0 ? ` · ${formatZbyvaDni(daysLeft)}` : ''}
                  </Text>
                ) : null}
              </>
            )}
          </View>

          {/* Rozpočty */}
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Rozpočty</Text>
          <>
            {budgets.length === 0 ? (
              <EmptyState
                title="Žádné rozpočty"
                description="Nastav limity kategorií — jídlo, doprava, nákupy…"
                icon={<Target color={colors.primary} size={28} />}
                actionLabel="Přidat rozpočet"
                onAction={openAddBudget}
              />
            ) : (
              <View style={[styles.card, { backgroundColor: cardBg, paddingVertical: 8 }]}>
                {budgets.map((b) => {
                  const spent = spentForBudget(b);
                  const pct = b.amount > 0 ? (spent / b.amount) * 100 : 0;
                  const bar = budgetBarColor(pct);
                  const remain = b.amount - spent;
                  return (
                    <TouchableOpacity
                      key={b.id}
                      style={styles.budgetRow}
                      onPress={() => openEditBudget(b)}
                      activeOpacity={0.75}
                    >
                      <Text style={styles.budgetEmoji}>{budgetDisplayEmoji(b)}</Text>
                      <View style={{ flex: 1 }}>
                        <View style={styles.budgetTitleRow}>
                          <Text style={[styles.budgetCat, { color: colors.text }]} numberOfLines={1}>
                            {budgetDisplayLabel(b)}
                          </Text>
                          <Text style={[styles.budgetAmounts, { color: muted }]}>
                            {formatKc(spent)} / {formatKc(b.amount)}
                          </Text>
                        </View>
                        <View style={[styles.barBg, { backgroundColor: colors.muted }]}>
                          <View
                            style={[
                              styles.barFill,
                              { width: `${Math.min(100, pct)}%`, backgroundColor: bar },
                            ]}
                          />
                        </View>
                        <Text
                          style={[
                            styles.budgetRemain,
                            { color: remain < 0 ? '#EF4444' : muted },
                          ]}
                        >
                          {remain < 0
                            ? `přečerpáno o ${formatKc(Math.abs(remain))}`
                            : `zbývá ${formatKc(remain)}`}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity style={styles.addRow} onPress={openAddBudget}>
                  <Plus color={colors.primary} size={18} />
                  <Text style={[styles.addRowText, { color: colors.primary }]}>Přidat rozpočet</Text>
                </TouchableOpacity>
                {!isHouseholdPremium ? (
                  <Text style={{ color: muted, fontSize: 12, textAlign: 'center', paddingBottom: 8 }}>
                    {`Zdarma ${Math.min(budgets.length, FREE_BUDGET_LIMIT)} z ${FREE_BUDGET_LIMIT} rozpočtů · neomezeně a s upozorněním v Premium`}
                  </Text>
                ) : null}
              </View>
            )}
          </>

          {/* Spořicí cíle */}
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Spořicí cíle</Text>
          <PremiumGate feature="financial_goals">
            {sortedGoals.length === 0 ? (
              <EmptyState
                title="Žádné cíle"
                description="Rezerva, dovolená, nové auto — spoř s jasným cílem."
                icon={<Target color={colors.primary} size={28} />}
                actionLabel="Nový cíl"
                onAction={() => setGoalSheet(true)}
              />
            ) : (
              <>
                {sortedGoals.length === 1 ? (
                  renderGoalCard(sortedGoals[0]!, true)
                ) : (
                  <View style={styles.goalsGrid}>
                    {sortedGoals.map((g) => (
                      <View key={g.id} style={styles.goalsGridItem}>
                        {renderGoalCard(g, false)}
                      </View>
                    ))}
                  </View>
                )}
                <TouchableOpacity style={[styles.addRow, { marginTop: 8 }]} onPress={() => setGoalSheet(true)}>
                  <Plus color={colors.primary} size={18} />
                  <Text style={[styles.addRowText, { color: colors.primary }]}>Nový cíl</Text>
                </TouchableOpacity>
              </>
            )}
          </PremiumGate>

          {/* Co tě čeká */}
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Co tě čeká</Text>
          <Text style={[styles.sectionSub, { color: muted }]}>
            Pravidelné platby v příštích 30 dnech
          </Text>
          <View style={[styles.card, { backgroundColor: cardBg, paddingVertical: 4 }]}>
            {upcoming.length === 0 ? (
              <Text style={[styles.emptyUpcoming, { color: muted }]}>
                Žádné platby v příštích 30 dnech
              </Text>
            ) : (
              upcoming.map((p) => {
                const dLeft = daysUntil(p.date, now);
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={styles.payRow}
                    onPress={() => openPaySheet(p)}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.payIcon, { backgroundColor: colors.muted }]}>
                      <Text style={{ fontSize: 18 }}>{p.emoji}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.payTitle, { color: colors.text }]} numberOfLines={1}>
                        {p.title}
                      </Text>
                      <Text style={{ color: muted, fontSize: 12 }}>
                        {formatZaDni(dLeft)}
                        <Text style={{ color: muted }}>
                          {' · '}
                          {p.date.toLocaleDateString('cs-CZ', {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </Text>
                      </Text>
                    </View>
                    <Text style={[styles.payAmount, { color: colors.text }]}>{formatKc(p.amount)}</Text>
                  </TouchableOpacity>
                );
              })
            )}
            <TouchableOpacity
              style={styles.allLink}
              onPress={() => router.push('/personal-recurring')}
            >
              <Text style={{ color: colors.primary, fontWeight: '700' }}>
                Všechny pravidelné platby
              </Text>
              <ChevronRightIcon color={colors.primary} size={18} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.allLink, { marginTop: 0 }]} onPress={() => router.push('/loans')}>
              <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 13 }}>
                Závazky a úvěry
              </Text>
              <ChevronRightIcon color={colors.primary} size={16} />
            </TouchableOpacity>
          </View>

          {isLoading ? <ActivityIndicator style={{ marginTop: 16 }} color={colors.primary} /> : null}
        </View>
      </ScrollView>

      {/* Budget sheet */}
      <Modal visible={budgetSheet} transparent animationType="slide" onRequestClose={() => setBudgetSheet(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => setBudgetSheet(false)} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView
              style={[styles.sheet, { backgroundColor: colors.background, maxHeight: '90%' }]}
              contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={[styles.sheetTitle, { color: colors.text }]}>
                {editBudgetId ? 'Upravit rozpočet' : 'Přidat rozpočet'}
              </Text>
              <Text style={[styles.sheetLabel, { color: muted }]}>Emoji</Text>
              <View style={styles.emojiGrid}>
                {BUDGET_EMOJI_OPTIONS.map((e, i) => (
                  <TouchableOpacity
                    key={`${e}-${i}`}
                    style={[
                      styles.emojiBtn,
                      budgetEmoji === e && {
                        borderColor: colors.primary,
                        backgroundColor: colors.muted,
                      },
                    ]}
                    onPress={() => setBudgetEmoji(e)}
                  >
                    <Text style={{ fontSize: 22 }}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={[styles.sheetLabel, { color: muted }]}>Název</Text>
              <TextInput
                value={budgetLabel}
                onChangeText={setBudgetLabel}
                placeholder={budgetCat || 'Název kategorie'}
                placeholderTextColor={muted}
                style={[
                  styles.sheetInput,
                  { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
                ]}
              />
              <Text style={[styles.sheetLabel, { color: muted }]}>Kategorie</Text>
              <CategoryPicker
                type="expense"
                selectedCategory={budgetCat}
                selectedSubcategory={budgetSub}
                description=""
                onChange={(c, s) => {
                  setBudgetCat(c);
                  setBudgetSub(s);
                }}
                layout="chips"
              />
              <Text style={[styles.sheetLabel, { color: muted }]}>Měsíční limit</Text>
              <TextInput
                value={budgetAmount}
                onChangeText={(t) => setBudgetAmount(formatKčGrouped(t))}
                keyboardType="number-pad"
                placeholder="5 000"
                placeholderTextColor={muted}
                style={[
                  styles.sheetInput,
                  { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
                ]}
              />
              <TouchableOpacity
                style={[styles.sheetSave, { backgroundColor: colors.primary, opacity: savingSheet ? 0.7 : 1 }]}
                onPress={() => void saveBudget()}
                disabled={savingSheet}
              >
                <Text style={styles.sheetSaveText}>{savingSheet ? '…' : 'Uložit'}</Text>
              </TouchableOpacity>
              {editBudgetId ? (
                <TouchableOpacity style={styles.deleteBtn} onPress={deleteBudgetFromSheet}>
                  <Text style={{ color: '#EF4444', fontWeight: '700' }}>Smazat rozpočet</Text>
                </TouchableOpacity>
              ) : null}
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Goal sheet */}
      <Modal visible={goalSheet} transparent animationType="slide" onRequestClose={() => setGoalSheet(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => setGoalSheet(false)} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView
              style={[styles.sheet, { backgroundColor: colors.background, maxHeight: '88%' }]}
              contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={[styles.sheetTitle, { color: colors.text }]}>Nový cíl</Text>
              <Text style={[styles.sheetLabel, { color: muted }]}>Emoji</Text>
              <View style={styles.emojiGrid}>
                {SAVINGS_GOAL_EMOJI_OPTIONS.map((e, i) => (
                  <TouchableOpacity
                    key={`${e}-${i}`}
                    style={[
                      styles.emojiBtn,
                      goalEmoji === e && { borderColor: colors.primary, backgroundColor: colors.muted },
                    ]}
                    onPress={() => setGoalEmoji(e)}
                  >
                    <Text style={{ fontSize: 22 }}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={[styles.sheetLabel, { color: muted }]}>Barva</Text>
              <View style={styles.emojiGrid}>
                {SAVINGS_GOAL_COLOR_OPTIONS.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.colorBtn, { backgroundColor: c }, goalColor === c && styles.colorBtnActive]}
                    onPress={() => setGoalColor(c)}
                  />
                ))}
              </View>
              <Text style={[styles.sheetLabel, { color: muted }]}>Název</Text>
              <TextInput
                value={goalName}
                onChangeText={setGoalName}
                placeholder="Dovolená"
                placeholderTextColor={muted}
                style={[
                  styles.sheetInput,
                  { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
                ]}
              />
              <Text style={[styles.sheetLabel, { color: muted }]}>Cílová částka</Text>
              <TextInput
                value={goalTarget}
                onChangeText={(t) => setGoalTarget(formatKčGrouped(t))}
                keyboardType="number-pad"
                placeholder="50 000"
                placeholderTextColor={muted}
                style={[
                  styles.sheetInput,
                  { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
                ]}
              />
              <Text style={[styles.sheetLabel, { color: muted }]}>Deadline (nepovinné)</Text>
              <TouchableOpacity
                style={[
                  styles.sheetInput,
                  { borderColor: colors.border, backgroundColor: colors.surface, justifyContent: 'center' },
                ]}
                onPress={() => setShowGoalDate(true)}
              >
                <Text style={{ color: goalDeadline ? colors.text : muted }}>
                  {goalDeadline ? goalDeadline.toLocaleDateString('cs-CZ') : 'Bez data'}
                </Text>
              </TouchableOpacity>
              {goalDeadline ? (
                <TouchableOpacity onPress={() => setGoalDeadline(null)}>
                  <Text style={{ color: colors.primary, marginBottom: 8 }}>Odstranit datum</Text>
                </TouchableOpacity>
              ) : null}
              {showGoalDate ? (
                <DateTimePicker
                  value={goalDeadline ?? new Date()}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  minimumDate={new Date()}
                  onChange={(_e, d) => {
                    if (Platform.OS === 'android') setShowGoalDate(false);
                    if (d) setGoalDeadline(d);
                  }}
                />
              ) : null}
              <TouchableOpacity
                style={[styles.sheetSave, { backgroundColor: colors.primary, opacity: savingSheet ? 0.7 : 1 }]}
                onPress={() => void saveGoal()}
                disabled={savingSheet}
              >
                <Text style={styles.sheetSaveText}>{savingSheet ? '…' : 'Vytvořit'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Upcoming payment sheet */}
      <Modal visible={paySheet != null} transparent animationType="slide" onRequestClose={() => setPaySheet(null)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => setPaySheet(null)} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View
              style={[
                styles.sheet,
                { backgroundColor: colors.background, paddingBottom: insets.bottom + 20 },
              ]}
            >
              <Text style={[styles.sheetTitle, { color: colors.text }]} numberOfLines={1}>
                {paySheet?.emoji} {paySheet?.title}
              </Text>
              <Text style={[styles.sheetLabel, { color: muted }]}>Částka</Text>
              <TextInput
                value={payAmount}
                onChangeText={(t) => setPayAmount(formatKčGrouped(t))}
                keyboardType="number-pad"
                style={[
                  styles.sheetInput,
                  { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
                ]}
              />
              <Text style={[styles.sheetLabel, { color: muted }]}>Den v měsíci</Text>
              <TextInput
                value={payDueDay}
                onChangeText={setPayDueDay}
                keyboardType="number-pad"
                style={[
                  styles.sheetInput,
                  { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
                ]}
              />
              {paySheet?.kind === 'recurring' ? (
                <RecurringFrequencyField
                  value={payFrequency}
                  onChange={(v) => {
                    if (v) setPayFrequency(v);
                  }}
                />
              ) : (
                <Text style={{ color: muted, fontSize: 13, marginTop: 8 }}>Frekvence: měsíčně</Text>
              )}
              <TouchableOpacity
                style={[styles.sheetSave, { backgroundColor: colors.primary, opacity: savingSheet ? 0.7 : 1 }]}
                onPress={() => void savePayEdits()}
                disabled={savingSheet}
              >
                <Text style={styles.sheetSaveText}>Uložit změny</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sheetSave, { backgroundColor: '#10B981', opacity: savingSheet ? 0.7 : 1 }]}
                onPress={() => void markPayPaid()}
                disabled={savingSheet}
              >
                <Text style={styles.sheetSaveText}>Zaplaceno ✓</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteBtn} onPress={() => void cancelPay()}>
                <Text style={{ color: '#EF4444', fontWeight: '700' }}>Zrušit platbu</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

function PlanLine({
  label,
  value,
  hint,
  color,
  muted,
  bold,
}: {
  label: string;
  value: string;
  hint?: string;
  color: string;
  muted: string;
  bold?: boolean;
}) {
  return (
    <View style={styles.planLine}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.planLineLabel, { color: muted, fontWeight: bold ? '700' : '500' }]}>
          {label}
        </Text>
        {hint ? <Text style={{ color: muted, fontSize: 12 }}>{hint}</Text> : null}
      </View>
      <Text style={[styles.planLineValue, { color, fontWeight: bold ? '800' : '700' }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  headerTitle: { color: '#fff', fontSize: 28, fontWeight: '800' },
  headerSub: { color: 'rgba(255,255,255,0.85)', fontSize: 14, marginTop: 4 },
  scrollInner: { padding: 16, gap: 8 },
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  monthLabel: { fontSize: 17, fontWeight: '700' },
  planLine: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  planLineLabel: { fontSize: 14 },
  planLineValue: { fontSize: 16 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 8 },
  progressHint: { fontSize: 13, marginTop: 10, fontWeight: '500' },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 12,
    marginBottom: 4,
  },
  sectionSub: { fontSize: 13, marginBottom: 8 },
  budgetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  budgetEmoji: { fontSize: 22, width: 28, textAlign: 'center' },
  budgetTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 6,
  },
  budgetCat: { fontSize: 15, fontWeight: '600', flex: 1 },
  budgetAmounts: { fontSize: 12, fontWeight: '600' },
  barBg: { height: 6, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
  budgetRemain: { fontSize: 12, marginTop: 4, fontWeight: '600' },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  addRowText: { fontSize: 15, fontWeight: '700' },
  goalsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  goalsGridItem: {
    width: '48%',
    flexGrow: 1,
    maxWidth: '48%',
  },
  goalCard: {
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  goalCardWide: {
    alignItems: 'stretch',
  },
  goalWideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  reserveBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(16,185,129,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    zIndex: 1,
  },
  reserveBadgeText: { color: '#10B981', fontSize: 10, fontWeight: '800' },
  goalEmoji: { fontSize: 32, marginTop: 4 },
  goalName: { fontSize: 14, fontWeight: '700', textAlign: 'center', minHeight: 36 },
  ringCenter: { alignItems: 'center', justifyContent: 'center' },
  ringPct: { fontSize: 13, fontWeight: '800' },
  goalAmounts: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  goalNeed: { fontSize: 11, fontWeight: '700', textAlign: 'center' },
  goalDeadline: { fontSize: 11, textAlign: 'center' },
  payRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  payIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payTitle: { fontSize: 15, fontWeight: '600' },
  payAmount: { fontSize: 15, fontWeight: '700' },
  emptyUpcoming: { textAlign: 'center', paddingVertical: 20, fontSize: 14 },
  allLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 12,
  },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', marginBottom: 12 },
  sheetLabel: { fontSize: 13, fontWeight: '600', marginTop: 10, marginBottom: 6 },
  sheetInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  sheetSave: {
    marginTop: 12,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  sheetSaveText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  deleteBtn: { alignItems: 'center', paddingVertical: 14 },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  emojiBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorBtn: { width: 32, height: 32, borderRadius: 16 },
  colorBtnActive: { borderWidth: 3, borderColor: '#fff', transform: [{ scale: 1.1 }] },
});
