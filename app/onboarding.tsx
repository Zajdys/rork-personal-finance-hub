import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
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
import { useAuth } from '@/store/auth-store';
import { useRouter } from 'expo-router';
import { useFinanceStore } from '@/store/finance-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
  const { user, setUser } = useAuth();
  const { addLoan: addLoanToStore } = useFinanceStore();
  const router = useRouter();

  const totalSteps = 7;

  const handleNext = () => {
    if (step === 1 && !data.employmentStatus) {
      Alert.alert('Chyba', 'Prosím vyberte váš pracovní status');
      return;
    }
    if (step === 2 && !data.monthlyIncome) {
      Alert.alert('Chyba', 'Prosím vyberte váš příjmový rozsah');
      return;
    }
    if (step === 3 && data.financialGoals.length === 0) {
      Alert.alert('Chyba', 'Prosím vyberte alespoň jeden finanční cíl');
      return;
    }
    if (step === 4 && !data.experienceLevel) {
      Alert.alert('Chyba', 'Prosím vyberte vaši úroveň zkušeností');
      return;
    }
    if (step === 5 && data.loanData.hasLoan) {
      if (data.loanData.loans.length === 0) {
        Alert.alert('Chyba', 'Prosím přidejte alespoň jeden úvěr nebo hypotéku');
        return;
      }
      const incompleteLoan = data.loanData.loans.find(
        loan => !loan.loanAmount || !loan.interestRate || !loan.monthlyPayment || !loan.remainingMonths
      );
      if (incompleteLoan) {
        Alert.alert('Chyba', 'Prosím vyplňte všechny údaje u všech úvěrů');
        return;
      }
    }
    if (step === 6) {
      const { housing, food, transportation } = data.budgetBreakdown;
      if (!housing || !food || !transportation) {
        Alert.alert('Chyba', 'Prosím vyplňte alespoň základní kategorie rozpočtu (bydlení, jídlo, doprava)');
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
      const onboardingProfile = {
        ...data,
        completedAt: new Date().toISOString(),
        userId: user?.id,
      };

      await AsyncStorage.setItem('onboarding_completed', 'true');
      await AsyncStorage.setItem('onboarding_profile', JSON.stringify(onboardingProfile));

      const suggestedCurrency = data.monthlyIncome?.includes('k') ? 'CZK' : 'EUR';
      setCurrency(suggestedCurrency);

      if (user && data.employmentStatus) {
        const employmentStatusLabels = {
          'employed': 'Zaměstnanec',
          'selfEmployed': 'OSVČ / Podnikatel',
          'student': 'Student',
          'unemployed': 'Nezaměstnaný',
          'retired': 'Důchodce',
        };
        
        const updatedUser = {
          ...user,
          name: employmentStatusLabels[data.employmentStatus] || user.name,
          employmentStatus: data.employmentStatus,
          monthlyIncome: data.monthlyIncome,
          financialGoals: data.financialGoals,
          experienceLevel: data.experienceLevel,
        };
        
        if (setUser) {
          setUser(updatedUser);
        }
      }

      if (data.loanData.hasLoan && data.loanData.loans.length > 0) {
        data.loanData.loans.forEach((loan) => {
          const loanItem = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            loanType: loan.loanType,
            loanAmount: parseFloat(loan.loanAmount),
            interestRate: parseFloat(loan.interestRate),
            monthlyPayment: parseFloat(loan.monthlyPayment),
            remainingMonths: parseInt(loan.remainingMonths, 10),
            startDate: new Date(),
            name: getLoanTypeLabel(loan.loanType),
            currentBalance: parseFloat(loan.loanAmount),
          };
          addLoanToStore(loanItem);
        });
      }

      console.log('Onboarding completed:', onboardingProfile);
      Alert.alert(
        'Hotovo! 🎉',
        'Vaše aplikace je nyní nastavena podle vašich potřeb. Můžete začít!',
        [
          {
            text: 'Začít',
            onPress: () => router.replace('/(tabs)'),
          },
        ]
      );
    } catch (error) {
      console.error('Failed to save onboarding data:', error);
      Alert.alert('Chyba', 'Nepodařilo se uložit data. Zkuste to prosím znovu.');
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
              Jaký je váš pracovní status?
            </Text>
            <Text style={[styles.stepSubtitle, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
              Pomůže nám to lépe nastavit vaše finanční plány
            </Text>

            <View style={styles.optionsContainer}>
              <OptionCard
                icon={Briefcase}
                title="Zaměstnanec"
                selected={data.employmentStatus === 'employed'}
                onPress={() => setData({ ...data, employmentStatus: 'employed' })}
                isDarkMode={isDarkMode}
              />
              <OptionCard
                icon={TrendingUp}
                title="OSVČ / Podnikatel"
                selected={data.employmentStatus === 'selfEmployed'}
                onPress={() => setData({ ...data, employmentStatus: 'selfEmployed' })}
                isDarkMode={isDarkMode}
              />
              <OptionCard
                icon={GraduationCap}
                title="Student"
                selected={data.employmentStatus === 'student'}
                onPress={() => setData({ ...data, employmentStatus: 'student' })}
                isDarkMode={isDarkMode}
              />
              <OptionCard
                icon={Home}
                title="Nezaměstnaný"
                selected={data.employmentStatus === 'unemployed'}
                onPress={() => setData({ ...data, employmentStatus: 'unemployed' })}
                isDarkMode={isDarkMode}
              />
              <OptionCard
                icon={Heart}
                title="Důchodce"
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
              Jaký je váš měsíční příjem?
            </Text>
            <Text style={[styles.stepSubtitle, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
              Přibližná částka nám pomůže nastavit realistické cíle
            </Text>

            <View style={styles.optionsContainer}>
              <OptionCard
                icon={DollarSign}
                title="Méně než 20 000 Kč"
                selected={data.monthlyIncome === 'under20k'}
                onPress={() => setData({ ...data, monthlyIncome: 'under20k' })}
                isDarkMode={isDarkMode}
              />
              <OptionCard
                icon={DollarSign}
                title="20 000 - 40 000 Kč"
                selected={data.monthlyIncome === '20k-40k'}
                onPress={() => setData({ ...data, monthlyIncome: '20k-40k' })}
                isDarkMode={isDarkMode}
              />
              <OptionCard
                icon={DollarSign}
                title="40 000 - 60 000 Kč"
                selected={data.monthlyIncome === '40k-60k'}
                onPress={() => setData({ ...data, monthlyIncome: '40k-60k' })}
                isDarkMode={isDarkMode}
              />
              <OptionCard
                icon={DollarSign}
                title="60 000 - 100 000 Kč"
                selected={data.monthlyIncome === '60k-100k'}
                onPress={() => setData({ ...data, monthlyIncome: '60k-100k' })}
                isDarkMode={isDarkMode}
              />
              <OptionCard
                icon={DollarSign}
                title="Více než 100 000 Kč"
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
              Jaké jsou vaše finanční cíle?
            </Text>
            <Text style={[styles.stepSubtitle, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
              Můžete vybrat více možností
            </Text>

            <View style={styles.optionsContainer}>
              <OptionCard
                icon={Target}
                title="Spořit peníze"
                selected={data.financialGoals.includes('savings')}
                onPress={() => toggleGoal('savings')}
                isDarkMode={isDarkMode}
                multiSelect
              />
              <OptionCard
                icon={TrendingUp}
                title="Investovat"
                selected={data.financialGoals.includes('investment')}
                onPress={() => toggleGoal('investment')}
                isDarkMode={isDarkMode}
                multiSelect
              />
              <OptionCard
                icon={DollarSign}
                title="Splatit dluhy"
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
                title="Vzdělání"
                selected={data.financialGoals.includes('education')}
                onPress={() => toggleGoal('education')}
                isDarkMode={isDarkMode}
                multiSelect
              />
              <OptionCard
                icon={Heart}
                title="Důchod"
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
              Jaká je vaše zkušenost s financemi?
            </Text>
            <Text style={[styles.stepSubtitle, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
              Přizpůsobíme obsah podle vaší úrovně
            </Text>

            <View style={styles.optionsContainer}>
              <OptionCard
                icon={Target}
                title="Začátečník"
                subtitle="Teprve začínám s financemi"
                selected={data.experienceLevel === 'beginner'}
                onPress={() => setData({ ...data, experienceLevel: 'beginner' })}
                isDarkMode={isDarkMode}
              />
              <OptionCard
                icon={TrendingUp}
                title="Pokročilý"
                subtitle="Mám základní znalosti"
                selected={data.experienceLevel === 'intermediate'}
                onPress={() => setData({ ...data, experienceLevel: 'intermediate' })}
                isDarkMode={isDarkMode}
              />
              <OptionCard
                icon={CheckCircle}
                title="Expert"
                subtitle="Mám pokročilé znalosti"
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
              Máte nějaký úvěr nebo hypotéku?
            </Text>
            <Text style={[styles.stepSubtitle, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
              Pomůže nám to lépe plánovat vaše finance
            </Text>

            <View style={styles.optionsContainer}>
              <OptionCard
                icon={CheckCircle}
                title="Ano, mám úvěr"
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
                title="Ne, nemám žádný úvěr"
                selected={data.loanData.hasLoan === false}
                onPress={() => setData({ ...data, loanData: { hasLoan: false, loans: [] } })}
                isDarkMode={isDarkMode}
              />
            </View>

            {data.loanData.hasLoan && (
              <View style={{ marginTop: 24 }}>
                <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                  Vaše úvěry a hypotéky
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
                        <Text style={[styles.loanTypeText, { color: loan.loanType === 'mortgage' ? 'white' : isDarkMode ? 'white' : '#1F2937' }]}>Hypotéka</Text>
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
                        <Text style={[styles.loanTypeText, { color: loan.loanType === 'car' ? 'white' : isDarkMode ? 'white' : '#1F2937' }]}>Auto</Text>
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
                        <Text style={[styles.loanTypeText, { color: loan.loanType === 'personal' ? 'white' : isDarkMode ? 'white' : '#1F2937' }]}>Osobní</Text>
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
                        <Text style={[styles.loanTypeText, { color: loan.loanType === 'student' ? 'white' : isDarkMode ? 'white' : '#1F2937' }]}>Studium</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={[styles.loanInputContainer, { backgroundColor: isDarkMode ? '#4B5563' : '#F9FAFB' }]}>
                      <Text style={[styles.inputLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>Výše úvěru (Kč)</Text>
                      <TextInput
                        style={[styles.input, { color: isDarkMode ? 'white' : '#1F2937' }]}
                        placeholder="Např. 2000000"
                        placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'}
                        value={loan.loanAmount}
                        onChangeText={(text) => updateLoan(loan.id, 'loanAmount', text)}
                        keyboardType="numeric"
                      />
                    </View>

                    <View style={[styles.loanInputContainer, { backgroundColor: isDarkMode ? '#4B5563' : '#F9FAFB' }]}>
                      <Text style={[styles.inputLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>Úroková sazba (%)</Text>
                      <TextInput
                        style={[styles.input, { color: isDarkMode ? 'white' : '#1F2937' }]}
                        placeholder="Např. 4.5"
                        placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'}
                        value={loan.interestRate}
                        onChangeText={(text) => updateLoan(loan.id, 'interestRate', text)}
                        keyboardType="decimal-pad"
                      />
                    </View>

                    <View style={[styles.loanInputContainer, { backgroundColor: isDarkMode ? '#4B5563' : '#F9FAFB' }]}>
                      <Text style={[styles.inputLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>Měsíční splátka (Kč)</Text>
                      <TextInput
                        style={[styles.input, { color: isDarkMode ? 'white' : '#1F2937' }]}
                        placeholder="Např. 15000"
                        placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'}
                        value={loan.monthlyPayment}
                        onChangeText={(text) => updateLoan(loan.id, 'monthlyPayment', text)}
                        keyboardType="numeric"
                      />
                    </View>

                    <View style={[styles.loanInputContainer, { backgroundColor: isDarkMode ? '#4B5563' : '#F9FAFB' }]}>
                      <Text style={[styles.inputLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>Zbývající měsíce splácení</Text>
                      <TextInput
                        style={[styles.input, { color: isDarkMode ? 'white' : '#1F2937' }]}
                        placeholder="Např. 240"
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
                    <Text style={styles.addLoanText}>+ Přidat další úvěr</Text>
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
              Jaký je váš měsíční rozpočet?
            </Text>
            <Text style={[styles.stepSubtitle, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
              Rozdělte si měsíční výdaje do kategorií
            </Text>

            <View style={[styles.inputContainer, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}>
              <Home color={isDarkMode ? '#9CA3AF' : '#6B7280'} size={20} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.inputLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>Bydlení (nájem, energie)</Text>
                <TextInput
                  style={[styles.input, { color: isDarkMode ? 'white' : '#1F2937' }]}
                  placeholder="Např. 12000"
                  placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'}
                  value={data.budgetBreakdown.housing}
                  onChangeText={(text) => setData({ ...data, budgetBreakdown: { ...data.budgetBreakdown, housing: text } })}
                  keyboardType="numeric"
                />
              </View>
              <Text style={[styles.currencyLabel, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>Kč</Text>
            </View>

            <View style={[styles.inputContainer, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}>
              <Text style={{ fontSize: 20 }}>🍽️</Text>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.inputLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>Jídlo a nápoje</Text>
                <TextInput
                  style={[styles.input, { color: isDarkMode ? 'white' : '#1F2937' }]}
                  placeholder="Např. 5000"
                  placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'}
                  value={data.budgetBreakdown.food}
                  onChangeText={(text) => setData({ ...data, budgetBreakdown: { ...data.budgetBreakdown, food: text } })}
                  keyboardType="numeric"
                />
              </View>
              <Text style={[styles.currencyLabel, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>Kč</Text>
            </View>

            <View style={[styles.inputContainer, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}>
              <Car color={isDarkMode ? '#9CA3AF' : '#6B7280'} size={20} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.inputLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>Doprava</Text>
                <TextInput
                  style={[styles.input, { color: isDarkMode ? 'white' : '#1F2937' }]}
                  placeholder="Např. 2000"
                  placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'}
                  value={data.budgetBreakdown.transportation}
                  onChangeText={(text) => setData({ ...data, budgetBreakdown: { ...data.budgetBreakdown, transportation: text } })}
                  keyboardType="numeric"
                />
              </View>
              <Text style={[styles.currencyLabel, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>Kč</Text>
            </View>

            <View style={[styles.inputContainer, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}>
              <Text style={{ fontSize: 20 }}>🎬</Text>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.inputLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>Zábava (volitelné)</Text>
                <TextInput
                  style={[styles.input, { color: isDarkMode ? 'white' : '#1F2937' }]}
                  placeholder="Např. 3000"
                  placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'}
                  value={data.budgetBreakdown.entertainment}
                  onChangeText={(text) => setData({ ...data, budgetBreakdown: { ...data.budgetBreakdown, entertainment: text } })}
                  keyboardType="numeric"
                />
              </View>
              <Text style={[styles.currencyLabel, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>Kč</Text>
            </View>

            <View style={[styles.inputContainer, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}>
              <Target color={isDarkMode ? '#9CA3AF' : '#6B7280'} size={20} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.inputLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>Spoření (volitelné)</Text>
                <TextInput
                  style={[styles.input, { color: isDarkMode ? 'white' : '#1F2937' }]}
                  placeholder="Např. 5000"
                  placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'}
                  value={data.budgetBreakdown.savings}
                  onChangeText={(text) => setData({ ...data, budgetBreakdown: { ...data.budgetBreakdown, savings: text } })}
                  keyboardType="numeric"
                />
              </View>
              <Text style={[styles.currencyLabel, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>Kč</Text>
            </View>

            <View style={[styles.inputContainer, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}>
              <Text style={{ fontSize: 20 }}>📦</Text>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.inputLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>Ostatní (volitelné)</Text>
                <TextInput
                  style={[styles.input, { color: isDarkMode ? 'white' : '#1F2937' }]}
                  placeholder="Např. 2000"
                  placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'}
                  value={data.budgetBreakdown.other}
                  onChangeText={(text) => setData({ ...data, budgetBreakdown: { ...data.budgetBreakdown, other: text } })}
                  keyboardType="numeric"
                />
              </View>
              <Text style={[styles.currencyLabel, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>Kč</Text>
            </View>
          </View>
        );

      case 7:
        return (
          <View style={styles.stepContent}>
            <Text style={[styles.stepTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
              Shrnutí vašeho profilu
            </Text>
            <Text style={[styles.stepSubtitle, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
              Zkontrolujte si zadané údaje před dokončením
            </Text>

            <View style={[styles.summaryContainer, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                  Pracovní status:
                </Text>
                <Text style={[styles.summaryValue, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                  {getEmploymentStatusLabel(data.employmentStatus)}
                </Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                  Měsíční příjem:
                </Text>
                <Text style={[styles.summaryValue, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                  {getIncomeRangeLabel(data.monthlyIncome)}
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
                  {getExperienceLevelLabel(data.experienceLevel)}
                </Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                  Úvěry/Hypotéky:
                </Text>
                <Text style={[styles.summaryValue, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                  {data.loanData.hasLoan ? `${data.loanData.loans.length} úvěrů` : 'Ne'}
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
                  {calculateTotalBudget(data.budgetBreakdown)} Kč
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
        <Text style={styles.headerTitle}>Nastavení profilu</Text>
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
                  Zpět
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
                {step === totalSteps ? 'Dokončit' : 'Další'}
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

function getEmploymentStatusLabel(status: EmploymentStatus | null): string {
  switch (status) {
    case 'employed':
      return 'Zaměstnanec';
    case 'selfEmployed':
      return 'OSVČ / Podnikatel';
    case 'student':
      return 'Student';
    case 'unemployed':
      return 'Nezaměstnaný';
    case 'retired':
      return 'Důchodce';
    default:
      return 'Nevybráno';
  }
}

function getIncomeRangeLabel(range: IncomeRange | null): string {
  switch (range) {
    case 'under20k':
      return 'Méně než 20 000 Kč';
    case '20k-40k':
      return '20 000 - 40 000 Kč';
    case '40k-60k':
      return '40 000 - 60 000 Kč';
    case '60k-100k':
      return '60 000 - 100 000 Kč';
    case 'over100k':
      return 'Více než 100 000 Kč';
    default:
      return 'Nevybráno';
  }
}

function getExperienceLevelLabel(level: ExperienceLevel | null): string {
  switch (level) {
    case 'beginner':
      return 'Začátečník';
    case 'intermediate':
      return 'Pokročilý';
    case 'advanced':
      return 'Expert';
    default:
      return 'Nevybráno';
  }
}

function getLoanTypeLabel(type?: 'mortgage' | 'car' | 'personal' | 'student' | 'other'): string {
  switch (type) {
    case 'mortgage':
      return 'Hypotéka';
    case 'car':
      return 'Auto';
    case 'personal':
      return 'Osobní';
    case 'student':
      return 'Studium';
    case 'other':
      return 'Jiný';
    default:
      return 'Nevybráno';
  }
}

function calculateTotalBudget(breakdown: BudgetBreakdown): string {
  const total = [
    breakdown.housing,
    breakdown.food,
    breakdown.transportation,
    breakdown.entertainment,
    breakdown.savings,
    breakdown.other,
  ]
    .filter(v => v && v.trim() !== '')
    .reduce((sum, v) => sum + parseFloat(v), 0);
  
  return total > 0 ? total.toFixed(0) : 'Nevyplněno';
}

function calculateTotalLoanPayment(loans: Loan[]): string {
  const total = loans
    .filter(loan => loan.monthlyPayment && loan.monthlyPayment.trim() !== '')
    .reduce((sum, loan) => sum + parseFloat(loan.monthlyPayment), 0);
  
  return total > 0 ? total.toFixed(0) : '0';
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
