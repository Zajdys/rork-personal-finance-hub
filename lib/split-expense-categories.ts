/** Kategorie split výdajů (sloupec split_expenses.category). */

export const SPLIT_EXPENSE_CATEGORIES = [
  { id: 'jidlo', emoji: '🍕', labelCs: 'Jídlo', labelEn: 'Food' },
  { id: 'doprava', emoji: '🚕', labelCs: 'Doprava', labelEn: 'Transport' },
  { id: 'ubytovani', emoji: '🏠', labelCs: 'Ubytování', labelEn: 'Stay' },
  { id: 'zabava', emoji: '🎉', labelCs: 'Zábava', labelEn: 'Fun' },
  { id: 'nakupy', emoji: '🛍️', labelCs: 'Nákupy', labelEn: 'Shopping' },
  { id: 'zdravi', emoji: '💊', labelCs: 'Zdraví', labelEn: 'Health' },
  { id: 'ostatni', emoji: '🧾', labelCs: 'Ostatní', labelEn: 'Other' },
] as const;

export type SplitExpenseCategoryId = (typeof SPLIT_EXPENSE_CATEGORIES)[number]['id'];

export const DEFAULT_SPLIT_EXPENSE_CATEGORY: SplitExpenseCategoryId = 'ostatni';

const CATEGORY_EMOJI: Record<SplitExpenseCategoryId, string> = {
  jidlo: '🍕',
  doprava: '🚕',
  ubytovani: '🏠',
  zabava: '🎉',
  nakupy: '🛍️',
  zdravi: '💊',
  ostatni: '🧾',
};

export function isSplitExpenseCategoryId(value: string): value is SplitExpenseCategoryId {
  return value in CATEGORY_EMOJI;
}

export function normalizeSplitExpenseCategory(raw: unknown): SplitExpenseCategoryId {
  const s = String(raw ?? '').trim().toLowerCase();
  if (isSplitExpenseCategoryId(s)) return s;
  return DEFAULT_SPLIT_EXPENSE_CATEGORY;
}

export function splitExpenseCategoryEmoji(category: string | null | undefined): string {
  return CATEGORY_EMOJI[normalizeSplitExpenseCategory(category)] ?? '🧾';
}

export function splitExpenseCategoryLabel(
  category: string | null | undefined,
  lang: 'cs' | 'en' = 'cs',
): string {
  const id = normalizeSplitExpenseCategory(category);
  const row = SPLIT_EXPENSE_CATEGORIES.find((c) => c.id === id);
  if (!row) return lang === 'en' ? 'Other' : 'Ostatní';
  return lang === 'en' ? row.labelEn : row.labelCs;
}
