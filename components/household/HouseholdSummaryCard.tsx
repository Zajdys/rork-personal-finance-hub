import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Check, X } from 'lucide-react-native';
import type { ThemeColors } from '@/constants/theme-colors';

type HouseholdSummaryCardProps = {
  colors: ThemeColors;
  numberLocale: string;
  currencySymbol: string;
  overviewLabel: string;
  totalMonthlyCosts: number;
  paidLabel: string;
  unpaidLabel: string;
  householdPaidTotal: number;
  householdUnpaidTotal: number;
  overviewProgressTrackW: number;
  onOverviewProgressTrackLayout: (width: number) => void;
  householdPaidPercent: number;
  recurringTotalCount: number;
  recurringFullyPaidCount: number;
  expensesPaidThisMonthLabel: string;
  noEachOwnRecurringThisMonthLabel: string;
  singlePayerDueThisMonthTotal: number;
  singlePayerOverviewLine: string;
  singlePayerGoSettlementLabel: string;
  onScrollToSettlement: () => void;
  yourShareTotalLabel: string;
  yourShareTotalKc: number;
  paidTotal: number;
  sharedExpensesMonthLabel: string;
  sharedMonthTotal: number;
  yourShareLabel: string;
  sharedMonthYourShare: number;
};

export function HouseholdSummaryCard({
  colors,
  numberLocale,
  currencySymbol,
  overviewLabel,
  totalMonthlyCosts,
  paidLabel,
  unpaidLabel,
  householdPaidTotal,
  householdUnpaidTotal,
  overviewProgressTrackW,
  onOverviewProgressTrackLayout,
  householdPaidPercent,
  recurringTotalCount,
  recurringFullyPaidCount,
  expensesPaidThisMonthLabel,
  noEachOwnRecurringThisMonthLabel,
  singlePayerDueThisMonthTotal,
  singlePayerOverviewLine,
  singlePayerGoSettlementLabel,
  onScrollToSettlement,
  yourShareTotalLabel,
  yourShareTotalKc,
  paidTotal,
  sharedExpensesMonthLabel,
  sharedMonthTotal,
  yourShareLabel,
  sharedMonthYourShare,
}: HouseholdSummaryCardProps) {
  return (
    <View style={styles.overviewCard}>
      <Text style={styles.overviewLabel}>{overviewLabel}</Text>
      <Text style={[styles.overviewTotal, styles.overviewTotalMedium]}>
        {totalMonthlyCosts.toLocaleString(numberLocale)} {currencySymbol}
      </Text>

      <View style={styles.overviewDivider} />

      <View style={styles.overviewTwoCol}>
        <View style={styles.overviewCol}>
          <Text style={styles.overviewColLabel}>{paidLabel}</Text>
          <Text style={styles.overviewColValue}>
            {householdPaidTotal.toLocaleString(numberLocale)} {currencySymbol}
          </Text>
        </View>
        <View style={[styles.overviewCol, styles.overviewColRight]}>
          <Text style={[styles.overviewColLabel, styles.overviewColLabelRight]}>{unpaidLabel}</Text>
          <Text style={[styles.overviewColValue, styles.overviewColValueRight]}>
            {householdUnpaidTotal.toLocaleString(numberLocale)} {currencySymbol}
          </Text>
        </View>
      </View>

      <View
        style={styles.progressTrack}
        onLayout={(e) => onOverviewProgressTrackLayout(e.nativeEvent.layout.width)}
      >
        {overviewProgressTrackW > 0 && householdPaidPercent > 0 ? (
          <View
            style={{
              width: `${householdPaidPercent}%`,
              height: '100%',
              borderRadius: 999,
              overflow: 'hidden',
            }}
          >
            <LinearGradient
              colors={[colors.error, colors.success]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ width: overviewProgressTrackW, height: '100%' }}
            />
          </View>
        ) : null}
      </View>

      <View style={styles.overviewPaidPill}>
        {recurringTotalCount > 0 ? (
          recurringFullyPaidCount === recurringTotalCount ? (
            <Check size={14} color={colors.onPrimary} strokeWidth={2.5} />
          ) : (
            <X size={14} color={colors.onPrimary} strokeWidth={2.5} />
          )
        ) : null}
        <Text style={styles.overviewPaidPillText}>
          {recurringTotalCount > 0 ? expensesPaidThisMonthLabel : noEachOwnRecurringThisMonthLabel}
        </Text>
      </View>

      {singlePayerDueThisMonthTotal > 0 ? (
        <TouchableOpacity
          style={styles.overviewSinglePayerRow}
          onPress={onScrollToSettlement}
          activeOpacity={0.85}
        >
          <Text style={styles.overviewSinglePayerText}>{singlePayerOverviewLine}</Text>
          <Text style={styles.overviewSinglePayerLink}>{singlePayerGoSettlementLabel}</Text>
        </TouchableOpacity>
      ) : null}

      <View style={styles.overviewSubBox}>
        <View style={styles.overviewTwoCol}>
          <View style={styles.overviewCol}>
            <Text style={styles.overviewColLabel}>{yourShareTotalLabel}</Text>
            <Text style={styles.overviewColValue}>
              {yourShareTotalKc.toLocaleString(numberLocale)} {currencySymbol}
            </Text>
          </View>
          <View style={[styles.overviewCol, styles.overviewColRight]}>
            <Text style={[styles.overviewColLabel, styles.overviewColLabelRight]}>{paidLabel}</Text>
            <Text style={[styles.overviewColValue, styles.overviewColValueRight]}>
              {paidTotal.toLocaleString(numberLocale)} {currencySymbol}
            </Text>
          </View>
        </View>
      </View>

      <View style={[styles.overviewSubBox, styles.overviewSubBoxLast]}>
        <View style={styles.overviewTwoCol}>
          <View style={styles.overviewCol}>
            <Text style={styles.overviewColLabel}>{sharedExpensesMonthLabel}</Text>
            <Text style={styles.overviewColValue}>
              {sharedMonthTotal.toLocaleString(numberLocale)} {currencySymbol}
            </Text>
          </View>
          <View style={[styles.overviewCol, styles.overviewColRight]}>
            <Text style={[styles.overviewColLabel, styles.overviewColLabelRight]}>{yourShareLabel}</Text>
            <Text style={[styles.overviewColValue, styles.overviewColValueRight]}>
              {sharedMonthYourShare.toLocaleString(numberLocale)} {currencySymbol}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overviewCard: {
    marginTop: 16,
    borderRadius: 16,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  overviewLabel: { color: 'white', opacity: 0.9, fontSize: 12, fontWeight: '600' },
  overviewTotal: { color: 'white', fontSize: 28, fontWeight: '800', marginTop: 2, lineHeight: 32 },
  overviewTotalMedium: { letterSpacing: -0.5, marginBottom: 0 },
  overviewDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.28)',
    marginVertical: 8,
  },
  overviewTwoCol: {
    flexDirection: 'row',
    gap: 8,
  },
  overviewCol: { flex: 1, minWidth: 0 },
  overviewColRight: { alignItems: 'flex-end' },
  overviewColLabel: {
    color: 'rgba(255,255,255,0.68)',
    fontSize: 10,
    fontWeight: '500',
    marginBottom: 2,
    lineHeight: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.25,
  },
  overviewColLabelRight: { textAlign: 'right' },
  overviewColValue: {
    color: 'white',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
    lineHeight: 18,
  },
  overviewColValueRight: { textAlign: 'right' },
  overviewPaidPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    marginTop: 6,
    marginBottom: 8,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  overviewPaidPillText: { color: 'rgba(255,255,255,0.95)', fontSize: 11, fontWeight: '600', lineHeight: 14 },
  overviewSinglePayerRow: {
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  overviewSinglePayerText: {
    flex: 1,
    color: 'rgba(255,255,255,0.92)',
    fontSize: 12,
    fontWeight: '600',
  },
  overviewSinglePayerLink: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: 12,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  overviewSubBox: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 10,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  overviewSubBoxLast: { marginBottom: 0 },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
    marginTop: 8,
    marginBottom: 2,
  },
});
