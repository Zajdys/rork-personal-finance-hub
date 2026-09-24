import React, { useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Platform,
  TouchableOpacity as RNTouchableOpacity,
} from 'react-native';
import { Swipeable, TouchableOpacity as GHTouchableOpacity } from 'react-native-gesture-handler';

const RowTouchable = Platform.OS === 'web' ? RNTouchableOpacity : GHTouchableOpacity;
import { useRouter } from 'expo-router';
import type { Transaction } from '@/store/finance-store';
import { useTheme } from '@/hooks/use-theme';
import { TransactionSelectionCheckbox } from '@/components/TransactionSelectionCheckbox';
import { formatTransactionDateCs } from '@/lib/transaction-date';
import { getTransactionDisplayTitle } from '@/lib/transaction-display';

type Props = {
  transaction: Transaction;
  onDelete: (id: string) => void;
  currencySymbol?: string;
  /** Extra line under title (e.g. date) — ignorováno při variant="goalDetail" */
  subtitle?: string;
  containerStyle?: object;
  /** Detail kategorie ve finančních cílech: název, datum, pill kategorie, pevný padding */
  variant?: 'default' | 'goalDetail';
  /** Režim hromadného výběru — klik na řádek přepíná výběr; swipe mazání vypnuto */
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelection?: () => void;
};

export function SwipeableTransactionRow({
  transaction,
  onDelete,
  currencySymbol = 'Kč',
  subtitle,
  containerStyle,
  variant = 'default',
  selectionMode = false,
  selected = false,
  onToggleSelection,
}: Props) {
  const { colors } = useTheme();
  const isGoalDetail = variant === 'goalDetail';
  const displayTitle = getTransactionDisplayTitle(transaction);
  const router = useRouter();
  const swipeRef = useRef<Swipeable>(null);

  const confirmDelete = useCallback(() => {
    Alert.alert(
      'Smazat transakci?',
      `Opravdu chcete smazat „${displayTitle}“?`,
      [
        {
          text: 'Zrušit',
          style: 'cancel',
          onPress: () => swipeRef.current?.close(),
        },
        {
          text: 'Smazat',
          style: 'destructive',
          onPress: () => {
            onDelete(transaction.id);
            swipeRef.current?.close();
          },
        },
      ],
    );
  }, [transaction.id, displayTitle, onDelete]);

  const openDetail = useCallback(() => {
    router.push({
      pathname: '/transaction-detail',
      params: { id: transaction.id },
    });
  }, [router, transaction.id]);

  const handleRowPress = useCallback(() => {
    if (selectionMode && onToggleSelection) {
      onToggleSelection();
      return;
    }
    openDetail();
  }, [selectionMode, onToggleSelection, openDetail]);

  const renderRightActions = useCallback(
    () => (
      <GHTouchableOpacity
        style={styles.deleteAction}
        activeOpacity={0.85}
        onPress={confirmDelete}
      >
        <Text style={styles.deleteActionText}>Smazat</Text>
      </GHTouchableOpacity>
    ),
    [confirmDelete],
  );

  const rowInner = isGoalDetail ? (
    <RowTouchable
      onPress={handleRowPress}
      onLongPress={selectionMode ? undefined : confirmDelete}
      activeOpacity={0.7}
      style={[
        {
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 12,
          backgroundColor: colors.card,
          borderRadius: 12,
        },
      ]}
    >
      {selectionMode && onToggleSelection ? (
        <TransactionSelectionCheckbox selected={selected} onPress={onToggleSelection} />
      ) : null}
      <View style={{ flex: 1, flexShrink: 1, marginRight: 8, overflow: 'hidden' }}>
        <Text
          numberOfLines={1}
          ellipsizeMode="tail"
          style={[styles.goalDetailTitle, { color: colors.text }]}
        >
          {displayTitle}
        </Text>
        <Text
          numberOfLines={1}
          ellipsizeMode="tail"
          style={[styles.goalDetailDate, { color: colors.textSecondary }]}
        >
          {formatTransactionDateCs(transaction.date)}
        </Text>
      </View>
      <View style={{ flexShrink: 0, alignItems: 'flex-end' }}>
        <Text
          style={{
            fontSize: 15,
            fontWeight: '700',
            color: transaction.type === 'expense' ? '#EF4444' : '#22C55E',
            flexShrink: 0,
          }}
        >
          {`${transaction.type === 'expense' ? '-' : '+'}${Math.round(transaction.amount)} Kč${
            transaction.receiptUrl ? '  📷' : ''
          }`}
        </Text>
      </View>
    </RowTouchable>
  ) : (
    <>
      {selectionMode && onToggleSelection ? (
        <View style={styles.checkboxWrap}>
          <TransactionSelectionCheckbox selected={selected} onPress={onToggleSelection} />
        </View>
      ) : null}
      <RowTouchable
        style={[styles.rowMain, { backgroundColor: colors.card }]}
        onPress={handleRowPress}
        onLongPress={selectionMode ? undefined : confirmDelete}
        activeOpacity={0.7}
      >
        <View style={styles.rowText}>
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            style={[styles.title, { color: colors.text }]}
          >
            {displayTitle}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {subtitle ?? transaction.category}
          </Text>
        </View>
        <View style={styles.amountColumn}>
          <Text
            style={[styles.amount, { color: transaction.type === 'income' ? colors.success : colors.error }]}
          >
            {transaction.type === 'income' ? '+' : '-'}
            {transaction.amount.toLocaleString('cs-CZ')} {currencySymbol}
          </Text>
          {transaction.receiptUrl ? <Text style={styles.receiptListIcon}>📷</Text> : null}
        </View>
      </RowTouchable>
    </>
  );

  const row = (
    <View
      style={[
        styles.row,
        { backgroundColor: colors.card },
        isGoalDetail && { paddingHorizontal: 0, paddingVertical: 0 },
        containerStyle,
      ]}
    >
      {rowInner}
    </View>
  );

  if (Platform.OS === 'web' || selectionMode) {
    return row;
  }

  return (
    <Swipeable
      ref={swipeRef}
      renderRightActions={renderRightActions}
      overshootRight={false}
      friction={2}
    >
      {row}
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  row: {
    flex: 1,
    alignItems: 'stretch',
    borderRadius: 16,
    overflow: 'hidden',
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 56,
  },
  checkboxWrap: {
    paddingLeft: 12,
    paddingVertical: 14,
    justifyContent: 'center',
  },
  checkboxWrapGoalDetail: {
    paddingLeft: 14,
    paddingVertical: 14,
  },
  rowText: {
    flex: 1,
    marginRight: 12,
  },
  goalDetailTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  goalDetailTitle: {
    fontSize: 15,
    fontWeight: '600',
    flexShrink: 1,
  },
  goalDetailAmountColumn: {
    flexShrink: 0,
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 2,
    minWidth: 90,
  },
  goalDetailDate: {
    fontSize: 12,
    marginTop: 2,
    flexWrap: 'nowrap',
  },
  categoryPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    maxWidth: '100%',
  },
  categoryPillText: {
    fontSize: 11,
    fontWeight: '500',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
  },
  amountColumn: {
    flexShrink: 0,
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 4,
    minWidth: 80,
    maxWidth: '42%',
  },
  amount: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'right',
    flexShrink: 0,
  },
  receiptListIcon: {
    fontSize: 14,
    lineHeight: 18,
  },
  deleteAction: {
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    paddingHorizontal: 20,
    marginVertical: 2,
    marginRight: 2,
    borderRadius: 14,
    minWidth: 88,
  },
  deleteActionText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
