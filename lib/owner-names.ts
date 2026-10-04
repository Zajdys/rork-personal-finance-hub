/**
 * Sestavení seznamu vlastních jmen pro rozpoznání Převodů (Revolut To/From …).
 * Deduplikace podle normalizePersonNameKey (bez diakritiky, lowercase, seřazená slova).
 */
import { normalizePersonNameKey } from '@/lib/suggest-own-accounts';
import type { OwnerBankStored } from '@/lib/owner-accounts-storage';

/** Typické labely účtů — ne držitel. */
const GENERIC_ACCOUNT_LABEL_KEYS = new Set(
  [
    'ucet',
    'bezny ucet',
    'sporici',
    'sporici ucet',
    'account',
    'checking',
    'savings',
    'savings account',
    'current account',
    'main',
    'hlavni',
    'partneruv',
    'partner',
  ].map((s) => normalizePersonNameKey(s)),
);

function looksLikePersonAccountLabel(label: string): boolean {
  const key = normalizePersonNameKey(label);
  if (!key || GENERIC_ACCOUNT_LABEL_KEYS.has(key)) return false;
  const words = key.split(' ').filter(Boolean);
  // držitel: aspoň 2 slova (jméno + příjmení)
  return words.length >= 2;
}

/**
 * Pořadí:
 * 1) first_name + last_name z user_profiles
 * 2) labely vlastních účtů, které vypadají jako jméno držitele
 * 3) auth display name (`user.name`) — jen když 1+2 nic nedaly
 */
export function buildOwnerNames(params: {
  profileFirstName?: string | null;
  profileLastName?: string | null;
  authDisplayName?: string | null;
  /** Labely z Banky a účty (ownerBanks.accounts[].label). */
  accountLabels?: string[];
}): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (raw: string | null | undefined) => {
    const s = String(raw ?? '').trim();
    if (!s) return;
    const key = normalizePersonNameKey(s);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(s);
  };

  const fn = String(params.profileFirstName ?? '').trim();
  const ln = String(params.profileLastName ?? '').trim();
  if (fn || ln) {
    push([fn, ln].filter(Boolean).join(' '));
  }

  for (const label of params.accountLabels ?? []) {
    if (looksLikePersonAccountLabel(label)) push(label);
  }

  if (out.length === 0) {
    push(params.authDisplayName);
  }

  return out;
}

export function accountLabelsFromOwnerBanks(banks: OwnerBankStored[]): string[] {
  const labels: string[] = [];
  for (const b of banks) {
    for (const a of b.accounts ?? []) {
      const l = a.label?.trim();
      if (l) labels.push(l);
    }
  }
  return labels;
}

/** Poslední 4 číslice z čísla účtu (pro „Účet …XXXX“). */
export function accountNumberLast4(accountNumber: string): string {
  const digits = String(accountNumber ?? '').replace(/\D/g, '');
  if (digits.length >= 4) return digits.slice(-4);
  const compact = String(accountNumber ?? '').replace(/\s+/g, '');
  return compact.slice(-4) || '????';
}

/**
 * Titulek řádku: vlastní název, jinak fallback „Účet …XXXX“ když je label prázdný
 * nebo je to jméno držitele (shoda s ownerNames).
 */
export function resolveOwnerAccountTitle(
  label: string | null | undefined,
  accountNumber: string,
  ownerNames: string[],
): { useFallback: boolean; last4: string; label: string } {
  const last4 = accountNumberLast4(accountNumber);
  const trimmed = String(label ?? '').trim();
  if (!trimmed) return { useFallback: true, last4, label: '' };
  const labelKey = normalizePersonNameKey(trimmed);
  if (!labelKey) return { useFallback: true, last4, label: '' };
  for (const n of ownerNames) {
    if (normalizePersonNameKey(n) === labelKey) {
      return { useFallback: true, last4, label: trimmed };
    }
  }
  return { useFallback: false, last4, label: trimmed };
}

/** Normalizuj vstup parseru: string | string[] | null → string[]. */
export function coerceOwnerNames(
  ownerNames?: string | string[] | null,
): string[] {
  if (Array.isArray(ownerNames)) {
    return ownerNames.map((s) => String(s ?? '').trim()).filter(Boolean);
  }
  if (typeof ownerNames === 'string' && ownerNames.trim()) {
    return [ownerNames.trim()];
  }
  return [];
}
