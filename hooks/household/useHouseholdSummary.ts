import { useMemo, useState } from 'react';
import {
  allocateRecurringMemberShares,
  sumPaidMemberSharesDisplay,
  sumPaidMemberSharesExact,
} from '@/lib/household-recurring-shares';
import { yourShareForSharedExpense, type SharedExpense } from '@/lib/household-shared-expenses';
import {
  itemFullyPaid,
  myShareAmountKc,
  recurringAuthorId,
  yourShareInOverviewKc,
} from '@/components/household/helpers';
import type { Member, RecurringExpense } from '@/components/household/types';

type UseHouseholdSummaryParams = {
  recurringExpenses: RecurringExpense[];
  sharedExpenses: SharedExpense[];
  members: Member[];
  sharedMonth: Date;
  numberLocale: string;
  currentUserId: string | undefined;
};

export function useHouseholdSummary({
  recurringExpenses,
  sharedExpenses,
  members,
  sharedMonth,
  numberLocale,
  currentUserId,
}: UseHouseholdSummaryParams) {
  const [overviewProgressTrackW, setOverviewProgressTrackW] = useState(0);

  const memberIds = useMemo(() => members.map((m) => m.userId), [members]);

  const dueThisMonthExpenses = useMemo(
    () => recurringExpenses.filter((item) => item.occurrences.length > 0),
    [recurringExpenses],
  );

  const eachOwnDueThisMonthExpenses = useMemo(
    () => dueThisMonthExpenses.filter((item) => item.paymentMode !== 'single_payer'),
    [dueThisMonthExpenses],
  );

  const singlePayerDueThisMonthTotal = useMemo(
    () =>
      dueThisMonthExpenses
        .filter((item) => item.paymentMode === 'single_payer')
        .reduce((sum, item) => sum + item.amount * item.occurrences.length, 0),
    [dueThisMonthExpenses],
  );

  const totalMonthlyCosts = useMemo(
    () =>
      dueThisMonthExpenses.reduce(
        (sum, item) => sum + item.amount * item.occurrences.length,
        0,
      ),
    [dueThisMonthExpenses],
  );

  const yourShareTotalKc = useMemo(
    () =>
      eachOwnDueThisMonthExpenses.reduce(
        (s, i) => s + yourShareInOverviewKc(i, currentUserId, memberIds),
        0,
      ),
    [eachOwnDueThisMonthExpenses, currentUserId, memberIds],
  );

  /** Domácnost: exact pro progress; jen each_own_share (single_payer nemá odškrtávání). */
  const eachOwnMonthlyTotal = useMemo(
    () =>
      eachOwnDueThisMonthExpenses.reduce(
        (sum, item) => sum + item.amount * item.occurrences.length,
        0,
      ),
    [eachOwnDueThisMonthExpenses],
  );

  const householdPaidExact = useMemo(
    () =>
      eachOwnDueThisMonthExpenses.reduce((sum, item) => {
        const shares = allocateRecurringMemberShares({
          amount: item.amount,
          split: item.splitType,
          mySharePct: item.myShare,
          memberIds,
          myShareOwnerUserId: recurringAuthorId(item),
          expenseId: item.id,
        });
        return (
          sum +
          item.occurrences.reduce(
            (s, o) => s + sumPaidMemberSharesExact(shares, o.paidUserIds),
            0,
          )
        );
      }, 0),
    [eachOwnDueThisMonthExpenses, memberIds],
  );
  const householdPaidTotal = useMemo(
    () =>
      eachOwnDueThisMonthExpenses.reduce((sum, item) => {
        const shares = allocateRecurringMemberShares({
          amount: item.amount,
          split: item.splitType,
          mySharePct: item.myShare,
          memberIds,
          myShareOwnerUserId: recurringAuthorId(item),
          expenseId: item.id,
        });
        return (
          sum +
          item.occurrences.reduce(
            (s, o) => s + sumPaidMemberSharesDisplay(shares, o.paidUserIds),
            0,
          )
        );
      }, 0),
    [eachOwnDueThisMonthExpenses, memberIds],
  );
  const householdUnpaid = Math.max(0, Math.round(eachOwnMonthlyTotal) - householdPaidTotal);
  const householdUnpaidTotal = householdUnpaid;
  const householdPaidPercent =
    eachOwnMonthlyTotal > 0
      ? Math.min(100, Math.round((householdPaidExact / eachOwnMonthlyTotal) * 100))
      : 0;

  /** Osobní: tvůj podíl u výskytů each_own_share, kde máš paid. */
  const paidTotal = useMemo(() => {
    if (!currentUserId) return 0;
    return eachOwnDueThisMonthExpenses.reduce((sum, item) => {
      const one = myShareAmountKc(
        item.amount,
        item.splitType,
        item.myShare,
        memberIds,
        recurringAuthorId(item),
        currentUserId,
      );
      const paidOcc = item.occurrences.filter((o) => o.paidUserIds.includes(currentUserId)).length;
      return sum + one * paidOcc;
    }, 0);
  }, [eachOwnDueThisMonthExpenses, currentUserId, memberIds]);

  const recurringFullyPaidCount = useMemo(
    () => eachOwnDueThisMonthExpenses.filter((item) => itemFullyPaid(item, memberIds)).length,
    [eachOwnDueThisMonthExpenses, memberIds],
  );
  const recurringTotalCount = eachOwnDueThisMonthExpenses.length;

  const sharedMonthLabel = useMemo(
    () => sharedMonth.toLocaleDateString(numberLocale, { month: 'long', year: 'numeric' }),
    [sharedMonth, numberLocale],
  );

  const sharedMonthTotal = useMemo(
    () => sharedExpenses.reduce((sum, item) => sum + item.amount, 0),
    [sharedExpenses],
  );

  const sharedMonthYourShare = useMemo(
    () =>
      sharedExpenses.reduce(
        (sum, item) => sum + yourShareForSharedExpense(item, currentUserId, memberIds),
        0,
      ),
    [sharedExpenses, currentUserId, memberIds],
  );

  return {
    data: {
      memberIds,
      dueThisMonthExpenses,
      eachOwnDueThisMonthExpenses,
      eachOwnMonthlyTotal,
      singlePayerDueThisMonthTotal,
      totalMonthlyCosts,
      yourShareTotalKc,
      householdPaidExact,
      householdPaidTotal,
      householdUnpaid,
      householdUnpaidTotal,
      householdPaidPercent,
      paidTotal,
      recurringFullyPaidCount,
      recurringTotalCount,
      sharedMonthLabel,
      sharedMonthTotal,
      sharedMonthYourShare,
      overviewProgressTrackW,
    },
    loading: false,
    error: null as string | null,
    setOverviewProgressTrackW,
  };
}
