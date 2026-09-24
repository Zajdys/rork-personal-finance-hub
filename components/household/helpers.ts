import {
  allocateRecurringMemberShares,
  isRecurringItemFullyPaid,
  memberShareDisplay,
  sumPaidMemberSharesExact,
  type RecurringSplitType,
} from '@/lib/household-recurring-shares';
import type { RecurringFrequency } from '@/lib/recurring-expense-cycle';
import { useLanguageStore } from '@/store/language-store';
import type { HouseholdCustomCategory, Member, RecurringExpense } from './types';

export function needsAnchorMonth(freq: RecurringFrequency): boolean {
  return freq === 'quarterly' || freq === 'biannual' || freq === 'yearly';
}

/** Výchozí kategorie pravidelných výdajů (emoji + název uložený v DB). */
export const DEFAULT_RECURRING_CATEGORY_PILLS: readonly { name: string; emoji: string }[] = [
  { name: 'Energie', emoji: '⚡' },
  { name: 'Bydlení', emoji: '🏠' },
  { name: 'Pojištění', emoji: '🛡️' },
  { name: 'Doprava', emoji: '🚗' },
  { name: 'Telefon', emoji: '📱' },
  { name: 'Internet', emoji: '🌐' },
  { name: 'Zdraví', emoji: '💊' },
  { name: 'Ostatní', emoji: '📦' },
];

export function isDefaultCategoryName(name: string): boolean {
  return DEFAULT_RECURRING_CATEGORY_PILLS.some((p) => p.name === name);
}

export function emojiForDefaultRecurringCategory(name: string): string | null {
  return DEFAULT_RECURRING_CATEGORY_PILLS.find((p) => p.name === name)?.emoji ?? null;
}

const RECURRING_CATEGORY_I18N: Record<
  string,
  | 'hhCatEnergy'
  | 'hhCatHousing'
  | 'hhCatInsurance'
  | 'hhCatTransport'
  | 'hhCatPhone'
  | 'hhCatInternet'
  | 'hhCatHealth'
  | 'other'
> = {
  Energie: 'hhCatEnergy',
  Bydlení: 'hhCatHousing',
  Pojištění: 'hhCatInsurance',
  Doprava: 'hhCatTransport',
  Telefon: 'hhCatPhone',
  Internet: 'hhCatInternet',
  Zdraví: 'hhCatHealth',
  Ostatní: 'other',
};

export function translateRecurringCategory(name: string): string {
  const key = RECURRING_CATEGORY_I18N[name];
  if (key) return useLanguageStore.getState().t(key);
  return name;
}

export function categoryDisplayLine(category: string, customs: HouseholdCustomCategory[]): string {
  const row = customs.find((c) => c.name === category);
  if (row) return `${row.emoji} ${category}`;
  const defEmoji = emojiForDefaultRecurringCategory(category);
  if (defEmoji) return `${defEmoji} ${translateRecurringCategory(category)}`;
  return category;
}

/** Kdo hradí pravidelný výdaj (DB `split_type`). */
export function normalizeRecurringSplitType(raw: unknown): RecurringSplitType {
  if (raw === 'shared_half' || raw === 'shared_custom') return raw;
  return 'mine';
}

export function recurringAuthorId(item: {
  createdBy?: string | null;
  addedBy?: string | null;
}): string | null {
  return item.createdBy ?? item.addedBy ?? null;
}

/** Tvůj podíl v celých Kč (shareDisplay). */
export function myShareAmountKc(
  amount: number,
  split: RecurringSplitType,
  mySharePct: number,
  memberIds: string[],
  authorUserId: string | null,
  currentUserId: string | undefined,
  expenseId?: string | null,
): number {
  return memberShareDisplay(
    amount,
    split,
    mySharePct,
    memberIds,
    authorUserId,
    currentUserId,
    expenseId,
  );
}

/** Řádek v přehledu „Tvůj podíl“ — 1× podíl za každý výskyt v měsíci. */
export function yourShareInOverviewKc(
  item: RecurringExpense,
  currentUserId: string | undefined,
  memberIds: string[],
): number {
  if (!currentUserId || item.occurrences.length === 0) return 0;
  const one = myShareAmountKc(
    item.amount,
    item.splitType,
    item.myShare,
    memberIds,
    recurringAuthorId(item),
    currentUserId,
    item.id,
  );
  return one * item.occurrences.length;
}

export function itemFullyPaid(item: RecurringExpense, memberIds: string[]): boolean {
  if (item.occurrences.length === 0) return false;
  const shares = allocateRecurringMemberShares({
    amount: item.amount,
    split: item.splitType,
    mySharePct: item.myShare,
    memberIds,
    myShareOwnerUserId: recurringAuthorId(item),
    expenseId: item.id,
  });
  return item.occurrences.every((o) => isRecurringItemFullyPaid(shares, o.paidUserIds));
}

export function countFullyPaidOccurrences(item: RecurringExpense, memberIds: string[]): number {
  if (item.occurrences.length === 0) return 0;
  const shares = allocateRecurringMemberShares({
    amount: item.amount,
    split: item.splitType,
    mySharePct: item.myShare,
    memberIds,
    myShareOwnerUserId: recurringAuthorId(item),
    expenseId: item.id,
  });
  return item.occurrences.filter((o) => isRecurringItemFullyPaid(shares, o.paidUserIds)).length;
}

/** Prezentace: datum výskytu už uplynulo (konec dne). */
export function isOccurrenceDatePast(dueDateIso: string, now = new Date()): boolean {
  const end = new Date(`${dueDateIso}T23:59:59.999`);
  return !Number.isNaN(end.getTime()) && now.getTime() > end.getTime();
}

/** Krátké datum: „pá 4. 9.“ */
export function formatOccurrenceDateShort(dueDateIso: string, locale: string): string {
  const d = new Date(`${dueDateIso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dueDateIso;
  const wd = d.toLocaleDateString(locale, { weekday: 'short' }).replace(/\.$/, '');
  const day = d.getDate();
  const month = d.getMonth() + 1;
  return `${wd} ${day}. ${month}.`;
}

/** Progress přes všechny výskyty: Σ exact zaplacených / (amount × N). */
export function itemOccurrencePaidPercent(item: RecurringExpense, memberIds: string[]): number {
  const n = item.occurrences.length;
  if (n <= 0 || item.amount <= 0) return 0;
  const shares = allocateRecurringMemberShares({
    amount: item.amount,
    split: item.splitType,
    mySharePct: item.myShare,
    memberIds,
    myShareOwnerUserId: recurringAuthorId(item),
    expenseId: item.id,
  });
  let paidExact = 0;
  for (const o of item.occurrences) {
    paidExact += sumPaidMemberSharesExact(shares, o.paidUserIds);
  }
  const denom = item.amount * n;
  return Math.min(100, Math.round((paidExact / denom) * 100));
}

export function memberDisplayLabel(
  member: Member,
  currentUserId: string | undefined,
  meLabel: string,
): string {
  if (currentUserId && member.userId === currentUserId) return meLabel;
  const trimmed = member.name.trim();
  if (!trimmed) return '?';
  const first = trimmed.split(/\s+/)[0] ?? trimmed;
  return first.length > 10 ? `${first.slice(0, 9)}…` : first;
}

export function occurrenceFieldsOf(item: RecurringExpense) {
  return {
    frequency: item.frequency,
    dueDay: item.dueDay ?? item.dueWeekday ?? 1,
    dueWeekday: item.dueWeekday,
    dueMonth: item.dueMonth,
    createdAt: item.createdAt,
  };
}
