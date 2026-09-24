import React from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Check, Trash2, X } from 'lucide-react-native';
import { allocateRecurringMemberShares } from '@/lib/household-recurring-shares';
import {
  formatRecurringNextPaymentLabel,
  formatRecurringScheduleSubtitle,
} from '@/lib/recurring-expense-cycle';
import { resolveHouseholdActorLabel } from '@/lib/household-members';
import type { ThemeColors } from '@/constants/theme-colors';
import { useLanguageStore } from '@/store/language-store';
import {
  categoryDisplayLine,
  countFullyPaidOccurrences,
  itemOccurrencePaidPercent,
  memberDisplayLabel,
  occurrenceFieldsOf,
  recurringAuthorId,
} from './helpers';
import { RecurringOccurrenceList } from './RecurringOccurrenceList';
import type { HouseholdCustomCategory, Member, RecurringExpense } from './types';

type TranslateFn = ReturnType<typeof useLanguageStore.getState>['t'];

type RecurringExpenseCardProps = {
  item: RecurringExpense;
  colors: ThemeColors;
  isDark: boolean;
  numberLocale: string;
  currencySymbol: string;
  memberIds: string[];
  members: Member[];
  currentUserId: string | undefined;
  customCategories: HouseholdCustomCategory[];
  expandedMultiOcc: boolean;
  onToggleMultiOcc: () => void;
  onLongPressReorder: () => void;
  onOpenEdit: () => void;
  onDelete: () => void;
  onSetMyPaid: (dueDate: string, nextPaid: boolean) => void;
  t: TranslateFn;
};

export function RecurringExpenseCard({
  item,
  colors,
  isDark,
  numberLocale,
  currencySymbol,
  memberIds,
  members,
  currentUserId,
  customCategories,
  expandedMultiOcc,
  onToggleMultiOcc,
  onLongPressReorder,
  onOpenEdit,
  onDelete,
  onSetMyPaid,
  t,
}: RecurringExpenseCardProps) {
  const dueFields = occurrenceFieldsOf(item);
  const dueThisMonth = item.occurrences.length > 0;
  const shares = allocateRecurringMemberShares({
    amount: item.amount,
    split: item.splitType,
    mySharePct: item.myShare,
    memberIds,
    myShareOwnerUserId: recurringAuthorId(item),
    expenseId: item.id,
  });
  const myKc = shares.get(currentUserId ?? '')?.shareDisplay ?? 0;
  const itemPaidPct = dueThisMonth ? itemOccurrencePaidPercent(item, memberIds) : 0;
  const itemBarColor =
    itemPaidPct === 0 ? colors.error : itemPaidPct >= 100 ? colors.success : colors.warning;
  const memberList =
    members.length > 0 ? members : currentUserId ? [{ userId: currentUserId, name: t('hhMe') }] : [];
  const cardMuted = !dueThisMonth;
  const showMemberPaidToggles = dueThisMonth && item.paymentMode !== 'single_payer';
  const isMultiOcc = dueThisMonth && item.occurrences.length > 1;
  const multiExpanded = expandedMultiOcc;
  const paidOccCount = isMultiOcc ? countFullyPaidOccurrences(item, memberIds) : 0;

  const renderMemberToggles = (
    paidUserIds: string[],
    onToggleMe: (nextPaid: boolean) => void,
    opts?: { compact?: boolean },
  ) => {
    const compact = opts?.compact === true;
    return (
      <View style={compact ? styles.recurringPaidChecksRowCompact : styles.recurringPaidChecksRow}>
        {memberList.map((member) => {
          const isMe = member.userId === currentUserId;
          const isPaid = paidUserIds.includes(member.userId);
          const circle = (
            <View
              style={[
                compact ? styles.recurringPaidCircleCompact : styles.recurringPaidCircle,
                isPaid
                  ? { backgroundColor: colors.success, borderWidth: 0 }
                  : {
                      backgroundColor: colors.muted,
                      borderWidth: 1,
                      borderColor: colors.border,
                    },
              ]}
            >
              {isPaid ? (
                <Check size={compact ? 12 : 18} color={colors.onPrimary} strokeWidth={2.5} />
              ) : (
                <X size={compact ? 11 : 16} color={colors.textSecondary} strokeWidth={2.5} />
              )}
            </View>
          );
          return (
            <View
              key={member.userId}
              style={compact ? styles.recurringPaidCheckColumnCompact : styles.recurringPaidCheckColumn}
            >
              {isMe && dueThisMonth ? (
                <Pressable
                  onPress={() => onToggleMe(!isPaid)}
                  accessibilityRole="button"
                  accessibilityLabel={t('hhMe')}
                  hitSlop={compact ? 8 : 0}
                >
                  {circle}
                </Pressable>
              ) : (
                circle
              )}
              {compact ? null : (
                <Text style={[styles.recurringPaidRoleLabel, { color: colors.textSecondary }]}>
                  {memberDisplayLabel(member, currentUserId, t('hhMe'))}
                </Text>
              )}
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <View
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
          opacity: cardMuted ? 0.72 : 1,
        },
      ]}
      // @ts-expect-error View long-press props used at runtime (unchanged from pre-refactor)
      delayLongPress={500}
      onLongPress={onLongPressReorder}
    >
      <View style={styles.cardTopRow}>
        <TouchableOpacity style={{ flex: 1, minWidth: 0 }} activeOpacity={0.85} onPress={onOpenEdit}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>{item.name}</Text>
          <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
            {categoryDisplayLine(item.category, customCategories)} •{' '}
            {formatRecurringScheduleSubtitle({
              frequency: item.frequency,
              dueDay: item.dueDay ?? item.dueWeekday ?? 1,
              dueWeekday: item.dueWeekday,
              dueMonth: item.dueMonth,
            })}
          </Text>
          <View
            style={[
              styles.recurringDueBadge,
              dueThisMonth
                ? { backgroundColor: `${colors.success}22` }
                : { backgroundColor: colors.muted },
            ]}
          >
            <Text
              style={[
                styles.recurringDueBadgeText,
                { color: dueThisMonth ? colors.success : colors.textSecondary },
              ]}
            >
              {dueThisMonth
                ? item.occurrences.length > 1
                  ? t('hhDueOccurrencesThisMonth', { count: item.occurrences.length })
                  : t('hhDueThisMonthBadge')
                : t('hhNextPaymentBadge', {
                    when: formatRecurringNextPaymentLabel(dueFields, numberLocale),
                  })}
            </Text>
          </View>
          <Text style={[styles.recurringMyShareLine, { color: colors.textSecondary }]}>
            {t('hhYourShare')}:{' '}
            <Text style={{ fontWeight: '700', color: colors.text }}>
              {(dueThisMonth ? myKc * item.occurrences.length : myKc).toLocaleString(numberLocale)}{' '}
              {currencySymbol}
            </Text>
            {' / '}
            {t('hhTotal')}:{' '}
            <Text style={{ fontWeight: '700', color: colors.text }}>
              {(dueThisMonth ? item.amount * item.occurrences.length : item.amount).toLocaleString(
                numberLocale,
              )}{' '}
              {currencySymbol}
            </Text>
          </Text>
        </TouchableOpacity>
        <View style={styles.cardRightGroup}>
          <Text style={[styles.cardAmount, { color: colors.text }]}>
            {item.amount.toLocaleString(numberLocale)} {currencySymbol}
          </Text>
          <TouchableOpacity
            style={[styles.deleteIconButton, { backgroundColor: colors.muted }]}
            onPress={onDelete}
          >
            <Trash2 size={16} color={colors.error} />
          </TouchableOpacity>
        </View>
      </View>

      {showMemberPaidToggles && item.occurrences.length === 1
        ? renderMemberToggles(item.occurrences[0]!.paidUserIds, (next) =>
            onSetMyPaid(item.occurrences[0]!.dueDate, next),
          )
        : null}

      {dueThisMonth && item.paymentMode === 'single_payer' ? (
        <View style={[styles.singlePayerInfoRow, { borderTopColor: colors.border }]}>
          <Text style={[styles.singlePayerInfoText, { color: colors.textSecondary }]}>
            {t('hhSinglePayerPaidBy', {
              name: resolveHouseholdActorLabel({
                userId: item.payerUserId,
                members,
                currentUserId,
                meLabel: t('hhMe'),
                formerLabel: t('hhFormerMember'),
              }),
            })}
          </Text>
        </View>
      ) : null}

      {isMultiOcc && showMemberPaidToggles ? (
        <RecurringOccurrenceList
          colors={colors}
          numberLocale={numberLocale}
          occurrences={item.occurrences}
          expanded={multiExpanded}
          onToggleExpand={onToggleMultiOcc}
          multiOccSummaryLabel={t('hhMultiOccSummary', {
            count: item.occurrences.length,
            paid: paidOccCount,
          })}
          shares={shares}
          renderMemberToggles={renderMemberToggles}
          onToggleOccurrencePaid={(dueDate, next) => onSetMyPaid(dueDate, next)}
        />
      ) : null}

      {dueThisMonth && item.paymentMode !== 'single_payer' ? (
        <View style={styles.recurringProgressRow}>
          <View style={[styles.recurringItemProgressTrack, { backgroundColor: colors.muted }]}>
            <View
              style={[
                styles.recurringItemProgressFill,
                { width: `${itemPaidPct}%`, backgroundColor: itemBarColor },
              ]}
            />
          </View>
          <Text style={[styles.recurringProgressPercent, { color: colors.textSecondary }]}>
            {itemPaidPct}%
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
  },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  cardRightGroup: { alignItems: 'flex-end', gap: 8 },
  deleteIconButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEE2E2',
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#1F2937' },
  cardMeta: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  cardAmount: { fontSize: 16, fontWeight: '700', color: '#111827' },
  recurringMyShareLine: { fontSize: 13, marginTop: 6 },
  recurringDueBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 8,
  },
  recurringDueBadgeText: { fontSize: 12, fontWeight: '600' },
  recurringPaidChecksRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
    paddingHorizontal: 2,
  },
  recurringPaidChecksRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 6,
  },
  recurringPaidCheckColumn: {
    alignItems: 'center',
    minWidth: 52,
    paddingVertical: 4,
  },
  recurringPaidCheckColumnCompact: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  recurringPaidCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recurringPaidCircleCompact: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recurringPaidRoleLabel: { marginTop: 6, fontSize: 12, fontWeight: '600' },
  recurringProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
  },
  recurringItemProgressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  recurringItemProgressFill: {
    height: '100%',
    borderRadius: 3,
  },
  recurringProgressPercent: { fontSize: 12, fontWeight: '700', minWidth: 36, textAlign: 'right' },
  singlePayerInfoRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  singlePayerInfoText: { fontSize: 13, fontWeight: '600' },
});
