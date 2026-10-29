/**
 * Strom výdajových kategorií: hlavní + výchozí podkategorie.
 * Strukturální (Převod, Investice) jsou v pickeru skryté.
 */

export type ExpenseCategoryDef = {
  name: string;
  icon: string;
  color: string;
  /** Výchozí podkategorie; prázdné = žádné předvolby */
  subcategories: readonly string[];
  /** Skryté v ručním pickeru (Převod, Investice) */
  structural?: boolean;
};

export const EXPENSE_CATEGORY_TREE: readonly ExpenseCategoryDef[] = [
  {
    name: 'Jídlo',
    icon: '🍽️',
    color: '#EF4444',
    subcategories: ['Potraviny', 'Restaurace', 'Kavárny', 'Rozvoz'],
  },
  {
    name: 'Bydlení',
    icon: '🏠',
    color: '#7C3AED',
    subcategories: ['Nájem', 'Energie', 'Voda', 'Internet a telefon', 'Údržba'],
  },
  {
    name: 'Úvěry',
    icon: '🏦',
    color: '#0F766E',
    subcategories: ['Hypotéka', 'Půjčka', 'Leasing'],
  },
  {
    name: 'Auto a doprava',
    icon: '🚗',
    color: '#10B981',
    subcategories: [
      'Benzín a nafta',
      'Servis a STK',
      'Pojištění',
      'Parkování a dálnice',
      'MHD a vlak',
    ],
  },
  {
    name: 'Nákupy',
    icon: '🛍️',
    color: '#F97316',
    subcategories: ['Oblečení a obuv', 'Elektronika', 'Drogerie', 'Domácnost a nábytek'],
  },
  {
    name: 'Volný čas',
    icon: '🎬',
    color: '#DB2777',
    subcategories: ['Kultura', 'Sport', 'Hry', 'Koníčky'],
  },
  {
    name: 'Cestování',
    icon: '✈️',
    color: '#0EA5E9',
    subcategories: ['Letenky', 'Ubytování', 'Dovolená'],
  },
  {
    name: 'Zdraví',
    icon: '⚕️',
    color: '#06B6D4',
    subcategories: ['Lékárna', 'Lékař', 'Péče'],
  },
  {
    name: 'Předplatné',
    icon: '📺',
    color: '#A855F7',
    subcategories: ['Streaming', 'Aplikace', 'Posilovna'],
  },
  { name: 'Vzdělání', icon: '📚', color: '#6366F1', subcategories: [] },
  { name: 'Děti', icon: '👶', color: '#F472B6', subcategories: [] },
  { name: 'Zvířata', icon: '🐾', color: '#A16207', subcategories: [] },
  {
    name: 'Poplatky a hotovost',
    icon: '💳',
    color: '#78716C',
    subcategories: ['Bankovní poplatky', 'Výběr hotovosti'],
  },
  { name: 'Platby lidem', icon: '👥', color: '#8B5CF6', subcategories: [] },
  { name: 'Ostatní', icon: '📦', color: '#6B7280', subcategories: [] },
  {
    name: 'Převod',
    icon: '🔄',
    color: '#9CA3AF',
    subcategories: [],
    structural: true,
  },
  {
    name: 'Investice',
    icon: '📈',
    color: '#9CA3AF',
    subcategories: [],
    structural: true,
  },
] as const;

export type MainExpenseCategoryName = (typeof EXPENSE_CATEGORY_TREE)[number]['name'];

/** Ploché příjmové kategorie (bez podkategorií). */
export const INCOME_CATEGORY_LIST = [
  { name: 'Mzda', icon: '💼', color: '#10B981' },
  { name: 'Freelance', icon: '💻', color: '#8B5CF6' },
  { name: 'Investice', icon: '📈', color: '#F59E0B' },
  { name: 'Dary', icon: '🎁', color: '#EC4899' },
  { name: 'Vklad hotovosti', icon: '💵', color: '#65A30D' },
  { name: 'Ostatní', icon: '💰', color: '#6B7280' },
] as const;

export function getExpenseCategoryDef(name: string): ExpenseCategoryDef | undefined {
  return EXPENSE_CATEGORY_TREE.find((c) => c.name === name);
}

export function defaultSubcategoriesFor(main: string): readonly string[] {
  return getExpenseCategoryDef(main)?.subcategories ?? [];
}

/** Ikona/barva pro lookup (hlavní kategorie). */
export function buildExpenseCategoriesRecord(): Record<string, { icon: string; color: string }> {
  const out: Record<string, { icon: string; color: string }> = {};
  for (const c of EXPENSE_CATEGORY_TREE) {
    out[c.name] = { icon: c.icon, color: c.color };
  }
  return out;
}

export function buildIncomeCategoriesRecord(): Record<string, { icon: string; color: string }> {
  const out: Record<string, { icon: string; color: string }> = {};
  for (const c of INCOME_CATEGORY_LIST) {
    out[c.name] = { icon: c.icon, color: c.color };
  }
  // Strukturální aliasy používané v klasifikaci / UI
  out['Předplatné'] = { icon: '📺', color: '#A855F7' };
  out['Převod'] = { icon: '🔄', color: '#9CA3AF' };
  return out;
}
