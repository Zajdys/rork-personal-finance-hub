/**
 * České kódy bank (4 číslice za / v čísle účtu, nebo v CZ IBAN).
 * Použito pro odvození názvu banky u owner_bank_accounts, pokud uživatel nezadá vlastní.
 */
import { normalizeAccount } from '@/utils/normalizeAccount';

/** Kód banky → kanonický display name (shodný s BANK_NAME_PRESETS kde jde). */
export const CZ_BANK_CODE_NAMES: Record<string, string> = {
  '0100': 'Komerční banka',
  '0300': 'ČSOB',
  '0600': 'Moneta Money Bank',
  '0710': 'Česká národní banka',
  '0800': 'Česká spořitelna',
  '2010': 'Fio banka',
  '2020': 'MUFG Bank',
  '2060': 'Citfin',
  '2250': 'Banka CREDITAS',
  '2600': 'Citibank',
  '2700': 'UniCredit Bank',
  '3030': 'Air Bank',
  '3050': 'BNP Paribas',
  '3500': 'ING',
  '4000': 'Max banka',
  '5500': 'Raiffeisenbank',
  '5800': 'J&T Banka',
  '6000': 'PPF banka',
  '6100': 'Raiffeisenbank', // Equa → RB
  '6200': 'CommBank',
  '6210': 'mBank',
  '6300': 'BNP Paribas Personal Finance',
  '6800': 'Sberbank',
  '7910': 'Deutsche Bank',
  '8030': 'Fio banka', // Fio stavební / legacy
  '8040': 'Oberbank',
  '8090': 'ČSOB Stavební spořitelna',
  '8220': 'Payment institutions',
};

/** Generické labely — nepovažovat za „uživatel zadal vlastní banku“. */
const GENERIC_BANK_NAME_KEYS = new Set(
  [
    'moje banka',
    'moje ucty',
    'moje účty',
    'my bank',
    'my accounts',
    'other',
    'jina',
    'jiná',
    'jine',
    'jiné',
    'unknown',
    'neznama banka',
    'neznámá banka',
  ].map((s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()),
);

function normalizeBankKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function isGenericBankName(name: string | null | undefined): boolean {
  const t = (name ?? '').trim();
  if (!t) return true;
  return GENERIC_BANK_NAME_KEYS.has(normalizeBankKey(t));
}

/**
 * Extrahuje 4místný kód banky z domestic `…/XXXX` nebo CZ IBAN.
 */
export function extractCzBankCode(accountNumber: string | null | undefined): string | null {
  if (!accountNumber?.trim()) return null;
  const compact = accountNumber.replace(/\s+/g, '').trim();
  if (!compact) return null;

  const domestic = compact.match(/\/(\d{4})$/);
  if (domestic?.[1]) return domestic[1];

  const norm = normalizeAccount(compact);
  if (norm) {
    const fromNorm = norm.match(/\/(\d{4})$/);
    if (fromNorm?.[1]) return fromNorm[1];
  }

  const iban = compact.toUpperCase();
  if (/^CZ\d{2}\d{4}/.test(iban) && iban.length >= 8) {
    return iban.slice(4, 8);
  }
  return null;
}

/** Kanonický název pro neznámý / chybějící kód banky. */
export const OTHER_BANK_NAME = 'Jiná banka';

export function bankNameFromAccountNumber(accountNumber: string | null | undefined): string | null {
  const code = extractCzBankCode(accountNumber);
  if (!code) return null;
  return CZ_BANK_CODE_NAMES[code] ?? OTHER_BANK_NAME;
}

/** Živý náhled v UI: kód v čísle → název / „Jiná banka“; bez kódu → null. */
export function previewBankNameFromAccountNumber(accountNumber: string | null | undefined): string | null {
  return bankNameFromAccountNumber(accountNumber);
}

/**
 * Uživatelský název banky, pokud je zadaný a není generický;
 * jinak odvození z kódu v čísle účtu; neznámý kód → Jiná banka.
 */
export function resolveOwnerBankName(
  accountNumber: string,
  userBank?: string | null,
  fallback = OTHER_BANK_NAME,
): string {
  const trimmed = (userBank ?? '').trim();
  if (trimmed && !isGenericBankName(trimmed) && normalizeBankKey(trimmed) !== normalizeBankKey(OTHER_BANK_NAME)) {
    return trimmed;
  }
  return bankNameFromAccountNumber(accountNumber) || trimmed || fallback;
}
