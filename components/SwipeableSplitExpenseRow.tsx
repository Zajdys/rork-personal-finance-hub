import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Platform,
  TouchableOpacity as RNTouchableOpacity,
  Image,
  Modal,
  Pressable,
} from 'react-native';
import { Swipeable, TouchableOpacity as GHTouchableOpacity } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/use-theme';
import { useLanguageStore } from '@/store/language-store';
import { splitExpenseCategoryEmoji } from '@/lib/split-expense-categories';
import { resolveSplitReceiptDisplayUrl } from '@/lib/split-receipt-upload';
import type { SplitExpense } from '@/lib/split-groups';

const RowTouchable = Platform.OS === 'web' ? RNTouchableOpacity : GHTouchableOpacity;

type Props = {
  expense: SplitExpense;
  currencyLabel: string;
  paidByLabel: string;
  onEdit: () => void;
  onDelete: () => void;
};

export function SwipeableSplitExpenseRow({
  expense,
  currencyLabel,
  paidByLabel,
  onEdit,
  onDelete,
}: Props) {
  const { colors } = useTheme();
  const { t } = useLanguageStore();
  const insets = useSafeAreaInsets();
  const swipeRef = useRef<Swipeable>(null);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState<string | null>(null);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);

  useEffect(() => {
    if (!expense.receipt_url) {
      setReceiptPreviewUrl(null);
      return;
    }
    let cancelled = false;
    void resolveSplitReceiptDisplayUrl(expense.receipt_url).then((url) => {
      if (!cancelled) setReceiptPreviewUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [expense.receipt_url]);

  const openReceiptFullscreen = useCallback(() => {
    if (!receiptPreviewUrl) {
      Alert.alert(t('error'), t('hhReceiptOpenFailed'));
      return;
    }
    setFullscreenOpen(true);
  }, [receiptPreviewUrl, t]);

  const closeSwipe = useCallback(() => swipeRef.current?.close(), []);

  const confirmDelete = useCallback(() => {
    Alert.alert(
      t('splitExpenseDeleteTitle'),
      t('splitExpenseDeleteConfirm', {
        title: expense.description || t('splitGroupsUntitledExpense'),
      }),
      [
        { text: t('cancel'), style: 'cancel', onPress: closeSwipe },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: () => {
            onDelete();
            closeSwipe();
          },
        },
      ],
    );
  }, [t, expense.description, onDelete, closeSwipe]);

  const showActions = useCallback(() => {
    Alert.alert(
      expense.description || t('splitGroupsUntitledExpense'),
      undefined,
      [
        {
          text: t('edit'),
          onPress: () => {
            closeSwipe();
            onEdit();
          },
        },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: confirmDelete,
        },
        { text: t('cancel'), style: 'cancel', onPress: closeSwipe },
      ],
    );
  }, [expense.description, t, onEdit, confirmDelete, closeSwipe]);

  const renderRightActions = useCallback(
    () => (
      <View style={styles.actionsRow}>
        <GHTouchableOpacity
          style={[styles.editAction, { backgroundColor: colors.primary }]}
          activeOpacity={0.85}
          onPress={() => {
            closeSwipe();
            onEdit();
          }}
        >
          <Text style={styles.actionText}>{t('edit')}</Text>
        </GHTouchableOpacity>
        <GHTouchableOpacity style={styles.deleteAction} activeOpacity={0.85} onPress={confirmDelete}>
          <Text style={styles.actionText}>{t('delete')}</Text>
        </GHTouchableOpacity>
      </View>
    ),
    [colors.primary, closeSwipe, onEdit, confirmDelete, t],
  );

  const amountText = `${expense.amount.toLocaleString('cs-CZ', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} ${currencyLabel}`;

  const titleText = expense.description?.trim()
    ? expense.description.trim()
    : t('splitGroupsUntitledExpense');
  const categoryEmoji = splitExpenseCategoryEmoji(expense.category);

  const inner = (
    <RowTouchable
      onPress={onEdit}
      onLongPress={showActions}
      delayLongPress={280}
      activeOpacity={0.75}
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <View style={styles.top}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
          {`${categoryEmoji} ${titleText}`}
        </Text>
        <Text style={[styles.amount, { color: colors.text }]}>{amountText}</Text>
      </View>
      <Text style={[styles.meta, { color: colors.textSecondary }]}>
        {paidByLabel} · {expense.date}
      </Text>
      {receiptPreviewUrl ? (
        <Pressable onPress={openReceiptFullscreen} style={styles.receiptThumbWrap}>
          <Image source={{ uri: receiptPreviewUrl }} style={styles.receiptThumb} resizeMode="cover" />
        </Pressable>
      ) : null}
    </RowTouchable>
  );

  const fullscreenModal = (
    <Modal visible={fullscreenOpen} animationType="fade" transparent onRequestClose={() => setFullscreenOpen(false)}>
      <View style={styles.receiptFsRoot}>
        <Pressable style={[styles.receiptFsClose, { top: insets.top + 12 }]} onPress={() => setFullscreenOpen(false)}>
          <Text style={styles.receiptFsCloseText}>{t('close')}</Text>
        </Pressable>
        {receiptPreviewUrl ? (
          <Image source={{ uri: receiptPreviewUrl }} style={styles.receiptFsImage} resizeMode="contain" />
        ) : null}
      </View>
    </Modal>
  );

  if (Platform.OS === 'web') {
    return (
      <>
        {inner}
        {fullscreenModal}
      </>
    );
  }

  return (
    <>
      <Swipeable
        ref={swipeRef}
        renderRightActions={renderRightActions}
        overshootRight={false}
        friction={2}
      >
        {inner}
      </Swipeable>
      {fullscreenModal}
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: { flex: 1, fontSize: 15, fontWeight: '600' },
  amount: { fontSize: 15, fontWeight: '700' },
  meta: { fontSize: 12, marginTop: 6 },
  receiptThumbWrap: {
    marginTop: 10,
    alignSelf: 'flex-start',
    borderRadius: 10,
    overflow: 'hidden',
  },
  receiptThumb: { width: 72, height: 72 },
  receiptFsRoot: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
  },
  receiptFsClose: { position: 'absolute', right: 16, zIndex: 2, padding: 8 },
  receiptFsCloseText: { color: 'white', fontSize: 17, fontWeight: '600' },
  receiptFsImage: { width: '100%', flex: 1, minHeight: 400 },
  actionsRow: {
    flexDirection: 'row',
    marginLeft: 8,
  },
  editAction: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 88,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
  },
  deleteAction: {
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
    width: 88,
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
  },
  actionText: { color: 'white', fontWeight: '700', fontSize: 13 },
});
