import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type StyleProp,
  type TextStyle,
  type GestureResponderHandlers,
} from 'react-native';
import { Check, ChevronLeft } from 'lucide-react-native';
import type { RecurringFrequency } from '@/lib/recurring-expense-cycle';
import type { RecurringSplitType } from '@/lib/household-recurring-shares';
import type { ExpensePaymentMode } from '@/lib/household-settlements';
import type { ThemeColors } from '@/constants/theme-colors';
import { useLanguageStore } from '@/store/language-store';
import {
  DEFAULT_RECURRING_CATEGORY_PILLS,
  needsAnchorMonth,
  translateRecurringCategory,
} from './helpers';
import type { HouseholdCustomCategory, Member } from './types';

type TranslateFn = ReturnType<typeof useLanguageStore.getState>['t'];

type FrequencyOption = { value: RecurringFrequency; label: string };
type SplitTypeOption = { id: RecurringSplitType; label: string };

type ExpenseFormModalProps = {
  visible: boolean;
  colors: ThemeColors;
  themedInput: StyleProp<TextStyle>;
  panHandlers: GestureResponderHandlers;
  editingRecurringId: string | null;
  isSaving: boolean;
  newRecurringName: string;
  setNewRecurringName: (v: string) => void;
  newRecurringAmount: string;
  setNewRecurringAmount: (v: string) => void;
  newRecurringFrequency: RecurringFrequency;
  setNewRecurringFrequency: (v: RecurringFrequency) => void;
  newRecurringDueWeekday: string;
  setNewRecurringDueWeekday: (v: string) => void;
  newRecurringDueDay: string;
  setNewRecurringDueDay: (v: string) => void;
  newRecurringDueMonth: string;
  setNewRecurringDueMonth: (v: string) => void;
  newRecurringCategory: string;
  setNewRecurringCategory: (v: string) => void;
  newRecurringSplitType: RecurringSplitType;
  setNewRecurringSplitType: (v: RecurringSplitType) => void;
  newRecurringMyShare: string;
  setNewRecurringMyShare: (v: string) => void;
  newRecurringPaymentMode: ExpensePaymentMode;
  setNewRecurringPaymentMode: (v: ExpensePaymentMode) => void;
  newRecurringPayerUserId: string;
  setNewRecurringPayerUserId: (v: string) => void;
  frequencyOptions: readonly FrequencyOption[];
  splitTypeOptions: readonly SplitTypeOption[];
  sortedCustomCategories: HouseholdCustomCategory[];
  customCategory: { name: string; emoji: string } | null;
  members: Member[];
  currentUserId: string | undefined;
  onClose: () => void;
  onOpenCustomCategoryModal: () => void;
  onSubmit: () => void;
  t: TranslateFn;
};

export function ExpenseFormModal({
  visible,
  colors,
  themedInput,
  panHandlers,
  editingRecurringId,
  isSaving,
  newRecurringName,
  setNewRecurringName,
  newRecurringAmount,
  setNewRecurringAmount,
  newRecurringFrequency,
  setNewRecurringFrequency,
  newRecurringDueWeekday,
  setNewRecurringDueWeekday,
  newRecurringDueDay,
  setNewRecurringDueDay,
  newRecurringDueMonth,
  setNewRecurringDueMonth,
  newRecurringCategory,
  setNewRecurringCategory,
  newRecurringSplitType,
  setNewRecurringSplitType,
  newRecurringMyShare,
  setNewRecurringMyShare,
  newRecurringPaymentMode,
  setNewRecurringPaymentMode,
  newRecurringPayerUserId,
  setNewRecurringPayerUserId,
  frequencyOptions,
  splitTypeOptions,
  sortedCustomCategories,
  customCategory,
  members,
  currentUserId,
  onClose,
  onOpenCustomCategoryModal,
  onSubmit,
  t,
}: ExpenseFormModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      onDismiss={onClose}
    >
      <View style={styles.modalRoot}>
        <Pressable
          style={[styles.modalBackdropPressable, { backgroundColor: colors.overlay }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('close')}
        />
        <View style={[styles.modalSheetCard, { backgroundColor: colors.surface }]}>
          <View {...panHandlers}>
            <View style={[styles.modalSheetHandle, { backgroundColor: colors.border }]} />
            <View style={styles.modalHeaderRow}>
              <TouchableOpacity
                onPress={onClose}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={t('back')}
              >
                <ChevronLeft color={colors.text} size={28} />
              </TouchableOpacity>
              <Text style={[styles.modalTitleInHeader, { color: colors.text }]} numberOfLines={2}>
                {editingRecurringId ? t('hhEditRecurring') : t('hhNewRecurring')}
              </Text>
              <View style={styles.modalHeaderSpacer} />
            </View>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.modalScrollContent}
          >
            <Text style={[styles.fieldLabel, { color: colors.text }]}>{t('hhNameLabel')}</Text>
            <TextInput
              style={themedInput}
              placeholder={t('hhNameLabel')}
              placeholderTextColor={colors.textSecondary}
              value={newRecurringName}
              onChangeText={setNewRecurringName}
            />

            <Text style={[styles.fieldLabel, { color: colors.text }]}>{t('hhAmountCzk')}</Text>
            <TextInput
              style={themedInput}
              placeholder={t('hhAmountCzk')}
              placeholderTextColor={colors.textSecondary}
              value={newRecurringAmount}
              onChangeText={setNewRecurringAmount}
              keyboardType="decimal-pad"
            />

            <Text style={[styles.fieldLabel, styles.fieldLabelCategory, { color: colors.text }]}>
              {t('hhFrequency')}
            </Text>
            <View style={styles.recurringFrequencyGrid}>
              {frequencyOptions.map(({ value, label }) => {
                const isSelected = newRecurringFrequency === value;
                return (
                  <TouchableOpacity
                    key={value}
                    style={[
                      styles.recurringCategoryPill,
                      isSelected
                        ? { backgroundColor: colors.primary }
                        : { backgroundColor: colors.muted },
                    ]}
                    onPress={() => setNewRecurringFrequency(value)}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[
                        styles.recurringCategoryPillLabel,
                        isSelected
                          ? styles.recurringCategoryPillLabelSelected
                          : { color: colors.text },
                      ]}
                    >
                      {label}
                    </Text>
                    {isSelected ? (
                      <Check
                        color={colors.onPrimary}
                        size={16}
                        style={styles.recurringCategoryPillCheck}
                      />
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>

            {newRecurringFrequency === 'weekly' ? (
              <>
                <Text style={[styles.fieldLabel, { color: colors.text }]}>
                  {t('hhWeekDayPickerLabel')}
                </Text>
                <View style={styles.recurringFrequencyGrid}>
                  {(
                    [
                      { v: '1', label: t('hhWeekdayMon') },
                      { v: '2', label: t('hhWeekdayTue') },
                      { v: '3', label: t('hhWeekdayWed') },
                      { v: '4', label: t('hhWeekdayThu') },
                      { v: '5', label: t('hhWeekdayFri') },
                      { v: '6', label: t('hhWeekdaySat') },
                      { v: '7', label: t('hhWeekdaySun') },
                    ] as const
                  ).map(({ v, label }) => {
                    const isSelected = newRecurringDueWeekday === v;
                    return (
                      <TouchableOpacity
                        key={v}
                        style={[
                          styles.recurringCategoryPill,
                          isSelected
                            ? { backgroundColor: colors.primary }
                            : { backgroundColor: colors.muted },
                        ]}
                        onPress={() => setNewRecurringDueWeekday(v)}
                        activeOpacity={0.85}
                      >
                        <Text
                          style={[
                            styles.recurringCategoryPillLabel,
                            isSelected
                              ? styles.recurringCategoryPillLabelSelected
                              : { color: colors.text },
                          ]}
                        >
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            ) : null}

            {newRecurringFrequency === 'monthly' ? (
              <>
                <Text style={[styles.fieldLabel, { color: colors.text }]}>{t('hhMonthDayLabel')}</Text>
                <TextInput
                  style={themedInput}
                  placeholder="1-31"
                  placeholderTextColor={colors.textSecondary}
                  value={newRecurringDueDay}
                  onChangeText={setNewRecurringDueDay}
                  keyboardType="number-pad"
                />
              </>
            ) : null}

            {needsAnchorMonth(newRecurringFrequency) ? (
              <>
                <Text style={[styles.fieldLabel, { color: colors.text }]}>{t('hhDayLabel')}</Text>
                <TextInput
                  style={themedInput}
                  placeholder="1-31"
                  placeholderTextColor={colors.textSecondary}
                  value={newRecurringDueDay}
                  onChangeText={setNewRecurringDueDay}
                  keyboardType="number-pad"
                />
                <Text style={[styles.fieldLabel, { color: colors.text }]}>
                  {newRecurringFrequency === 'yearly'
                    ? t('hhMonthLabel')
                    : t('hhFirstOccurrenceMonthLabel')}
                </Text>
                <TextInput
                  style={themedInput}
                  placeholder="1-12"
                  placeholderTextColor={colors.textSecondary}
                  value={newRecurringDueMonth}
                  onChangeText={setNewRecurringDueMonth}
                  keyboardType="number-pad"
                />
              </>
            ) : null}

            <Text style={[styles.fieldLabel, styles.fieldLabelCategory, { color: colors.text }]}>
              {t('hhCategory')}
            </Text>
            <View style={styles.recurringCategoryGrid}>
              {DEFAULT_RECURRING_CATEGORY_PILLS.map(({ name, emoji }) => {
                const isSelected = newRecurringCategory === name;
                return (
                  <TouchableOpacity
                    key={name}
                    style={[
                      styles.recurringCategoryPill,
                      isSelected
                        ? { backgroundColor: colors.primary }
                        : { backgroundColor: colors.muted },
                    ]}
                    onPress={() => setNewRecurringCategory(name)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.recurringCategoryPillEmoji}>{emoji}</Text>
                    <Text
                      style={[
                        styles.recurringCategoryPillLabel,
                        isSelected && styles.recurringCategoryPillLabelSelected,
                        !isSelected && { color: colors.text },
                      ]}
                    >
                      {translateRecurringCategory(name)}
                    </Text>
                    {isSelected ? (
                      <Check
                        color={colors.onPrimary}
                        size={16}
                        style={styles.recurringCategoryPillCheck}
                      />
                    ) : null}
                  </TouchableOpacity>
                );
              })}
              {sortedCustomCategories.map((row) => {
                const isSelected = newRecurringCategory === row.name;
                return (
                  <TouchableOpacity
                    key={row.id}
                    style={[
                      styles.recurringCategoryPill,
                      isSelected
                        ? { backgroundColor: colors.primary }
                        : { backgroundColor: colors.muted },
                    ]}
                    onPress={() => setNewRecurringCategory(row.name)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.recurringCategoryPillEmoji}>{row.emoji}</Text>
                    <Text
                      style={[
                        styles.recurringCategoryPillLabel,
                        isSelected && styles.recurringCategoryPillLabelSelected,
                        !isSelected && { color: colors.text },
                      ]}
                    >
                      {row.name}
                    </Text>
                    {isSelected ? (
                      <Check
                        color={colors.onPrimary}
                        size={16}
                        style={styles.recurringCategoryPillCheck}
                      />
                    ) : null}
                  </TouchableOpacity>
                );
              })}
              {customCategory ? (
                <TouchableOpacity
                  style={[
                    styles.recurringCategoryPill,
                    newRecurringCategory === customCategory.name
                      ? { backgroundColor: colors.primary }
                      : { backgroundColor: colors.muted },
                  ]}
                  onPress={() => setNewRecurringCategory(customCategory.name)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.recurringCategoryPillEmoji}>{customCategory.emoji}</Text>
                  <Text
                    style={[
                      styles.recurringCategoryPillLabel,
                      newRecurringCategory === customCategory.name &&
                        styles.recurringCategoryPillLabelSelected,
                      newRecurringCategory !== customCategory.name && { color: colors.text },
                    ]}
                  >
                    {customCategory.name}
                  </Text>
                  {newRecurringCategory === customCategory.name ? (
                    <Check
                      color={colors.onPrimary}
                      size={16}
                      style={styles.recurringCategoryPillCheck}
                    />
                  ) : null}
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={[
                  styles.recurringCategoryPill,
                  styles.recurringCategoryPillAddCustom,
                  { borderColor: colors.primary, backgroundColor: colors.surface },
                ]}
                onPress={onOpenCustomCategoryModal}
                activeOpacity={0.85}
              >
                <Text style={[styles.recurringCategoryPillAddCustomText, { color: colors.primary }]}>
                  {t('hhCustomCategoryAdd')}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.fieldLabel, { color: colors.text }]}>{t('hhWhoPays')}</Text>
            <View style={styles.recurringSplitRow}>
              {splitTypeOptions.map((opt) => {
                const sel = newRecurringSplitType === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[
                      styles.recurringSplitPill,
                      sel ? { backgroundColor: colors.primary } : { backgroundColor: colors.muted },
                    ]}
                    onPress={() => setNewRecurringSplitType(opt.id)}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[
                        styles.recurringSplitPillText,
                        sel
                          ? { color: colors.onPrimary, fontWeight: '700' }
                          : { color: colors.text },
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {newRecurringSplitType === 'shared_custom' ? (
              <>
                <Text style={[styles.fieldLabel, { color: colors.text }]}>
                  {t('hhMySharePercent')}
                </Text>
                <TextInput
                  style={themedInput}
                  placeholder={t('hhSharePlaceholder')}
                  placeholderTextColor={colors.textSecondary}
                  value={newRecurringMyShare}
                  onChangeText={setNewRecurringMyShare}
                  keyboardType="decimal-pad"
                />
              </>
            ) : null}

            <Text style={[styles.fieldLabel, { color: colors.text }]}>{t('hhHowPaymentWorks')}</Text>
            <View style={styles.recurringSplitRow}>
              <TouchableOpacity
                style={[
                  styles.recurringSplitPill,
                  newRecurringPaymentMode === 'each_own_share'
                    ? { backgroundColor: colors.primary }
                    : { backgroundColor: colors.muted },
                ]}
                onPress={() => setNewRecurringPaymentMode('each_own_share')}
              >
                <Text
                  style={[
                    styles.recurringSplitPillText,
                    newRecurringPaymentMode === 'each_own_share'
                      ? { color: colors.onPrimary, fontWeight: '700' }
                      : { color: colors.text },
                  ]}
                >
                  {t('hhPaymentEachOwnShare')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.recurringSplitPill,
                  newRecurringPaymentMode === 'single_payer'
                    ? { backgroundColor: colors.primary }
                    : { backgroundColor: colors.muted },
                ]}
                onPress={() => setNewRecurringPaymentMode('single_payer')}
              >
                <Text
                  style={[
                    styles.recurringSplitPillText,
                    newRecurringPaymentMode === 'single_payer'
                      ? { color: colors.onPrimary, fontWeight: '700' }
                      : { color: colors.text },
                  ]}
                >
                  {t('hhPaymentSinglePayer')}
                </Text>
              </TouchableOpacity>
            </View>
            {newRecurringPaymentMode === 'single_payer' ? (
              <>
                <Text style={[styles.fieldLabel, { color: colors.text }]}>
                  {t('hhSettlementPayer')}
                </Text>
                <View style={styles.recurringSplitRow}>
                  {members.map((m) => {
                    const sel = newRecurringPayerUserId === m.userId;
                    return (
                      <TouchableOpacity
                        key={m.userId}
                        style={[
                          styles.recurringSplitPill,
                          sel
                            ? { backgroundColor: colors.primary }
                            : { backgroundColor: colors.muted },
                        ]}
                        onPress={() => setNewRecurringPayerUserId(m.userId)}
                      >
                        <Text
                          style={[
                            styles.recurringSplitPillText,
                            sel
                              ? { color: colors.onPrimary, fontWeight: '700' }
                              : { color: colors.text },
                          ]}
                        >
                          {m.userId === currentUserId ? t('hhMe') : m.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            ) : null}

            <TouchableOpacity
              style={[
                styles.primaryButton,
                { backgroundColor: colors.primary },
                isSaving && { opacity: 0.6 },
              ]}
              onPress={onSubmit}
              disabled={isSaving}
            >
              <Text style={styles.primaryButtonText}>
                {editingRecurringId ? t('hhSaveChanges') : t('hhAddExpense')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.secondaryButton, { backgroundColor: colors.muted }]}
              onPress={onClose}
            >
              <Text style={[styles.secondaryButtonText, { color: colors.text }]}>{t('cancel')}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBackdropPressable: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  modalSheetCard: {
    maxHeight: '92%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 20,
    paddingBottom: 32,
    width: '100%',
    zIndex: 1,
    elevation: 12,
  },
  modalSheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#D1D5DB',
    marginTop: 10,
    marginBottom: 6,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  modalHeaderSpacer: { width: 28, height: 28 },
  modalTitleInHeader: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
  },
  modalScrollContent: { paddingBottom: 24 },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 6 },
  fieldLabelCategory: { marginTop: 4 },
  recurringFrequencyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  recurringCategoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  recurringCategoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
  },
  recurringCategoryPillEmoji: { fontSize: 16 },
  recurringCategoryPillLabel: { fontSize: 13, fontWeight: '600', color: '#1F2937' },
  recurringCategoryPillLabelSelected: { color: '#FFFFFF' },
  recurringCategoryPillCheck: { marginLeft: 2 },
  recurringCategoryPillAddCustom: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#667eea',
    borderStyle: 'dashed',
  },
  recurringCategoryPillAddCustomText: { fontSize: 13, fontWeight: '700', color: '#667eea' },
  primaryButton: {
    marginTop: 16,
    backgroundColor: '#667eea',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonText: { color: 'white', fontWeight: '700', fontSize: 16 },
  secondaryButton: {
    marginTop: 10,
    backgroundColor: '#E5E7EB',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryButtonText: { color: '#374151', fontWeight: '700', fontSize: 16 },
  recurringSplitRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  recurringSplitPill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  recurringSplitPillText: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
});
