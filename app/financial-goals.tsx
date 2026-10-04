import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useDraggableList } from '@/lib/use-draggable-list';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  Switch,
  Animated,
  Pressable,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Target,
  Plus,
  X,
  Edit3,
  Trash2,
  DollarSign,
  Calendar,
  TrendingUp,
  PiggyBank,
  Car,
  Home,
  Utensils,
  ShoppingBag,
  Fuel,
  RefreshCcw,
  Zap,
  Smartphone,
  Sparkles,
  PenLine,
  ChevronLeft,
} from 'lucide-react-native';
import { Stack } from 'expo-router';
import { useFocusRefresh } from '@/hooks/useFocusRefresh';
import { AsyncButton } from '@/components/AsyncButton';
import { useAsyncAction } from '@/hooks/use-async-action';
import { safePush } from '@/lib/safe-navigate';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useFinanceStore,
  FinancialGoal,
  RecurrenceFrequency,
  isExpenseForReport,
  type Transaction,
} from '@/store/finance-store';
import { useSettingsStore } from '@/store/settings-store';
import { useLanguageStore, type TRANSLATIONS } from '@/store/language-store';
import { useTheme } from '@/hooks/use-theme';
import { SwipeableTransactionRow } from '@/components/SwipeableTransactionRow';
import { compareTxDateDesc, transactionDateYmd } from '@/lib/transaction-date';
import {
  useSavingsGoalsStore,
  getGoalCurrentAmount,
  type SavingsGoal,
} from '@/store/savings-goals-store';
import { daysUntilDeadline } from '@/lib/savings-goal-utils';
import { BackButton } from '@/components/BackButton';
import { EmptyState } from '@/components/EmptyState';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';
import { parseMoneyInput } from '@/lib/parse-money-input';

type TranslateFn = (key: keyof typeof TRANSLATIONS.cs, params?: Record<string, string | number>) => string;


const FINANCIAL_GOAL_ORDER_KEY = 'financial_goal_order';

const GOAL_CATEGORIES = {
  'Bydlení': { icon: Home, color: '#8B5CF6', emoji: '🏠' },
  'Jídlo a nápoje': { icon: Utensils, color: '#EF4444', emoji: '🍽️' },
  'Doprava': { icon: Car, color: '#10B981', emoji: '🚗' },
  'Benzín': { icon: Fuel, color: '#F59E0B', emoji: '⛽' },
  'Nákupy': { icon: ShoppingBag, color: '#EC4899', emoji: '🛍️' },
  'Telefon/Internet': { icon: Smartphone, color: '#3B82F6', emoji: '📱' },
  'Energie': { icon: Zap, color: '#FBBF24', emoji: '⚡' },
  'Spoření': { icon: PiggyBank, color: '#06B6D4', emoji: '💰' },
  'Investice': { icon: TrendingUp, color: '#8B5CF6', emoji: '📈' },
  'Ostatní': { icon: Target, color: '#6B7280', emoji: '🎯' },
};

type InspirationTemplate = {
  id: string;
  emoji: string;
  titleKey: keyof typeof TRANSLATIONS.cs;
  descKey: keyof typeof TRANSLATIONS.cs;
  category: keyof typeof GOAL_CATEGORIES;
  type: 'saving' | 'spending_limit';
};

const SAVING_INSPIRATION_TEMPLATES: InspirationTemplate[] = [
  {
    id: 'reserve',
    emoji: '💰',
    titleKey: 'fgTplReserveTitle',
    descKey: 'fgTplReserveDesc',
    category: 'Spoření',
    type: 'saving',
  },
  {
    id: 'vacation',
    emoji: '✈️',
    titleKey: 'fgTplVacationTitle',
    descKey: 'fgTplVacationDesc',
    category: 'Ostatní',
    type: 'saving',
  },
  {
    id: 'renovation',
    emoji: '🏠',
    titleKey: 'fgTplRenovationTitle',
    descKey: 'fgTplRenovationDesc',
    category: 'Bydlení',
    type: 'saving',
  },
  {
    id: 'car',
    emoji: '🚗',
    titleKey: 'fgTplCarTitle',
    descKey: 'fgTplCarDesc',
    category: 'Doprava',
    type: 'saving',
  },
  {
    id: 'life-event',
    emoji: '💍',
    titleKey: 'fgTplLifeEventTitle',
    descKey: 'fgTplLifeEventDesc',
    category: 'Ostatní',
    type: 'saving',
  },
];

const LIMIT_INSPIRATION_TEMPLATES: InspirationTemplate[] = [
  {
    id: 'food',
    emoji: '🛒',
    titleKey: 'fgTplFoodTitle',
    descKey: 'fgTplFoodDesc',
    category: 'Jídlo a nápoje',
    type: 'spending_limit',
  },
  {
    id: 'energy',
    emoji: '⚡',
    titleKey: 'fgTplEnergyTitle',
    descKey: 'fgTplEnergyDesc',
    category: 'Energie',
    type: 'spending_limit',
  },
  {
    id: 'transport',
    emoji: '🚇',
    titleKey: 'fgTplTransportTitle',
    descKey: 'fgTplTransportDesc',
    category: 'Doprava',
    type: 'spending_limit',
  },
  {
    id: 'fun',
    emoji: '🎉',
    titleKey: 'fgTplFunTitle',
    descKey: 'fgTplFunDesc',
    category: 'Ostatní',
    type: 'spending_limit',
  },
  {
    id: 'clothing',
    emoji: '👗',
    titleKey: 'fgTplClothingTitle',
    descKey: 'fgTplClothingDesc',
    category: 'Nákupy',
    type: 'spending_limit',
  },
];

type AddPickerSheet = 'chooser' | 'templates';


function translateGoalCategory(cat: string, t: TranslateFn): string {
  const keyMap: Record<string, keyof typeof TRANSLATIONS.cs> = {
    Bydlení: 'fgCatHousing',
    'Jídlo a nápoje': 'fgCatFoodDrinks',
    Doprava: 'transport',
    Benzín: 'fgCatGas',
    Nákupy: 'shopping',
    'Telefon/Internet': 'fgCatPhoneInternet',
    Energie: 'hhCatEnergy',
    Spoření: 'fgCatSavings',
    Investice: 'fgCatInvestments',
    Ostatní: 'other',
  };
  return t(keyMap[cat] ?? 'other');
}

function fgTransactionsWord(count: number, t: TranslateFn): string {
  const n100 = count % 100;
  if (count === 1) return t('fgTxOne');
  if (n100 >= 12 && n100 <= 14) return t('fgTxMany');
  const n10 = count % 10;
  if (n10 >= 2 && n10 <= 4) return t('fgTxFew');
  return t('fgTxMany');
}

function formatKč(amount: number): string {
  return `${Math.round(amount).toLocaleString('cs-CZ')} Kč`;
}

/** 0–70 % zelená, 70–90 % oranžová, 90–100 % červená */
function getProgressColor(progressPercent: number): string {
  const p = Math.min(Math.max(progressPercent, 0), 100);
  if (p < 70) return '#22C55E';
  if (p < 90) return '#F97316';
  return '#EF4444';
}

/** Výdaje v kategorii za aktuální kalendářní měsíc, nejnovější první */
function getTransactionsForCategoryThisMonth(
  transactions: Transaction[],
  category: string,
): Transaction[] {
  const now = new Date();
  const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return transactions
    .filter((t) => {
      if (!isExpenseForReport(t) || t.category !== category) return false;
      const txDate = transactionDateYmd(t.date);
      return txDate.startsWith(prefix);
    })
    .sort(compareTxDateDesc);
}

export default function FinancialGoalsScreen() {
  const { t, language } = useLanguageStore();
  const { colors } = useTheme();
  const finance = useFinanceStore();
  const { getCurrentCurrency } = useSettingsStore();
  const currencySymbol = getCurrentCurrency().symbol;
  const {
    financialGoals: goals,
    addFinancialGoal,
    updateFinancialGoal,
    deleteFinancialGoal,
    loadData,
    isLoaded,
  } = finance;

  const savingsGoals = useSavingsGoalsStore((s) => s.goals);
  const savingsGoalsLoaded = useSavingsGoalsStore((s) => s.isLoaded);
  const loadSavingsGoals = useSavingsGoalsStore((s) => s.loadGoals);
  const goalsLoading = !isLoaded || !savingsGoalsLoaded;

  useFocusRefresh(
    useCallback(async () => {
      await loadSavingsGoals();
    }, [loadSavingsGoals]),
  );

  const openAddSavingsGoal = useCallback(() => {
    safePush('/add-savings-goal');
  }, []);

  const openSavingsGoalDetail = useCallback((goal: SavingsGoal) => {
    safePush({ pathname: '/savings-goal-detail', params: { id: goal.id } });
  }, []);

  const hasAnyGoals = goals.length > 0 || savingsGoals.length > 0;

  const summaryStats = useMemo(() => {
    let totalDisplay = 0;
    let totalTarget = 0;
    let nearLimit = 0;
    for (const goal of goals) {
      const raw =
        goal.type === 'spending_limit'
          ? finance
              .getExpensesByCategory(goal.category || 'Ostatní')
              .reduce((sum: number, t) => sum + t.amount, 0)
          : goal.currentAmount;
      const display = Math.round(raw);
      const target = Math.round(goal.targetAmount);
      totalDisplay += display;
      totalTarget += target;
      const progress = target > 0 ? (display / target) * 100 : 0;
      if (goal.type === 'spending_limit' && progress > 80) {
        nearLimit += 1;
      }
    }
    const overallPct = totalTarget > 0 ? (totalDisplay / totalTarget) * 100 : 0;
    const totalRemaining = Math.max(0, totalTarget - totalDisplay);
    return { totalDisplay, totalTarget, overallPct, nearLimit, totalRemaining };
  }, [goals, finance]);

  /** Limity výdajů sloučené podle kategorie — pro sekci „Rozložení výdajů“. */
  const expenseBreakdownCategoryData = useMemo(() => {
    const map = new Map<string, { amount: number; limit: number }>();
    for (const goal of goals) {
      if (goal.type !== 'spending_limit') continue;
      const cat = goal.category || 'Ostatní';
      const spent = Math.round(
        finance.getExpensesByCategory(cat).reduce((s: number, t) => s + t.amount, 0),
      );
      const lim = Math.round(goal.targetAmount);
      const ex = map.get(cat);
      if (!ex) {
        map.set(cat, { amount: spent, limit: lim });
      } else {
        map.set(cat, { amount: spent, limit: ex.limit + lim });
      }
    }
    return Array.from(map.entries()).map(([category, v]) => ({
      category,
      amount: v.amount,
      limit: v.limit,
    }));
  }, [goals, finance]);

  const totalExpenses = useMemo(
    () => expenseBreakdownCategoryData.reduce((sum, cat) => sum + cat.amount, 0),
    [expenseBreakdownCategoryData],
  );

  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [addPickerSheet, setAddPickerSheet] = useState<AddPickerSheet | null>(null);
  const [editingGoal, setEditingGoal] = useState<FinancialGoal | null>(null);
  const [goalTitle, setGoalTitle] = useState<string>('');
  const [goalAmount, setGoalAmount] = useState<string>('');
  const [goalCategory, setGoalCategory] = useState<string>('Ostatní');
  const [goalType, setGoalType] = useState<'saving' | 'spending_limit'>('saving');
  const [isRecurring, setIsRecurring] = useState<boolean>(false);
  const [frequency, setFrequency] = useState<RecurrenceFrequency>('monthly');
  const [dayOfMonth, setDayOfMonth] = useState<string>('1');
  const [detailGoal, setDetailGoal] = useState<FinancialGoal | null>(null);
  const [detailSelectionMode, setDetailSelectionMode] = useState(false);
  const [detailSelectedIds, setDetailSelectedIds] = useState<Set<string>>(() => new Set());
  const detailInsets = useSafeAreaInsets();
  const screenInsets = useSafeAreaInsets();

  const barAnim = useRef(new Animated.Value(0)).current;
  const goalsAnimKey = goals.map((g) => g.id).join('|');

  const {
    orderedItems: orderedGoals,
    loadOrder: loadGoalOrder,
    showReorderAlert: showGoalReorderAlert,
  } = useDraggableList(goals, FINANCIAL_GOAL_ORDER_KEY);

  useEffect(() => {
    void loadGoalOrder();
  }, [loadGoalOrder]);

  useEffect(() => {
    if (!isLoaded) {
      loadData();
    }
  }, [isLoaded, loadData]);

  useEffect(() => {
    if (goals.length === 0) return;
    barAnim.setValue(0);
    Animated.timing(barAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: false,
    }).start();
  }, [barAnim, goalsAnimKey, goals.length, finance.transactions.length]);

  useEffect(() => {
    setDetailSelectionMode(false);
    setDetailSelectedIds(new Set());
  }, [detailGoal?.id]);

  const detailTransactions = useMemo(() => {
    if (!detailGoal) return [];
    return getTransactionsForCategoryThisMonth(
      finance.transactions,
      detailGoal.category || 'Ostatní',
    );
  }, [detailGoal, finance.transactions]);

  const detailTotal = useMemo(
    () => Math.round(detailTransactions.reduce((sum, t) => sum + t.amount, 0)),
    [detailTransactions],
  );

  const toggleDetailSelect = useCallback((id: string) => {
    setDetailSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAllDetailTx = useCallback(() => {
    setDetailSelectedIds(new Set(detailTransactions.map((t) => t.id)));
  }, [detailTransactions]);

  const exitDetailSelection = useCallback(() => {
    setDetailSelectionMode(false);
    setDetailSelectedIds(new Set());
  }, []);

  const confirmBulkDeleteDetail = useCallback(() => {
    const ids = Array.from(detailSelectedIds);
    if (ids.length === 0) return;
    const transactionsWord = fgTransactionsWord(ids.length, t);
    Alert.alert(
      t('fgDeleteTransactionsTitle'),
      t('fgDeleteTransactionsConfirm', { count: ids.length, transactionsWord }),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: () => {
            finance.deleteTransactions(ids);
            exitDetailSelection();
          },
        },
      ],
    );
  }, [detailSelectedIds, finance, exitDetailSelection, t]);

  const resetGoalFormFields = useCallback(() => {
    setGoalTitle('');
    setGoalAmount('');
    setGoalCategory('Ostatní');
    setGoalType('saving');
    setIsRecurring(false);
    setFrequency('monthly');
    setDayOfMonth('1');
  }, []);

  const openCustomGoalForm = useCallback(() => {
    setEditingGoal(null);
    resetGoalFormFields();
    setAddPickerSheet(null);
    setShowAddModal(true);
  }, [resetGoalFormFields]);

  const openTemplatePicker = useCallback(() => {
    setAddPickerSheet('templates');
  }, []);

  const applyInspirationTemplate = useCallback(
    (template: InspirationTemplate) => {
      setEditingGoal(null);
      setGoalTitle(t(template.titleKey));
      setGoalAmount('');
      setGoalCategory(template.category);
      setGoalType(template.type);
      setIsRecurring(false);
      setFrequency('monthly');
      setDayOfMonth('1');
      setAddPickerSheet(null);
      setShowAddModal(true);
    },
    [t],
  );

  const closeAddPicker = useCallback(() => {
    setAddPickerSheet(null);
  }, []);

  const GoalCard = React.memo(
    ({ goal, txSig, anim, localeSig }: { goal: FinancialGoal; txSig: number; anim: Animated.Value; localeSig: string }) => {
      const cat = goal.category || 'Ostatní';
      const rawDisplay = useMemo(() => {
        if (goal.type !== 'spending_limit') return goal.currentAmount;
        const categoryKey = goal.category || 'Ostatní';
        const categoryExpenses = finance.getExpensesByCategory(categoryKey);
        return categoryExpenses.reduce((sum: number, t) => sum + t.amount, 0);
      }, [goal]);

      const displayRounded = Math.round(rawDisplay);
      const targetRounded = Math.round(goal.targetAmount);
      const progress = targetRounded > 0 ? (displayRounded / targetRounded) * 100 : 0;
      const progressClamped = Math.min(progress, 100);
      const isOverLimit = goal.type === 'spending_limit' && displayRounded > targetRounded;
      const barColor = isOverLimit ? '#EF4444' : getProgressColor(progressClamped);
      const typeLabel = goal.type === 'spending_limit' ? t('spendingLimit') : t('savingGoal');
      const emoji = GOAL_CATEGORIES[cat as keyof typeof GOAL_CATEGORIES]?.emoji || '🎯';

      return (
        <View
          style={[
            styles.goalCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={styles.goalCardHeader}>
            <View style={styles.goalCardTitleBlock}>
              <Text style={styles.goalEmoji}>{emoji}</Text>
              <Text style={[styles.goalTitle, { color: colors.text }]} numberOfLines={2}>
                {goal.title}
              </Text>
              <Text style={[styles.goalTypeBadge, { color: colors.textSecondary }]} numberOfLines={1}>
                {typeLabel}
              </Text>
            </View>
            <View style={styles.goalCardActions}>
              <TouchableOpacity
                style={styles.goalIconAction}
                onPress={() => {
                  setEditingGoal(goal);
                  setGoalTitle(goal.title);
                  setGoalAmount(goal.targetAmount.toString());
                  setGoalCategory(goal.category || 'Ostatní');
                  setGoalType(goal.type);
                  setIsRecurring(Boolean(goal.recurring?.isRecurring));
                  setFrequency((goal.recurring?.frequency ?? 'monthly') as RecurrenceFrequency);
                  setDayOfMonth(goal.recurring?.dayOfMonth ? String(goal.recurring.dayOfMonth) : '1');
                  setShowAddModal(true);
                }}
                hitSlop={8}
              >
                <Edit3 color={colors.textSecondary} size={16} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.goalIconAction}
                onPress={() => {
                  Alert.alert(
                    t('fgDeleteGoalTitle'),
                    t('fgDeleteGoalConfirm', { title: goal.title }),
                    [
                      { text: t('cancel'), style: 'cancel' },
                      {
                        text: t('delete'),
                        style: 'destructive',
                        onPress: () => {
                          try {
                            deleteFinancialGoal(goal.id);
                          } catch (error) {
                            console.error('Error deleting goal:', error);
                            Alert.alert(t('error'), t('fgGoalDeleteFailed'));
                          }
                        },
                      },
                    ],
                  );
                }}
                testID={`delete-goal-${goal.id}`}
                hitSlop={8}
              >
                <Trash2 color={colors.textSecondary} size={16} />
              </TouchableOpacity>
            </View>
          </View>

          <Text style={[styles.goalAmountLarge, { color: colors.text }]}>{formatKč(displayRounded)}</Text>

          <View style={[styles.progressBarTrack, { backgroundColor: colors.muted }]}>
            <Animated.View
              style={{
                height: 8,
                borderRadius: 4,
                backgroundColor: barColor,
                width: anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', `${progressClamped}%`],
                }),
              }}
            />
          </View>

          <Text style={[styles.progressSubline, { color: colors.textSecondary }]}>
            {t('fgGoalProgressLine', {
              current: formatKč(displayRounded),
              target: formatKč(targetRounded),
              pct: Math.round(progressClamped),
            })}
          </Text>

          {isOverLimit ? (
            <Text style={styles.overLimitText}>
              ⚠️ +{formatKč(displayRounded - targetRounded)} ({t('fgLimitLabel')})
            </Text>
          ) : null}

          {goal.recurring?.isRecurring ? (
            <Text style={[styles.goalRecurringHint, { color: colors.textSecondary }]}>
              {goal.recurring.frequency === 'monthly' ? t('fgMonthly') : t('fgYearly')}
              {goal.recurring.dayOfMonth ? ` · ${goal.recurring.dayOfMonth}.` : ''}
            </Text>
          ) : null}
        </View>
      );
    },
    (prevProps, nextProps) => {
      return (
        prevProps.goal.id === nextProps.goal.id &&
        prevProps.txSig === nextProps.txSig &&
        prevProps.localeSig === nextProps.localeSig &&
        prevProps.goal.currentAmount === nextProps.goal.currentAmount &&
        prevProps.goal.targetAmount === nextProps.goal.targetAmount &&
        prevProps.goal.title === nextProps.goal.title &&
        JSON.stringify(prevProps.goal.category) === JSON.stringify(nextProps.goal.category)
      );
    },
  );
  GoalCard.displayName = 'GoalCard';

  const openGoalDetail = useCallback((goal: FinancialGoal) => {
    setDetailGoal(goal);
  }, []);

  const { run: handleSaveGoal } = useAsyncAction(async () => {
    if (!goalTitle || !goalAmount) {
      Alert.alert(t('error'), t('fillAllFields'));
      return;
    }

    const amount = parseMoneyInput(goalAmount);
    if (amount == null || amount <= 0) {
      Alert.alert(t('error'), t('enterValidAmount'));
      return;
    }

    const goalData: FinancialGoal = {
      id: editingGoal?.id || Date.now().toString(),
      title: goalTitle,
      targetAmount: amount,
      currentAmount: editingGoal?.currentAmount || 0,
      category: goalCategory,
      deadline: new Date(2024, 11, 31),
      type: goalType,
      recurring: isRecurring ? { isRecurring: true, frequency, dayOfMonth: Number(dayOfMonth) || 1 } : undefined,
    };

    if (editingGoal) {
      updateFinancialGoal(editingGoal.id, goalData);
    } else {
      addFinancialGoal(goalData);
    }

    setGoalTitle('');
    setGoalAmount('');
    setGoalCategory('Ostatní');
    setGoalType('saving');
    setEditingGoal(null);
    setShowAddModal(false);
    
    Alert.alert(
      t('fgGoalSaved'),
      t('fgGoalSavedDetail', {
        title: goalTitle,
        action: editingGoal ? t('fgGoalUpdated') : t('fgGoalAdded'),
      }),
    );
  });

  function GoalsScreenListHeader() {
    return (
      <>
        <View style={styles.addButtonContainer}>
          <TouchableOpacity
            style={styles.addButton}
            onPress={openAddSavingsGoal}
            testID="open-add-goal"
          >
            <LinearGradient
              colors={['#10B981', '#059669']}
              style={styles.addButtonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Plus color="white" size={20} />
              <Text style={styles.addButtonText}>{t('fgNewGoal')}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <View
          style={[
            styles.summaryCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
            {t('fgOverallProgress')}
          </Text>
          <View style={[styles.summaryBarTrack, { backgroundColor: colors.muted }]}>
            <Animated.View
              style={{
                height: 8,
                borderRadius: 4,
                backgroundColor: '#a855f7',
                width: barAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', `${Math.min(summaryStats.overallPct, 100)}%`],
                }),
              }}
            />
          </View>
        </View>
      </>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient
        colors={['#667eea', '#764ba2']}
        style={styles.headerGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.headerContent}>
          <BackButton color="white" size={24} style={styles.backButton} />
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>{t('financialGoals')}</Text>
            <Text style={styles.headerSubtitle}>{t('profileGoalsSubtitle')}</Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>
      </LinearGradient>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        nestedScrollEnabled
      >
        {goalsLoading && !hasAnyGoals ? (
          <LoadingSkeleton loading variant="cards" />
        ) : !goalsLoading && !hasAnyGoals ? (
          <EmptyState
            title={t('fgEmptyGoalsTitle')}
            description={t('fgEmptyGoalsDescription')}
            icon={<Target color={colors.textSecondary} size={48} />}
            actionLabel={t('fgNewGoal')}
            actionIcon={<Plus color={colors.onPrimary} size={20} />}
            onAction={openAddSavingsGoal}
            actionTestID="open-add-first-goal"
          />
        ) : (
          <>
            <GoalsScreenListHeader />
            {savingsGoals.length > 0 ? (
              <View style={styles.goalsContainer}>
                {savingsGoals.map((sg) => {
                  const current = Math.round(getGoalCurrentAmount(sg));
                  const target = Math.round(sg.targetAmount);
                  const progress = target > 0 ? Math.min(100, (current / target) * 100) : 0;
                  const daysLeft = daysUntilDeadline(sg.deadline);
                  return (
                    <TouchableOpacity
                      key={sg.id}
                      activeOpacity={0.85}
                      onPress={() => openSavingsGoalDetail(sg)}
                      testID={`savings-goal-${sg.id}`}
                    >
                      <View
                        style={[
                          styles.goalCard,
                          { backgroundColor: colors.card, borderColor: colors.border },
                        ]}
                      >
                        <View style={styles.goalCardHeader}>
                          <Text style={styles.goalEmoji}>{sg.emoji}</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.goalTitle, { color: colors.text }]} numberOfLines={1}>
                              {sg.name}
                            </Text>
                            <Text style={[styles.goalTypeBadge, { color: colors.textSecondary }]}>
                              {t('savingGoal')}
                              {daysLeft >= 0
                                ? ` · ${daysLeft} ${
                                    daysLeft === 1
                                      ? t('sgDayOne')
                                      : daysLeft >= 2 && daysLeft <= 4
                                        ? t('sgDayFew')
                                        : t('sgDayMany')
                                  }`
                                : ''}
                            </Text>
                          </View>
                        </View>
                        <Text style={[styles.goalAmountLarge, { color: colors.text }]}>
                          {formatKč(current)}
                        </Text>
                        <View style={[styles.progressBarTrack, { backgroundColor: colors.muted }]}>
                          <View
                            style={{
                              height: 8,
                              borderRadius: 4,
                              backgroundColor: sg.color || '#10B981',
                              width: `${progress}%`,
                            }}
                          />
                        </View>
                        <Text style={[styles.progressSubline, { color: colors.textSecondary }]}>
                          {t('fgGoalProgressLine', {
                            current: formatKč(current),
                            target: formatKč(target),
                            pct: Math.round(progress),
                          })}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}
            {expenseBreakdownCategoryData.length > 0 && (
              <View style={styles.expenseBreakdownSection}>
                <Text style={[styles.expenseBreakdownTitle, { color: colors.text }]}>
                  {t('expenseBreakdown')}
                </Text>
                {expenseBreakdownCategoryData.map((cat) => {
                  const limitProgress =
                    cat.limit > 0 ? Math.min(100, Math.round((cat.amount / cat.limit) * 100)) : 0;
                  const percentage =
                    totalExpenses > 0 ? Math.round((cat.amount / totalExpenses) * 100) : 0;
                  const barWidth = cat.limit > 0 ? limitProgress : Math.min(percentage, 100);
                  const hasLimit = cat.limit > 0;
                  const overLimit = hasLimit && cat.amount > cat.limit;
                  const percentColor = !hasLimit ? colors.textSecondary : overLimit ? '#EF4444' : '#22C55E';
                  return (
                    <View key={cat.category} style={[styles.expenseBreakdownRow, { borderBottomColor: colors.border }]}>
                      <View style={styles.expenseBreakdownRowTop}>
                        <Text style={[styles.expenseBreakdownCategory, { color: colors.text }]} numberOfLines={1}>
                          {translateGoalCategory(cat.category, t)}
                        </Text>
                        <Text style={[styles.expenseBreakdownPercent, { color: percentColor }]}>
                          {hasLimit ? `${limitProgress}%` : `${percentage}%`}
                        </Text>
                      </View>
                      {cat.amount > 0 ? (
                        <Text style={[styles.expenseBreakdownAmounts, { color: colors.textSecondary }]}>
                          {formatKč(cat.amount)}
                          {hasLimit ? t('fgLimitAmount', { amount: formatKč(cat.limit) }) : t('fgWithoutLimit')}
                        </Text>
                      ) : null}
                      <View style={[styles.expenseBreakdownTrack, { backgroundColor: colors.muted }]}>
                        <View
                          style={[
                            styles.expenseBreakdownFill,
                            { width: `${barWidth}%`, backgroundColor: percentColor },
                          ]}
                        />
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
            <View style={styles.goalsContainer}>
              {orderedGoals.map((goal) => (
                <TouchableOpacity
                  key={goal.id}
                  activeOpacity={0.85}
                  delayLongPress={500}
                  onLongPress={() => showGoalReorderAlert(goal.id)}
                  onPress={() => openGoalDetail(goal)}
                >
                  <GoalCard goal={goal} txSig={finance.transactions.length} anim={barAnim} localeSig={language} />
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      <Modal
        visible={addPickerSheet !== null}
        transparent
        animationType="slide"
        onRequestClose={closeAddPicker}
      >
        <Pressable style={styles.addPickerBackdrop} onPress={closeAddPicker}>
          <Pressable
            style={[
              styles.addPickerSheet,
              { backgroundColor: colors.card, paddingBottom: Math.max(screenInsets.bottom, 16) },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            {addPickerSheet === 'chooser' ? (
              <>
                <Text style={[styles.addPickerTitle, { color: colors.text }]}>{t('fgHowToStart')}</Text>
                <TouchableOpacity
                  style={[styles.addPickerChoiceCard, { backgroundColor: colors.background, borderColor: colors.border }]}
                  onPress={openTemplatePicker}
                  activeOpacity={0.85}
                  testID="add-goal-from-template"
                >
                  <View style={[styles.addPickerChoiceIcon, { backgroundColor: 'rgba(168,85,247,0.15)' }]}>
                    <Sparkles color="#a855f7" size={24} />
                  </View>
                  <View style={styles.addPickerChoiceText}>
                    <Text style={[styles.addPickerChoiceTitle, { color: colors.text }]}>
                      {t('fgFromTemplate')}
                    </Text>
                    <Text style={[styles.addPickerChoiceDesc, { color: colors.textSecondary }]}>
                      {t('fgFromTemplateDesc')}
                    </Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.addPickerChoiceCard, { backgroundColor: colors.background, borderColor: colors.border }]}
                  onPress={openCustomGoalForm}
                  activeOpacity={0.85}
                  testID="add-goal-custom"
                >
                  <View style={[styles.addPickerChoiceIcon, { backgroundColor: 'rgba(16,185,129,0.15)' }]}>
                    <PenLine color="#10B981" size={24} />
                  </View>
                  <View style={styles.addPickerChoiceText}>
                    <Text style={[styles.addPickerChoiceTitle, { color: colors.text }]}>
                      {t('fgCustomGoal')}
                    </Text>
                    <Text style={[styles.addPickerChoiceDesc, { color: colors.textSecondary }]}>
                      {t('fgCustomGoalDesc')}
                    </Text>
                  </View>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={styles.addPickerTemplatesHeader}>
                  <TouchableOpacity
                    onPress={() => setAddPickerSheet('chooser')}
                    style={styles.addPickerBackBtn}
                    hitSlop={8}
                  >
                    <ChevronLeft color={colors.text} size={24} />
                  </TouchableOpacity>
                  <Text style={[styles.addPickerTitle, styles.addPickerTitleFlex, { color: colors.text }]}>
                    {t('fgFromTemplate')}
                  </Text>
                  <View style={styles.addPickerBackBtn} />
                </View>
                <ScrollView style={styles.addPickerTemplatesScroll} showsVerticalScrollIndicator={false}>
                  <Text style={[styles.addPickerSectionLabel, { color: colors.textSecondary }]}>
                    {t('fgTplSectionSaving')}
                  </Text>
                  {SAVING_INSPIRATION_TEMPLATES.map((tpl) => (
                    <TouchableOpacity
                      key={tpl.id}
                      style={[styles.addPickerTemplateRow, { borderColor: colors.border }]}
                      onPress={() => applyInspirationTemplate(tpl)}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.addPickerTemplateEmoji}>{tpl.emoji}</Text>
                      <View style={styles.addPickerTemplateText}>
                        <Text style={[styles.addPickerTemplateTitle, { color: colors.text }]}>
                          {t(tpl.titleKey)}
                        </Text>
                        <Text style={[styles.addPickerTemplateDesc, { color: colors.textSecondary }]}>
                          {t(tpl.descKey)}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                  <Text style={[styles.addPickerSectionLabel, { color: colors.textSecondary, marginTop: 16 }]}>
                    {t('fgTplSectionLimits')}
                  </Text>
                  {LIMIT_INSPIRATION_TEMPLATES.map((tpl) => (
                    <TouchableOpacity
                      key={tpl.id}
                      style={[styles.addPickerTemplateRow, { borderColor: colors.border }]}
                      onPress={() => applyInspirationTemplate(tpl)}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.addPickerTemplateEmoji}>{tpl.emoji}</Text>
                      <View style={styles.addPickerTemplateText}>
                        <Text style={[styles.addPickerTemplateTitle, { color: colors.text }]}>
                          {t(tpl.titleKey)}
                        </Text>
                        <Text style={[styles.addPickerTemplateDesc, { color: colors.textSecondary }]}>
                          {t(tpl.descKey)}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
          visible={showAddModal}
          animationType="slide"
          presentationStyle="pageSheet"
        >
          <View style={styles.modalContainer} testID="goal-modal">
            <LinearGradient
              colors={['#10B981', '#059669']}
              style={styles.modalHeader}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <View style={styles.modalHeaderContent}>
                <TouchableOpacity
                  onPress={() => {
                    setShowAddModal(false);
                    setEditingGoal(null);
                  }}
                  style={styles.closeButton}
                >
                  <X color="white" size={24} />
                </TouchableOpacity>
                <Text style={styles.modalTitle}>
                  {editingGoal ? t('fgEditGoal') : t('fgNewGoal')}
                </Text>
                <View style={styles.modalProgress} />
              </View>
            </LinearGradient>

            <ScrollView style={styles.modalContent}>
              <View style={styles.typeSelector}>
                <TouchableOpacity
                  style={[
                    styles.typeButton,
                    goalType === 'saving' && styles.typeButtonActive
                  ]}
                  onPress={() => setGoalType('saving')}
                >
                  <PiggyBank color={goalType === 'saving' ? 'white' : '#10B981'} size={20} />
                  <Text style={[
                    styles.typeButtonText,
                    goalType === 'saving' && styles.typeButtonTextActive
                  ]}>{t('savingGoal')}</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[
                    styles.typeButton,
                    goalType === 'spending_limit' && styles.typeButtonActive
                  ]}
                  onPress={() => setGoalType('spending_limit')}
                >
                  <DollarSign color={goalType === 'spending_limit' ? 'white' : '#EF4444'} size={20} />
                  <Text style={[
                    styles.typeButtonText,
                    goalType === 'spending_limit' && styles.typeButtonTextActive
                  ]}>{t('spendingLimit')}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.formContainer}>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>{t('fgGoalName')}</Text>
                  <TextInput
                    style={styles.textInput}
                    value={goalTitle}
                    onChangeText={setGoalTitle}
                    placeholder={goalType === 'saving' ? t('fgSavingPlaceholder') : t('fgLimitPlaceholder')}
                    testID="goal-title-input"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>
                    {goalType === 'saving' ? t('fgTargetAmount') : (isRecurring ? t('fgPaymentAmount') : t('fgMaxAmount'))} (Kč)
                  </Text>
                  <TextInput
                    style={styles.textInput}
                    value={goalAmount}
                    onChangeText={setGoalAmount}
                    placeholder="50000"
                    keyboardType="numeric"
                    testID="goal-amount-input"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>{t('category')}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categorySelector}>
                    {Object.entries(GOAL_CATEGORIES).map(([category, { icon: IconComponent, color }]) => (
                      <TouchableOpacity
                        key={category}
                        style={[
                          styles.categoryButton,
                          goalCategory === category && styles.categoryButtonActive,
                          { borderColor: color }
                        ]}
                        onPress={() => setGoalCategory(category)}
                        testID={`select-category-${category}`}
                      >
                        <IconComponent 
                          color={goalCategory === category ? 'white' : color} 
                          size={20} 
                        />
                        <Text style={[
                          styles.categoryButtonText,
                          goalCategory === category && styles.categoryButtonTextActive
                        ]}>
                          {translateGoalCategory(category, t)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>

                {goalType === 'spending_limit' && (
                  <View style={styles.recurringContainer}>
                    <View style={styles.recurringHeader}>
                      <View style={styles.recurringHeaderLeft}>
                        <RefreshCcw color="#10B981" size={18} />
                        <Text style={styles.recurringLabel}>{t('fgRecurringPayment')}</Text>
                      </View>
                      <Switch
                        value={isRecurring}
                        onValueChange={(v) => setIsRecurring(v)}
                        testID="toggle-recurring"
                      />
                    </View>

                    {isRecurring && (
                      <View style={styles.recurringFields}>
                        <View style={styles.frequencyRow}>
                          <TouchableOpacity
                            style={[styles.freqButton, frequency === 'monthly' && styles.freqButtonActive]}
                            onPress={() => setFrequency('monthly')}
                            testID="freq-monthly"
                          >
                            <Calendar color={frequency === 'monthly' ? 'white' : '#374151'} size={16} />
                            <Text style={[styles.freqButtonText, frequency === 'monthly' && styles.freqButtonTextActive]}>{t('fgMonthly')}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.freqButton, frequency === 'yearly' && styles.freqButtonActive]}
                            onPress={() => setFrequency('yearly')}
                            testID="freq-yearly"
                          >
                            <Calendar color={frequency === 'yearly' ? 'white' : '#374151'} size={16} />
                            <Text style={[styles.freqButtonText, frequency === 'yearly' && styles.freqButtonTextActive]}>{t('fgYearly')}</Text>
                          </TouchableOpacity>
                        </View>

                        <View style={styles.inputGroup}>
                          <Text style={styles.inputLabel}>{t('fgDayOfMonth')}</Text>
                          <TextInput
                            style={styles.textInput}
                            value={dayOfMonth}
                            onChangeText={setDayOfMonth}
                            keyboardType="numeric"
                            placeholder="1"
                            testID="day-of-month-input"
                          />
                        </View>
                      </View>
                    )}
                  </View>
                )}
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <AsyncButton
                variant="success"
                label={editingGoal ? t('subscription.saveChanges') : t('fgAddGoal')}
                loadingLabel={t('hhNotifSaving')}
                onPress={handleSaveGoal}
                style={styles.submitButton}
                contentStyle={styles.submitButtonGradient}
                textStyle={styles.submitButtonText}
                testID="save-goal"
              />
            </View>
          </View>
        </Modal>

      <Modal
        visible={detailGoal !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setDetailGoal(null)}
      >
        <View style={styles.detailModalContainer}>
          <LinearGradient
            colors={['#667eea', '#764ba2']}
            style={styles.detailModalHeader}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.detailModalHeaderRow}>
              <TouchableOpacity
                onPress={() => setDetailGoal(null)}
                style={styles.closeButton}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <X color="white" size={24} />
              </TouchableOpacity>
              <Text style={styles.detailModalTitle} numberOfLines={2}>
                {detailGoal
                  ? `${GOAL_CATEGORIES[detailGoal.category as keyof typeof GOAL_CATEGORIES]?.emoji ?? '🎯'} ${translateGoalCategory(detailGoal.category || 'Ostatní', t)}${t('fgDetailSuffix')}`
                  : ''}
              </Text>
              {detailTransactions.length > 0 ? (
                <View style={styles.detailHeaderActions}>
                  {detailSelectionMode && (
                    <TouchableOpacity onPress={selectAllDetailTx} hitSlop={8}>
                      <Text style={styles.detailHeaderActionText}>{t('fgSelectAll')}</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={() => {
                      if (detailSelectionMode) exitDetailSelection();
                      else setDetailSelectionMode(true);
                    }}
                    hitSlop={8}
                  >
                    <Text style={styles.detailHeaderActionText}>
                      {detailSelectionMode ? t('cancel') : t('fgSelect')}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.headerSpacer} />
              )}
            </View>
          </LinearGradient>
          <ScrollView
            style={styles.detailModalBody}
            contentContainerStyle={[
              styles.detailModalBodyContent,
              detailSelectionMode && { paddingBottom: 100 + detailInsets.bottom },
            ]}
          >
            {detailTransactions.length === 0 ? (
              <Text style={styles.detailModalEmpty}>{t('fgNoExpensesInCategory')}</Text>
            ) : (
              <>
                {detailTransactions.map((t) => (
                  <View key={t.id} style={styles.detailTxSwipeWrap}>
                    <SwipeableTransactionRow
                      transaction={t}
                      onDelete={finance.deleteTransaction}
                      currencySymbol={currencySymbol}
                      variant="goalDetail"
                      containerStyle={styles.detailSwipeRowCard}
                      selectionMode={detailSelectionMode}
                      selected={detailSelectedIds.has(t.id)}
                      onToggleSelection={() => toggleDetailSelect(t.id)}
                    />
                  </View>
                ))}
                <View style={styles.detailTxTotalRow}>
                  <Text style={styles.detailTxTotalLabel}>{t('hhTotal')}</Text>
                  <Text style={styles.detailTxTotalAmount}>{formatKč(detailTotal)}</Text>
                </View>
              </>
            )}
          </ScrollView>
          {detailSelectionMode && detailTransactions.length > 0 && (
            <View
              style={[
                styles.detailBulkToolbar,
                {
                  paddingBottom: Math.max(detailInsets.bottom, 12) + 8,
                  borderTopColor: '#E5E7EB',
                  backgroundColor: '#FFFFFF',
                },
              ]}
            >
              <Text style={styles.detailBulkToolbarLabel}>
                {t('fgSelectedCount', {
                  count: detailSelectedIds.size,
                  transactionsWord: fgTransactionsWord(detailSelectedIds.size, t),
                })}
              </Text>
              <TouchableOpacity
                style={[styles.detailBulkDeleteBtn, detailSelectedIds.size === 0 && { opacity: 0.45 }]}
                onPress={confirmBulkDeleteDetail}
                disabled={detailSelectedIds.size === 0}
                activeOpacity={0.85}
              >
                <Text style={styles.detailBulkDeleteBtnText}>{t('fgDeleteSelected')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  headerGradient: {
    paddingTop: 60,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleContainer: {
    flex: 1,
    marginLeft: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'white',
    opacity: 0.9,
  },
  headerSpacer: {
    width: 40,
  },
  templatesContainer: {
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: '#111827',
    marginBottom: 12,
  },
  templateCard: {
    width: 130,
    marginRight: 10,
    borderRadius: 12,
    borderWidth: 2,
    overflow: 'hidden',
    backgroundColor: '#111827',
  },
  templateGradient: {
    padding: 6,
    minHeight: 64,
    justifyContent: 'space-between',
  },
  templateTitle: {
    color: 'white',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  templateDesc: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 10,
    marginBottom: 4,
  },
  templateBadgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 6,
  },
  templateBadge: {
    paddingVertical: 2,
    paddingHorizontal: 5,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 9,
    marginRight: 4,
    marginBottom: 3,
  },
  templateBadgeText: {
    color: 'white',
    fontSize: 8,
    fontWeight: '600',
  },
  templateApply: {
    color: 'white',
    fontSize: 10,
    opacity: 0.9,
  },
  addButtonContainer: {
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 24,
  },
  addButton: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  addButtonGradient: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginLeft: 8,
  },
  addPickerBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  addPickerSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingHorizontal: 20,
    maxHeight: '85%',
  },
  addPickerTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    marginBottom: 16,
  },
  addPickerTitleFlex: {
    flex: 1,
    textAlign: 'center',
    marginBottom: 0,
  },
  addPickerTemplatesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  addPickerBackBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPickerChoiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
    gap: 14,
  },
  addPickerChoiceIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPickerChoiceText: {
    flex: 1,
  },
  addPickerChoiceTitle: {
    fontSize: 17,
    fontWeight: '700' as const,
    marginBottom: 4,
  },
  addPickerChoiceDesc: {
    fontSize: 14,
    lineHeight: 20,
  },
  addPickerTemplatesScroll: {
    maxHeight: 480,
  },
  addPickerSectionLabel: {
    fontSize: 13,
    fontWeight: '700' as const,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  addPickerTemplateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  addPickerTemplateEmoji: {
    fontSize: 24,
    width: 32,
    textAlign: 'center',
  },
  addPickerTemplateText: {
    flex: 1,
  },
  addPickerTemplateTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    marginBottom: 2,
  },
  addPickerTemplateDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
  summaryCard: {
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  summaryLabel: {
    fontSize: 15,
    fontWeight: '600' as const,
    marginBottom: 12,
  },
  summaryBarTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  expenseBreakdownSection: {
    marginHorizontal: 20,
    marginBottom: 20,
  },
  expenseBreakdownTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 14,
  },
  expenseBreakdownRow: {
    marginBottom: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  expenseBreakdownRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginBottom: 6,
  },
  expenseBreakdownCategory: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
  },
  expenseBreakdownPercent: {
    fontSize: 15,
    fontWeight: '700',
    flexShrink: 0,
  },
  expenseBreakdownAmounts: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 8,
  },
  expenseBreakdownTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
  },
  expenseBreakdownFill: {
    height: '100%',
    borderRadius: 4,
  },
  goalsContainer: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  goalCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  goalCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 8,
  },
  goalCardTitleBlock: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 52,
  },
  goalTypeBadge: {
    fontSize: 12,
    fontWeight: '600' as const,
    flexShrink: 0,
    maxWidth: 96,
  },
  goalCardActions: {
    position: 'absolute',
    top: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  goalIconAction: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalEmoji: {
    fontSize: 18,
  },
  goalTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    flex: 1,
  },
  goalAmountLarge: {
    fontSize: 28,
    fontWeight: '800' as const,
    marginBottom: 12,
    letterSpacing: -0.5,
  },
  goalRecurringHint: {
    fontSize: 12,
    marginTop: 8,
  },
  progressBarTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
  },
  progressSubline: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 4,
  },
  recurringChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: '#F3F4F6',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    marginTop: 6,
  },
  recurringText: {
    fontSize: 12,
    fontWeight: '600',
  },
  overLimitText: {
    fontSize: 12,
    color: '#EF4444',
    fontWeight: '600',
  },
  remainingText: {
    fontSize: 12,
    color: '#6B7280',
  },
  remainingTextBold: {
    fontSize: 14,
    fontWeight: '700',
  },
  emptyState: {
    flex: 1,
    minHeight: 420,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyStateText: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  emptyStateButton: {
    borderRadius: 14,
    overflow: 'hidden',
    minWidth: 220,
  },
  emptyStateButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 8,
  },
  emptyStateButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#FFFFFF',
  },
  detailModalContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  detailModalHeader: {
    paddingTop: 56,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  detailModalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  detailHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 96,
    justifyContent: 'flex-end',
  },
  detailHeaderActionText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  detailBulkToolbar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  detailBulkToolbarLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
  },
  detailBulkDeleteBtn: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  detailBulkDeleteBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  detailModalTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  detailModalBody: {
    flex: 1,
  },
  detailModalBodyContent: {
    padding: 16,
    paddingBottom: 32,
  },
  detailModalEmpty: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 24,
  },
  detailTxSwipeWrap: {
    minHeight: 64,
    marginBottom: 8,
  },
  detailSwipeRowCard: {
    marginBottom: 0,
  },
  detailTxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  detailTxDate: {
    width: 86,
    fontSize: 13,
    color: '#64748B',
  },
  detailTxTitle: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
  },
  detailTxAmount: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  detailTxTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  detailTxTotalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  detailTxTotalAmount: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  modalHeader: {
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  modalHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
    flex: 1,
    textAlign: 'center',
  },
  modalProgress: {
    width: 40,
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  typeSelector: {
    flexDirection: 'row',
    marginBottom: 24,
    gap: 12,
  },
  typeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'white',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  typeButtonActive: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  typeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    marginLeft: 6,
  },
  typeButtonTextActive: {
    color: 'white',
  },
  formContainer: {
    gap: 16,
  },
  inputGroup: {
    gap: 8,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  textInput: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  categorySelector: {
    flexDirection: 'row',
  },
  categoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'white',
    borderRadius: 20,
    borderWidth: 2,
    marginRight: 8,
  },
  categoryButtonActive: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  categoryButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginLeft: 4,
  },
  categoryButtonTextActive: {
    color: 'white',
  },
  recurringContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
    gap: 12,
  },
  recurringHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recurringHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recurringLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  recurringFields: {
    gap: 12,
  },
  frequencyRow: {
    flexDirection: 'row',
    gap: 8,
  },
  freqButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingVertical: 10,
    gap: 6,
  },
  freqButtonActive: {
    backgroundColor: '#10B981',
  },
  freqButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  freqButtonTextActive: {
    color: 'white',
  },
  modalFooter: {
    padding: 20,
  },
  submitButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  submitButtonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
});

