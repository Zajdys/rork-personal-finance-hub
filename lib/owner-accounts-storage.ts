import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from '@/lib/random-uuid';
import { normalizeAccount } from '@/utils/normalizeAccount';
import { getAuthUserId } from '@/lib/supabase-transactions';
import {
  loadOwnerBanksWithLocalMigration,
  readLocalOwnerBanksForMigration,
  syncOwnerBankAccountsRemote,
} from '@/lib/owner-bank-accounts-supabase';
import { resolveOwnerBankName } from '@/lib/cz-bank-codes';

/**
 * Legacy AsyncStorage klíč — jen jednorázová migrace do Supabase
 * (`loadOwnerBanksWithLocalMigration` klíč smaže).
 */
export const OWNER_BANKS_ASYNC_KEY = 'ownerBanks';

/** Legacy klíč (flat { name, number }[]) — pouze pro migraci. */
export const OWNER_ACCOUNTS_ASYNC_KEY = 'ownerAccounts';

/** Uživatel viděl / přeskočil prompt „vlastní účty“ před importem. */
export const OWNER_ACCOUNTS_IMPORT_PROMPT_KEY = 'ownerAccountsImportPromptDone';

/** Odmítnuté návrhy vlastních účtů (compact keys). */
export const OWNER_ACCOUNTS_DISMISSED_SUGGESTIONS_KEY = 'ownerAccountsDismissedSuggestions';

export type OwnerBankAccountStored = { id: string; label: string; number: string };

export type OwnerBankStored = { id: string; bankName: string; accounts: OwnerBankAccountStored[] };

/** Legacy typ pro migraci. */
export type OwnerAccountStored = { name: string; number: string };

export const BANK_NAME_PRESETS = [
  'Raiffeisenbank',
  'ČSOB',
  'Komerční banka',
  'Česká spořitelna',
  'Moneta Money Bank',
  'Fio banka',
  'Air Bank',
  'mBank',
  'Revolut',
] as const;

export function parseOwnerAccountsJson(raw: string | null): OwnerAccountStored[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: OwnerAccountStored[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const o = item as Record<string, unknown>;
      const name = typeof o.name === 'string' ? o.name.trim() : '';
      const number = typeof o.number === 'string' ? o.number.trim() : '';
      if (number) out.push({ name, number });
    }
    return out;
  } catch {
    return [];
  }
}

export function parseOwnerBanksJson(raw: string | null): OwnerBankStored[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: OwnerBankStored[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const o = item as Record<string, unknown>;
      const id = typeof o.id === 'string' && o.id.trim() ? o.id.trim() : randomUUID();
      const bankName = typeof o.bankName === 'string' ? o.bankName.trim() : '';
      if (!bankName) continue;
      const accRaw = o.accounts;
      const accounts: OwnerBankAccountStored[] = [];
      if (Array.isArray(accRaw)) {
        for (const a of accRaw) {
          if (!a || typeof a !== 'object') continue;
          const ao = a as Record<string, unknown>;
          const aid = typeof ao.id === 'string' && ao.id.trim() ? ao.id.trim() : randomUUID();
          const label = typeof ao.label === 'string' ? ao.label.trim() : '';
          const number = typeof ao.number === 'string' ? ao.number.trim() : '';
          accounts.push({
            id: aid,
            label: label || 'Účet',
            number,
          });
        }
      }
      out.push({ id, bankName, accounts });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Načte vlastní účty ze Supabase (DB = zdroj pravdy).
 * Jednorázově nahraje lokální OWNER_BANKS_ASYNC_KEY / legacy a klíč smaže.
 */
export async function loadOwnerBanksFromStorage(): Promise<OwnerBankStored[]> {
  const userId = await getAuthUserId();
  if (!userId) {
    return readLocalOwnerBanksForMigration();
  }
  const { banks, error } = await loadOwnerBanksWithLocalMigration(userId);
  if (error && banks.length === 0) {
    console.warn('[owner-banks] load failed', error.message);
    return [];
  }
  if (error) console.warn('[owner-banks] load warning', error.message);
  return banks;
}

/** Flat pole všech čísel účtů (bez mezer), unikátní — pro PDF import / Edge. */
export function getAllOwnerAccountNumbers(banks: OwnerBankStored[]): string[] {
  const nums: string[] = [];
  for (const b of banks) {
    for (const a of b.accounts) {
      const n = a.number.replace(/\s+/g, '').trim();
      if (n) nums.push(n);
    }
  }
  return [...new Set(nums)];
}

/** @deprecated Použij `getAllOwnerAccountNumbers` nad `OwnerBankStored[]`. */
export function ownerAccountNumbersFromStored(list: OwnerAccountStored[]): string[] {
  const nums = list
    .map((x) => x.number.replace(/\s+/g, '').trim())
    .filter((n) => n.length > 0);
  return [...new Set(nums)];
}

export function serializeOwnerBanksForStorage(banks: OwnerBankStored[]): OwnerBankStored[] {
  return banks
    .map((b) => ({
      id: b.id,
      bankName: b.bankName.trim(),
      accounts: b.accounts
        .map((a) => ({
          id: a.id,
          label: a.label.trim(),
          number: a.number.trim(),
        }))
        .filter((a) => a.number.length > 0),
    }))
    .filter((b) => b.bankName.length > 0);
}

export async function markOwnerAccountsImportPromptDone(): Promise<void> {
  await AsyncStorage.setItem(OWNER_ACCOUNTS_IMPORT_PROMPT_KEY, '1');
}

export async function isOwnerAccountsImportPromptDone(): Promise<boolean> {
  const v = await AsyncStorage.getItem(OWNER_ACCOUNTS_IMPORT_PROMPT_KEY);
  return v === '1' || v === 'true';
}

/** Má se před výběrem souboru ukázat prompt na vlastní účty? */
export async function shouldShowOwnerAccountsImportPrompt(): Promise<boolean> {
  const banks = await loadOwnerBanksFromStorage();
  if (getAllOwnerAccountNumbers(banks).length > 0) return false;
  if (await isOwnerAccountsImportPromptDone()) return false;
  return true;
}

export async function loadDismissedOwnAccountSuggestions(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(OWNER_ACCOUNTS_DISMISSED_SUGGESTIONS_KEY);
    if (!raw?.trim()) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
  } catch {
    return [];
  }
}

export async function addDismissedOwnAccountSuggestions(keys: string[]): Promise<void> {
  if (!keys.length) return;
  const prev = await loadDismissedOwnAccountSuggestions();
  const next = [...new Set([...prev, ...keys.map((k) => k.trim()).filter(Boolean)])];
  await AsyncStorage.setItem(OWNER_ACCOUNTS_DISMISSED_SUGGESTIONS_KEY, JSON.stringify(next));
}

/** Přidá účty (seskupí podle odvozené / zadané banky) a uloží do Supabase. */
export async function appendOwnerAccountsToStorage(
  entries: { number: string; label: string }[],
  bankNameFallback: string,
): Promise<OwnerBankStored[]> {
  if (!entries.length) return loadOwnerBanksFromStorage();
  const userId = await getAuthUserId();
  if (!userId) throw new Error('Nepřihlášen');

  let next: OwnerBankStored[] = (await loadOwnerBanksFromStorage()).map((b) => ({
    ...b,
    accounts: [...b.accounts],
  }));
  const existing = new Set(
    getAllOwnerAccountNumbers(next).map((n) => (normalizeAccount(n) || n).toLowerCase()),
  );

  for (const e of entries) {
    const number = e.number.trim();
    if (!number) continue;
    const n = (normalizeAccount(number) || number.replace(/\s+/g, '')).toLowerCase();
    if (!n || existing.has(n)) continue;
    existing.add(n);

    const bankName = resolveOwnerBankName(number, bankNameFallback);
    let bank = next.find((b) => b.bankName === bankName || b.id === bankName);
    if (!bank) {
      bank = { id: bankName, bankName, accounts: [] };
      next = [...next, bank];
    }
    bank.accounts.push({
      id: randomUUID(),
      label: e.label.trim() || 'Účet',
      number,
    });
  }

  const { banks: saved, error } = await syncOwnerBankAccountsRemote(userId, next);
  if (error) throw error;
  return saved;
}

/** Odebere vlastní účty podle čísla (normalizovaná shoda) a uloží do Supabase. */
export async function removeOwnerAccountsFromStorage(
  accountNumbers: string[],
): Promise<{ removed: number; banks: OwnerBankStored[] }> {
  if (!accountNumbers.length) {
    return { removed: 0, banks: await loadOwnerBanksFromStorage() };
  }
  const userId = await getAuthUserId();
  if (!userId) return { removed: 0, banks: [] };
  const wanted = new Set(
    accountNumbers
      .map((a) => normalizeAccount(a) || a.replace(/\s+/g, ''))
      .filter(Boolean)
      .map((a) => a.toLowerCase()),
  );
  const banks = await loadOwnerBanksFromStorage();
  let removed = 0;
  const next = banks.map((b) => {
    const accounts = b.accounts.filter((acc) => {
      const n = (normalizeAccount(acc.number) || acc.number).toLowerCase();
      if (wanted.has(n) || [...wanted].some((w) => n.includes(w) || w.includes(n))) {
        removed += 1;
        return false;
      }
      return true;
    });
    return { ...b, accounts };
  });
  if (removed > 0) {
    const { banks: saved, error } = await syncOwnerBankAccountsRemote(userId, next);
    if (error) throw error;
    return { removed, banks: saved };
  }
  return { removed: 0, banks };
}
