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
import { Stack, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  Home,
  Car,
  DollarSign,
  GraduationCap,
  CreditCard,
} from 'lucide-react-native';
import { useFinanceStore, LoanType } from '@/store/finance-store';
import { useSettingsStore } from '@/store/settings-store';

export default function AddLoanScreen() {
  const router = useRouter();
  const { addLoan } = useFinanceStore();
  const { isDarkMode, getCurrentCurrency } = useSettingsStore();
  const currentCurrency = getCurrentCurrency();

  const [loanType, setLoanType] = useState<LoanType>('personal');
  const [name, setName] = useState<string>('');
  const [loanAmount, setLoanAmount] = useState<string>('');
  const [interestRate, setInterestRate] = useState<string>('');
  const [monthlyPayment, setMonthlyPayment] = useState<string>('');
  const [remainingMonths, setRemainingMonths] = useState<string>('');
  const [paidMonths, setPaidMonths] = useState<string>('0');

  const loanTypes: Array<{ type: LoanType; label: string; icon: any; color: string }> = [
    { type: 'mortgage', label: 'Hypotéka', icon: Home, color: '#10B981' },
    { type: 'car', label: 'Úvěr na auto', icon: Car, color: '#3B82F6' },
    { type: 'personal', label: 'Osobní úvěr', icon: DollarSign, color: '#8B5CF6' },
    { type: 'student', label: 'Studentský úvěr', icon: GraduationCap, color: '#F59E0B' },
    { type: 'other', label: 'Jiný úvěr', icon: CreditCard, color: '#6B7280' },
  ];

  const handleSubmit = () => {
    console.log('Submit clicked', { loanAmount, interestRate, monthlyPayment, remainingMonths });
    
    if (!loanAmount || !interestRate || !monthlyPayment || !remainingMonths) {
      Alert.alert('Chyba', 'Vyplňte prosím všechna povinná pole (výše úvěru, úroková sazba, měsíční splátka, zbývá měsíců)');
      return;
    }

    const numLoanAmount = parseFloat(loanAmount.replace(',', '.'));
    const numInterestRate = parseFloat(interestRate.replace(',', '.'));
    const numMonthlyPayment = parseFloat(monthlyPayment.replace(',', '.'));
    const numRemainingMonths = parseInt(remainingMonths, 10);
    const numPaidMonths = parseInt(paidMonths || '0', 10);

    console.log('Parsed values:', { numLoanAmount, numInterestRate, numMonthlyPayment, numRemainingMonths, numPaidMonths });

    if (
      isNaN(numLoanAmount) ||
      isNaN(numInterestRate) ||
      isNaN(numMonthlyPayment) ||
      isNaN(numRemainingMonths) ||
      numLoanAmount <= 0 ||
      numInterestRate < 0 ||
      numMonthlyPayment <= 0 ||
      numRemainingMonths <= 0
    ) {
      Alert.alert('Chyba', 'Zadejte prosím platné číselné hodnoty. Výše úvěru, měsíční splátka a zbývající měsíce musí být větší než 0.');
      return;
    }

    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - numPaidMonths);

    const newLoan = {
      id: Date.now().toString(),
      loanType,
      name: name.trim() || undefined,
      loanAmount: numLoanAmount,
      interestRate: numInterestRate,
      monthlyPayment: numMonthlyPayment,
      remainingMonths: numRemainingMonths,
      startDate,
    };

    console.log('Adding loan:', newLoan);
    addLoan(newLoan);
    console.log('Loan added successfully');

    Alert.alert('Úspěch', 'Závazek byl úspěšně přidán', [
      {
        text: 'OK',
        onPress: () => {
          console.log('Navigating back');
          router.back();
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: isDarkMode ? '#111827' : '#F8FAFC' }]}>
      <Stack.Screen options={{ headerShown: false }} />
      
      <LinearGradient
        colors={['#667eea', '#764ba2']}
        style={styles.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.headerContent}>
          <TouchableOpacity
            style={styles.headerBackButton}
            onPress={() => router.back()}
          >
            <ArrowLeft color="white" size={24} />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>Přidat závazek</Text>
            <Text style={styles.headerSubtitle}>Zadejte informace o závazku</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
              Typ závazku
            </Text>
            <View style={styles.loanTypesGrid}>
              {loanTypes.map((type) => {
                const Icon = type.icon;
                const isSelected = loanType === type.type;
                return (
                  <TouchableOpacity
                    key={type.type}
                    style={[
                      styles.loanTypeCard,
                      { backgroundColor: isDarkMode ? '#374151' : 'white' },
                      isSelected && { borderColor: type.color, borderWidth: 2 },
                    ]}
                    onPress={() => setLoanType(type.type)}
                  >
                    <View
                      style={[
                        styles.loanTypeIcon,
                        {
                          backgroundColor: isSelected
                            ? type.color + '20'
                            : isDarkMode
                            ? '#4B5563'
                            : '#F3F4F6',
                        },
                      ]}
                    >
                      <Icon color={isSelected ? type.color : '#6B7280'} size={24} />
                    </View>
                    <Text
                      style={[
                        styles.loanTypeLabel,
                        {
                          color: isSelected
                            ? type.color
                            : isDarkMode
                            ? '#D1D5DB'
                            : '#6B7280',
                        },
                      ]}
                    >
                      {type.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
              Název závazku (volitelné)
            </Text>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: isDarkMode ? '#374151' : 'white', color: isDarkMode ? 'white' : '#1F2937' },
              ]}
              value={name}
              onChangeText={setName}
              placeholder="např. Hypotéka na byt"
              placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'}
            />
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
              Celková částka *
            </Text>
            <View style={styles.inputWithCurrency}>
              <TextInput
                style={[
                  styles.input,
                  styles.inputFlex,
                  { backgroundColor: isDarkMode ? '#374151' : 'white', color: isDarkMode ? 'white' : '#1F2937' },
                ]}
                value={loanAmount}
                onChangeText={setLoanAmount}
                placeholder="0"
                keyboardType="numeric"
                placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'}
              />
              <Text style={[styles.currencyLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                {currentCurrency.symbol}
              </Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
              Úroková sazba (% p.a.) *
            </Text>
            <View style={styles.inputWithCurrency}>
              <TextInput
                style={[
                  styles.input,
                  styles.inputFlex,
                  { backgroundColor: isDarkMode ? '#374151' : 'white', color: isDarkMode ? 'white' : '#1F2937' },
                ]}
                value={interestRate}
                onChangeText={setInterestRate}
                placeholder="0"
                keyboardType="numeric"
                placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'}
              />
              <Text style={[styles.currencyLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                %
              </Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
              Měsíční splátka *
            </Text>
            <View style={styles.inputWithCurrency}>
              <TextInput
                style={[
                  styles.input,
                  styles.inputFlex,
                  { backgroundColor: isDarkMode ? '#374151' : 'white', color: isDarkMode ? 'white' : '#1F2937' },
                ]}
                value={monthlyPayment}
                onChangeText={setMonthlyPayment}
                placeholder="0"
                keyboardType="numeric"
                placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'}
              />
              <Text style={[styles.currencyLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                {currentCurrency.symbol}
              </Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
              Zbývá měsíců *
            </Text>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: isDarkMode ? '#374151' : 'white', color: isDarkMode ? 'white' : '#1F2937' },
              ]}
              value={remainingMonths}
              onChangeText={setRemainingMonths}
              placeholder="0"
              keyboardType="numeric"
              placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'}
            />
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
              Kolik měsíců jste již splatili?
            </Text>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: isDarkMode ? '#374151' : 'white', color: isDarkMode ? 'white' : '#1F2937' },
              ]}
              value={paidMonths}
              onChangeText={setPaidMonths}
              placeholder="0"
              keyboardType="numeric"
              placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'}
            />
            <Text style={[styles.helperText, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
              Toto pomůže správně vypočítat průběh splácení
            </Text>
          </View>

          <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
            <LinearGradient
              colors={['#667eea', '#764ba2']}
              style={styles.submitGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Text style={styles.submitText}>Přidat závazek</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 60,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerBackButton: {
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
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'white',
    opacity: 0.9,
    marginTop: 2,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  loanTypesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  loanTypeCard: {
    width: '47%',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  loanTypeIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  loanTypeLabel: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  input: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  inputWithCurrency: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  inputFlex: {
    flex: 1,
  },
  currencyLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  helperText: {
    fontSize: 12,
    marginTop: 8,
  },
  submitButton: {
    marginTop: 16,
    marginBottom: 32,
    borderRadius: 16,
    overflow: 'hidden',
  },
  submitGradient: {
    paddingVertical: 18,
    alignItems: 'center',
  },
  submitText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
  },
});
