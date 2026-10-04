import { normalizeExpensePaymentMode, type ExpensePaymentMode } from '@/lib/household-settlements';
import { memberShareDisplay } from '@/lib/household-recurring-shares';

export type SharedExpenseSplitType = 'me' | 'half' | 'custom';

export type { ExpensePaymentMode };

export type SharedExpense = {
  id: string;
  name: string;
  amount: number;
  category: string;
  paidBy: string;
  date: string;
  splitType: SharedExpenseSplitType;
  splitPercent: number;
  paymentMode: ExpensePaymentMode;
  receiptUrl?: string | null;
};

export const SHARED_EXPENSE_CATEGORIES = [
  { name: 'Jídlo', emoji: '🍕' },
  { name: 'Doprava', emoji: '🚗' },
  { name: 'Zábava', emoji: '🎮' },
  { name: 'Domácnost', emoji: '🏠' },
  { name: 'Ostatní', emoji: '📦' },
] as const;

export function normalizeSharedSplitType(raw: unknown): SharedExpenseSplitType {
  if (raw === 'me' || raw === 'half' || raw === 'custom') return raw;
  return 'half';
}

export function clampSplitPercent(n: number): number {
  if (!Number.isFinite(n)) return 50;
  return Math.min(100, Math.max(0, Math.round(n)));
}

export function sharedSplitBadgeLabel(
  splitType: SharedExpenseSplitType,
  splitPercent: number,
  labels: { mine: string; half: string },
): string {
  if (splitType === 'me') return labels.mine;
  if (splitType === 'half') return labels.half;
  return `${clampSplitPercent(splitPercent)} %`;
}

/** Podíl aktuálního uživatele na výdaji (Kč, shareDisplay). */
export function yourShareForSharedExpense(
  item: SharedExpense,
  currentUserId?: string,
  memberIds?: string[],
): number {
  const amount = item.amount;
  if (item.splitType === 'me') {
    return item.paidBy === currentUserId ? Math.round(amount) : 0;
  }
  if (item.splitType === 'half') {
    if (!currentUserId) return 0;
    const ids =
      memberIds && memberIds.length > 0
        ? memberIds
        : [...new Set([item.paidBy, currentUserId].filter(Boolean))];
    return memberShareDisplay(amount, 'shared_half', 50, ids, item.paidBy, currentUserId);
  }
  // shared_custom: my_share % patří autorovi (paidBy) — UI podíl autora beze změny
  return Math.round((amount * clampSplitPercent(item.splitPercent)) / 100);
}

export function mapSharedExpenseRow(row: Record<string, unknown>): SharedExpense {
  const dateRaw = row.expense_date ?? row.date;
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    amount: Number(row.amount) || 0,
    category: String(row.category ?? 'Ostatní'),
    paidBy: String(row.payer_user_id ?? row.paid_by ?? ''),
    date: typeof dateRaw === 'string' ? dateRaw.slice(0, 10) : '',
    splitType: normalizeSharedSplitType(row.split_type),
    splitPercent: clampSplitPercent(Number(row.split_percent ?? 50)),
    paymentMode: normalizeExpensePaymentMode(row.payment_mode),
    receiptUrl:
      typeof row.receipt_url === 'string' && row.receipt_url.length > 0 ? row.receipt_url : null,
  };
}

export function monthYm(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthBounds(d: Date): { start: string; end: string } {
  const y = d.getFullYear();
  const m = d.getMonth();
  const start = `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m + 1, 0).getDate();
  const end = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

export function formatSharedExpenseDate(ymd: string, locale: string): string {
  const [y, mo, da] = ymd.split('-').map(Number);
  if (!y || !mo || !da) return ymd;
  const dt = new Date(y, mo - 1, da);
  return dt.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

export function memberInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]!.charAt(0)}${parts[1]!.charAt(0)}`.toUpperCase();
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return '?';
}

export function sharedCategoryEmoji(category: string): string {
  return SHARED_EXPENSE_CATEGORIES.find((c) => c.name === category)?.emoji ?? '📦';
}
