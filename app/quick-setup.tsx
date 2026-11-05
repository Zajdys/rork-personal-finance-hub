import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Plus, Trash2 } from 'lucide-react-native';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/store/auth-store';
import { useFinanceStore } from '@/store/finance-store';
import { showToast } from '@/store/toast-store';
import { askNotificationsInContext } from '@/lib/reschedule-all-local-notifications';
import { parseMoneyInput } from '@/lib/parse-money-input';
import { suggestIncomeFromSalary } from '@/lib/income-suggest';
import { upsertUserBudgetByCategory, fetchUserBudgets } from '@/lib/supabase-plan';
import {
  buildQuickSetupLoans,
  buildQuickSetupRecurring,
  DEFAULT_COMMITMENTS,
  EMPTY_BUDGET,
  employmentChipToDb,
  employmentDbToChip,
  fetchQuickSetupProfile,
  formatKčGrouped,
  getCommitmentMeta,
  commitmentName,
  COMMITMENT_TITLE_TO_KEY,
  markQuickSetupAutoShown,
  markQuickSetupCompleted,
  saveQuickSetupProfileFields,
  sumBudgetMonthly,
  sumCommitmentMonthly,
  type EmploymentChip,
  type QuickSetupBudgetDraft,
  type QuickSetupCommitmentDraft,
  type QuickSetupCommitmentKey,
} from '@/lib/quick-setup';
import { useLanguageStore } from '@/store/language-store';
import { categoryPathLabel } from '@/lib/category-labels';
import { uiLocale } from '@/lib/app-locale';

const STEPS = 3;

const EMPLOYMENT_CHIPS: { id: Exclude<EmploymentChip, null>; label: string; labelEn: string }[] = [
  { id: 'employee', label: 'Zaměstnanec', labelEn: 'Employee' },
  { id: 'osvc', label: 'OSVČ', labelEn: 'Self-employed' },
  { id: 'student', label: 'Student', labelEn: 'Student' },
  { id: 'other', label: 'Jiné', labelEn: 'Other' },
];

const BUDGET_FIELDS: {
  key: keyof QuickSetupBudgetDraft;
  emoji: string;
  label: string;
  labelEn: string;
}[] = [
  { key: 'food', emoji: '🍽️', label: 'Jídlo', labelEn: 'Food' },
  { key: 'transportation', emoji: '🚗', label: 'Auto a doprava', labelEn: 'Car & transport' },
  { key: 'shopping', emoji: '🛍️', label: 'Nákupy', labelEn: 'Shopping' },
  { key: 'entertainment', emoji: '🎬', label: 'Volný čas', labelEn: 'Leisure' },
];

export default function QuickSetupScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ edit?: string }>();
  const isEdit = params.edit === '1';
  const { user } = useAuth();
  const { tr } = useLanguageStore();
  const { addLoan, loans, deleteLoan } = useFinanceStore();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [loadingPrefill, setLoadingPrefill] = useState(true);

  const [income, setIncome] = useState('');
  const [employment, setEmployment] = useState<EmploymentChip>(null);
  const [payday, setPayday] = useState('');

  const [commitments, setCommitments] =
    useState<QuickSetupCommitmentDraft[]>(DEFAULT_COMMITMENTS);
  const [budget, setBudget] = useState<QuickSetupBudgetDraft>(EMPTY_BUDGET);

  useEffect(() => {
    if (user?.id) void markQuickSetupAutoShown(user.id);
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.id) {
        setLoadingPrefill(false);
        return;
      }
      try {
        const profile = await fetchQuickSetupProfile(user.id);
        if (!cancelled) {
          if (profile.expectedMonthlyIncome != null && profile.expectedMonthlyIncome > 0) {
            setIncome(formatKčGrouped(String(Math.round(profile.expectedMonthlyIncome))));
          }
          if (profile.payday != null) setPayday(String(profile.payday));
          setEmployment(employmentDbToChip(profile.employmentType));
        }

        // Prefill nájem/energie/telefon z pravidelných plateb (editace)
        if (!cancelled) {
          const { fetchPersonalRecurringRules } = await import('@/lib/personal-recurring');
          const { rules } = await fetchPersonalRecurringRules(user.id);
          // Názvy v obou jazycích (pravidla uložená v CZ i EN).
          const titleToKey: Record<string, QuickSetupCommitmentKey> = Object.fromEntries(
            Object.entries(COMMITMENT_TITLE_TO_KEY).filter(([, k]) => k === 'rent' || k === 'energy' || k === 'phone'),
          ) as Record<string, QuickSetupCommitmentKey>;
          const hits = (rules ?? []).filter((r) => r.active && titleToKey[r.title]);
          if (!cancelled && hits.length > 0) {
            setCommitments((prev) =>
              prev.map((c) => {
                const r = hits.find((h) => titleToKey[h.title] === c.key);
                if (!r || c.enabled) return c;
                return {
                  ...c,
                  enabled: true,
                  amount: formatKčGrouped(String(Math.round(r.amount))),
                  dueDay: String(parseInt(r.nextDate.slice(8, 10), 10) || 15),
                };
              }),
            );
          }
        }

        // Prefill závazků z existujících loans (editace)
        if (!cancelled && loans.length > 0) {
          setCommitments((prev) => {
            const next = prev.map((c) => ({ ...c, extras: c.extras ? [...c.extras] : [] }));
            const byKey = new Map(next.map((c) => [c.key, c]));
            for (const loan of loans) {
              const name = (loan.name ?? '').toLowerCase();
              let key: QuickSetupCommitmentKey | null = null;
              if (loan.loanType === 'mortgage' || name.includes('hypot')) key = 'mortgage';
              else if (name.includes('nájem') || name.includes('najem') || name === 'rent') key = 'rent';
              else if (name.includes('energie') || name === 'energy') key = 'energy';
              else if (name.includes('telefon') || name.includes('internet') || name.includes('phone')) key = 'phone';
              else if (loan.loanType === 'car' || name.includes('leasing') || name.includes('půjč') || name.includes('loan'))
                key = 'leasing';
              if (!key) continue;
              const row = byKey.get(key);
              if (!row) continue;
              const amt = formatKčGrouped(String(Math.round(loan.monthlyPayment)));
              const day = String(
                loan.startDate instanceof Date
                  ? loan.startDate.getDate()
                  : new Date(loan.startDate).getDate(),
              );
              if (!row.enabled) {
                row.enabled = true;
                row.amount = amt;
                row.dueDay = day;
              } else if (key === 'leasing') {
                row.extras = [...(row.extras ?? []), { amount: amt, dueDay: day }];
              }
            }
            return next;
          });
        }

        const remoteBudgets = await fetchUserBudgets(user.id);
        if (!cancelled && remoteBudgets.length > 0) {
          const find = (cat: string) => remoteBudgets.find((b) => b.category === cat);
          setBudget((b) => ({
            food:
              b.food ||
              (find('Jídlo') ? formatKčGrouped(String(Math.round(find('Jídlo')!.amount))) : ''),
            transportation:
              b.transportation ||
              (find('Auto a doprava')
                ? formatKčGrouped(String(Math.round(find('Auto a doprava')!.amount)))
                : ''),
            shopping:
              b.shopping ||
              (find('Nákupy')
                ? formatKčGrouped(String(Math.round(find('Nákupy')!.amount)))
                : ''),
            entertainment:
              b.entertainment ||
              (find('Volný čas')
                ? formatKčGrouped(String(Math.round(find('Volný čas')!.amount)))
                : ''),
          }));
        }
      } finally {
        if (!cancelled) setLoadingPrefill(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // jen při mount / změně user
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const incomeNum = parseMoneyInput(income) ?? 0;
  const allTransactions = useFinanceStore((st) => st.transactions);
  const incomeSuggestion = useMemo(() => suggestIncomeFromSalary(allTransactions), [allTransactions]);
  const showIncomeSuggestion =
    incomeSuggestion != null &&
    Math.abs(incomeSuggestion.average - incomeNum) >= Math.max(500, incomeSuggestion.average * 0.03);
  const commitmentsSum = useMemo(() => sumCommitmentMonthly(commitments), [commitments]);
  const budgetSum = useMemo(() => sumBudgetMonthly(budget), [budget]);
  const remaining = incomeNum - commitmentsSum - budgetSum;

  const goTabs = useCallback(() => {
    router.replace('/(tabs)');
  }, [router]);

  /** Po prvním nastavení rovnou nabídnout nahrání výpisu (s návodem). */
  const goAfterSetup = useCallback(() => {
    if (isEdit) router.replace('/(tabs)');
    else router.replace({ pathname: '/import-guide', params: { onboarding: '1' } } as never);
  }, [router, isEdit]);

  const handleSkip = useCallback(async () => {
    if (user?.id) await markQuickSetupAutoShown(user.id);
    goAfterSetup();
  }, [user?.id, goAfterSetup]);

  const updateCommitment = (
    key: QuickSetupCommitmentKey,
    patch: Partial<QuickSetupCommitmentDraft>,
  ) => {
    setCommitments((prev) => prev.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  };

  const handleSave = useCallback(async () => {
    if (!user?.id || saving) return;
    setSaving(true);
    try {
      const paydayNum = payday.trim()
        ? Math.min(31, Math.max(1, parseInt(payday, 10) || 1))
        : null;
      await saveQuickSetupProfileFields(user.id, {
        expectedMonthlyIncome: incomeNum > 0 ? Math.round(incomeNum) : null,
        payday: paydayNum,
        employmentType: employmentChipToDb(employment),
      });

      // Úvěry = loans (ne transakce). Předchozí položky z rychlého nastavení vždy nahradit (jinak duplicity při opakování).
      {
        const setupNames = new Set(
          Object.keys(COMMITMENT_TITLE_TO_KEY).flatMap((n) => [
            n,
            `${n} 2`,
            `${n} 3`,
            `${n} 4`,
          ]),
        );
        for (const loan of loans) {
          const base = (loan.name ?? '').replace(/ \d+$/, '');
          if (setupNames.has(loan.name ?? '') || setupNames.has(base)) {
            deleteLoan(loan.id);
          }
        }
      }

      const newLoans = buildQuickSetupLoans(commitments);
      for (const loan of newLoans) {
        addLoan(loan);
      }

      // Nájem / energie / telefon → Pravidelné platby (měsíčně), bez okamžité transakce.
      const recurringDrafts = buildQuickSetupRecurring(commitments);
      {
        const pr = await import('@/lib/personal-recurring');
        const { rules } = await pr.fetchPersonalRecurringRules(user.id);
        const setupTitles = new Set(
          Object.entries(COMMITMENT_TITLE_TO_KEY)
            .filter(([, k]) => k === 'rent' || k === 'energy' || k === 'phone')
            .map(([n]) => n),
        );
        // Editace: stará pravidla z rychlého nastavení nahradíme (transakce zůstanou).
        for (const r of rules ?? []) {
          if (setupTitles.has(r.title)) await pr.deletePersonalRecurringRule(user.id, r.id);
        }
        for (const d of recurringDrafts) {
          const { error: recErr } = await pr.createPersonalRecurringRuleOnly(user.id, {
            type: 'expense',
            title: d.title,
            amount: d.amount,
            currency: 'CZK',
            category: d.category,
            subcategory: d.subcategory,
            frequency: 'monthly',
            startDate: d.startDate,
          });
          if (recErr) console.warn('[quick-setup] recurring', recErr.message);
        }
      }

      const budgetSpecs: { category: string; raw: string }[] = [
        { category: 'Jídlo', raw: budget.food },
        { category: 'Auto a doprava', raw: budget.transportation },
        { category: 'Nákupy', raw: budget.shopping },
        { category: 'Volný čas', raw: budget.entertainment },
      ];
      // Rozpočty paralelně (dřív se ukládaly jeden po druhém → pomalé „Hotovo“).
      const budgetWrites = budgetSpecs
        .map((spec) => ({ spec, amt: parseMoneyInput(spec.raw) }))
        .filter((x) => x.amt != null && (x.amt as number) > 0)
        .map((x) =>
          upsertUserBudgetByCategory({
            userId: user.id,
            category: x.spec.category,
            amount: x.amt as number,
          }),
        );
      await Promise.all([...budgetWrites, markQuickSetupCompleted(user.id)]);
      showToast({ type: 'success', message: tr('✓ Appka je nastavená', '✓ All set up') });
      goAfterSetup();
      // Notifikace mají smysl až teď (připomínky splatností, hlídání rozpočtů).
      if (newLoans.length > 0 || recurringDrafts.length > 0 || budgetWrites.length > 0) {
        setTimeout(() => {
          void askNotificationsInContext();
        }, 1200);
      }
    } catch (e) {
      console.warn('[quick-setup] save', e);
      showToast({ type: 'error', message: tr('Nepodařilo se uložit nastavení', 'Could not save your setup') });
    } finally {
      setSaving(false);
    }
  }, [
    user,
    saving,
    incomeNum,
    payday,
    budget,
    employment,
    commitments,
    isEdit,
    loans,
    deleteLoan,
    addLoan,
    goTabs,
    goAfterSetup,
  ]);

  const progress = (step + 1) / STEPS;

  if (loadingPrefill) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background, justifyContent: 'center' }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader
        title={isEdit ? tr('Příjem a rozpočty', 'Income & budgets') : tr('Rychlé nastavení', 'Quick setup')}
        subtitle={isEdit ? tr('Uprav si plán', 'Adjust your plan') : tr('Zvládneš to za minutu', 'Takes about a minute')}
        variant="gradient"
        right={
          <TouchableOpacity onPress={() => void handleSkip()} hitSlop={10}>
            <Text style={styles.skipText}>{isEdit ? tr('Zavřít', 'Close') : tr('Přeskočit', 'Skip')}</Text>
          </TouchableOpacity>
        }
      />

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: colors.primary }]} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
          keyboardShouldPersistTaps="handled"
        >
          {step === 0 ? (
            <View>
              <Text style={[styles.headline, { color: colors.text }]}>{tr('Kolik ti měsíčně přijde?', 'How much do you earn a month?')}</Text>
              <Text style={[styles.hint, { color: colors.textSecondary }]}>
                {tr('Čistý měsíční příjem — pomůže naplánovat rozpočet.', 'Net monthly income — helps plan your budget.')}
              </Text>
              <View
                style={[
                  styles.incomeBox,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <TextInput
                  value={income}
                  onChangeText={(v) => setIncome(formatKčGrouped(v))}
                  keyboardType="number-pad"
                  placeholder="35 000"
                  placeholderTextColor={colors.textSecondary}
                  style={[styles.incomeInput, { color: colors.text }]}
                />
                <Text style={[styles.currency, { color: colors.textSecondary }]}>Kč</Text>
              </View>

              {showIncomeSuggestion && incomeSuggestion ? (
                <View
                  style={[
                    styles.suggestCard,
                    { backgroundColor: colors.primary + '14', borderColor: colors.primary + '55' },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>
                      {tr(`Podle výpisů ti chodí průměrně ${formatKčGrouped(String(incomeSuggestion.average))} Kč`, `Based on your statements you earn ${formatKčGrouped(String(incomeSuggestion.average))} Kč on average`)}
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                      {tr(`Posledních ${incomeSuggestion.monthly.length} výplat:`, `Last ${incomeSuggestion.monthly.length} salaries:`)}{' '}
                      {incomeSuggestion.monthly
                        .map((m) => formatKčGrouped(String(Math.round(m.amount))))
                        .join(' · ')}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      setIncome(formatKčGrouped(String(incomeSuggestion.average)));
                      if (!payday && incomeSuggestion.payday) setPayday(String(incomeSuggestion.payday));
                    }}
                    style={[styles.suggestBtn, { backgroundColor: colors.primary }]}
                    accessibilityRole="button"
                  >
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{tr('Použít', 'Use')}</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{tr('Typ příjmu', 'Income type')}</Text>
              <View style={styles.chipRow}>
                {EMPLOYMENT_CHIPS.map((c) => {
                  const on = employment === c.id;
                  return (
                    <TouchableOpacity
                      key={c.id}
                      onPress={() => setEmployment(on ? null : c.id)}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: on ? colors.primary : colors.muted,
                        },
                      ]}
                    >
                      <Text style={{ color: on ? '#fff' : colors.text, fontWeight: '600', fontSize: 13 }}>
                        {tr(c.label, c.labelEn)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                {tr('Den výplaty (nepovinné)', 'Payday (optional)')}
              </Text>
              <TextInput
                value={payday}
                onChangeText={(v) => setPayday(v.replace(/[^\d]/g, '').slice(0, 2))}
                keyboardType="number-pad"
                placeholder="1–31"
                placeholderTextColor={colors.textSecondary}
                style={[
                  styles.smallInput,
                  { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              />
            </View>
          ) : null}

          {step === 1 ? (
            <View>
              <Text style={[styles.headline, { color: colors.text }]}>{tr('Pravidelné platby', 'Regular payments')}</Text>
              <Text style={[styles.hint, { color: colors.textSecondary }]}>
                {tr('Nájem, energie a telefon uložíme do Pravidelných plateb, hypotéku a leasing do Úvěrů. Až nahraješ výpis, platby se samy spárují.', 'Rent, energy and phone go to Regular payments, mortgage and leasing to Loans. Once you upload a statement, payments are matched automatically.')}
              </Text>
              {commitments.map((c) => {
                const meta = getCommitmentMeta(c.key);
                return (
                  <View
                    key={c.key}
                    style={[
                      styles.commitmentCard,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                    ]}
                  >
                    <View style={styles.commitmentHeader}>
                      <Text style={{ fontSize: 22 }}>{meta.emoji}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.commitmentTitle, { color: colors.text }]}>{commitmentName(c.key)}</Text>
                        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                          {categoryPathLabel(meta.categoryTag.split(' › ')[0], meta.categoryTag.split(' › ')[1] ?? null).replace(' · ', ' › ')}
                        </Text>
                      </View>
                      <Switch
                        value={c.enabled}
                        onValueChange={(v) => updateCommitment(c.key, { enabled: v })}
                        trackColor={{ true: colors.primary }}
                      />
                    </View>
                    {c.enabled ? (
                      <View style={styles.commitmentFields}>
                        <View style={{ flex: 1.4 }}>
                          <Text style={[styles.miniLabel, { color: colors.textSecondary }]}>{tr('Částka', 'Amount')}</Text>
                          <TextInput
                            value={c.amount}
                            onChangeText={(v) => updateCommitment(c.key, { amount: formatKčGrouped(v) })}
                            keyboardType="number-pad"
                            placeholder="0"
                            placeholderTextColor={colors.textSecondary}
                            style={[
                              styles.smallInput,
                              {
                                color: colors.text,
                                backgroundColor: colors.background,
                                borderColor: colors.border,
                              },
                            ]}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.miniLabel, { color: colors.textSecondary }]}>{tr('Den', 'Day')}</Text>
                          <TextInput
                            value={c.dueDay}
                            onChangeText={(v) =>
                              updateCommitment(c.key, {
                                dueDay: v.replace(/[^\d]/g, '').slice(0, 2),
                              })
                            }
                            keyboardType="number-pad"
                            placeholder="15"
                            placeholderTextColor={colors.textSecondary}
                            style={[
                              styles.smallInput,
                              {
                                color: colors.text,
                                backgroundColor: colors.background,
                                borderColor: colors.border,
                              },
                            ]}
                          />
                        </View>
                      </View>
                    ) : null}
                    {c.key === 'leasing' && c.enabled ? (
                      <View style={{ marginTop: 8, gap: 8 }}>
                        {(c.extras ?? []).map((ex, i) => (
                          <View key={i} style={styles.commitmentFields}>
                            <TextInput
                              value={ex.amount}
                              onChangeText={(v) => {
                                const extras = [...(c.extras ?? [])];
                                extras[i] = { ...extras[i]!, amount: formatKčGrouped(v) };
                                updateCommitment('leasing', { extras });
                              }}
                              keyboardType="number-pad"
                              placeholder={tr('Částka', 'Amount')}
                              placeholderTextColor={colors.textSecondary}
                              style={[
                                styles.smallInput,
                                {
                                  flex: 1.4,
                                  color: colors.text,
                                  backgroundColor: colors.background,
                                  borderColor: colors.border,
                                },
                              ]}
                            />
                            <TextInput
                              value={ex.dueDay}
                              onChangeText={(v) => {
                                const extras = [...(c.extras ?? [])];
                                extras[i] = {
                                  ...extras[i]!,
                                  dueDay: v.replace(/[^\d]/g, '').slice(0, 2),
                                };
                                updateCommitment('leasing', { extras });
                              }}
                              keyboardType="number-pad"
                              placeholder={tr('Den', 'Day')}
                              placeholderTextColor={colors.textSecondary}
                              style={[
                                styles.smallInput,
                                {
                                  flex: 1,
                                  color: colors.text,
                                  backgroundColor: colors.background,
                                  borderColor: colors.border,
                                },
                              ]}
                            />
                            <TouchableOpacity
                              onPress={() => {
                                const extras = (c.extras ?? []).filter((_, j) => j !== i);
                                updateCommitment('leasing', { extras });
                              }}
                              hitSlop={8}
                            >
                              <Trash2 color="#EF4444" size={18} />
                            </TouchableOpacity>
                          </View>
                        ))}
                        <TouchableOpacity
                          style={styles.addLeasingBtn}
                          onPress={() =>
                            updateCommitment('leasing', {
                              extras: [...(c.extras ?? []), { amount: '', dueDay: '15' }],
                            })
                          }
                        >
                          <Plus color={colors.primary} size={16} />
                          <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>
                            {tr('Přidat další leasing / půjčku', 'Add another leasing / loan')}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : null}

          {step === 2 ? (
            <View>
              <Text style={[styles.headline, { color: colors.text }]}>
                {tr('Kolik zhruba utratíš za měsíc?', 'Roughly how much do you spend a month?')}
              </Text>
              <Text style={[styles.hint, { color: colors.textSecondary }]}>
                {tr('Nepovinné — nastaví měsíční limity (rozpočty) na kategorie.', 'Optional — sets monthly limits (budgets) for categories.')}
              </Text>
              {BUDGET_FIELDS.map((f) => (
                <View key={f.key} style={styles.budgetRow}>
                  <Text style={{ fontSize: 22, width: 36 }}>{f.emoji}</Text>
                  <Text style={[styles.budgetLabel, { color: colors.text }]}>{tr(f.label, f.labelEn)}</Text>
                  <TextInput
                    value={budget[f.key]}
                    onChangeText={(v) =>
                      setBudget((b) => ({ ...b, [f.key]: formatKčGrouped(v) }))
                    }
                    keyboardType="number-pad"
                    placeholder="0"
                    placeholderTextColor={colors.textSecondary}
                    style={[
                      styles.budgetInput,
                      {
                        color: colors.text,
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                  />
                  <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Kč</Text>
                </View>
              ))}

              <View
                style={[
                  styles.summaryCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.summaryLine, { color: colors.textSecondary }]}>
                  {tr(
                    `Příjem ${incomeNum.toLocaleString(uiLocale())} − pravidelné platby ${commitmentsSum.toLocaleString(uiLocale())} − plán výdajů ${budgetSum.toLocaleString(uiLocale())}`,
                    `Income ${incomeNum.toLocaleString(uiLocale())} − regular payments ${commitmentsSum.toLocaleString(uiLocale())} − planned spending ${budgetSum.toLocaleString(uiLocale())}`,
                  )}
                </Text>
                <Text
                  style={[
                    styles.summaryRemain,
                    { color: remaining >= 0 ? '#10B981' : '#EF4444' },
                  ]}
                >
                  {tr(`= zbývá ${remaining.toLocaleString(uiLocale())} Kč`, `= ${remaining.toLocaleString(uiLocale())} Kč left`)}
                </Text>
              </View>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <View
        style={[
          styles.footer,
          {
            paddingBottom: Math.max(insets.bottom, 12),
            backgroundColor: colors.background,
            borderTopColor: colors.border,
          },
        ]}
      >
        {step > 0 ? (
          <TouchableOpacity
            onPress={() => setStep((s) => s - 1)}
            style={[styles.footerBtnSecondary, { borderColor: colors.border }]}
          >
            <Text style={{ color: colors.text, fontWeight: '700' }}>{tr('Zpět', 'Back')}</Text>
          </TouchableOpacity>
        ) : null}
        {step < STEPS - 1 ? (
          <TouchableOpacity
            onPress={() => setStep((s) => Math.min(STEPS - 1, s + 1))}
            style={styles.footerBtnPrimaryWrap}
          >
            <LinearGradient
              colors={[colors.gradientStart ?? '#667eea', colors.gradientEnd ?? '#764ba2']}
              style={styles.footerBtnPrimary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.footerBtnPrimaryText}>{tr('Další', 'Next')}</Text>
            </LinearGradient>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={() => void handleSave()}
            disabled={saving}
            style={[styles.footerBtnPrimaryWrap, { opacity: saving ? 0.7 : 1 }]}
          >
            <LinearGradient
              colors={[colors.gradientStart ?? '#667eea', colors.gradientEnd ?? '#764ba2']}
              style={styles.footerBtnPrimary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.footerBtnPrimaryText}>{tr('Hotovo', 'Done')}</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  skipText: { color: 'rgba(255,255,255,0.92)', fontWeight: '700', fontSize: 15 },
  progressTrack: {
    height: 4,
    backgroundColor: 'rgba(0,0,0,0.06)',
    marginHorizontal: 16,
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 4,
  },
  progressFill: { height: '100%', borderRadius: 2 },
  scroll: { paddingHorizontal: 20, paddingTop: 20 },
  headline: { fontSize: 24, fontWeight: '800', marginBottom: 8 },
  hint: { fontSize: 14, lineHeight: 20, marginBottom: 20 },
  incomeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 20,
  },
  incomeInput: { flex: 1, fontSize: 32, fontWeight: '800', paddingVertical: 12 },
  suggestCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 10 },
  suggestBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10 },
  currency: { fontSize: 20, fontWeight: '700', marginLeft: 8 },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999 },
  smallInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: '600',
  },
  commitmentCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  commitmentHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  commitmentTitle: { fontSize: 16, fontWeight: '700' },
  commitmentFields: { flexDirection: 'row', gap: 10, marginTop: 12, alignItems: 'flex-end' },
  miniLabel: { fontSize: 11, fontWeight: '600', marginBottom: 4 },
  addLeasingBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  budgetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  budgetLabel: { flex: 1, fontSize: 15, fontWeight: '600' },
  budgetInput: {
    width: 110,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'right',
  },
  summaryCard: {
    marginTop: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
  },
  summaryLine: { fontSize: 13, lineHeight: 18 },
  summaryRemain: { fontSize: 20, fontWeight: '800', marginTop: 8 },
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerBtnSecondary: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  footerBtnPrimaryWrap: { flex: 1.4, borderRadius: 14, overflow: 'hidden' },
  footerBtnPrimary: { paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  footerBtnPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
