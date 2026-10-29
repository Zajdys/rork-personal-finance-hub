/**
 * Normalizace kategorií: legacy aliasy → { category, subcategory }.
 * Rozšiřuje dřívější CATEGORY_ALIASES / PICKER / suggest logiku.
 */
import {
  EXPENSE_CATEGORY_TREE,
  defaultSubcategoriesFor,
  getExpenseCategoryDef,
} from '@/constants/categories';

export type NormalizedCategory = {
  category: string;
  subcategory: string | null;
};

/** @deprecated Použij LEGACY_MAP — ponecháno pro starší importy. */
export const CATEGORY_ALIASES: Record<string, string> = {
  'Nájem a bydlení': 'Bydlení',
  'Jídlo a nápoje': 'Jídlo',
  Oblečení: 'Nákupy',
  'Oblečení a obuv': 'Nákupy',
  Zábava: 'Volný čas',
  'Zábava a kultura': 'Volný čas',
  'Sport a zdraví': 'Volný čas',
  Sport: 'Volný čas',
  Doprava: 'Auto a doprava',
  'Cestování a ubytování': 'Cestování',
  Elektronika: 'Nákupy',
  'Domácnost a nábytek': 'Nákupy',
  'Telefon a internet': 'Bydlení',
  'Splátky úvěrů': 'Úvěry',
  'Bankovní poplatky': 'Poplatky a hotovost',
  'Výběr hotovosti': 'Poplatky a hotovost',
  Služby: 'Ostatní',
};

/**
 * Stará kategorie (příp. i podkategorie v datech) → nový strom.
 * Bez DB migrace — normalizace při čtení / klasifikaci.
 */
export const LEGACY_MAP: Record<string, NormalizedCategory> = {
  'Jídlo a nápoje': { category: 'Jídlo', subcategory: null },
  'Nájem a bydlení': { category: 'Bydlení', subcategory: null },
  Bydlení: { category: 'Bydlení', subcategory: null },
  'Telefon a internet': { category: 'Bydlení', subcategory: 'Internet a telefon' },
  'Splátky úvěrů': { category: 'Úvěry', subcategory: null },
  Doprava: { category: 'Auto a doprava', subcategory: null },
  Oblečení: { category: 'Nákupy', subcategory: 'Oblečení a obuv' },
  'Oblečení a obuv': { category: 'Nákupy', subcategory: 'Oblečení a obuv' },
  Elektronika: { category: 'Nákupy', subcategory: 'Elektronika' },
  'Domácnost a nábytek': { category: 'Nákupy', subcategory: 'Domácnost a nábytek' },
  Zábava: { category: 'Volný čas', subcategory: null },
  'Zábava a kultura': { category: 'Volný čas', subcategory: null },
  Sport: { category: 'Volný čas', subcategory: 'Sport' },
  'Sport a zdraví': { category: 'Volný čas', subcategory: 'Sport' },
  'Cestování a ubytování': { category: 'Cestování', subcategory: null },
  'Bankovní poplatky': { category: 'Poplatky a hotovost', subcategory: 'Bankovní poplatky' },
  'Výběr hotovosti': { category: 'Poplatky a hotovost', subcategory: 'Výběr hotovosti' },
  Služby: { category: 'Ostatní', subcategory: null },
  Nákupy: { category: 'Nákupy', subcategory: null },
  Zdraví: { category: 'Zdraví', subcategory: null },
  Vzdělání: { category: 'Vzdělání', subcategory: null },
  Předplatné: { category: 'Předplatné', subcategory: null },
  'Platby lidem': { category: 'Platby lidem', subcategory: null },
  Ostatní: { category: 'Ostatní', subcategory: null },
  Převod: { category: 'Převod', subcategory: null },
  Investice: { category: 'Investice', subcategory: null },
  // Nové hlavní názvy (idempotent)
  Jídlo: { category: 'Jídlo', subcategory: null },
  Úvěry: { category: 'Úvěry', subcategory: null },
  'Auto a doprava': { category: 'Auto a doprava', subcategory: null },
  'Volný čas': { category: 'Volný čas', subcategory: null },
  Cestování: { category: 'Cestování', subcategory: null },
  Děti: { category: 'Děti', subcategory: null },
  Zvířata: { category: 'Zvířata', subcategory: null },
  'Poplatky a hotovost': { category: 'Poplatky a hotovost', subcategory: null },
};

/** Hlavní výdajové kategorie v pickeru (bez strukturálních). */
export const PICKER_EXPENSE_CATEGORIES = EXPENSE_CATEGORY_TREE.filter((c) => !c.structural).map(
  (c) => c.name,
);

export const DEFAULT_TOP_EXPENSE_CATEGORIES = [
  'Jídlo',
  'Bydlení',
  'Auto a doprava',
  'Nákupy',
  'Volný čas',
  'Ostatní',
] as const;

/** Extra hledací synonyma → hlavní kategorie (bez diakritiky, lower). */
export const CATEGORY_SEARCH_SYNONYMS: Record<string, string[]> = {
  Jídlo: ['jidlo', 'potraviny', 'restaurace', 'kavarna', 'rozvoz', 'lidl', 'albert', 'kaufland', 'billa', 'tesco'],
  Bydlení: ['bydleni', 'najem', 'energie', 'elektrina', 'plyn', 'voda', 'najemne', 'internet', 'telefon'],
  Úvěry: ['hypo', 'hypoteka', 'uver', 'splatka', 'pujcka', 'leasing'],
  'Auto a doprava': [
    'benzin',
    'nafta',
    'tank',
    'mhd',
    'vlak',
    'autobus',
    'taxi',
    'uber',
    'phm',
    'stk',
    'servis',
    'parkovani',
    'dalnice',
  ],
  Nákupy: ['obleceni', 'obuv', 'boty', 'elektronika', 'drogerie', 'nabytek', 'domacnost'],
  'Volný čas': ['zabava', 'kultura', 'kino', 'divadlo', 'sport', 'hry', 'konicky', 'fitko'],
  Cestování: ['letenky', 'ubytovani', 'dovolena', 'hotel', 'airbnb'],
  Zdraví: ['lekarna', 'doktor', 'lekar', 'pece'],
  Předplatné: ['netflix', 'spotify', 'hbo', 'disney', 'youtube', 'streaming', 'posilovna'],
  'Poplatky a hotovost': ['poplatek', 'bankomat', 'hotovost', 'vyber'],
  'Platby lidem': ['prevod lidem', 'osoba'],
  Vzdělání: ['skola', 'kurz', 'vzdelani'],
  Děti: ['deti', 'skolka', 'pleny'],
  Zvířata: ['pes', 'kocka', 'veterinar', 'zvire'],
  Mzda: ['vyplata', 'mzda', 'plat'],
};

export function foldCategoryText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();
}

/**
 * Sjednocení kategorie (+ volitelné podkategorie) na nový strom.
 * Pokud `sub` chybí a legacy mapování má podkategorii, použije se ta.
 * Pokud `sub` je zadaná, má přednost (po oříznutí).
 */
export function normalizeCategory(
  cat: string | null | undefined,
  sub?: string | null,
): NormalizedCategory {
  const raw = (cat ?? '').trim();
  if (!raw) {
    return { category: 'Ostatní', subcategory: trimSub(sub) };
  }

  const mapped = LEGACY_MAP[raw];
  const explicitSub = trimSub(sub);

  if (mapped) {
    return {
      category: mapped.category,
      subcategory: explicitSub ?? mapped.subcategory,
    };
  }

  // Alias table (starší kód)
  const aliasMain = CATEGORY_ALIASES[raw];
  if (aliasMain) {
    const fromLegacy = LEGACY_MAP[raw];
    return {
      category: aliasMain,
      subcategory: explicitSub ?? fromLegacy?.subcategory ?? null,
    };
  }

  // Podkategorie zadaná jako „hlavní“? (např. uložené jen „Potraviny“)
  const parentOfSub = findParentOfSubcategoryName(raw);
  if (parentOfSub) {
    return {
      category: parentOfSub,
      subcategory: explicitSub ?? raw,
    };
  }

  return { category: raw, subcategory: explicitSub };
}

function trimSub(sub?: string | null): string | null {
  if (sub == null) return null;
  const t = String(sub).trim();
  return t.length ? t : null;
}

function findParentOfSubcategoryName(name: string): string | null {
  for (const c of EXPENSE_CATEGORY_TREE) {
    if (c.subcategories.includes(name)) return c.name;
  }
  return null;
}

export function isAliasCategory(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(LEGACY_MAP, name) && !getExpenseCategoryDef(name);
}

/** Kategorie viditelné v ručním pickeru výdajů. */
export function isPickerExpenseCategory(name: string): boolean {
  if (name === 'Převod' || name === 'Investice') return false;
  return (PICKER_EXPENSE_CATEGORIES as readonly string[]).includes(name);
}

/** Jen název hlavní kategorie (pro agregace / Set). */
export function mainCategoryName(
  cat: string | null | undefined,
  sub?: string | null,
): string {
  return normalizeCategory(cat, sub).category;
}

/** Zobrazení: „🚗 Auto a doprava · Benzín a nafta“ */
export function formatCategoryDisplay(
  cat: string | null | undefined,
  sub?: string | null,
  opts?: { withIcon?: boolean },
): string {
  const n = normalizeCategory(cat, sub);
  const def = getExpenseCategoryDef(n.category);
  const icon = opts?.withIcon === false ? '' : def?.icon ? `${def.icon} ` : '';
  if (n.subcategory) {
    return `${icon}${n.category} · ${n.subcategory}`;
  }
  return `${icon}${n.category}`;
}

/**
 * Návrh kategorie (+ podkategorie) z popisu — výdaj i příjem.
 */
export function suggestCategoryFromDescription(
  text: string,
  type: 'income' | 'expense',
): NormalizedCategory | null {
  const f = foldCategoryText(text);
  if (!f || f.length < 2) return null;

  if (type === 'income') {
    if (/\b(vyplata|mzda|plat|salary|wage)\b/.test(f)) return { category: 'Mzda', subcategory: null };
    if (/\b(freelance|faktura|honor)\b/.test(f)) return { category: 'Freelance', subcategory: null };
    if (/\b(dar|gift)\b/.test(f)) return { category: 'Dary', subcategory: null };
    if (/\b(vklad|hotovost)\b/.test(f)) return { category: 'Vklad hotovosti', subcategory: null };
    return null;
  }

  if (/\b(hypo|hypoteka|hypotek)\b/.test(f)) {
    return { category: 'Úvěry', subcategory: 'Hypotéka' };
  }
  if (/\b(leasing)\b/.test(f)) return { category: 'Úvěry', subcategory: 'Leasing' };
  if (/\b(pujcka|uver|splatka)\b/.test(f)) return { category: 'Úvěry', subcategory: 'Půjčka' };

  if (/\b(benzin|nafta|tank|phm|cerpaci)\b/.test(f)) {
    return { category: 'Auto a doprava', subcategory: 'Benzín a nafta' };
  }
  if (/\b(stk|servis|pneuservis)\b/.test(f)) {
    return { category: 'Auto a doprava', subcategory: 'Servis a STK' };
  }
  if (/\b(parkov|dalnic|myto)\b/.test(f)) {
    return { category: 'Auto a doprava', subcategory: 'Parkování a dálnice' };
  }
  if (/\b(mhd|vlak|autobus|taxi|uber|bolt)\b/.test(f)) {
    return { category: 'Auto a doprava', subcategory: 'MHD a vlak' };
  }

  if (/\b(netflix|spotify|hbo|disney|youtube)\b/.test(f)) {
    return { category: 'Předplatné', subcategory: 'Streaming' };
  }
  if (/\b(posilovna|fitko|fitness|gym)\b/.test(f)) {
    return { category: 'Předplatné', subcategory: 'Posilovna' };
  }

  if (/\b(lidl|albert|kaufland|billa|tesco|penny|globus|rohlik|kosik)\b/.test(f)) {
    return { category: 'Jídlo', subcategory: 'Potraviny' };
  }
  if (/\b(wolt|foodora|damejidlo)\b/.test(f)) {
    return { category: 'Jídlo', subcategory: 'Rozvoz' };
  }
  if (/\b(mcdonald|kfc|restaurace|pizza|kebab)\b/.test(f)) {
    return { category: 'Jídlo', subcategory: 'Restaurace' };
  }
  if (/\b(starbucks|costa|kavarna|cafe|coffee)\b/.test(f)) {
    return { category: 'Jídlo', subcategory: 'Kavárny' };
  }

  if (/\b(najem|najemne)\b/.test(f)) return { category: 'Bydlení', subcategory: 'Nájem' };
  if (/\b(energie|elektrina|plyn|cez|innogy)\b/.test(f)) {
    return { category: 'Bydlení', subcategory: 'Energie' };
  }
  if (/\b(vodafone|t-?mobile|o2|internet|starnet)\b/.test(f)) {
    return { category: 'Bydlení', subcategory: 'Internet a telefon' };
  }

  if (/\b(lekarna|pharm)\b/.test(f)) return { category: 'Zdraví', subcategory: 'Lékárna' };
  if (/\b(doktor|lekar|ordinace|klinika)\b/.test(f)) {
    return { category: 'Zdraví', subcategory: 'Lékař' };
  }

  if (/\b(bankomat|vyber hotovosti)\b/.test(f)) {
    return { category: 'Poplatky a hotovost', subcategory: 'Výběr hotovosti' };
  }
  if (/\b(poplatek|poplatky)\b/.test(f)) {
    return { category: 'Poplatky a hotovost', subcategory: 'Bankovní poplatky' };
  }

  return null;
}

export function categoryMatchesQuery(categoryName: string, query: string): boolean {
  const q = foldCategoryText(query);
  if (!q) return true;
  const nameFold = foldCategoryText(categoryName);
  if (nameFold.includes(q)) return true;

  for (const [legacy, mapped] of Object.entries(LEGACY_MAP)) {
    if (mapped.category === categoryName && foldCategoryText(legacy).includes(q)) return true;
  }

  const syns = CATEGORY_SEARCH_SYNONYMS[categoryName];
  if (syns?.some((s) => s.includes(q) || q.includes(s))) return true;

  // Podkategorie této hlavní kategorie
  for (const sub of defaultSubcategoriesFor(categoryName)) {
    if (foldCategoryText(sub).includes(q)) return true;
  }

  return false;
}

/** Najde hlavní kategorii, jejíž podkategorie nebo synonyma sedí na query. */
export function findMainCategoryMatchingSubQuery(query: string): string | null {
  const q = foldCategoryText(query);
  if (!q) return null;
  for (const c of EXPENSE_CATEGORY_TREE) {
    if (c.structural) continue;
    if (foldCategoryText(c.name).includes(q)) return c.name;
    if (c.subcategories.some((s) => foldCategoryText(s).includes(q))) return c.name;
    const syns = CATEGORY_SEARCH_SYNONYMS[c.name];
    if (syns?.some((s) => s.includes(q) || q.includes(s))) return c.name;
  }
  return null;
}
