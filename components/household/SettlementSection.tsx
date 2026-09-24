import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Check, ChevronDown, Trash2 } from 'lucide-react-native';
import { resolveHouseholdActorLabel } from '@/lib/household-members';
import type { HouseholdSettlement, HouseholdSimplifiedTransfer } from '@/lib/household-settlements';
import type { ThemeColors } from '@/constants/theme-colors';
import { useLanguageStore } from '@/store/language-store';
import type { Member } from './types';

type TranslateFn = ReturnType<typeof useLanguageStore.getState>['t'];

type SettlementSectionProps = {
  colors: ThemeColors;
  numberLocale: string;
  currencySymbol: string;
  currentUserId: string | undefined;
  members: Member[];
  householdSettled: boolean;
  simplifiedHouseholdDebts: HouseholdSimplifiedTransfer[];
  householdSettlements: HouseholdSettlement[];
  settlementsHistoryOpen: boolean;
  onToggleHistory: () => void;
  onOpenSettleTransfer: (
    fromUserId: string,
    toUserId: string,
    amountExact: number,
    amountDisplay: number,
  ) => void;
  onDeleteSettlement: (st: HouseholdSettlement) => void;
  settlementSectionRef: React.Ref<View>;
  t: TranslateFn;
};

export function SettlementSection({
  colors,
  numberLocale,
  currencySymbol,
  currentUserId,
  members,
  householdSettled,
  simplifiedHouseholdDebts,
  householdSettlements,
  settlementsHistoryOpen,
  onToggleHistory,
  onOpenSettleTransfer,
  onDeleteSettlement,
  settlementSectionRef,
  t,
}: SettlementSectionProps) {
  return (
    <View
      ref={settlementSectionRef}
      collapsable={false}
      style={[styles.settlementCard, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <Text style={[styles.settlementSectionTitle, { color: colors.text }]}>
        {t('hhSettlementTitle')}
      </Text>
      <Text style={[styles.settlementScopeHint, { color: colors.textSecondary }]}>
        {t('hhSettlementCumulativeHint')}
      </Text>
      {householdSettled ? (
        <View style={styles.settlementSettledRow}>
          <Check size={18} color={colors.success} strokeWidth={2.5} />
          <Text style={[styles.settlementSettledText, { color: colors.success }]}>
            {t('hhSettlementBalanced')}
          </Text>
        </View>
      ) : (
        simplifiedHouseholdDebts.map((debt) => {
          const fromLabel = debt.fromUserId === currentUserId ? t('hhMe') : debt.fromName;
          const toLabel = debt.toUserId === currentUserId ? t('hhMe') : debt.toName;
          return (
            <View key={`${debt.fromUserId}-${debt.toUserId}`} style={styles.settlementDebtRow}>
              <Text style={[styles.settlementDebtText, { color: colors.text }]} numberOfLines={2}>
                {t('hhSettlementTransferLine', {
                  from: fromLabel,
                  to: toLabel,
                  amount: debt.amountDisplay.toLocaleString(numberLocale),
                  symbol: currencySymbol,
                })}
              </Text>
              <TouchableOpacity
                style={[styles.settlementSettleBtn, { backgroundColor: colors.primary }]}
                onPress={() =>
                  onOpenSettleTransfer(
                    debt.fromUserId,
                    debt.toUserId,
                    debt.amountExact,
                    debt.amountDisplay,
                  )
                }
              >
                <Text style={[styles.settlementSettleBtnText, { color: colors.onPrimary }]}>
                  {t('hhSettlementSettle')}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })
      )}

      {householdSettlements.length > 0 ? (
        <>
          <TouchableOpacity style={styles.settlementHistoryToggle} onPress={onToggleHistory}>
            <Text style={[styles.settlementHistoryToggleText, { color: colors.primary }]}>
              {t('hhSettlementHistory')}
            </Text>
            <ChevronDown
              color={colors.primary}
              size={18}
              style={{ transform: [{ rotate: settlementsHistoryOpen ? '180deg' : '0deg' }] }}
            />
          </TouchableOpacity>
          {settlementsHistoryOpen
            ? householdSettlements.map((st) => {
                const fromLabel = resolveHouseholdActorLabel({
                  userId: st.fromUserId,
                  members,
                  currentUserId,
                  meLabel: t('hhMe'),
                  formerLabel: t('hhFormerMember'),
                });
                const toLabel = resolveHouseholdActorLabel({
                  userId: st.toUserId,
                  members,
                  currentUserId,
                  meLabel: t('hhMe'),
                  formerLabel: t('hhFormerMember'),
                });
                const dateLabel = st.createdAt
                  ? new Date(st.createdAt).toLocaleDateString(numberLocale, {
                      day: 'numeric',
                      month: 'short',
                    })
                  : '';
                return (
                  <View
                    key={st.id}
                    style={[styles.settlementHistoryRow, { borderTopColor: colors.border }]}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.settlementHistoryMain, { color: colors.text }]}>
                        {dateLabel} · {fromLabel} → {toLabel} ·{' '}
                        {Math.round(st.amount).toLocaleString(numberLocale)} {currencySymbol}
                      </Text>
                      {st.note ? (
                        <Text style={[styles.settlementHistoryNote, { color: colors.textSecondary }]}>
                          {st.note}
                        </Text>
                      ) : null}
                    </View>
                    {st.createdBy === currentUserId ? (
                      <TouchableOpacity hitSlop={8} onPress={() => onDeleteSettlement(st)}>
                        <Trash2 size={16} color={colors.error} />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                );
              })
            : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  settlementCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    marginBottom: 16,
  },
  settlementSectionTitle: { fontSize: 16, fontWeight: '800', marginBottom: 10 },
  settlementScopeHint: { fontSize: 12, fontWeight: '600', marginBottom: 10, marginTop: -4 },
  settlementSettledRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  settlementSettledText: { fontSize: 15, fontWeight: '700' },
  settlementDebtRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  settlementDebtText: { flex: 1, fontSize: 14, fontWeight: '600' },
  settlementSettleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  settlementSettleBtnText: { fontSize: 13, fontWeight: '700' },
  settlementHistoryToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 10,
  },
  settlementHistoryToggleText: { fontSize: 14, fontWeight: '700' },
  settlementHistoryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  settlementHistoryMain: { fontSize: 13, fontWeight: '600' },
  settlementHistoryNote: { fontSize: 12, marginTop: 4 },
});
