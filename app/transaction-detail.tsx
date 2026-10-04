import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
  Modal,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Stack, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Calendar, Trash2 } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { supabase } from '@/lib/supabase';
import { useFinanceStore } from '@/store/finance-store';
import { useSettingsStore } from '@/store/settings-store';
import { useLanguageStore } from '@/store/language-store';
import { formatDateCs } from '@/lib/loan-math';
import { toYyyyMmDd, transactionToLocalDateNoon } from '@/lib/transaction-date';
import { getAuthUserId } from '@/lib/supabase-transactions';
import { deleteReceiptFromStorage, uploadReceiptToStorage } from '@/lib/receipt-upload';
import {
  bulkApplyCategoryForMerchantKey,
  countTransactionsForMerchantKey,
  upsertUserCategoryRule,
} from '@/lib/user-category-rules';
import { safeGoBack } from '@/lib/safe-back';
import { BackButton } from '@/components/BackButton';
import { parseMoneyInput } from '@/lib/parse-money-input';
import { AsyncButton } from '@/components/AsyncButton';
import { useAsyncAction } from '@/hooks/use-async-action';
import { pluralTransakce } from '@/lib/plural-cs';

function paramId(raw: string | string[] | undefined): string | undefined {
  if (raw == null) return undefined;
  return Array.isArray(raw) ? raw[0] : raw;
}

export default function TransactionDetailScreen() {
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = paramId(idParam);
  const { transactions, updateTransaction, deleteTransaction, getAllCategories } = useFinanceStore();
  const { isDarkMode, getCurrentCurrency } = useSettingsStore();
  const { t, language } = useLanguageStore();
  const currency = getCurrentCurrency();

  const transaction = useMemo(() => transactions.find((t) => t.id === id), [transactions, id]);

  const [amountStr, setAmountStr] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [date, setDate] = useState<Date>(new Date());
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [receiptFullscreen, setReceiptFullscreen] = useState(false);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);

  useEffect(() => {
    if (!transaction) return;
    setAmountStr(String(transaction.amount).replace('.', ','));
    setTitle(transaction.title);
    setCategory(transaction.category);
    setDate(transactionToLocalDateNoon(transaction.date));
  }, [transaction]);

  const categoryMap = useMemo(() => {
    if (!transaction) return {};
    return getAllCategories(transaction.type);
  }, [transaction, getAllCategories]);

  const categoryNames = useMemo(() => {
    const names = Object.keys(categoryMap).sort();
    if (transaction && category && !names.includes(category)) {
      return [category, ...names];
    }
    return names;
  }, [categoryMap, category, transaction]);

  const onDateChange = useCallback((_e: unknown, selected?: Date) => {
    if (Platform.OS === 'android' || Platform.OS === 'web') setDatePickerVisible(false);
    if (selected) {
      const d = new Date(selected);
      d.setHours(12, 0, 0, 0);
      setDate(d);
    }
  }, []);

  const { run: runBulkApply } = useAsyncAction(
    async (userId: string, merchantKey: string, cat: string, excludeId: string) => {
      const { updatedIds, error: bulkErr } = await bulkApplyCategoryForMerchantKey(
        userId,
        merchantKey,
        cat,
        excludeId,
      );
      if (bulkErr) {
        Alert.alert(t('error'), bulkErr.message);
      } else {
        for (const txId of updatedIds) {
          updateTransaction(txId, { category: cat });
        }
        Alert.alert(
          t('saved'),
          t('categoryApplyToOthersDone', {
            count: updatedIds.length,
            transactionsWord: pluralTransakce(
              updatedIds.length,
              language === 'en' ? 'en' : 'cs',
            ),
          }),
        );
      }
      safeGoBack();
    },
  );

  const { run: handleSave } = useAsyncAction(async () => {
    if (!transaction || !id) return;
    const num = parseMoneyInput(amountStr);
    if (!title.trim()) {
      Alert.alert(t('error'), t('fillDescription'));
      return;
    }
    if (num == null || num <= 0) {
      Alert.alert(t('error'), t('enterValidAmountGtZero'));
      return;
    }
    if (!category) {
      Alert.alert(t('error'), t('selectCategoryRequired'));
      return;
    }

    const categoryChanged = category !== transaction.category;
    const merchantLabel = title.trim() || transaction.title;

    updateTransaction(id, {
      amount: num,
      title: title.trim(),
      category,
      date: toYyyyMmDd(date),
    });

    if (categoryChanged && transaction.type === 'expense' && category !== 'Převod') {
      const userId = await getAuthUserId();
      if (userId) {
        const { merchantKey, error } = await upsertUserCategoryRule(userId, merchantLabel, category);
        if (error) {
          console.warn('[user_category_rules] upsert failed:', error.message);
          Alert.alert(t('error'), error.message);
        } else if (merchantKey) {
          const n = await countTransactionsForMerchantKey(userId, merchantKey, id);
          if (n > 0) {
            const label = merchantKey.length > 24 ? `${merchantKey.slice(0, 22)}…` : merchantKey;
            Alert.alert(
              t('saved'),
              t('categoryApplyToOthersAsk', {
                count: n,
                merchant: label,
                transactionsWord: pluralTransakce(n, language === 'en' ? 'en' : 'cs'),
              }),
              [
                {
                  text: t('categoryApplyToOthersNo'),
                  style: 'cancel',
                  onPress: () => safeGoBack(),
                },
                {
                  text: t('categoryApplyToOthersYes'),
                  onPress: () => {
                    void runBulkApply(userId, merchantKey, category, id);
                  },
                },
              ],
            );
            return;
          }
        }
      }
    }

    Alert.alert(t('saved'), t('changesSaved'));
    safeGoBack();
  });

  const { run: runDeleteTransaction } = useAsyncAction(async () => {
    if (!id) return;
    deleteTransaction(id);
    safeGoBack();
  });

  const handleDelete = useCallback(() => {
    if (!transaction || !id) return;
    Alert.alert(
      t('transactionDeleteTitle'),
      `${transaction.title} — ${transaction.amount.toLocaleString('cs-CZ')} ${currency.symbol}`,
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: () => {
            void runDeleteTransaction();
          },
        },
      ],
    );
  }, [transaction, id, currency.symbol, t, runDeleteTransaction]);

  const applyReceiptUrl = useCallback(
    async (publicUrl: string) => {
      if (!id) return;
      const userId = await getAuthUserId();
      if (userId) {
        const { error } = await supabase
          .from('transactions')
          .update({ receipt_url: publicUrl })
          .eq('id', id)
          .eq('user_id', userId);
        if (error) {
          Alert.alert(t('error'), error.message);
          return;
        }
      }
      updateTransaction(id, { receiptUrl: publicUrl });
    },
    [id, t, updateTransaction],
  );

  const pickAndUploadReceipt = useCallback(
    async (source: 'camera' | 'library') => {
      if (!id || !transaction) return;
      const userId = await getAuthUserId();
      if (!userId) {
        Alert.alert(t('signInTitle'), t('signInForReceipt'));
        return;
      }
      if (source === 'camera') {
        const cam = await ImagePicker.requestCameraPermissionsAsync();
        if (!cam.granted) {
          Alert.alert(t('cameraPermissionTitle'), t('cameraPermissionMessage'));
          return;
        }
      } else {
        const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!lib.granted) {
          Alert.alert(t('galleryPermissionTitle'), t('galleryPermissionMessage'));
          return;
        }
      }
      const pickerOptions = { mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: false } as const;
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(pickerOptions)
          : await ImagePicker.launchImageLibraryAsync(pickerOptions);
      if (result.canceled || !result.assets?.[0]?.uri) return;
      const uri = result.assets[0].uri;
      setUploadingReceipt(true);
      try {
        const { publicUrl, error } = await uploadReceiptToStorage({ userId, transactionId: id, localUri: uri });
        if (error) {
          Alert.alert(t('receiptUploadTitle'), error.message);
          return;
        }
        await applyReceiptUrl(publicUrl);
      } finally {
        setUploadingReceipt(false);
      }
    },
    [id, t, transaction, applyReceiptUrl],
  );

  const openReceiptPicker = useCallback(() => {
    if (Platform.OS === 'web') {
      void pickAndUploadReceipt('library');
      return;
    }
    Alert.alert(t('receiptTitle'), t('receiptChooseSource'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('takePhoto'), onPress: () => void pickAndUploadReceipt('camera') },
      { text: t('selectFromGallery'), onPress: () => void pickAndUploadReceipt('library') },
    ]);
  }, [pickAndUploadReceipt, t]);

  const handleDeleteReceipt = useCallback(() => {
    const url = transaction?.receiptUrl;
    if (!url || !id) return;
    Alert.alert(t('deleteReceiptTitle'), t('deleteReceiptMessage'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: async () => {
          setUploadingReceipt(true);
          try {
            const { error } = await deleteReceiptFromStorage(url);
            if (error) {
              Alert.alert(t('error'), error.message);
              return;
            }
            const userId = await getAuthUserId();
            if (userId) {
              await supabase
                .from('transactions')
                .update({ receipt_url: null })
                .eq('id', id)
                .eq('user_id', userId);
            }
            updateTransaction(id, { receiptUrl: undefined });
          } finally {
            setUploadingReceipt(false);
          }
        },
      },
    ]);
  }, [transaction?.receiptUrl, id, updateTransaction, t]);

  if (!id || !transaction) {
    return (
      <View style={[styles.container, { backgroundColor: isDarkMode ? '#111827' : '#F8FAFC' }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.missing}>
          <Text style={{ color: isDarkMode ? '#fff' : '#1F2937' }}>Transakce nenalezena.</Text>
          <TouchableOpacity style={styles.backBtnPlain} onPress={() => safeGoBack()}>
            <Text style={styles.backBtnPlainText}>{t('back')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const typeLabel = transaction.isRefund
    ? t('transactionRefundBadge')
    : transaction.type === 'income'
      ? t('income')
      : t('expense');
  const headerColors = transaction.isRefund
    ? (['#F59E0B', '#D97706'] as const)
    : transaction.type === 'income'
      ? (['#10B981', '#059669'] as const)
      : (['#EF4444', '#DC2626'] as const);

  return (
    <View style={[styles.container, { backgroundColor: isDarkMode ? '#111827' : '#F8FAFC' }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient colors={headerColors} style={styles.header} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <BackButton color="white" size={24} style={styles.headerBack} />
        <Text style={styles.headerTitle}>{typeLabel}</Text>
        <Text style={styles.headerSub} numberOfLines={2}>
          {transaction.title}
        </Text>
      </LinearGradient>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={[styles.label, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>{t('amount')} ({currency.symbol})</Text>
        <TextInput
          style={[
            styles.input,
            { color: isDarkMode ? 'white' : '#1F2937', borderColor: isDarkMode ? '#4B5563' : '#E5E7EB', backgroundColor: isDarkMode ? '#374151' : 'white' },
          ]}
          value={amountStr}
          onChangeText={setAmountStr}
          keyboardType={Platform.OS === 'ios' ? 'decimal-pad' : 'numeric'}
          placeholder="0"
          placeholderTextColor={isDarkMode ? '#6B7280' : '#9CA3AF'}
        />
        {transaction.originalCurrency &&
        transaction.originalAmount != null &&
        transaction.originalCurrency !== 'CZK' ? (
          <Text style={{ marginTop: -8, marginBottom: 12, color: isDarkMode ? '#9CA3AF' : '#6B7280', fontSize: 14 }}>
            {transaction.originalAmount.toLocaleString('cs-CZ', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{' '}
            {transaction.originalCurrency}
            {transaction.exchangeRate != null
              ? ` · kurz ${transaction.exchangeRate.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
              : ''}
          </Text>
        ) : null}

        <Text style={[styles.label, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>{t('description')}</Text>
        <TextInput
          style={[
            styles.input,
            styles.inputMultiline,
            { color: isDarkMode ? 'white' : '#1F2937', borderColor: isDarkMode ? '#4B5563' : '#E5E7EB', backgroundColor: isDarkMode ? '#374151' : 'white' },
          ]}
          value={title}
          onChangeText={setTitle}
          placeholder={t('transactionNamePlaceholder')}
          placeholderTextColor={isDarkMode ? '#6B7280' : '#9CA3AF'}
          multiline
        />

        {(transaction.counterpartyAccount || transaction.counterpartyName) ? (
          <View style={{ marginBottom: 8 }}>
            <Text style={[styles.label, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
              {t('counterpartyLabel')}
            </Text>
            <Text style={[styles.readOnlyValue, { color: isDarkMode ? '#E5E7EB' : '#1F2937' }]}>
              {[transaction.counterpartyName, transaction.counterpartyAccount]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
        ) : null}

        <Text style={[styles.label, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>{t('category')}</Text>
        <View style={styles.chipWrap}>
          {categoryNames.map((name) => (
            <TouchableOpacity
              key={name}
              style={[
                styles.chip,
                category === name && styles.chipActive,
                { borderColor: isDarkMode ? '#4B5563' : '#E5E7EB', backgroundColor: isDarkMode ? '#374151' : 'white' },
              ]}
              onPress={() => setCategory(name)}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: isDarkMode ? '#E5E7EB' : '#374151' },
                  category === name && styles.chipTextActive,
                ]}
              >
                {categoryMap[name]?.icon ? `${categoryMap[name].icon} ` : ''}
                {name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.label, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>{t('date')}</Text>
        <TouchableOpacity
          style={[
            styles.dateRow,
            { backgroundColor: isDarkMode ? '#374151' : 'white', borderColor: isDarkMode ? '#4B5563' : '#E5E7EB' },
          ]}
          onPress={() => setDatePickerVisible(true)}
        >
          <Calendar color="#667eea" size={22} />
          <Text style={[styles.dateRowText, { color: isDarkMode ? 'white' : '#1F2937' }]}>{formatDateCs(date)}</Text>
        </TouchableOpacity>

        {Platform.OS === 'ios' && (
          <Modal transparent animationType="slide" visible={datePickerVisible}>
            <View style={styles.modalRoot}>
              <Pressable style={styles.modalBackdrop} onPress={() => setDatePickerVisible(false)} />
              <View style={[styles.iosPickerCard, { backgroundColor: isDarkMode ? '#1F2937' : 'white' }]}>
                <View style={styles.iosPickerHeader}>
                  <TouchableOpacity onPress={() => setDatePickerVisible(false)}>
                    <Text style={styles.iosPickerDone}>{t('done')}</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker value={date} mode="date" display="spinner" onChange={onDateChange} style={{ height: 180 }} />
              </View>
            </View>
          </Modal>
        )}

        {Platform.OS === 'android' && datePickerVisible && (
          <DateTimePicker value={date} mode="date" display="default" onChange={onDateChange} />
        )}

        {Platform.OS === 'web' && datePickerVisible && (
          <DateTimePicker value={date} mode="date" display="default" onChange={onDateChange} />
        )}

        <Text style={[styles.label, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>{t('receiptTitle')}</Text>
        {transaction.receiptUrl ? (
          <View style={styles.receiptBlock}>
            <TouchableOpacity
              onPress={() => setReceiptFullscreen(true)}
              activeOpacity={0.85}
              style={[
                styles.receiptThumbWrap,
                { borderColor: isDarkMode ? '#4B5563' : '#E5E7EB' },
              ]}
            >
              <Image
                source={{ uri: transaction.receiptUrl }}
                style={styles.receiptThumb}
                contentFit="cover"
                transition={200}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.receiptFullPreviewBtn, { borderColor: isDarkMode ? '#4B5563' : '#E5E7EB' }]}
              onPress={() => setReceiptFullscreen(true)}
              activeOpacity={0.85}
            >
              <Text style={[styles.receiptFullPreviewText, { color: isDarkMode ? '#E5E7EB' : '#374151' }]}>
                Zobrazit celou účtenku
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.deleteReceiptBtn}
              onPress={handleDeleteReceipt}
              disabled={uploadingReceipt}
              activeOpacity={0.85}
            >
              <Text style={styles.deleteReceiptBtnText}>{t('deleteReceiptButton')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.addReceiptBtn, { borderColor: isDarkMode ? '#4B5563' : '#E5E7EB', opacity: uploadingReceipt ? 0.6 : 1 }]}
            onPress={openReceiptPicker}
            disabled={uploadingReceipt}
            activeOpacity={0.85}
          >
            {uploadingReceipt ? (
              <ActivityIndicator color="#667eea" />
            ) : (
              <Text style={[styles.addReceiptBtnText, { color: isDarkMode ? '#E5E7EB' : '#374151' }]}>
                📷 {t('scanReceipt')}
              </Text>
            )}
          </TouchableOpacity>
        )}

        <AsyncButton
          variant="primary"
          label={t('subscription.saveChanges')}
          loadingLabel={t('hhNotifSaving')}
          onPress={handleSave}
          style={styles.saveBtn}
          contentStyle={styles.saveGradient}
          textStyle={styles.saveText}
        />

        <TouchableOpacity style={styles.deleteOutline} onPress={handleDelete}>
          <Trash2 color="#EF4444" size={20} />
          <Text style={styles.deleteOutlineText}>{t('delete')}</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal
        visible={receiptFullscreen}
        transparent
        animationType="fade"
        onRequestClose={() => setReceiptFullscreen(false)}
      >
        <View style={styles.receiptFsRoot}>
          <TouchableOpacity
            style={styles.receiptFsClose}
            onPress={() => setReceiptFullscreen(false)}
            hitSlop={12}
            activeOpacity={0.85}
          >
            <Text style={styles.receiptFsCloseText}>{t('close')}</Text>
          </TouchableOpacity>
          {transaction.receiptUrl ? (
            <Image
              source={{ uri: transaction.receiptUrl }}
              style={styles.receiptFsImage}
              contentFit="contain"
            />
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  missing: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 16 },
  backBtnPlain: { paddingVertical: 10, paddingHorizontal: 20 },
  backBtnPlainText: { color: '#667eea', fontWeight: '600' },
  header: { paddingTop: 56, paddingBottom: 28, paddingHorizontal: 20 },
  headerBack: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: { fontSize: 14, color: 'rgba(255,255,255,0.9)', marginBottom: 8 },
  headerSub: { fontSize: 22, fontWeight: 'bold', color: 'white' },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8, marginTop: 16 },
  readOnlyValue: { fontSize: 16, lineHeight: 22, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  inputMultiline: { minHeight: 80, textAlignVertical: 'top' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipActive: { borderColor: '#667eea', backgroundColor: 'rgba(102,126,234,0.15)' },
  chipText: { fontSize: 14 },
  chipTextActive: { fontWeight: '700', color: '#667eea' },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  dateRowText: { fontSize: 16, fontWeight: '500' },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  iosPickerCard: { borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 24 },
  iosPickerHeader: { alignItems: 'flex-end', padding: 12 },
  iosPickerDone: { color: '#667eea', fontSize: 17, fontWeight: '600' },
  saveBtn: { marginTop: 28, borderRadius: 14, overflow: 'hidden' },
  saveGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
  },
  saveText: { color: 'white', fontSize: 17, fontWeight: '700' },
  deleteOutline: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 14,
    backgroundColor: 'rgba(239,68,68,0.06)',
  },
  deleteOutlineText: { color: '#EF4444', fontSize: 16, fontWeight: '600' },
  receiptBlock: { gap: 12, marginBottom: 4 },
  receiptThumbWrap: {
    alignSelf: 'stretch',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
  },
  receiptThumb: { width: '100%', minHeight: 200, maxHeight: 360 },
  addReceiptBtn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  addReceiptBtnText: { fontSize: 16, fontWeight: '600' },
  receiptFullPreviewBtn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  receiptFullPreviewText: { fontSize: 15, fontWeight: '600' },
  deleteReceiptBtn: { paddingVertical: 10, alignItems: 'center' },
  deleteReceiptBtnText: { color: '#EF4444', fontSize: 15, fontWeight: '600' },
  receiptFsRoot: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    padding: 16,
  },
  receiptFsClose: { position: 'absolute', top: 52, right: 16, zIndex: 2, padding: 8 },
  receiptFsCloseText: { color: 'white', fontSize: 17, fontWeight: '600' },
  receiptFsImage: { width: '100%', flex: 1, minHeight: 400 },
});
