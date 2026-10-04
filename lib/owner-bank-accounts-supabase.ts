/**
 * Vlastní bankovní účty — Supabase = zdroj pravdy.
 * UI zůstává bank → účty (sloupec `bank`, klient seskupuje).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { normalizeAccount } from '@/utils/normalizeAccount';
import { randomUUID } from '@/lib/random-uuid';
import {
  OWNER_BANKS_ASYNC_KEY,
  OWNER_ACCOUNTS_ASYNC_KEY,
  parseOwnerBanksJson,
  parseOwnerAccountsJson,
  serializeOwnerBanksForStorage,
  type OwnerBankStored,
  type OwnerBankAccountStored,
  type OwnerAccountStored,
} from '@/lib/owner-accounts-storage';
import { resolveOwnerBankName } from '@/lib/cz-bank-codes';

const LEGACY_OWNER_ACCOUNT_RB_KEY = 'ownerAccount_raiffeisenbank';
const LEGACY_OWNER_ACCOUNT_CSOB_KEY = 'ownerAccount_csob';

export type OwnerBankAccountRow = {
  id: string;
  user_id: string;
  bank: string | null;
  account_label: string | null;
  holder_name: string | null;
  account_number: string;
  account_number_normalized: string;
  created_at?: string;
  updated_at?: string;
};

/** Flat řádek pro sync (bez normalized — plní DB trigger). */
export type OwnerBankAccountWrite = {
  bank: string;
  account_label: string;
  holder_name: string | null;
  account_number: string;
};

function migrateFlatToBanks(rows: OwnerAccountStored[]): OwnerBankStored[] {
  const groups = new Map<string, OwnerAccountStored[]>();
  for (const row of rows) {
    const key = row.name.trim() || 'Neznámá banka';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }
  const banks: OwnerBankStored[] = [];
  for (const [bankName, list] of groups) {
    banks.push({
      id: randomUUID(),
      bankName,
      accounts: list.map((a) => ({
        id: randomUUID(),
        label: 'Běžný účet',
        number: a.number.trim(),
      })),
    });
  }
  return banks;
}

/** Jen lokální AsyncStorage (pro jednorázovou migraci) — nic nezapisuje. */
export async function readLocalOwnerBanksForMigration(): Promise<OwnerBankStored[]> {
  const rawBanks = await AsyncStorage.getItem(OWNER_BANKS_ASYNC_KEY);
  let banks = parseOwnerBanksJson(rawBanks);
  if (banks.length > 0) return banks;

  let old = parseOwnerAccountsJson(await AsyncStorage.getItem(OWNER_ACCOUNTS_ASYNC_KEY));
  if (old.length === 0) {
    const [rb, csob] = await Promise.all([
      AsyncStorage.getItem(LEGACY_OWNER_ACCOUNT_RB_KEY),
      AsyncStorage.getItem(LEGACY_OWNER_ACCOUNT_CSOB_KEY),
    ]);
    const legacy: OwnerAccountStored[] = [];
    if (rb?.trim()) legacy.push({ name: 'Raiffeisenbank', number: rb.trim() });
    if (csob?.trim()) legacy.push({ name: 'ČSOB', number: csob.trim() });
    old = legacy;
  }
  if (old.length === 0) return [];
  return migrateFlatToBanks(old);
}

async function clearLocalOwnerBankKeys(): Promise<void> {
  await AsyncStorage.multiRemove([
    OWNER_BANKS_ASYNC_KEY,
    OWNER_ACCOUNTS_ASYNC_KEY,
    LEGACY_OWNER_ACCOUNT_RB_KEY,
    LEGACY_OWNER_ACCOUNT_CSOB_KEY,
  ]);
}

/** DB řádky → hierarchie bank → účty (stabilní id banky = název banky). */
export function rowsToOwnerBanks(rows: OwnerBankAccountRow[]): OwnerBankStored[] {
  const order: string[] = [];
  const map = new Map<string, OwnerBankAccountStored[]>();
  for (const r of rows) {
    const bankName = resolveOwnerBankName(r.account_number, r.bank);
    if (!map.has(bankName)) {
      map.set(bankName, []);
      order.push(bankName);
    }
    map.get(bankName)!.push({
      id: r.id,
      label: (r.account_label ?? '').trim() || 'Účet',
      number: r.account_number,
    });
  }
  return order.map((bankName) => ({
    id: bankName,
    bankName,
    accounts: map.get(bankName)!,
  }));
}

export function ownerBanksToWrites(banks: OwnerBankStored[]): OwnerBankAccountWrite[] {
  const payload = serializeOwnerBanksForStorage(banks);
  const out: OwnerBankAccountWrite[] = [];
  const seen = new Set<string>();
  for (const b of payload) {
    for (const a of b.accounts) {
      const number = a.number.trim();
      if (!number) continue;
      const norm = (normalizeAccount(number) || number.replace(/\s+/g, '')).toLowerCase();
      if (!norm || seen.has(norm)) continue;
      seen.add(norm);
      out.push({
        bank: resolveOwnerBankName(number, b.bankName),
        account_label: a.label.trim() || 'Účet',
        holder_name: null,
        account_number: number,
      });
    }
  }
  return out;
}

export async function fetchOwnerBankAccountsRemote(
  userId: string,
): Promise<{ rows: OwnerBankAccountRow[]; error: Error | null }> {
  const { data, error } = await supabase
    .from('owner_bank_accounts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) return { rows: [], error: new Error(error.message) };
  return { rows: (data ?? []) as OwnerBankAccountRow[], error: null };
}

/**
 * Upsert podle (user_id, account_number_normalized) + smazání odebraných.
 * Jeden bulk upsert + jeden delete (.in id).
 * Normalized v payloadu je jen pro onConflict (stejný algoritmus jako DB);
 * BEFORE trigger ho stejně přepíše z account_number.
 */
export async function syncOwnerBankAccountsRemote(
  userId: string,
  banks: OwnerBankStored[],
): Promise<{ banks: OwnerBankStored[]; error: Error | null }> {
  const desired = ownerBanksToWrites(banks);
  const { rows: existing, error: fetchErr } = await fetchOwnerBankAccountsRemote(userId);
  if (fetchErr) return { banks: [], error: fetchErr };

  const desiredNorms = new Set<string>();
  const upsertRows: {
    user_id: string;
    bank: string;
    account_label: string;
    holder_name: string | null;
    account_number: string;
    account_number_normalized: string;
  }[] = [];

  for (const d of desired) {
    const norm = normalizeAccount(d.account_number) || d.account_number.replace(/\s+/g, '').trim();
    if (!norm) continue;
    const key = norm.toLowerCase();
    if (desiredNorms.has(key)) continue;
    desiredNorms.add(key);
    upsertRows.push({
      user_id: userId,
      bank: d.bank,
      account_label: d.account_label,
      holder_name: d.holder_name,
      account_number: d.account_number,
      account_number_normalized: norm,
    });
  }

  const removedIds = existing
    .filter((r) => {
      const key = (r.account_number_normalized || normalizeAccount(r.account_number) || '').toLowerCase();
      return !key || !desiredNorms.has(key);
    })
    .map((r) => r.id);

  if (upsertRows.length > 0) {
    const { error } = await supabase.from('owner_bank_accounts').upsert(upsertRows, {
      onConflict: 'user_id,account_number_normalized',
    });
    if (error) return { banks: [], error: new Error(error.message) };
  }

  if (removedIds.length > 0) {
    const { error } = await supabase
      .from('owner_bank_accounts')
      .delete()
      .eq('user_id', userId)
      .in('id', removedIds);
    if (error) return { banks: [], error: new Error(error.message) };
  }

  const { rows, error } = await fetchOwnerBankAccountsRemote(userId);
  if (error) return { banks: [], error };
  return { banks: rowsToOwnerBanks(rows), error: null };
}

/**
 * Jednorázová migrace: lokální OWNER_BANKS_ASYNC_KEY (+ legacy) → DB → smazat klíče.
 * Pak vždy načte z DB.
 */
export async function loadOwnerBanksWithLocalMigration(
  userId: string,
): Promise<{ banks: OwnerBankStored[]; error: Error | null; migrated: number }> {
  const local = await readLocalOwnerBanksForMigration();
  const localAccounts = local.reduce((n, b) => n + b.accounts.filter((a) => a.number.trim()).length, 0);
  let migrated = 0;

  if (localAccounts > 0) {
    const { error: syncErr } = await syncOwnerBankAccountsRemote(userId, local);
    if (syncErr) {
      console.warn('[owner-banks] local→supabase migrate failed', syncErr.message);
      return { banks: local, error: syncErr, migrated: 0 };
    }
    migrated = localAccounts;
    await clearLocalOwnerBankKeys();
    console.log('[owner-banks] migrated local → supabase', migrated);
  } else {
    const raw = await AsyncStorage.getItem(OWNER_BANKS_ASYNC_KEY);
    if (raw != null) await clearLocalOwnerBankKeys();
  }

  const { rows, error } = await fetchOwnerBankAccountsRemote(userId);
  if (error) return { banks: migrated > 0 ? [] : local, error, migrated };
  return { banks: rowsToOwnerBanks(rows), error: null, migrated };
}
