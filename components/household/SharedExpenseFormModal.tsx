import React from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type GestureResponderHandlers,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Image } from 'expo-image';
import { Check, ChevronLeft } from 'lucide-react-native';
import { SHARED_EXPENSE_CATEGORIES, type SharedExpenseSplitType } from '@/lib/household-shared-expenses';
import type { ExpensePaymentMode } from '@/lib/household-settlements';
import type { ThemeColors } from '@/constants/theme-colors';
import { useLanguageStore } from '@/store/language-store';
import type { Member } from './types';
import { householdStyles as styles } from './styles';

type TranslateFn = ReturnType<typeof useLanguageStore.getState>['t'];

export type SharedExpenseFormModalProps = {
  visible: boolean;
  colors: ThemeColors;
  themedInput: StyleProp<TextStyle>;
  panHandlers: GestureResponderHandlers;
  editingSharedId: string | null;
  isSavingShared: boolean;
  newSharedName: string;
  setNewSharedName: (v: string) => void;
  newSharedAmount: string;
  setNewSharedAmount: (v: string) => void;
  newSharedCategory: string;
  setNewSharedCategory: (v: string) => void;
  newSharedDate: Date;
  setNewSharedDate: (v: Date) => void;
  showSharedDatePicker: boolean;
  setShowSharedDatePicker: (v: boolean) => void;
  newSharedPaidBy: string;
  setNewSharedPaidBy: (v: string) => void;
  newSharedPaymentMode: ExpensePaymentMode;
  setNewSharedPaymentMode: (v: ExpensePaymentMode) => void;
  newSharedSplitType: SharedExpenseSplitType;
  setNewSharedSplitType: (v: SharedExpenseSplitType) => void;
  newSharedSplitPercent: string;
  setNewSharedSplitPercent: (v: string) => void;
  newSharedReceiptUri: string | null;
  newSharedExistingReceiptUrl: string | null;
  setNewSharedReceiptUri: (v: string | null) => void;
  setNewSharedExistingReceiptUrl: (v: string | null) => void;
  sharedSplitTypeOptions: readonly { id: SharedExpenseSplitType; label: string }[];
  members: Member[];
  currentUserId: string | undefined;
  numberLocale: string;
  closeSharedModal: () => void;
  pickSharedReceipt: () => void;
  upsertSharedExpense: () => void;
  onOpenExistingReceipt: (url: string) => void;
  t: TranslateFn;
};

export function SharedExpenseFormModal({
  visible,
  colors,
  themedInput,
  panHandlers,
  editingSharedId,
  isSavingShared,
  newSharedName,
  setNewSharedName,
  newSharedAmount,
  setNewSharedAmount,
  newSharedCategory,
  setNewSharedCategory,
  newSharedDate,
  setNewSharedDate,
  showSharedDatePicker,
  setShowSharedDatePicker,
  newSharedPaidBy,
  setNewSharedPaidBy,
  newSharedPaymentMode,
  setNewSharedPaymentMode,
  newSharedSplitType,
  setNewSharedSplitType,
  newSharedSplitPercent,
  setNewSharedSplitPercent,
  newSharedReceiptUri,
  newSharedExistingReceiptUrl,
  setNewSharedReceiptUri,
  setNewSharedExistingReceiptUrl,
  sharedSplitTypeOptions,
  members,
  currentUserId,
  numberLocale,
  closeSharedModal,
  pickSharedReceipt,
  upsertSharedExpense,
  onOpenExistingReceipt,
  t,
}: SharedExpenseFormModalProps) {
  const sharedSheetPanResponder = { panHandlers };
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={closeSharedModal}
      onDismiss={closeSharedModal}
    >
      <View style={styles.modalRoot}>
        <Pressable
          style={[styles.modalBackdropPressable, { backgroundColor: colors.overlay }]}
          onPress={closeSharedModal}
          accessibilityRole="button"
          accessibilityLabel={t('close')}
        />
        <View style={[styles.modalSheetCard, { backgroundColor: colors.surface }]}>
          <View {...sharedSheetPanResponder.panHandlers}>
            <View style={[styles.modalSheetHandle, { backgroundColor: colors.border }]} />
            <View style={styles.modalHeaderRow}>
              <TouchableOpacity onPress={closeSharedModal} hitSlop={12}>
                <ChevronLeft color={colors.text} size={28} />
              </TouchableOpacity>
              <Text style={[styles.modalTitleInHeader, { color: colors.text }]} numberOfLines={2}>
                {editingSharedId ? t('hhEditSharedExpense') : t('hhNewSharedExpense')}
              </Text>
              <View style={styles.modalHeaderSpacer} />
            </View>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalScrollContent}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>{t('hhNameLabel')}</Text>
            <TextInput
              style={themedInput}
              placeholder={t('hhNameLabel')}
              placeholderTextColor={colors.textSecondary}
              value={newSharedName}
              onChangeText={setNewSharedName}
            />

            <Text style={[styles.fieldLabel, { color: colors.text }]}>{t('hhAmountCzk')}</Text>
            <TextInput
              style={themedInput}
              placeholder={t('hhAmountCzk')}
              placeholderTextColor={colors.textSecondary}
              value={newSharedAmount}
              onChangeText={setNewSharedAmount}
              keyboardType="decimal-pad"
            />

            <TouchableOpacity
              style={[styles.sharedReceiptAttachBtn, { borderColor: colors.border, backgroundColor: colors.muted }]}
              onPress={pickSharedReceipt}
              activeOpacity={0.85}
            >
              <Text style={[styles.sharedReceiptAttachBtnText, { color: colors.text }]}>{t('hhAttachReceipt')}</Text>
            </TouchableOpacity>
            {newSharedReceiptUri ? (
              <View style={[styles.sharedReceiptPreviewWrap, { borderColor: colors.border }]}>
                <Image source={{ uri: newSharedReceiptUri }} style={styles.sharedReceiptPreview} contentFit="cover" />
                <Text style={[styles.sharedReceiptPreviewHint, { color: colors.textSecondary }]}>{t('hhReceiptAttached')}</Text>
              </View>
            ) : newSharedExistingReceiptUrl ? (
              <TouchableOpacity
                style={[styles.sharedReceiptPreviewWrap, { borderColor: colors.border }]}
                onPress={() => void onOpenExistingReceipt(newSharedExistingReceiptUrl)}
                activeOpacity={0.85}
              >
                <Text style={[styles.sharedReceiptPreviewHint, { color: colors.textSecondary }]}>{t('hhReceiptAttached')}</Text>
              </TouchableOpacity>
            ) : null}

            <Text style={[styles.fieldLabel, styles.fieldLabelCategory, { color: colors.text }]}>{t('category')}</Text>
            <View style={styles.recurringCategoryGrid}>
              {SHARED_EXPENSE_CATEGORIES.map(({ name, emoji }) => {
                const isSelected = newSharedCategory === name;
                return (
                  <TouchableOpacity
                    key={name}
                    style={[
                      styles.recurringCategoryPill,
                      isSelected ? { backgroundColor: colors.primary } : { backgroundColor: colors.muted },
                    ]}
                    onPress={() => setNewSharedCategory(name)}
                  >
                    <Text style={styles.recurringCategoryPillEmoji}>{emoji}</Text>
                    <Text style={[styles.recurringCategoryPillLabel, isSelected && styles.recurringCategoryPillLabelSelected, !isSelected && { color: colors.text }]}>
                      {name}
                    </Text>
                    {isSelected ? <Check color={colors.onPrimary} size={16} style={styles.recurringCategoryPillCheck} /> : null}
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.text }]}>{t('hhDateLabel')}</Text>
            <TouchableOpacity
              style={[themedInput as StyleProp<ViewStyle>, styles.sharedDateButton]}
              onPress={() => setShowSharedDatePicker(true)}
            >
              <Text style={{ color: colors.text }}>
                {newSharedDate.toLocaleDateString(numberLocale, { day: 'numeric', month: 'long', year: 'numeric' })}
              </Text>
            </TouchableOpacity>
            {showSharedDatePicker ? (
              <DateTimePicker
                value={newSharedDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(_e, d) => {
                  if (Platform.OS !== 'ios') setShowSharedDatePicker(false);
                  if (d) setNewSharedDate(d);
                }}
              />
            ) : null}

            <Text style={[styles.fieldLabel, { color: colors.text }]}>{t('hhHowPaymentWorks')}</Text>
            <View style={styles.recurringSplitRow}>
              <TouchableOpacity
                style={[
                  styles.recurringSplitPill,
                  newSharedPaymentMode === 'each_own_share'
                    ? { backgroundColor: colors.primary }
                    : { backgroundColor: colors.muted },
                ]}
                onPress={() => setNewSharedPaymentMode('each_own_share')}
              >
                <Text
                  style={[
                    styles.recurringSplitPillText,
                    newSharedPaymentMode === 'each_own_share'
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
                  newSharedPaymentMode === 'single_payer'
                    ? { backgroundColor: colors.primary }
                    : { backgroundColor: colors.muted },
                ]}
                onPress={() => setNewSharedPaymentMode('single_payer')}
              >
                <Text
                  style={[
                    styles.recurringSplitPillText,
                    newSharedPaymentMode === 'single_payer'
                      ? { color: colors.onPrimary, fontWeight: '700' }
                      : { color: colors.text },
                  ]}
                >
                  {t('hhPaymentSinglePayer')}
                </Text>
              </TouchableOpacity>
            </View>

            {newSharedPaymentMode === 'single_payer' ? (
              <>
                <Text style={[styles.fieldLabel, { color: colors.text }]}>{t('hhSettlementPayer')}</Text>
                <View style={styles.recurringSplitRow}>
                  {members.map((m) => {
                    const sel = newSharedPaidBy === m.userId;
                    return (
                      <TouchableOpacity
                        key={m.userId}
                        style={[
                          styles.recurringSplitPill,
                          sel ? { backgroundColor: colors.primary } : { backgroundColor: colors.muted },
                        ]}
                        onPress={() => setNewSharedPaidBy(m.userId)}
                      >
                        <Text
                          style={[
                            styles.recurringSplitPillText,
                            sel ? { color: colors.onPrimary, fontWeight: '700' } : { color: colors.text },
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

            <Text style={[styles.fieldLabel, { color: colors.text }]}>{t('hhWhoPays')}</Text>
            <View style={styles.recurringSplitRow}>
              {sharedSplitTypeOptions.map((opt) => {
                const sel = newSharedSplitType === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[styles.recurringSplitPill, sel ? { backgroundColor: colors.primary } : { backgroundColor: colors.muted }]}
                    onPress={() => setNewSharedSplitType(opt.id)}
                  >
                    <Text style={[styles.recurringSplitPillText, sel ? { color: colors.onPrimary, fontWeight: '700' } : { color: colors.text }]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {newSharedSplitType === 'custom' ? (
              <>
                <Text style={[styles.fieldLabel, { color: colors.text }]}>{t('hhMySharePercent')}</Text>
                <TextInput
                  style={themedInput}
                  placeholder={t('hhSharePlaceholder')}
                  placeholderTextColor={colors.textSecondary}
                  value={newSharedSplitPercent}
                  onChangeText={setNewSharedSplitPercent}
                  keyboardType="decimal-pad"
                />
              </>
            ) : null}

            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: colors.primary }, isSavingShared && { opacity: 0.6 }]}
              onPress={() => void upsertSharedExpense()}
              disabled={isSavingShared}
            >
              <Text style={styles.primaryButtonText}>{editingSharedId ? t('hhSaveChanges') : t('hhAddExpense')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.secondaryButton, { backgroundColor: colors.muted }]} onPress={closeSharedModal}>
              <Text style={[styles.secondaryButtonText, { color: colors.text }]}>{t('cancel')}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>

  );
}
