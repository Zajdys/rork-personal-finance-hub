import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { PlusCircle, Trash2 } from 'lucide-react-native';
import {
  formatSharedExpenseDate,
  memberInitials,
  sharedCategoryEmoji,
  sharedSplitBadgeLabel,
  yourShareForSharedExpense,
  type SharedExpense,
} from '@/lib/household-shared-expenses';
import { resolveHouseholdActorLabel } from '@/lib/household-members';
import type { ThemeColors } from '@/constants/theme-colors';
import { useLanguageStore } from '@/store/language-store';
import { EmptyState } from '@/components/EmptyState';
import type { Member } from './types';
import { householdStyles as styles } from './styles';

type TranslateFn = ReturnType<typeof useLanguageStore.getState>['t'];

type Props = {
  sharedExpenses: SharedExpense[];
  colors: ThemeColors;
  isDark: boolean;
  numberLocale: string;
  currencySymbol: string;
  memberIds: string[];
  members: Member[];
  currentUserId: string | undefined;
  onOpenCreate: () => void;
  onOpenEdit: (item: SharedExpense) => void;
  onDelete: (id: string) => void;
  onOpenReceipt: (url: string) => void;
  t: TranslateFn;
};

export function SharedExpenseList({
  sharedExpenses,
  colors,
  isDark,
  numberLocale,
  currencySymbol,
  memberIds,
  members,
  currentUserId,
  onOpenCreate,
  onOpenEdit,
  onDelete,
  onOpenReceipt,
  t,
}: Props) {
  if (sharedExpenses.length === 0) {
    return (
      <EmptyState
        title={t('hhNoSharedExpensesMonth')}
        actionLabel={t('addAction')}
        actionIcon={<PlusCircle color={colors.onPrimary} size={18} />}
        onAction={onOpenCreate}
      />
    );
  }

  return (
    <>
      {sharedExpenses.map((item) => {
            const myKc = yourShareForSharedExpense(item, currentUserId, memberIds);
            const payerName = resolveHouseholdActorLabel({
              userId: item.paidBy,
              members,
              currentUserId,
              meLabel: t('hhMe'),
              formerLabel: t('hhFormerMember'),
            });
            const splitBadge = sharedSplitBadgeLabel(item.splitType, item.splitPercent, {
              mine: t('hhSplitMine'),
              half: t('hhSplitHalfBadge'),
            });
            return (
              <View
                key={item.id}
                style={[
                  styles.card,
                  {
                    backgroundColor: colors.card,
                    padding: 20,
                    shadowColor: '#000000',
                    shadowOpacity: isDark ? 0.45 : 0.07,
                    shadowRadius: isDark ? 12 : 10,
                    shadowOffset: { width: 0, height: 3 },
                    elevation: isDark ? 8 : 4,
                  },
                ]}
              >
                <View style={styles.cardTopRow}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.sharedTitleRow}>
                      <TouchableOpacity style={{ flex: 1, minWidth: 0 }} activeOpacity={0.85} onPress={() => onOpenEdit(item)}>
                        <Text style={[styles.cardTitle, { color: colors.text }]}>{item.name}</Text>
                      </TouchableOpacity>
                      {item.receiptUrl ? (
                        <TouchableOpacity
                          hitSlop={8}
                          onPress={() => void onOpenReceipt(item.receiptUrl!)}
                          accessibilityLabel={t('hhReceiptAttached')}
                        >
                          <Text style={styles.sharedReceiptIcon}>🧾</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                    <TouchableOpacity activeOpacity={0.85} onPress={() => onOpenEdit(item)}>
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
                      {sharedCategoryEmoji(item.category)} {item.category} • {formatSharedExpenseDate(item.date, numberLocale)}
                    </Text>
                    <View style={styles.sharedBadgeRow}>
                      <View style={[styles.sharedSplitBadge, { backgroundColor: colors.muted }]}>
                        <Text style={[styles.sharedSplitBadgeText, { color: colors.text }]}>{splitBadge}</Text>
                      </View>
                    </View>
                    <Text style={[styles.recurringMyShareLine, { color: colors.textSecondary }]}>
                      {t('hhYourShare')}:{' '}
                      <Text style={{ fontWeight: '700', color: colors.text }}>{myKc.toLocaleString(numberLocale)} {currencySymbol}</Text>
                    </Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.cardRightGroup}>
                    <Text style={[styles.cardAmount, { color: colors.text }]}>{item.amount.toLocaleString(numberLocale)} {currencySymbol}</Text>
                    <TouchableOpacity
                      style={[styles.deleteIconButton, { backgroundColor: colors.muted }]}
                      onPress={() => onDelete(item.id)}
                    >
                      <Trash2 size={16} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                </View>
                {item.paymentMode === 'single_payer' ? (
                  <View style={styles.sharedPayerRow}>
                    <View style={[styles.sharedPayerAvatar, { backgroundColor: colors.primary }]}>
                      <Text style={[styles.sharedPayerAvatarText, { color: colors.onPrimary }]}>
                        {memberInitials(payerName)}
                      </Text>
                    </View>
                    <Text style={[styles.sharedPayerLabel, { color: colors.textSecondary }]}>
                      {t('hhSinglePayerPaidBy', { name: payerName })}
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          })}
    </>
  );
}
