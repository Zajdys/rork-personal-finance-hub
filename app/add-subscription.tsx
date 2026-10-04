import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Calendar,
  DollarSign,
  Tag,
  Check,
} from 'lucide-react-native';
import { useFinanceStore, EXPENSE_CATEGORIES } from '@/store/finance-store';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useSettingsStore } from '@/store/settings-store';
import { useLanguageStore } from '@/store/language-store';
import { safeGoBack } from '@/lib/safe-back';
import { BackButton } from '@/components/BackButton';
import { BrandIcon } from '@/components/BrandIcon';
import { parseMoneyInput } from '@/lib/parse-money-input';
import { AsyncButton } from '@/components/AsyncButton';
import { useAsyncAction } from '@/hooks/use-async-action';
import { SUBSCRIPTION_CATEGORY } from '@/lib/subscription-brands';

function paramStr(v: string | string[] | undefined, fallback = ''): string {
  if (Array.isArray(v)) return v[0] ?? fallback;
  return v ?? fallback;
}

export default function AddSubscriptionScreen() {
  const params = useLocalSearchParams<{
    name?: string;
    amount?: string;
    dayOfMonth?: string;
    category?: string;
    merchantKey?: string;
    source?: string;
    currency?: string;
    frequency?: string;
  }>();
  const { addSubscription } = useFinanceStore();
  const { isDarkMode, getCurrentCurrency } = useSettingsStore();
  const { t } = useLanguageStore();
  const currentCurrency = getCurrentCurrency();

  const prefilled = useMemo(() => {
    const name = paramStr(params.name);
    const amount = paramStr(params.amount);
    const dayOfMonth = paramStr(params.dayOfMonth, '1');
    const category = paramStr(params.category, SUBSCRIPTION_CATEGORY);
    const merchantKey = paramStr(params.merchantKey);
    const source = paramStr(params.source, 'manual') === 'bank' ? 'bank' : 'manual';
    const currency = paramStr(params.currency, currentCurrency.code || 'CZK').toUpperCase();
    const frequency = paramStr(params.frequency, 'monthly') === 'yearly' ? 'yearly' : 'monthly';
    return { name, amount, dayOfMonth, category, merchantKey, source, currency, frequency } as const;
  }, [params, currentCurrency.code]);

  const [name, setName] = useState<string>(prefilled.name);
  const [amount, setAmount] = useState<string>(prefilled.amount);
  const [selectedCategory, setSelectedCategory] = useState<string>(
    prefilled.category || SUBSCRIPTION_CATEGORY,
  );
  const [dayOfMonth, setDayOfMonth] = useState<string>(prefilled.dayOfMonth);
  const [currency, setCurrency] = useState<string>(prefilled.currency);
  const [frequency, setFrequency] = useState<'monthly' | 'yearly'>(prefilled.frequency);

  const { run: handleSave } = useAsyncAction(async () => {
    if (!name.trim()) {
      Alert.alert(t('error'), t('subscription.enterName'));
      return;
    }

    const parsedAmount = parseMoneyInput(amount);
    if (parsedAmount == null || parsedAmount <= 0) {
      Alert.alert(t('error'), t('subscription.enterValidAmount'));
      return;
    }

    const parsedDay = parseInt(dayOfMonth, 10);
    if (isNaN(parsedDay) || parsedDay < 1 || parsedDay > 31) {
      Alert.alert(t('error'), t('subscription.enterValidDay'));
      return;
    }

    addSubscription({
      id: '',
      name: name.trim(),
      amount: parsedAmount,
      currency: currency.trim().toUpperCase() || 'CZK',
      frequency,
      category: selectedCategory,
      dayOfMonth: parsedDay,
      merchantKey: prefilled.merchantKey || null,
      source: prefilled.source,
      active: true,
      paused: false,
    });

    Alert.alert(t('done'), t('subscription.added'), [
      {
        text: 'OK',
        onPress: () => safeGoBack(),
      },
    ]);
  });

  const categories = Object.keys(EXPENSE_CATEGORIES);

  return (
    <View style={[styles.container, { backgroundColor: isDarkMode ? '#111827' : '#F8FAFC' }]}>
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
            <Text style={styles.headerTitle}>{t('subscription.addTitle')}</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <View style={styles.brandPreview}>
            <BrandIcon merchantKey={name.trim() || '?'} size={64} />
          </View>

          <View style={[styles.card, { backgroundColor: isDarkMode ? '#1F2937' : 'white' }]}>
            <View style={styles.inputGroup}>
              <View style={styles.inputLabel}>
                <Tag color="#667eea" size={20} />
                <Text style={[styles.labelText, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                  {t('subscription.name')}
                </Text>
              </View>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: isDarkMode ? '#374151' : '#F3F4F6',
                    color: isDarkMode ? 'white' : '#1F2937',
                  },
                ]}
                value={name}
                onChangeText={setName}
                placeholder={t('subscription.namePlaceholder')}
                placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'}
              />
            </View>

            <View style={styles.inputGroup}>
              <View style={styles.inputLabel}>
                <DollarSign color="#667eea" size={20} />
                <Text style={[styles.labelText, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                  {t('subscription.amount')}
                </Text>
              </View>
              <View style={styles.amountInputContainer}>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: isDarkMode ? '#374151' : '#F3F4F6',
                      color: isDarkMode ? 'white' : '#1F2937',
                      flex: 1,
                    },
                  ]}
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0"
                  placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'}
                  keyboardType="numeric"
                />
                <TextInput
                  style={[
                    styles.currencyInput,
                    {
                      backgroundColor: isDarkMode ? '#374151' : '#F3F4F6',
                      color: isDarkMode ? 'white' : '#1F2937',
                    },
                  ]}
                  value={currency}
                  onChangeText={(v) => setCurrency(v.toUpperCase())}
                  autoCapitalize="characters"
                  maxLength={3}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.labelText, { color: isDarkMode ? 'white' : '#1F2937', marginBottom: 8 }]}>
                {t('subscription.frequency')}
              </Text>
              <View style={styles.freqRow}>
                {(['monthly', 'yearly'] as const).map((f) => (
                  <TouchableOpacity
                    key={f}
                    style={[
                      styles.freqChip,
                      {
                        backgroundColor:
                          frequency === f ? '#667eea' : isDarkMode ? '#374151' : '#F3F4F6',
                      },
                    ]}
                    onPress={() => setFrequency(f)}
                  >
                    <Text
                      style={{
                        color: frequency === f ? 'white' : isDarkMode ? '#D1D5DB' : '#374151',
                        fontWeight: '600',
                      }}
                    >
                      {f === 'monthly' ? t('subscription.freqMonthly') : t('subscription.freqYearly')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <View style={styles.inputLabel}>
                <Calendar color="#667eea" size={20} />
                <Text style={[styles.labelText, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                  {t('subscription.paymentDay')}
                </Text>
              </View>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: isDarkMode ? '#374151' : '#F3F4F6',
                    color: isDarkMode ? 'white' : '#1F2937',
                  },
                ]}
                value={dayOfMonth}
                onChangeText={setDayOfMonth}
                placeholder="1-31"
                placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'}
                keyboardType="numeric"
              />
            </View>
          </View>

          <View style={[styles.card, { backgroundColor: isDarkMode ? '#1F2937' : 'white' }]}>
            <View style={styles.inputLabel}>
              <Tag color="#667eea" size={20} />
              <Text style={[styles.labelText, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                {t('subscription.category')}
              </Text>
            </View>

            <View style={styles.categoriesGrid}>
              {categories.map((category) => {
                const categoryInfo = EXPENSE_CATEGORIES[category as keyof typeof EXPENSE_CATEGORIES];
                const isSelected = selectedCategory === category;

                return (
                  <TouchableOpacity
                    key={category}
                    style={[
                      styles.categoryButton,
                      {
                        backgroundColor: isSelected
                          ? '#667eea'
                          : isDarkMode
                            ? '#374151'
                            : '#F3F4F6',
                      },
                    ]}
                    onPress={() => setSelectedCategory(category)}
                  >
                    <Text style={styles.categoryEmoji}>{categoryInfo.icon}</Text>
                    <Text
                      style={[
                        styles.categoryText,
                        { color: isSelected ? 'white' : isDarkMode ? '#D1D5DB' : '#1F2937' },
                      ]}
                    >
                      {category}
                    </Text>
                    {isSelected && <Check color="white" size={16} style={styles.checkIcon} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <AsyncButton
            variant="success"
            label={t('subscription.save')}
            loadingLabel={t('hhNotifSaving')}
            onPress={handleSave}
            style={styles.saveButton}
            contentStyle={styles.saveButtonGradient}
            textStyle={styles.saveButtonText}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  headerGradient: {
    paddingTop: 60,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  headerContent: { flexDirection: 'row', alignItems: 'center' },
  backButton: { marginRight: 12 },
  headerTitleContainer: { flex: 1 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: 'white' },
  content: { padding: 20, paddingBottom: 40 },
  brandPreview: { alignItems: 'center', marginBottom: 16 },
  card: { borderRadius: 16, padding: 16, marginBottom: 16 },
  inputGroup: { marginBottom: 16 },
  inputLabel: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  labelText: { fontSize: 15, fontWeight: '600' },
  input: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  amountInputContainer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  currencyInput: {
    width: 64,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 12,
    fontSize: 16,
    textAlign: 'center',
    fontWeight: '700',
  },
  freqRow: { flexDirection: 'row', gap: 8 },
  freqChip: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  categoriesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  categoryButton: {
    width: '47%',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryEmoji: { fontSize: 18 },
  categoryText: { flex: 1, fontSize: 13, fontWeight: '600' },
  checkIcon: { marginLeft: 4 },
  saveButton: { marginTop: 4 },
  saveButtonGradient: { borderRadius: 14, paddingVertical: 14 },
  saveButtonText: { fontSize: 16, fontWeight: '700', color: 'white' },
});
