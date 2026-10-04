import React, { useState, useEffect } from 'react';
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
import { getSubscriptionUiState } from '@/lib/subscription-helpers';
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

export default function EditSubscriptionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { subscriptions, updateSubscription, deleteSubscription } = useFinanceStore();
  const { isDarkMode, getCurrentCurrency } = useSettingsStore();
  const { t } = useLanguageStore();
  const currentCurrency = getCurrentCurrency();

  const subscription = subscriptions.find((s) => s.id === id);

  const [name, setName] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [currency, setCurrency] = useState<string>('CZK');
  const [frequency, setFrequency] = useState<'monthly' | 'yearly'>('monthly');
  const [selectedCategory, setSelectedCategory] = useState<string>(SUBSCRIPTION_CATEGORY);
  const [dayOfMonth, setDayOfMonth] = useState<string>('1');
  const [active, setActive] = useState(true);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (subscription) {
      setName(subscription.name);
      setAmount(String(subscription.amount));
      setCurrency((subscription.currency || currentCurrency.code || 'CZK').toUpperCase());
      setFrequency(subscription.frequency === 'yearly' ? 'yearly' : 'monthly');
      setSelectedCategory(subscription.category);
      setDayOfMonth(subscription.dayOfMonth.toString());
      setActive(subscription.active !== false);
      setPaused(Boolean(subscription.paused));
    }
  }, [subscription, currentCurrency.code]);

  const { run: handleSave } = useAsyncAction(async () => {
    if (!subscription) return;
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

    updateSubscription(id!, {
      name: name.trim(),
      amount: parsedAmount,
      currency: currency.trim().toUpperCase() || 'CZK',
      frequency,
      category: selectedCategory,
      dayOfMonth: parsedDay,
      active,
      paused,
    });

    Alert.alert(t('done'), t('subscription.updated'), [
      {
        text: 'OK',
        onPress: () => safeGoBack(),
      },
    ]);
  });

  const handleDelete = () => {
    Alert.alert(t('subscription.deleteTitle'), t('subscription.deleteHidePrompt'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('subscription.deleteKeepSuggestion'),
        style: 'destructive',
        onPress: () => {
          void deleteSubscription(id!, { hideSuggestion: false }).then(() => safeGoBack());
        },
      },
      {
        text: t('subscription.deleteAndHide'),
        style: 'destructive',
        onPress: () => {
          void deleteSubscription(id!, { hideSuggestion: true }).then(() => safeGoBack());
        },
      },
    ]);
  };

  if (!subscription) {
    return (
      <View style={[styles.container, { backgroundColor: isDarkMode ? '#111827' : '#F8FAFC' }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: isDarkMode ? 'white' : '#1F2937' }]}>
            {t('subscription.notFound')}
          </Text>
          <TouchableOpacity onPress={() => safeGoBack()} style={styles.backButtonError}>
            <Text style={styles.backButtonErrorText}>{t('back')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const categories = Object.keys(EXPENSE_CATEGORIES);
  const statusUi = getSubscriptionUiState({ active, paused });

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
            <Text style={styles.headerTitle}>{t('subscription.editTitle')}</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <View style={styles.brandPreview}>
            <BrandIcon
              merchantKey={name.trim() || subscription.name}
              size={64}
              isDimmed={statusUi !== 'on'}
            />
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
              <Text
                style={[
                  styles.labelText,
                  { color: isDarkMode ? 'white' : '#1F2937', marginBottom: 8 },
                ]}
              >
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
            <Text style={[styles.labelText, { color: isDarkMode ? 'white' : '#1F2937', marginBottom: 12 }]}>
              {t('subscription.status')}
            </Text>
            <View style={styles.statusRow}>
              <TouchableOpacity
                style={[
                  styles.statusChip,
                  {
                    backgroundColor:
                      statusUi === 'on' ? '#10B981' : isDarkMode ? '#374151' : '#F3F4F6',
                  },
                ]}
                onPress={() => {
                  setActive(true);
                  setPaused(false);
                }}
              >
                <Text
                  style={[
                    styles.statusChipText,
                    { color: statusUi === 'on' ? 'white' : isDarkMode ? '#D1D5DB' : '#374151' },
                  ]}
                >
                  {t('account.active')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.statusChip,
                  {
                    backgroundColor:
                      statusUi === 'paused' ? '#F59E0B' : isDarkMode ? '#374151' : '#F3F4F6',
                  },
                ]}
                onPress={() => {
                  setActive(true);
                  setPaused(true);
                }}
              >
                <Text
                  style={[
                    styles.statusChipText,
                    {
                      color: statusUi === 'paused' ? 'white' : isDarkMode ? '#D1D5DB' : '#374151',
                    },
                  ]}
                >
                  {t('subscription.paused')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.statusChip,
                  {
                    backgroundColor:
                      statusUi === 'off' ? '#6B7280' : isDarkMode ? '#374151' : '#F3F4F6',
                  },
                ]}
                onPress={() => {
                  setActive(false);
                  setPaused(false);
                }}
              >
                <Text
                  style={[
                    styles.statusChipText,
                    { color: statusUi === 'off' ? 'white' : isDarkMode ? '#D1D5DB' : '#374151' },
                  ]}
                >
                  {t('subscription.off')}
                </Text>
              </TouchableOpacity>
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
            label={t('subscription.saveChanges')}
            loadingLabel={t('hhNotifSaving')}
            onPress={handleSave}
            style={styles.saveButton}
            contentStyle={styles.saveButtonGradient}
            textStyle={styles.saveButtonText}
          />

          <AsyncButton
            variant="danger"
            label={t('subscription.delete')}
            loadingLabel="…"
            onPress={async () => {
              handleDelete();
            }}
            style={styles.deleteButton}
            textStyle={styles.deleteButtonText}
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
  statusRow: { flexDirection: 'row', gap: 8 },
  statusChip: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  statusChipText: { fontWeight: '600', fontSize: 13 },
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
  deleteButton: { marginTop: 12 },
  deleteButtonText: { fontSize: 16, fontWeight: '700' },
  errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { fontSize: 16, marginBottom: 16 },
  backButtonError: {
    backgroundColor: '#667eea',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  backButtonErrorText: { color: 'white', fontWeight: '600' },
});
