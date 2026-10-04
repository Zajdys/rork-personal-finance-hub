import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowRight,
  ArrowLeft,
  Briefcase,
  DollarSign,
  Target,
  TrendingUp,
  Home,
  Car,
  GraduationCap,
  Heart,
  CheckCircle,
} from 'lucide-react-native';
import { useSettingsStore } from '@/store/settings-store';
import { useLanguageStore } from '@/store/language-store';
import { pluralUver } from '@/lib/plural-cs';
import { useAuth } from '@/store/auth-store';
import { useRouter } from 'expo-router';
import { useFinanceStore } from '@/store/finance-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  buildBudgetGoalsFromOnboarding,
  insertLoanRecurringExpenses,
  isLikelyNetworkError,
  parseDecimalInput,
  parseMoneyInput,
  persistOnboardingUserRow,
  savePendingOnboardingProfileSync,
  type LoanPersist,
  type OnboardingUserRowPayload,
} from '@/lib/onboarding-completion';
import { hasAppLockPin, setAppLockEnabled, setAppLockPin } from '@/lib/app-lock-storage';
import { PinSetupFlow } from '@/components/PinSetupFlow';
import { BiometricOptIn, resolveBiometricLabel } from '@/components/BiometricOptIn';

type EmploymentStatus = 'employed' | 'selfEmployed' | 'student' | 'unemployed' | 'retired';
type IncomeRange = 'under20k' | '20k-40k' | '40k-60k' | '60k-100k' | 'over100k';
type FinancialGoal = 'savings' | 'investment' | 'debt' | 'house' | 'car' | 'education' | 'retirement';
type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';

interface Loan {
  id: string;
  loanType: 'mortgage' | 'car' | 'personal' | 'student' | 'other';
  loanAmount: string;
  interestRate: string;
  monthlyPayment: string;
  remainingMonths: string;
}

interface LoanData {
  hasLoan: boolean;
  loans: Loan[];
}

interface BudgetBreakdown {
  housing: string;
  food: string;
  transportation: string;
  entertainment: string;
  savings: string;
  other: string;
}

interface OnboardingData {
  employmentStatus: EmploymentStatus | null;
  monthlyIncome: IncomeRange | null;
  financialGoals: FinancialGoal[];
  experienceLevel: ExperienceLevel | null;
  loanData: LoanData;
  budgetBreakdown: BudgetBreakdown;
}

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<number>(1);
  /** null = checking SecureStore; pin/bio = mandatory security before questions */
  const [securityPhase, setSecurityPhase] = useState<'loading' | 'pin' | 'bio' | 'done'>('loading');
  const [data, setData] = useState<OnboardingData>({
    employmentStatus: null,
    monthlyIncome: null,
    financialGoals: [],
    experienceLevel: null,
    loanData: {
      hasLoan: false,
      loans: [],
    },
    budgetBreakdown: {
      housing: '',
      food: '',
      transportation: '',
      entertainment: '',
      savings: '',
      other: '',
    },
  });

  const { isDarkMode, setCurrency } = useSettingsStore();
  const { t, language } = useLanguageStore();
  const { user, setUser } = useAuth();
  const { addLoan: addLoanToStore, addFinancialGoal } = useFinanceStore();
  const router = useRouter();

  const totalSteps = 7;

  useEffect(() => {
    if (Platform.OS === 'web') {
      setSecurityPhase('done');
      return;
    }
    void (async () => {
      const hasPin = await hasAppLockPin();
      setSecurityPhase(hasPin ? 'done' : 'pin');
    })();
  }, []);

  const finishSecurity = useCallback(() => {
    setSecurityPhase('done');
  }, []);

  const handlePinComplete = useCallback(
    async (pin: string) => {
      await setAppLockPin(pin);
      await setAppLockEnabled(true);
      const bio = await resolveBiometricLabel(language);
      if (bio.available) {
        setSecurityPhase('bio');
      } else {
        finishSecurity();
      }
    },
    [language, finishSecurity],
  );

  if (securityPhase === 'loading') {
    return (
      <View style={[styles.container, styles.securityLoading, { backgroundColor: isDarkMode ? '#111827' : '#F8FAFC' }]}>
        <ActivityIndicator size="large" color="#667eea" />
      </View>
    );
  }

  if (securityPhase === 'pin') {
    return <PinSetupFlow onComplete={(pin) => void handlePinComplete(pin)} />;
  }

  if (securityPhase === 'bio') {
    return <BiometricOptIn onDone={finishSecurity} />;
  }

  const handleNext = () => {
    if (step === 1 && !data.employmentStatus) {
      Alert.alert(t('error'), t('onboardingSelectWorkStatus'));
      return;
    }
    if (step === 2 && !data.monthlyIncome) {
      Alert.alert(t('error'), t('onboardingSelectIncome'));
      return;
    }
    if (step === 3 && data.financialGoals.length === 0) {
      Alert.alert(t('error'), t('onboardingSelectGoals'));
      return;
    }
    if (step === 4 && !data.experienceLevel) {
      Alert.alert(t('error'), t('onboardingSelectExperience'));
      return;
    }
    if (step === 5 && data.loanData.hasLoan) {
      if (data.loanData.loans.length === 0) {
        Alert.alert(t('error'), t('onboardingAddLoan'));
        return;
      }
      const incompleteLoan = data.loanData.loans.find(
        loan => !loan.loanAmount || !loan.interestRate || !loan.monthlyPayment || !loan.remainingMonths
      );
      if (incompleteLoan) {
        Alert.alert(t('error'), t('onboardingFillLoans'));
        return;
      }
    }
    if (step === 6) {
      const { housing, food, transportation } = data.budgetBreakdown;
      if (!housing || !food || !transportation) {
        Alert.alert(t('error'), t('onboardingFillBudget'));
        return;
      }
    }

    if (step < totalSteps) {
      setStep(step + 1);
    } else {
      handleComplete();
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleComplete = async () => {
    try {
      console.log('Starting onboarding completion...');

      if (!user?.id || !user.email) {
        Alert.alert(t('error'), t('onboardingNotSignedIn'));
        return;
      }

      const suggestedCurrency = 'CZK' as const;
      setCurrency(suggestedCurrency);

      const employmentStatusLabels: Record<EmploymentStatus, string> = {
        employed: t('onboardingEmployed'),
        selfEmployed: t('onboardingSelfEmployed'),
        student: t('onboardingStudent'),
        unemployed: t('onboardingUnemployed'),
        retired: t('onboardingRetired'),
      };

      const incomeLabels: Record<IncomeRange, string> = {
        under20k: t('onboardingIncomeUnder20k'),
        '20k-40k': t('onboardingIncome20to40k'),
        '40k-60k': t('onboardingIncome40to60k'),
        '60k-100k': t('onboardingIncome60to100k'),
        over100k: t('onboardingIncomeOver100k'),
      };

      const experienceLabels: Record<ExperienceLevel, string> = {
        beginner: t('onboardingBeginner'),
        intermediate: t('onboardingIntermediate'),
        advanced: t('onboardingAdvanced'),
      };

      const goalLabels: Record<FinancialGoal, string> = {
        savings: t('onboardingGoalSavings'),
        investment: t('onboardingGoalInvest'),
        debt: t('onboardingGoalDebt'),
        house: t('onboardingGoalSavings'),
        car: t('onboardingGoalSavings'),
        education: t('onboardingGoalEducation'),
        retirement: t('onboardingGoalRetirement'),
      };

      const loanTypeLabels: Record<Loan['loanType'], string> = {
        mortgage: t('loanTypeMortgage'),
        car: t('loanTypeCar'),
        personal: t('onboardingLoanPersonal'),
        student: t('loanTypeStudent'),
        other: t('onboardingLoanOther'),
      };

      if (!data.employmentStatus || !data.monthlyIncome || !data.experienceLevel) {
        Alert.alert(t('error'), t('onboardingMissingData'));
        return;
      }

      const loanDetails: LoanPersist[] | null =
        data.loanData.hasLoan && data.loanData.loans.length > 0
          ? data.loanData.loans.map((l) => ({
              loanType: l.loanType,
              loanAmount: parseMoneyInput(l.loanAmount) ?? 0,
              interestRate: parseDecimalInput(l.interestRate, 4) ?? 0,
              monthlyPayment: parseMoneyInput(l.monthlyPayment) ?? 0,
              remainingMonths: Number.parseInt(String(l.remainingMonths ?? '0'), 10) || 0,
            }))
          : null;

      const profilePayload: OnboardingUserRowPayload = {
        userId: user.id,
        email: user.email,
        displayName: user.name || user.email,
        employmentStatus: data.employmentStatus,
        monthlyIncome: data.monthlyIncome,
        financialGoals: data.financialGoals.slice(),
        experienceLevel: data.experienceLevel,
        hasLoans: Boolean(data.loanData.hasLoan),
        loanDetails,
        monthlyBudget: { ...data.budgetBreakdown },
      };

      const { error: saveErr } = await persistOnboardingUserRow(profilePayload);

      if (saveErr) {
        if (isLikelyNetworkError(saveErr)) {
          console.warn('[onboarding] Supabase save offline; queueing profile for sync', saveErr.message);
          await savePendingOnboardingProfileSync(profilePayload);
        } else {
          console.error('[onboarding] Supabase save', saveErr);
          Alert.alert(t('error'), saveErr.message || t('onboardingSaveFailed'));
          return;
        }
      }

      const budgetGoals = buildBudgetGoalsFromOnboarding(user.id, data.budgetBreakdown);
      budgetGoals.forEach((g) => addFinancialGoal(g));

      if (data.loanData.hasLoan && data.loanData.loans.length > 0) {
        const { error: loanErr } = await insertLoanRecurringExpenses({
          userId: user.id,
          loans: data.loanData.loans.map((l) => ({
            loanType: l.loanType,
            monthlyPayment: l.monthlyPayment,
            displayName: t('onboardingPaymentLabel', { type: loanTypeLabels[l.loanType] ?? l.loanType }),
          })),
        });
        if (loanErr) {
          Alert.alert(t('error'), loanErr.message);
        }

        data.loanData.loans.forEach((loan, index) => {
          const loanItem = {
            id: `${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
            loanType: loan.loanType,
            loanAmount: parseMoneyInput(loan.loanAmount) ?? 0,
            interestRate: parseDecimalInput(loan.interestRate, 4) ?? 0,
            monthlyPayment: parseMoneyInput(loan.monthlyPayment) ?? 0,
            remainingMonths: Number.parseInt(String(loan.remainingMonths ?? '0'), 10) || 0,
            startDate: new Date(),
            name: getLoanTypeLabel(loan.loanType, t),
            currentBalance: parseMoneyInput(loan.loanAmount) ?? 0,
          };
          addLoanToStore(loanItem);
        });
      }

      setUser({
        ...user,
        onboardingCompleted: true,
        welcomeTourCompleted: false,
      });

      const onboardingProfile = {
        ...data,
        completedAt: new Date().toISOString(),
        userId: user.id,
      };
      await AsyncStorage.setItem('onboarding_completed', 'true');
      await AsyncStorage.setItem('onboarding_profile', JSON.stringify(onboardingProfile));

      const apiBaseUrlRaw =
        (process.env.EXPO_PUBLIC_RORK_API_BASE_URL ?? process.env.EXPO_PUBLIC_API_URL) ||
        (typeof window !== 'undefined' ? window.location.origin : '');
      const apiBaseUrl = String(apiBaseUrlRaw).replace(/\/$/, '');
      const onboardingUrl = `${apiBaseUrl}/api/onboarding/submit`;
      const token = (await AsyncStorage.getItem('authToken')) ?? '';
      const payload = {
        email: user.email,
        workStatus: employmentStatusLabels[data.employmentStatus],
        monthlyIncomeRange: incomeLabels[data.monthlyIncome],
        financeExperience: experienceLabels[data.experienceLevel],
        financialGoals: data.financialGoals.map((g) => goalLabels[g]).filter(Boolean),
        hasLoan: Boolean(data.loanData.hasLoan),
        budgetHousing: parseMoneyInput(String(data.budgetBreakdown?.housing ?? '')) ?? 0,
        budgetFood: parseMoneyInput(String(data.budgetBreakdown?.food ?? '')) ?? 0,
        budgetTransport: parseMoneyInput(String(data.budgetBreakdown?.transportation ?? '')) ?? 0,
        budgetFun: parseMoneyInput(String(data.budgetBreakdown?.entertainment ?? '')) ?? 0,
        budgetSavings: parseMoneyInput(String(data.budgetBreakdown?.savings ?? '')) ?? 0,
        loans: (data.loanData.loans ?? []).map((l) => ({
          loanType: loanTypeLabels[l.loanType] ?? String(l.loanType),
          loanAmount: parseMoneyInput(String(l.loanAmount ?? '0')) ?? 0,
          interestRate: parseDecimalInput(String(l.interestRate ?? '0'), 4) ?? 0,
          monthlyPayment: parseMoneyInput(String(l.monthlyPayment ?? '0')) ?? 0,
          remainingMonths: Number.parseInt(String(l.remainingMonths ?? '0'), 10) || 0,
        })),
      } as const;

      try {
        if (token || user.email) {
          const resp = await fetch(onboardingUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
          });
          if (!resp.ok) {
            console.warn('[onboarding] optional backend submit failed', resp.status);
          }
        }
      } catch (e) {
        console.warn('[onboarding] optional backend submit', e);
      }

      // Navigaci na welcome-tour řídí root _layout gate po aktualizaci user stavu.
      setTimeout(() => {
        Alert.alert(t('onboardingDoneTitle'), t('onboardingDoneMessage'), [{ text: t('confirm') }]);
      }, 500);
    } catch (error) {
      console.error('Failed to save onboarding data:', error);
      Alert.alert(t('error'), t('onboardingSaveError'));
    }
  };

  const toggleGoal = (goal: FinancialGoal) => {
    setData((prev) => ({
      ...prev,
      financialGoals: prev.financialGoals.includes(goal)
        ? prev.financialGoals.filter((g) => g !== goal)
        : [...prev.financialGoals, goal],
    }));
  };

  const addLoanToForm = () => {
    const newLoan: Loan = {
      id: Date.now().toString(),
      loanType: 'mortgage',
      loanAmount: '',
      interestRate: '',
      monthlyPayment: '',
      remainingMonths: '',
    };
    setData((prev) => ({
      ...prev,
      loanData: {
        ...prev.loanData,
        loans: [...prev.loanData.loans, newLoan],
      },
    }));
  };

  const removeLoan = (id: string) => {
    setData((prev) => ({
      ...prev,
      loanData: {
        ...prev.loanData,
        loans: prev.loanData.loans.filter((loan) => loan.id !== id),
      },
    }));
  };

  const updateLoan = (id: string, field: keyof Loan, value: string) => {
    setData((prev) => ({
      ...prev,
      loanData: {
        ...prev.loanData,
        loans: prev.loanData.loans.map((loan) =>
          loan.id === id ? { ...loan, [field]: value } : loan
        ),
      },
    }));
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <View style={styles.stepContent}>
            <Text style={[styles.stepTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
              Jaký je tvůj pracovní status?
            </Text>
            <Text style={[styles.stepSubtitle, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
              Pomůže nám to lépe nastavit tvoje finanční plány
            </Text>

            <View style={styles.optionsContainer}>
              <OptionCard
                icon={Briefcase}
                title={t('onboardingEmployed')}
                selected={data.employmentStatus === 'employed'}
                onPress={() => setData({ ...data, employmentStatus: 'employed' })}
                isDarkMode={isDarkMode}
              />
              <OptionCard
                icon={TrendingUp}
                title={t('onboardingSelfEmployed')}
                selected={data.employmentStatus === 'selfEmployed'}
                onPress={() => setData({ ...data, employmentStatus: 'selfEmployed' })}
                isDarkMode={isDarkMode}
              />
              <OptionCard
                icon={GraduationCap}
                title={t('onboardingStudent')}
                selected={data.employmentStatus === 'student'}
                onPress={() => setData({ ...data, employmentStatus: 'student' })}
                isDarkMode={isDarkMode}
              />
              <OptionCard
                icon={Home}
                title={t('onboardingUnemployed')}
                selected={data.employmentStatus === 'unemployed'}
                onPress={() => setData({ ...data, employmentStatus: 'unemployed' })}
                isDarkMode={isDarkMode}
              />
              <OptionCard
                icon={Heart}
                title={t('onboardingRetired')}
                selected={data.employmentStatus === 'retired'}
                onPress={() => setData({ ...data, employmentStatus: 'retired' })}
                isDarkMode={isDarkMode}
              />
            </View>
          </View>
        );

      case 2:
        return (
          <View style={styles.stepContent}>
            <Text style={[styles.stepTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
              Jaký je tvůj měsíční příjem?
            </Text>
            <Text style={[styles.stepSubtitle, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
              Přibližná částka nám pomůže nastavit realistické cíle
            </Text>

            <View style={styles.optionsContainer}>
              <OptionCard
                icon={DollarSign}
                title={t('onboardingIncomeUnder20k')}
                selected={data.monthlyIncome === 'under20k'}
                onPress={() => setData({ ...data, monthlyIncome: 'under20k' })}
                isDarkMode={isDarkMode}
              />
              <OptionCard
                icon={DollarSign}
                title={t('onboardingIncome20to40k')}
                selected={data.monthlyIncome === '20k-40k'}
                onPress={() => setData({ ...data, monthlyIncome: '20k-40k' })}
                isDarkMode={isDarkMode}
              />
              <OptionCard
                icon={DollarSign}
                title={t('onboardingIncome40to60k')}
                selected={data.monthlyIncome === '40k-60k'}
                onPress={() => setData({ ...data, monthlyIncome: '40k-60k' })}
                isDarkMode={isDarkMode}
              />
              <OptionCard
                icon={DollarSign}
                title={t('onboardingIncome60to100k')}
                selected={data.monthlyIncome === '60k-100k'}
                onPress={() => setData({ ...data, monthlyIncome: '60k-100k' })}
                isDarkMode={isDarkMode}
              />
              <OptionCard
                icon={DollarSign}
                title={t('onboardingIncomeOver100k')}
                selected={data.monthlyIncome === 'over100k'}
                onPress={() => setData({ ...data, monthlyIncome: 'over100k' })}
                isDarkMode={isDarkMode}
              />
            </View>
          </View>
        );

      case 3:
        return (
          <View style={styles.stepContent}>
            <Text style={[styles.stepTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
              Jaké jsou tvoje finanční cíle?
            </Text>
            <Text style={[styles.stepSubtitle, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
              Můžeš vybrat víc možností
            </Text>

            <View style={styles.optionsContainer}>
              <OptionCard
                icon={Target}
                title={t('onboardingGoalSavings')}
                selected={data.financialGoals.includes('savings')}
                onPress={() => toggleGoal('savings')}
                isDarkMode={isDarkMode}
                multiSelect
              />
              <OptionCard
                icon={TrendingUp}
                title={t('onboardingGoalInvest')}
                selected={data.financialGoals.includes('investment')}
                onPress={() => toggleGoal('investment')}
                isDarkMode={isDarkMode}
                multiSelect
              />
              <OptionCard
                icon={DollarSign}
                title={t('onboardingGoalDebt')}
                selected={data.financialGoals.includes('debt')}
                onPress={() => toggleGoal('debt')}
                isDarkMode={isDarkMode}
                multiSelect
              />
              <OptionCard
                icon={Home}
                title="Koupit nemovitost"
                selected={data.financialGoals.includes('house')}
                onPress={() => toggleGoal('house')}
                isDarkMode={isDarkMode}
                multiSelect
              />
              <OptionCard
                icon={Car}
                title="Koupit auto"
                selected={data.financialGoals.includes('car')}
                onPress={() => toggleGoal('car')}
                isDarkMode={isDarkMode}
                multiSelect
              />
              <OptionCard
                icon={GraduationCap}
                title={t('onboardingGoalEducation')}
                selected={data.financialGoals.includes('education')}
                onPress={() => toggleGoal('education')}
                isDarkMode={isDarkMode}
                multiSelect
              />
              <OptionCard
                icon={Heart}
                title={t('onboardingGoalRetirement')}
                selected={data.financialGoals.includes('retirement')}
                onPress={() => toggleGoal('retirement')}
                isDarkMode={isDarkMode}
                multiSelect
              />
            </View>
          </View>
        );

      case 4:
        return (
          <View style={styles.stepContent}>
            <Text style={[styles.stepTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
              Jaká je tvoje zkušenost s financemi?
            </Text>
            <Text style={[styles.stepSubtitle, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
              Přizpůsobíme obsah podle tvojí úrovně
            </Text>

            <View style={styles.optionsContainer}>
              <OptionCard
                icon={Target}
                title={t('onboardingBeginner')}
                subtitle={t('onboardingBeginnerSub')}
                selected={data.experienceLevel === 'beginner'}
                onPress={() => setData({ ...data, experienceLevel: 'beginner' })}
                isDarkMode={isDarkMode}
              />
              <OptionCard
                icon={TrendingUp}
                title={t('onboardingIntermediate')}
                subtitle={t('onboardingIntermediateSub')}
                selected={data.experienceLevel === 'intermediate'}
                onPress={() => setData({ ...data, experienceLevel: 'intermediate' })}
                isDarkMode={isDarkMode}
              />
              <OptionCard
                icon={CheckCircle}
                title={t('onboardingAdvanced')}
                subtitle={t('onboardingAdvancedSub')}
                selected={data.experienceLevel === 'advanced'}
                onPress={() => setData({ ...data, experienceLevel: 'advanced' })}
                isDarkMode={isDarkMode}
              />
            </View>
          </View>
        );

      case 5:
        return (
          <View style={styles.stepContent}>
            <Text style={[styles.stepTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
              Máš nějaký úvěr nebo hypotéku?
            </Text>
            <Text style={[styles.stepSubtitle, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
              Pomůže nám to lépe plánovat tvoje finance
            </Text>

            <View style={styles.optionsContainer}>
              <OptionCard
                icon={CheckCircle}
                title={t('onboardingHasLoan')}
                selected={data.loanData.hasLoan === true}
                onPress={() => {
                  setData({ ...data, loanData: { ...data.loanData, hasLoan: true } });
                  if (data.loanData.loans.length === 0) {
                    addLoanToForm();
                  }
                }}
                isDarkMode={isDarkMode}
              />
              <OptionCard
                icon={CheckCircle}
                title={t('onboardingNoLoan')}
                selected={data.loanData.hasLoan === false}
                onPress={() => setData({ ...data, loanData: { hasLoan: false, loans: [] } })}
                isDarkMode={isDarkMode}
              />
            </View>

            {data.loanData.hasLoan && (
              <View style={{ marginTop: 24 }}>
                <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                  Tvoje úvěry a hypotéky
                </Text>

                {data.loanData.loans.map((loan, index) => (
                  <View key={loan.id} style={[styles.loanCard, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}>
                    <View style={styles.loanCardHeader}>
                      <Text style={[styles.loanCardTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                        Úvěr #{index + 1}
                      </Text>
                      {data.loanData.loans.length > 1 && (
                        <TouchableOpacity
                          onPress={() => removeLoan(loan.id)}
                          style={styles.removeLoanButton}
                        >
                          <Text style={styles.removeLoanText}>✕</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    <View style={styles.loanTypeContainer}>
                      <TouchableOpacity
                        style={[
                          styles.loanTypeButton,
                          { backgroundColor: isDarkMode ? '#4B5563' : '#F3F4F6' },
                          loan.loanType === 'mortgage' && styles.loanTypeButtonSelected,
                        ]}
                        onPress={() => updateLoan(loan.id, 'loanType', 'mortgage')}
                      >
                        <Home color={loan.loanType === 'mortgage' ? 'white' : isDarkMode ? '#9CA3AF' : '#6B7280'} size={20} />
                        <Text style={[styles.loanTypeText, { color: loan.loanType === 'mortgage' ? 'white' : isDarkMode ? 'white' : '#1F2937' }]}>{t('loanTypeMortgage')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.loanTypeButton,
                          { backgroundColor: isDarkMode ? '#4B5563' : '#F3F4F6' },
                          loan.loanType === 'car' && styles.loanTypeButtonSelected,
                        ]}
                        onPress={() => updateLoan(loan.id, 'loanType', 'car')}
                      >
                        <Car color={loan.loanType === 'car' ? 'white' : isDarkMode ? '#9CA3AF' : '#6B7280'} size={20} />
                        <Text style={[styles.loanTypeText, { color: loan.loanType === 'car' ? 'white' : isDarkMode ? 'white' : '#1F2937' }]}>{t('loanTypeCar')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.loanTypeButton,
                          { backgroundColor: isDarkMode ? '#4B5563' : '#F3F4F6' },
                          loan.loanType === 'personal' && styles.loanTypeButtonSelected,
                        ]}
                        onPress={() => updateLoan(loan.id, 'loanType', 'personal')}
                      >
                        <DollarSign color={loan.loanType === 'personal' ? 'white' : isDarkMode ? '#9CA3AF' : '#6B7280'} size={20} />
                        <Text style={[styles.loanTypeText, { color: loan.loanType === 'personal' ? 'white' : isDarkMode ? 'white' : '#1F2937' }]}>{t('onboardingLoanPersonal')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.loanTypeButton,
                          { backgroundColor: isDarkMode ? '#4B5563' : '#F3F4F6' },
                          loan.loanType === 'student' && styles.loanTypeButtonSelected,
                        ]}
                        onPress={() => updateLoan(loan.id, 'loanType', 'student')}
                      >
                        <GraduationCap color={loan.loanType === 'student' ? 'white' : isDarkMode ? '#9CA3AF' : '#6B7280'} size={20} />
                        <Text style={[styles.loanTypeText, { color: loan.loanType === 'student' ? 'white' : isDarkMode ? 'white' : '#1F2937' }]}>{t('loanTypeStudent')}</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={[styles.loanInputContainer, { backgroundColor: isDarkMode ? '#4B5563' : '#F9FAFB' }]}>
                      <Text style={[styles.inputLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>{t('onboardingLoanAmountLabel')}</Text>
                      <TextInput
                        style={[styles.input, { color: isDarkMode ? 'white' : '#1F2937' }]}
                        placeholder={t('onboardingPlaceholderAmount')}
                        placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'}
                        value={loan.loanAmount}
                        onChangeText={(text) => updateLoan(loan.id, 'loanAmount', text)}
                        keyboardType="numeric"
                      />
                    </View>

                    <View style={[styles.loanInputContainer, { backgroundColor: isDarkMode ? '#4B5563' : '#F9FAFB' }]}>
                      <Text style={[styles.inputLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>{t('onboardingInterestRateLabel')}</Text>
                      <TextInput
                        style={[styles.input, { color: isDarkMode ? 'white' : '#1F2937' }]}
                        placeholder={t('onboardingPlaceholderRate')}
                        placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'}
                        value={loan.interestRate}
                        onChangeText={(text) => updateLoan(loan.id, 'interestRate', text)}
                        keyboardType="decimal-pad"
                      />
                    </View>

                    <View style={[styles.loanInputContainer, { backgroundColor: isDarkMode ? '#4B5563' : '#F9FAFB' }]}>
                      <Text style={[styles.inputLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>{t('onboardingMonthlyPaymentLabel')}</Text>
                      <TextInput
                        style={[styles.input, { color: isDarkMode ? 'white' : '#1F2937' }]}
                        placeholder={t('onboardingPlaceholderPayment')}
                        placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'}
                        value={loan.monthlyPayment}
                        onChangeText={(text) => updateLoan(loan.id, 'monthlyPayment', text)}
                        keyboardType="numeric"
                      />
                    </View>

                    <View style={[styles.loanInputContainer, { backgroundColor: isDarkMode ? '#4B5563' : '#F9FAFB' }]}>
                      <Text style={[styles.inputLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>{t('onboardingRemainingMonthsLabel')}</Text>
                      <TextInput
                        style={[styles.input, { color: isDarkMode ? 'white' : '#1F2937' }]}
                        placeholder={t('onboardingPlaceholderMonths')}
                        placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'}
                        value={loan.remainingMonths}
                        onChangeText={(text) => updateLoan(loan.id, 'remainingMonths', text)}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>
                ))}

                <TouchableOpacity
                  style={[styles.addLoanButton, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}
                  onPress={addLoanToForm}
                >
                  <LinearGradient
                    colors={['#667eea', '#764ba2']}
                    style={styles.addLoanGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  >
                    <Text style={styles.addLoanText}>{t('onboardingAddAnotherLoan')}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            )}
          </View>
        );

      case 6:
        return (
          <View style={styles.stepContent}>
            <Text style={[styles.stepTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
              Jaký je tvůj měsíční rozpočet?
            </Text>
            <Text style={[styles.stepSubtitle, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
              Rozděl si měsíční výdaje do kategorií
            </Text>

            <View style={[styles.inputContainer, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}>
              <Home color={isDarkMode ? '#9CA3AF' : '#6B7280'} size={20} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.inputLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>{t('onboardingHousingLabel')}</Text>
                <TextInput
                  style={[styles.input, { color: isDarkMode ? 'white' : '#1F2937' }]}
                  placeholder={t('onboardingPlaceholderHousing')}
                  placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'}
                  value={data.budgetBreakdown.housing}
                  onChangeText={(text) => setData({ ...data, budgetBreakdown: { ...data.budgetBreakdown, housing: text } })}
                  keyboardType="numeric"
                />
              </View>
              <Text style={[styles.currencyLabel, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>{t('currencySymbol')}</Text>
            </View>

            <View style={[styles.inputContainer, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}>
              <Text style={{ fontSize: 20 }}>🍽️</Text>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.inputLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>{t('onboardingFoodDrinksLabel')}</Text>
                <TextInput
                  style={[styles.input, { color: isDarkMode ? 'white' : '#1F2937' }]}
                  placeholder={t('onboardingPlaceholderFood')}
                  placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'}
                  value={data.budgetBreakdown.food}
                  onChangeText={(text) => setData({ ...data, budgetBreakdown: { ...data.budgetBreakdown, food: text } })}
                  keyboardType="numeric"
                />
              </View>
              <Text style={[styles.currencyLabel, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>{t('currencySymbol')}</Text>
            </View>

            <View style={[styles.inputContainer, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}>
              <Car color={isDarkMode ? '#9CA3AF' : '#6B7280'} size={20} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.inputLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>{t('onboardingTransportLabel')}</Text>
                <TextInput
                  style={[styles.input, { color: isDarkMode ? 'white' : '#1F2937' }]}
                  placeholder={t('onboardingPlaceholderTransport')}
                  placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'}
                  value={data.budgetBreakdown.transportation}
                  onChangeText={(text) => setData({ ...data, budgetBreakdown: { ...data.budgetBreakdown, transportation: text } })}
                  keyboardType="numeric"
                />
              </View>
              <Text style={[styles.currencyLabel, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>{t('currencySymbol')}</Text>
            </View>

            <View style={[styles.inputContainer, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}>
              <Text style={{ fontSize: 20 }}>🎬</Text>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.inputLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>{t('onboardingFunOptionalLabel')}</Text>
                <TextInput
                  style={[styles.input, { color: isDarkMode ? 'white' : '#1F2937' }]}
                  placeholder={t('onboardingPlaceholderFun')}
                  placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'}
                  value={data.budgetBreakdown.entertainment}
                  onChangeText={(text) => setData({ ...data, budgetBreakdown: { ...data.budgetBreakdown, entertainment: text } })}
                  keyboardType="numeric"
                />
              </View>
              <Text style={[styles.currencyLabel, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>{t('currencySymbol')}</Text>
            </View>

            <View style={[styles.inputContainer, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}>
              <Target color={isDarkMode ? '#9CA3AF' : '#6B7280'} size={20} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.inputLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>{t('onboardingSavingsOptionalLabel')}</Text>
                <TextInput
                  style={[styles.input, { color: isDarkMode ? 'white' : '#1F2937' }]}
                  placeholder={t('onboardingPlaceholderSavings')}
                  placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'}
                  value={data.budgetBreakdown.savings}
                  onChangeText={(text) => setData({ ...data, budgetBreakdown: { ...data.budgetBreakdown, savings: text } })}
                  keyboardType="numeric"
                />
              </View>
              <Text style={[styles.currencyLabel, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>{t('currencySymbol')}</Text>
            </View>

            <View style={[styles.inputContainer, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}>
              <Text style={{ fontSize: 20 }}>📦</Text>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.inputLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>{t('onboardingOtherOptionalLabel')}</Text>
                <TextInput
                  style={[styles.input, { color: isDarkMode ? 'white' : '#1F2937' }]}
                  placeholder={t('onboardingPlaceholderOther')}
                  placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'}
                  value={data.budgetBreakdown.other}
                  onChangeText={(text) => setData({ ...data, budgetBreakdown: { ...data.budgetBreakdown, other: text } })}
                  keyboardType="numeric"
                />
              </View>
              <Text style={[styles.currencyLabel, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>{t('currencySymbol')}</Text>
            </View>
          </View>
        );

      case 7:
        return (
          <View style={styles.stepContent}>
            <Text style={[styles.stepTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
              Shrnutí tvého profilu
            </Text>
            <Text style={[styles.stepSubtitle, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
              Zkontroluj si zadané údaje před dokončením
            </Text>

            <View style={[styles.summaryContainer, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                  Pracovní status:
                </Text>
                <Text style={[styles.summaryValue, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                  {getEmploymentStatusLabel(data.employmentStatus, t)}
                </Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                  Měsíční příjem:
                </Text>
                <Text style={[styles.summaryValue, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                  {getIncomeRangeLabel(data.monthlyIncome, t)}
                </Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                  Finanční cíle:
                </Text>
                <Text style={[styles.summaryValue, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                  {data.financialGoals.length} vybraných
                </Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                  Zkušenosti:
                </Text>
                <Text style={[styles.summaryValue, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                  {getExperienceLevelLabel(data.experienceLevel, t)}
                </Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                  Úvěry/Hypotéky:
                </Text>
                <Text style={[styles.summaryValue, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                  {data.loanData.hasLoan
                    ? t('onboardingLoanCount', {
                        count: data.loanData.loans.length,
                        loansWord: pluralUver(
                          data.loanData.loans.length,
                          language === 'en' ? 'en' : 'cs',
                        ),
                      })
                    : t('onboardingNo')}
                </Text>
              </View>
              {data.loanData.hasLoan && data.loanData.loans.length > 0 && (
                <View style={styles.summaryItem}>
                  <Text style={[styles.summaryLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                    Celková měsíční splátka:
                  </Text>
                  <Text style={[styles.summaryValue, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                    {calculateTotalLoanPayment(data.loanData.loans)} Kč
                  </Text>
                </View>
              )}
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                  Měsíční rozpočet:
                </Text>
                <Text style={[styles.summaryValue, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                  {calculateTotalBudget(data.budgetBreakdown, t('onboardingNotFilled'))} Kč
                </Text>
              </View>
            </View>
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: isDarkMode ? '#111827' : '#F8FAFC' }]}>
      <LinearGradient
        colors={['#667eea', '#764ba2']}
        style={[styles.header, { paddingTop: insets.top + 20 }]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Text style={styles.headerTitle}>{t('screenProfileSetup')}</Text>
        <Text style={styles.headerSubtitle}>
          Krok {step} z {totalSteps}
        </Text>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${(step / totalSteps) * 100}%` }]} />
        </View>
      </LinearGradient>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {renderStep()}
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: isDarkMode ? '#1F2937' : 'white', paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.buttonContainer}>
          {step > 1 && (
            <TouchableOpacity style={styles.backButton} onPress={handleBack}>
              <View style={[styles.backButtonContent, { backgroundColor: isDarkMode ? '#374151' : '#F3F4F6' }]}>
                <ArrowLeft color={isDarkMode ? 'white' : '#1F2937'} size={20} />
                <Text style={[styles.backButtonText, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                  {t('back')}
                </Text>
              </View>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.nextButton, step === 1 && styles.nextButtonFull]}
            onPress={handleNext}
          >
            <LinearGradient
              colors={['#667eea', '#764ba2']}
              style={styles.nextGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Text style={styles.nextButtonText}>
                {step === totalSteps ? t('onboardingFinish') : t('next')}
              </Text>
              <ArrowRight color="white" size={20} />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

interface OptionCardProps {
  icon: React.ComponentType<any>;
  title: string;
  subtitle?: string;
  selected: boolean;
  onPress: () => void;
  isDarkMode: boolean;
  multiSelect?: boolean;
}

const OptionCard = React.memo<OptionCardProps>(
  ({ icon: Icon, title, subtitle, selected, onPress, isDarkMode, multiSelect }) => {
    return (
      <TouchableOpacity
        style={[
          styles.optionCard,
          { backgroundColor: isDarkMode ? '#374151' : 'white' },
          selected && styles.optionCardSelected,
        ]}
        onPress={onPress}
      >
        {selected && (
          <LinearGradient
            colors={['#667eea', '#764ba2']}
            style={styles.optionCardGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
        )}
        <View style={styles.optionCardContent}>
          <View style={styles.optionCardLeft}>
            <View
              style={[
                styles.optionIconContainer,
                { backgroundColor: selected ? 'rgba(255,255,255,0.2)' : isDarkMode ? '#4B5563' : '#F3F4F6' },
              ]}
            >
              <Icon color={selected ? 'white' : isDarkMode ? '#9CA3AF' : '#6B7280'} size={24} />
            </View>
            <View style={styles.optionTextContainer}>
              <Text
                style={[
                  styles.optionTitle,
                  { color: selected ? 'white' : isDarkMode ? 'white' : '#1F2937' },
                ]}
              >
                {title}
              </Text>
              {subtitle && (
                <Text
                  style={[
                    styles.optionSubtitle,
                    { color: selected ? 'rgba(255,255,255,0.8)' : isDarkMode ? '#D1D5DB' : '#6B7280' },
                  ]}
                >
                  {subtitle}
                </Text>
              )}
            </View>
          </View>
          {multiSelect && selected && (
            <CheckCircle color="white" size={24} />
          )}
        </View>
      </TouchableOpacity>
    );
  }
);

OptionCard.displayName = 'OptionCard';

function getEmploymentStatusLabel(
  status: EmploymentStatus | null,
  t: ReturnType<typeof useLanguageStore.getState>['t'],
): string {
  switch (status) {
    case 'employed':
      return t('onboardingEmployed');
    case 'selfEmployed':
      return t('onboardingSelfEmployed');
    case 'student':
      return t('onboardingStudent');
    case 'unemployed':
      return t('onboardingUnemployed');
    case 'retired':
      return t('onboardingRetired');
    default:
      return t('onboardingNotSelected');
  }
}

function getIncomeRangeLabel(
  range: IncomeRange | null,
  t: ReturnType<typeof useLanguageStore.getState>['t'],
): string {
  switch (range) {
    case 'under20k':
      return t('onboardingIncomeUnder20k');
    case '20k-40k':
      return t('onboardingIncome20to40k');
    case '40k-60k':
      return t('onboardingIncome40to60k');
    case '60k-100k':
      return t('onboardingIncome60to100k');
    case 'over100k':
      return t('onboardingIncomeOver100k');
    default:
      return t('onboardingNotSelected');
  }
}

function getExperienceLevelLabel(
  level: ExperienceLevel | null,
  t: ReturnType<typeof useLanguageStore.getState>['t'],
): string {
  switch (level) {
    case 'beginner':
      return t('onboardingBeginner');
    case 'intermediate':
      return t('onboardingIntermediate');
    case 'advanced':
      return t('onboardingAdvanced');
    default:
      return t('onboardingNotSelected');
  }
}

function getLoanTypeLabel(
  type?: 'mortgage' | 'car' | 'personal' | 'student' | 'other',
  t?: ReturnType<typeof useLanguageStore.getState>['t'],
): string {
  if (!t) return '';
  switch (type) {
    case 'mortgage':
      return t('loanTypeMortgage');
    case 'car':
      return t('loanTypeCar');
    case 'personal':
      return t('onboardingLoanPersonal');
    case 'student':
      return t('loanTypeStudent');
    case 'other':
      return t('onboardingLoanOther');
    default:
      return t('onboardingNotSelected');
  }
}

function calculateTotalBudget(breakdown: BudgetBreakdown, notFilledLabel: string): string {
  const total = [
    breakdown.housing,
    breakdown.food,
    breakdown.transportation,
    breakdown.entertainment,
    breakdown.savings,
    breakdown.other,
  ]
    .filter(v => v && v.trim() !== '')
    .reduce((sum, v) => sum + (parseMoneyInput(v) ?? 0), 0);
  
  return total > 0 ? total.toFixed(0) : notFilledLabel;
}

function calculateTotalLoanPayment(loans: Loan[]): string {
  const total = loans
    .filter(loan => loan.monthlyPayment && loan.monthlyPayment.trim() !== '')
    .reduce((sum, loan) => sum + (parseMoneyInput(loan.monthlyPayment) ?? 0), 0);
  
  return total > 0 ? total.toFixed(0) : '0';
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  securityLoading: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    paddingBottom: 30,
    paddingHorizontal: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 16,
    color: 'white',
    opacity: 0.9,
    marginBottom: 16,
  },
  progressBar: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: 'white',
  },
  scrollView: {
    flex: 1,
  },
  stepContent: {
    padding: 20,
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  stepSubtitle: {
    fontSize: 16,
    marginBottom: 24,
  },
  optionsContainer: {
    gap: 12,
  },
  optionCard: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  optionCardSelected: {
    shadowColor: '#667eea',
    shadowOpacity: 0.3,
    elevation: 8,
  },
  optionCardGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  optionCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  optionCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  optionIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  optionTextContainer: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  optionSubtitle: {
    fontSize: 14,
    marginTop: 2,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    gap: 12,
    marginBottom: 24,
  },
  loanCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  loanCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  loanCardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  removeLoanButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeLoanText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  loanInputContainer: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
  },
  addLoanButton: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    marginTop: 8,
  },
  addLoanGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addLoanText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  input: {
    flex: 1,
    fontSize: 16,
  },
  currencyLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  summaryContainer: {
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  summaryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  summaryLabel: {
    fontSize: 14,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  loanTypeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  loanTypeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  loanTypeButtonSelected: {
    backgroundColor: '#667eea',
  },
  loanTypeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  inputLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  backButton: {
    flex: 1,
  },
  backButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    gap: 8,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  nextButton: {
    flex: 2,
    borderRadius: 16,
    overflow: 'hidden',
  },
  nextButtonFull: {
    flex: 1,
  },
  nextGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  nextButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
  },
});
