import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import { isRecurringItemFullyPaid, type MemberShareAmounts } from '@/lib/household-recurring-shares';
import type { ThemeColors } from '@/constants/theme-colors';
import { formatOccurrenceDateShort, isOccurrenceDatePast } from './helpers';
import type { RecurringOccurrencePayment } from './types';

type MemberTogglesRenderer = (
  paidUserIds: string[],
  onToggleMe: (nextPaid: boolean) => void,
  opts?: { compact?: boolean },
) => React.ReactNode;

type RecurringOccurrenceListProps = {
  colors: ThemeColors;
  numberLocale: string;
  occurrences: RecurringOccurrencePayment[];
  expanded: boolean;
  onToggleExpand: () => void;
  multiOccSummaryLabel: string;
  shares: Map<string, MemberShareAmounts>;
  renderMemberToggles: MemberTogglesRenderer;
  onToggleOccurrencePaid: (dueDate: string, nextPaid: boolean) => void;
};

export function RecurringOccurrenceList({
  colors,
  numberLocale,
  occurrences,
  expanded,
  onToggleExpand,
  multiOccSummaryLabel,
  shares,
  renderMemberToggles,
  onToggleOccurrencePaid,
}: RecurringOccurrenceListProps) {
  return (
    <>
      <Pressable
        style={[styles.multiOccSummaryRow, { borderTopColor: colors.border }]}
        onPress={onToggleExpand}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
      >
        <Text style={[styles.multiOccSummaryText, { color: colors.textSecondary }]} numberOfLines={2}>
          {multiOccSummaryLabel}
        </Text>
        <ChevronDown
          color={colors.textSecondary}
          size={18}
          style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}
        />
      </Pressable>
      {expanded
        ? occurrences.map((occ) => {
            const occFullyPaid = isRecurringItemFullyPaid(shares, occ.paidUserIds);
            const overdueUnpaid = !occFullyPaid && isOccurrenceDatePast(occ.dueDate);
            const dateColor = overdueUnpaid
              ? colors.error
              : occFullyPaid
                ? colors.success
                : colors.textSecondary;
            return (
              <View
                key={occ.dueDate}
                style={[styles.occurrenceRowCompact, { borderTopColor: colors.border }]}
              >
                <Text style={[styles.occurrenceDateCompact, { color: dateColor }]} numberOfLines={1}>
                  {formatOccurrenceDateShort(occ.dueDate, numberLocale)}
                </Text>
                {renderMemberToggles(
                  occ.paidUserIds,
                  (next) => onToggleOccurrencePaid(occ.dueDate, next),
                  { compact: true },
                )}
              </View>
            );
          })
        : null}
    </>
  );
}

const styles = StyleSheet.create({
  multiOccSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  multiOccSummaryText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  occurrenceRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 44,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  occurrenceDateCompact: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    marginRight: 10,
  },
});
