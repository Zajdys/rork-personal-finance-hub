/**
 * Zobrazované názvy kategorií v angličtině.
 * V databázi zůstávají české názvy (Jídlo, Bydlení…) — překládá se jen při zobrazení.
 * Vlastní kategorie uživatele (např. „Zubař“) se nepřekládají.
 */
import { useLanguageStore, type Language } from '@/store/language-store';

const EN: Record<string, string> = {
  // Hlavní výdajové kategorie
  'Jídlo': 'Food',
  'Bydlení': 'Housing',
  'Úvěry': 'Loans',
  'Auto a doprava': 'Car & transport',
  'Nákupy': 'Shopping',
  'Volný čas': 'Leisure',
  'Cestování': 'Travel',
  'Zdraví': 'Health',
  'Předplatné': 'Subscriptions',
  'Vzdělání': 'Education',
  'Děti': 'Kids',
  'Zvířata': 'Pets',
  'Poplatky a hotovost': 'Fees & cash',
  'Platby lidem': 'Payments to people',
  'Ostatní': 'Other',
  'Převod': 'Transfer',
  'Investice': 'Investments',

  // Podkategorie
  'Potraviny': 'Groceries',
  'Restaurace': 'Restaurants',
  'Kavárny': 'Cafés',
  'Rozvoz': 'Food delivery',
  'Nájem': 'Rent',
  'Energie': 'Energy',
  'Voda': 'Water',
  'Internet a telefon': 'Internet & phone',
  'Údržba': 'Maintenance',
  'Hypotéka': 'Mortgage',
  'Půjčka': 'Loan',
  'Leasing': 'Leasing',
  'Benzín a nafta': 'Fuel',
  'Servis a STK': 'Service & MOT',
  'Pojištění': 'Insurance',
  'Parkování a dálnice': 'Parking & tolls',
  'MHD a vlak': 'Public transport & train',
  'Oblečení a obuv': 'Clothes & shoes',
  'Elektronika': 'Electronics',
  'Drogerie': 'Drugstore',
  'Domácnost a nábytek': 'Home & furniture',
  'Kultura': 'Culture',
  'Sport': 'Sport',
  'Hry': 'Games',
  'Koníčky': 'Hobbies',
  'Letenky': 'Flights',
  'Ubytování': 'Accommodation',
  'Dovolená': 'Holiday',
  'Lékárna': 'Pharmacy',
  'Lékař': 'Doctor',
  'Péče': 'Personal care',
  'Streaming': 'Streaming',
  'Aplikace': 'Apps',
  'Posilovna': 'Gym',
  'Bankovní poplatky': 'Bank fees',
  'Výběr hotovosti': 'Cash withdrawal',

  // Příjmové kategorie
  'Mzda': 'Salary',
  'Freelance': 'Freelance',
  'Dary': 'Gifts',
  'Vklad hotovosti': 'Cash deposit',

  // Starší / domácnost / rozdělení útraty
  'Splátky úvěrů': 'Loan payments',
  'Bez kategorie': 'Uncategorized',
  'Nájem a energie': 'Rent & energy',
  'Doprava': 'Transport',
  'Zábava': 'Entertainment',
  'Restaurace a bary': 'Restaurants & bars',
  'Ubytování a cestování': 'Accommodation & travel',
  'Nákup': 'Shopping',
};

/** Název kategorie / podkategorie v aktuálním (nebo zadaném) jazyce. */
export function categoryLabel(name: string | null | undefined, lang?: Language): string {
  const n = String(name ?? '').trim();
  if (!n) return '';
  const l = lang ?? useLanguageStore.getState().language;
  if (l !== 'en') return n;
  return EN[n] ?? n;
}

/** „Jídlo · Potraviny“ → „Food · Groceries“ */
export function categoryPathLabel(
  main: string | null | undefined,
  sub?: string | null,
  lang?: Language,
): string {
  const m = categoryLabel(main, lang);
  const s = sub ? categoryLabel(sub, lang) : '';
  return s ? `${m} · ${s}` : m;
}
