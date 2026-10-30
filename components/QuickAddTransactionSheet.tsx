import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Keyboard,
  KeyboardAvoidingView,
  InputAccessoryView,
  Platform,
  PanResponder,
  ActivityIndicator,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/use-theme';
import { useLanguageStore } from '@/store/language-store';
import { useSettingsStore } from '@/store/settings-store';
import { CategoryPicker } from '@/components/CategoryPicker';
import {
  RecurringFrequencyField,
  type PersonalRecurringChoice,
} from '@/components/RecurringFrequencyField';
import { useAddTransaction } from '@/hooks/useAddTransaction';
import { toYyyyMmDd } from '@/lib/transaction-date';

const QUICK_ADD_ACCESSORY_ID = 'quick-add-keyboard-done';
import { appLocale } from '@/lib/app-locale';

export type QuickAddTransactionSheetProps = {
  visible: boolean;
  onClose: () => void;
  type: 'income' | 'expense';
  /** Umožní přepínač příjem/výdaj (tab ➕). */
  allowTypeToggle?: boolean;
  onTypeChange?: (type: 'income' | 'expense') => void;
  /** Odkaz „Nahrát výpis“ + další možnosti → bank-import / add. */
  showMoreOptions?: boolean;
  defaultCategory?: string;
  defaultSubcategory?: string | null;
  /** Po úspěšném uložení (sheet už se zavírá) */
  onSaved?: () => void;
};

export function QuickAddTransactionSheet({
  visible,
  onClose,
  type,
  allowTypeToggle = false,
  onTypeChange,
  showMoreOptions = false,
  defaultCategory,
  defaultSubcategory,
  onSaved,
}: QuickAddTransactionSheetProps) {
  const { colors } = useTheme();
  const { t, language } = useLanguageStore();
  const { getCurrentCurrency } = useSettingsStore();
  const currency = getCurrentCurrency();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { saveTransaction, isSaving } = useAddTransaction();
  const amountRef = useRef<TextInput>(null);

  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  const [date, setDate] = useState(() => new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [frequency, setFrequency] = useState<PersonalRecurringChoice>(null);

  const resetForm = useCallback(() => {
    setAmount('');
    setTitle('');
    setSelectedCategory(defaultCategory?.trim() || '');
    setSelectedSubcategory(defaultSubcategory ?? null);
    setDate(new Date());
    setShowDatePicker(false);
    setFrequency(null);
  }, [defaultCategory, defaultSubcategory]);

  useEffect(() => {
    if (!visible) return;
    resetForm();
    const tmr = setTimeout(() => amountRef.current?.focus(), 350);
    return () => clearTimeout(tmr);
  }, [visible, resetForm]);

  const close = useCallback(() => {
    Keyboard.dismiss();
    onClose();
  }, [onClose]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 10 && g.dy > Math.abs(g.dx),
        onPanResponderRelease: (_e, g) => {
          if (g.dy > 56) close();
        },
      }),
    [close],
  );

  const accent = type === 'income' ? '#10B981' : '#EF4444';
  const titleText =
    type === 'income' ? t('addTransaction.newIncomeTitle') : t('addTransaction.newExpenseTitle');

  const dateLabel = useMemo(() => {
    try {
      return date.toLocaleDateString(appLocale(language), {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return toYyyyMmDd(date);
    }
  }, [date, language]);

  const onCategoryChange = useCallback((category: string, subcategory: string | null) => {
    setSelectedCategory(category);
    setSelectedSubcategory(subcategory);
  }, []);

  const handleSave = useCallback(async () => {
    const result = await saveTransaction({
      type,
      amount,
      title,
      category: selectedCategory,
      subcategory: selectedSubcategory,
      date: toYyyyMmDd(date),
      currency: 'CZK',
      frequency,
    });
    if (!result.ok) return;
    onSaved?.();
    close();
  }, [
    saveTransaction,
    type,
    amount,
    title,
    selectedCategory,
    selectedSubcategory,
    date,
    frequency,
    onSaved,
    close,
  ]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.modalRoot}>
        <Pressable
          style={[styles.backdrop, { backgroundColor: colors.overlay ?? 'rgba(0,0,0,0.45)' }]}
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel={t('cancel')}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.kav}
        >
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: colors.background,
                paddingBottom: Math.max(insets.bottom, 16) + 8,
              },
            ]}
          >
            <View {...panResponder.panHandlers} onTouchEnd={() => Keyboard.dismiss()}>
              <View style={styles.handle} />
              <View style={styles.headerRow}>
                <View style={styles.headerSpacer} />
                <Text style={[styles.headerTitle, { color: accent }]} numberOfLines={1}>
                  {titleText}
                </Text>
                <TouchableOpacity
                  onPress={close}
                  style={[styles.closeBtn, { backgroundColor: colors.muted }]}
                  hitSlop={8}
                  accessibilityLabel={t('cancel')}
                >
                  <X color={colors.textSecondary} size={18} />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
            >
              {allowTypeToggle ? (
                <View style={[styles.typeToggle, { backgroundColor: colors.muted }]}>
                  {(['expense', 'income'] as const).map((tab) => {
                    const active = type === tab;
                    return (
                      <TouchableOpacity
                        key={tab}
                        style={[
                          styles.typeToggleBtn,
                          active && {
                            backgroundColor: tab === 'income' ? '#10B981' : '#EF4444',
                          },
                        ]}
                        onPress={() => {
                          onTypeChange?.(tab);
                          setSelectedCategory('');
                          setSelectedSubcategory(null);
                        }}
                      >
                        <Text
                          style={[
                            styles.typeToggleText,
                            { color: active ? '#fff' : colors.textSecondary },
                          ]}
                        >
                          {tab === 'expense' ? t('expense') : t('income')}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : null}

              <Text style={[styles.label, { color: colors.textSecondary }]}>{t('amount')}</Text>
              <View
                style={[
                  styles.amountRow,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <TextInput
                  ref={amountRef}
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  inputAccessoryViewID={Platform.OS === 'ios' ? QUICK_ADD_ACCESSORY_ID : undefined}
                  style={[styles.amountInput, { color: colors.text }]}
                  testID="quick-add-amount"
                />
                <Text style={[styles.currency, { color: colors.textSecondary }]}>
                  {currency.symbol || 'Kč'}
                </Text>
              </View>

              <Text style={[styles.label, { color: colors.textSecondary }]}>{t('description')}</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                returnKeyType="done"
                blurOnSubmit
                onSubmitEditing={() => Keyboard.dismiss()}
                inputAccessoryViewID={Platform.OS === 'ios' ? QUICK_ADD_ACCESSORY_ID : undefined}
                placeholder={t('description')}
                placeholderTextColor={colors.textSecondary}
                style={[
                  styles.textInput,
                  { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border },
                ]}
                testID="quick-add-title"
              />

              <Text style={[styles.label, { color: colors.textSecondary }]}>{t('category')}</Text>
              <CategoryPicker
                key={`cat-${type}-${defaultCategory ?? ''}-${visible ? '1' : '0'}`}
                type={type}
                selectedCategory={selectedCategory}
                selectedSubcategory={selectedSubcategory}
                description={title}
                onChange={onCategoryChange}
                layout="chips"
              />

              <Text style={[styles.label, { color: colors.textSecondary }]}>{t('date')}</Text>
              <TouchableOpacity
                style={[
                  styles.dateBtn,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
                onPress={() => setShowDatePicker((v) => !v)}
              >
                <Text style={{ color: colors.text, fontWeight: '600' }}>{dateLabel}</Text>
              </TouchableOpacity>
              {showDatePicker ? (
                <DateTimePicker
                  value={date}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(_e, selected) => {
                    if (Platform.OS === 'android') setShowDatePicker(false);
                    if (selected) setDate(selected);
                  }}
                  maximumDate={frequency ? undefined : new Date()}
                />
              ) : null}

              <RecurringFrequencyField value={frequency} onChange={setFrequency} />

              {showMoreOptions ? (
                <View style={styles.moreOptions}>
                  <TouchableOpacity
                    onPress={() => {
                      close();
                      router.push('/bank-import');
                    }}
                  >
                    <Text style={[styles.moreLink, { color: colors.primary }]}>Nahrát výpis</Text>
                  </TouchableOpacity>
                  <Text style={{ color: colors.textSecondary }}> · </Text>
                  <TouchableOpacity
                    onPress={() => {
                      close();
                      router.push('/(tabs)/add');
                    }}
                  >
                    <Text style={[styles.moreLink, { color: colors.primary }]}>Další možnosti</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </ScrollView>

            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: accent, opacity: isSaving ? 0.7 : 1 }]}
              onPress={() => void handleSave()}
              disabled={isSaving}
              testID="quick-add-save"
            >
              {isSaving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveBtnText}>{t('save')}</Text>
              )}
            </TouchableOpacity>

          </View>
        </KeyboardAvoidingView>
        {Platform.OS === 'ios' ? (
          <InputAccessoryView nativeID={QUICK_ADD_ACCESSORY_ID}>
            <View style={[styles.accessoryBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
              <TouchableOpacity onPress={() => Keyboard.dismiss()} hitSlop={10}>
                <Text style={[styles.accessoryDone, { color: colors.primary }]}>Hotovo</Text>
              </TouchableOpacity>
            </View>
          </InputAccessoryView>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject },
  kav: { width: '100%', maxHeight: '92%' },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    width: '100%',
    maxHeight: '100%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#D1D5DB',
    marginTop: 10,
    marginBottom: 6,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  headerSpacer: { width: 32, height: 32 },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { flexShrink: 1 },
  scrollContent: { paddingBottom: 16 },
  accessoryBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  accessoryDone: { fontSize: 16, fontWeight: '700' },
  typeToggle: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    marginBottom: 4,
    gap: 4,
  },
  typeToggleBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  typeToggleText: { fontSize: 14, fontWeight: '700' },
  moreOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    marginBottom: 4,
  },
  moreLink: { fontSize: 14, fontWeight: '600' },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 6,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  amountInput: {
    flex: 1,
    fontSize: 28,
    fontWeight: '700',
    padding: 0,
  },
  currency: { fontSize: 18, fontWeight: '600', marginLeft: 8 },
  textInput: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  dateBtn: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  saveBtn: {
    marginTop: 8,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
