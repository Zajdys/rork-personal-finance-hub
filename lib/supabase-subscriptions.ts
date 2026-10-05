/**
 * Osobní předplatná + ignorované návrhy — zdroj pravdy = Supabase.
 * Jednorázová migrace z AsyncStorage klíčů finance_subscriptions /
 * ignored_detected_subscriptions.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { normalizeMerchantKey } from '@/lib/normalize-merchant-key';
import {
  resolveSubscriptionBrand,
  SUBSCRIPTION_CATEGORY,
} from '@/lib/subscription-brands';
import { amountsWithinTolerance } from '@/lib/subscription-detect';
import type {
  SubscriptionFrequency,
  SubscriptionItem,
  SubscriptionSource,
} from '@/store/finance-store';

export const FINANCE_SUBSCRIPTIONS_KEY = 'finance_subscriptions';
export const IGNORED_DETECTED_SUBSCRIPTIONS_KEY = 'ignored_detected_subscriptions';

export type IgnoredSubscriptionSuggestion = {
  id: string;
  merchantKey: string;
  amount: number;
  currency: string;
  displayName?: string | null;
};

export type MonthlySubscriptionRow = {
  id: string;
  user_id: string;
  name: string;
  amount: number;
  currency: string;
  frequency: string;
  next_payment_date: string | null;
  due_day: number | null;
  category: string;
  merchant_key: string | null;
  source: string;
  active: boolean;
  paused: boolean;
  created_at?: string;
  updated_at?: string;
};

export type IgnoredSubscriptionSuggestionRow = {
  id: string;
  user_id: string;
  merchant_key: string;
  amount: number;
  currency: string;
  display_name: string | null;
  created_at?: string;
};

function asFrequency(v: unknown): SubscriptionFrequency {
  return v === 'yearly' ? 'yearly' : 'monthly';
}

function asSource(v: unknown): SubscriptionSource {
  return v === 'bank' ? 'bank' : 'manual';
}

export function merchantKeyForSubscriptionName(name: string): string {
  const brand = resolveSubscriptionBrand(name);
  if (brand) return brand.key;
  return normalizeMerchantKey(name) || name.trim().toUpperCase();
}

/** Zjevně ne-digitální „předplatná“ z dřívějšího importu (energie apod.). */
export function isNonDigitalSubscriptionJunk(name: string): boolean {
  const n = String(name ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
  if (!n) return false;
  if (resolveSubscriptionBrand(name)) return false;
  return (
    /muj\.?cez/.test(n) ||
    /\bcez\b/.test(n) ||
    /hajek\s*jan/.test(n) ||
    /ceske\s*drahy/.test(n) ||
    /\bautobus/.test(n)
  );
}

export function subscriptionToRow(
  sub: SubscriptionItem,
  userId: string,
): MonthlySubscriptionRow {
  const merchantKey =
    (sub.merchantKey && String(sub.merchantKey).trim()) ||
    merchantKeyForSubscriptionName(sub.name);
  const dueDay =
    Number.isFinite(sub.dayOfMonth) && sub.dayOfMonth >= 1 && sub.dayOfMonth <= 31
      ? Math.floor(sub.dayOfMonth)
      : null;
  return {
    id: String(sub.id),
    user_id: userId,
    name: sub.name.trim(),
    amount: Number(sub.amount) || 0,
    currency: (sub.currency || 'CZK').trim().toUpperCase() || 'CZK',
    frequency: asFrequency(sub.frequency),
    next_payment_date: sub.nextPaymentDate ?? null,
    due_day: dueDay,
    category: sub.category?.trim() || SUBSCRIPTION_CATEGORY,
    merchant_key: merchantKey || null,
    source: asSource(sub.source),
    active: sub.active !== false,
    paused: Boolean(sub.paused),
  };
}

export function rowToSubscription(row: MonthlySubscriptionRow): SubscriptionItem {
  return {
    id: String(row.id),
    name: row.name,
    amount: Number(row.amount) || 0,
    currency: (row.currency || 'CZK').toUpperCase(),
    frequency: asFrequency(row.frequency),
    category: row.category || SUBSCRIPTION_CATEGORY,
    dayOfMonth: row.due_day != null && row.due_day >= 1 ? Number(row.due_day) : 1,
    nextPaymentDate: row.next_payment_date,
    merchantKey: row.merchant_key,
    source: asSource(row.source),
    active: row.active !== false,
    paused: Boolean(row.paused),
  };
}

export function rowToIgnored(
  row: IgnoredSubscriptionSuggestionRow,
): IgnoredSubscriptionSuggestion {
  return {
    id: String(row.id),
    merchantKey: row.merchant_key,
    amount: Number(row.amount) || 0,
    currency: (row.currency || 'CZK').toUpperCase(),
    displayName: row.display_name,
  };
}

export type ParseLocalResult<T> =
  | { ok: true; items: T[] }
  | { ok: false; items: T[]; error: string };

/** Parsuje lokální JSON bez junk filtru (amount > 0). */
export function parseLocalSubscriptionsJson(
  raw: string | null,
): ParseLocalResult<SubscriptionItem> {
  if (raw == null) return { ok: true, items: [] };
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return { ok: false, items: [], error: 'not an array' };
    }
    const items = parsed
      .filter((s) => s && typeof s === 'object')
      .map((s: Record<string, unknown>) => {
        const name = String(s.name ?? '').trim() || 'Předplatné';
        return {
          id: String(s.id ?? `legacy-${Date.now()}`),
          name,
          amount: Number(s.amount) || 0,
          currency: typeof s.currency === 'string' ? s.currency : 'CZK',
          frequency: asFrequency(s.frequency),
          category: String(s.category ?? SUBSCRIPTION_CATEGORY),
          dayOfMonth: Number(s.dayOfMonth) || 1,
          nextPaymentDate:
            typeof s.nextPaymentDate === 'string' ? s.nextPaymentDate : null,
          merchantKey:
            typeof s.merchantKey === 'string'
              ? s.merchantKey
              : merchantKeyForSubscriptionName(name),
          source: asSource(s.source),
          active: s.active !== false,
          paused: Boolean(s.paused),
        } satisfies SubscriptionItem;
      })
      .filter((s) => s.amount > 0);
    return { ok: true, items };
  } catch (e) {
    return {
      ok: false,
      items: [],
      error: e instanceof Error ? e.message : 'parse failed',
    };
  }
}

export function filterDigitalSubscriptionsForMigrate(
  items: SubscriptionItem[],
): SubscriptionItem[] {
  return items.filter((s) => !isNonDigitalSubscriptionJunk(s.name));
}

/** Legacy AsyncStorage: `detected-${key}` / `detected-${key}-${amount}`. */
export function parseLocalIgnoredIdsJson(
  raw: string | null,
): ParseLocalResult<{ merchantKey: string; amount: number; displayName?: string }> {
  if (raw == null) return { ok: true, items: [] };
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return { ok: false, items: [], error: 'not an array' };
    }
    const out: Array<{ merchantKey: string; amount: number; displayName?: string }> = [];
    for (const x of parsed) {
      if (typeof x !== 'string') continue;
      const m = /^detected-(.+?)(?:-(\d+(?:\.\d+)?))?$/.exec(x.trim());
      if (!m) continue;
      const rawKey = m[1]!.trim();
      const brand = resolveSubscriptionBrand(rawKey);
      const merchantKey = brand ? brand.key : normalizeMerchantKey(rawKey) || rawKey.toUpperCase();
      const amount = m[2] != null ? Number(m[2]) : 0;
      out.push({
        merchantKey,
        amount: Number.isFinite(amount) ? amount : 0,
        displayName: brand?.brand.displayName ?? rawKey,
      });
    }
    return { ok: true, items: out };
  } catch (e) {
    return {
      ok: false,
      items: [],
      error: e instanceof Error ? e.message : 'parse failed',
    };
  }
}

export async function fetchSubscriptionsRemote(
  userId: string,
): Promise<{ subscriptions: SubscriptionItem[]; error: Error | null }> {
  const { data, error } = await supabase
    .from('monthly_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) return { subscriptions: [], error: new Error(error.message) };
  const subscriptions = ((data ?? []) as MonthlySubscriptionRow[])
    .map(rowToSubscription)
    .filter((s) => !isNonDigitalSubscriptionJunk(s.name));
  return { subscriptions, error: null };
}

export async function upsertSubscriptionsRemote(
  subscriptions: SubscriptionItem[],
  userId: string,
): Promise<{ error: Error | null; upsertedCount: number }> {
  if (!subscriptions.length) return { error: null, upsertedCount: 0 };
  const rows = subscriptions.map((s) => subscriptionToRow(s, userId));
  const { data, error } = await supabase
    .from('monthly_subscriptions')
    .upsert(rows, { onConflict: 'id' })
    .select('id');
  if (error) return { error: new Error(error.message), upsertedCount: 0 };
  return { error: null, upsertedCount: (data ?? []).length };
}

export async function deleteSubscriptionRemote(
  id: string,
  userId: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('monthly_subscriptions')
    .delete()
    .eq('user_id', userId)
    .eq('id', id);
  if (error) return { error: new Error(error.message) };
  return { error: null };
}

export async function fetchIgnoredSuggestionsRemote(
  userId: string,
): Promise<{ ignored: IgnoredSubscriptionSuggestion[]; error: Error | null }> {
  const { data, error } = await supabase
    .from('ignored_subscription_suggestions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) return { ignored: [], error: new Error(error.message) };
  const ignored = ((data ?? []) as IgnoredSubscriptionSuggestionRow[]).map(rowToIgnored);
  return { ignored, error: null };
}

export async function upsertIgnoredSuggestionRemote(
  userId: string,
  input: {
    merchantKey: string;
    amount: number;
    currency?: string;
    displayName?: string | null;
  },
): Promise<{ ignored: IgnoredSubscriptionSuggestion | null; error: Error | null }> {
  const currency = (input.currency || 'CZK').toUpperCase();
  const row = {
    user_id: userId,
    merchant_key: input.merchantKey.trim(),
    amount: Number(input.amount) || 0,
    currency,
    display_name: input.displayName?.trim() || null,
  };
  const { data, error } = await supabase
    .from('ignored_subscription_suggestions')
    .upsert(row, { onConflict: 'user_id,merchant_key,amount,currency' })
    .select('*')
    .maybeSingle();
  if (error) return { ignored: null, error: new Error(error.message) };
  return {
    ignored: data ? rowToIgnored(data as IgnoredSubscriptionSuggestionRow) : null,
    error: null,
  };
}

export async function deleteIgnoredSuggestionRemote(
  id: string,
  userId: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('ignored_subscription_suggestions')
    .delete()
    .eq('user_id', userId)
    .eq('id', id);
  if (error) return { error: new Error(error.message) };
  return { error: null };
}

export function isIgnoredSuggestionMatch(
  ignored: IgnoredSubscriptionSuggestion[],
  merchantKey: string,
  amount: number,
): boolean {
  const key = merchantKey.trim().toUpperCase();
  return ignored.some(
    (i) =>
      i.merchantKey.trim().toUpperCase() === key &&
      amountsWithinTolerance(i.amount, amount),
  );
}

export function matchesExistingSubscription(
  subscriptions: SubscriptionItem[],
  merchantKey: string,
  name: string,
  amount: number,
): boolean {
  const brand = resolveSubscriptionBrand(merchantKey || name);
  const key = brand ? brand.key : normalizeMerchantKey(merchantKey || name);
  const nameKey = brand ? brand.key : normalizeMerchantKey(name);
  return subscriptions.some((s) => {
    const sBrand = resolveSubscriptionBrand(s.merchantKey || s.name);
    const sKey = sBrand
      ? sBrand.key
      : normalizeMerchantKey(s.merchantKey || s.name);
    const same =
      (!!key && sKey === key) ||
      (!!nameKey && sKey === nameKey) ||
      s.name.trim().toLowerCase() === name.trim().toLowerCase();
    if (!same) return false;
    return amountsWithinTolerance(s.amount, amount);
  });
}

/**
 * Jednorázová migrace AsyncStorage → DB, pak načti z DB.
 * Klíč `finance_subscriptions` se maže JEN po úspěšném upsertu
 * (`upsertedCount === filteredCount`). Při chybě / mismatch klíč zůstane.
 * Pozor: `saveData()` nesmí klíč mazat dřív, než proběhne tato migrace.
 */
export async function loadSubscriptionsWithLocalMigration(
  userId: string,
): Promise<{
  subscriptions: SubscriptionItem[];
  ignored: IgnoredSubscriptionSuggestion[];
  error: Error | null;
  migratedSubs: number;
  migratedIgnored: number;
}> {
  const [subsRaw, ignoredRaw] = await Promise.all([
    AsyncStorage.getItem(FINANCE_SUBSCRIPTIONS_KEY),
    AsyncStorage.getItem(IGNORED_DETECTED_SUBSCRIPTIONS_KEY),
  ]);

  let migratedSubs = 0;
  let migratedIgnored = 0;
  let migrateError: Error | null = null;
  /** Lokální fallback, pokud migrace předplatných selhala (klíč zůstává). */
  let localSubsFallback: SubscriptionItem[] | null = null;

  const parsedSubs = parseLocalSubscriptionsJson(subsRaw);
  const localN = parsedSubs.ok ? parsedSubs.items.length : -1;
  const isDev = typeof __DEV__ !== 'undefined' && __DEV__;
  if (isDev) {
    console.log(
      '[subscriptions] AsyncStorage finance_subscriptions',
      subsRaw == null ? 'MISSING' : `present rawLen=${subsRaw.length} localN=${localN}`,
    );
  }

  if (subsRaw != null && parsedSubs.ok) {
    const localAll = parsedSubs.items;
    const filtered = filterDigitalSubscriptionsForMigrate(localAll);
    const localM = filtered.length;

    if (localM > 0) {
      const withIds = filtered.map((s) => {
        const looksUuid =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            s.id,
          );
        return looksUuid ? s : { ...s, id: cryptoRandomUuid() };
      });
      const { error: upErr, upsertedCount } = await upsertSubscriptionsRemote(
        withIds,
        userId,
      );
      const insertedK = upsertedCount;
      const errX = upErr?.message ?? null;
      if (isDev) {
        console.log(
          `[subscriptions] migrate: lokálně N=${localAll.length}, po filtru M=${localM}, vloženo K=${insertedK}, chyba X=${errX ?? 'null'}`,
        );
      }
      // Porovnávej počet AŽ po filtru (M), ne před ním (N)
      if (upErr || insertedK !== localM) {
        const msg =
          upErr?.message ||
          `upsert count mismatch: got ${insertedK}, expected ${localM} (after junk filter; localN=${localAll.length})`;
        console.warn(
          '[subscriptions] local→supabase migrate failed — keeping AsyncStorage key',
          msg,
        );
        migrateError = new Error(msg);
        localSubsFallback = withIds;
        // klíč finance_subscriptions NESMAZAT — „migrace hotová“ jen po úspěchu
      } else {
        migratedSubs = insertedK;
        await AsyncStorage.removeItem(FINANCE_SUBSCRIPTIONS_KEY);
        console.log('[subscriptions] migrated local → supabase', migratedSubs);
      }
    } else if (localAll.length === 0) {
      // Skutečně prázdné pole `[]` — není co migrovat
      if (isDev) {
        console.log(
          `[subscriptions] migrate: lokálně N=0, po filtru M=0, vloženo K=0, chyba X=null (empty key)`,
        );
      }
      await AsyncStorage.removeItem(FINANCE_SUBSCRIPTIONS_KEY);
    } else {
      // N > 0, M = 0 — jen junk (muj.cez…). Klíč smaž až teď (úspěšná „prázdná“ migrace).
      if (isDev) {
        console.log(
          `[subscriptions] migrate: lokálně N=${localAll.length}, po filtru M=0, vloženo K=0, chyba X=null (all junk)`,
        );
      }
      await AsyncStorage.removeItem(FINANCE_SUBSCRIPTIONS_KEY);
    }
  } else if (subsRaw != null && !parsedSubs.ok) {
    if (isDev) {
      console.log(
        `[subscriptions] migrate: lokálně N=?, po filtru M=?, vloženo K=0, chyba X=${parsedSubs.error}`,
      );
    }
    console.warn(
      '[subscriptions] local JSON parse failed — keeping AsyncStorage key',
      parsedSubs.error,
    );
    migrateError = new Error(parsedSubs.error);
  }

  const parsedIgnored = parseLocalIgnoredIdsJson(ignoredRaw);
  if (ignoredRaw != null && parsedIgnored.ok && parsedIgnored.items.length > 0) {
    let okCount = 0;
    let ignErr: Error | null = null;
    for (const item of parsedIgnored.items) {
      if (!item.merchantKey) continue;
      const { ignored: row, error } = await upsertIgnoredSuggestionRemote(userId, {
        merchantKey: item.merchantKey,
        amount: item.amount > 0 ? item.amount : 0.01,
        displayName: item.displayName,
      });
      if (error || !row) {
        ignErr = error ?? new Error('ignored upsert returned no row');
        break;
      }
      okCount += 1;
    }
    const expected = parsedIgnored.items.filter((i) => i.merchantKey).length;
    if (ignErr || okCount !== expected) {
      const msg =
        ignErr?.message ||
        `ignored upsert count mismatch: got ${okCount}, expected ${expected}`;
      console.warn(
        '[subscriptions] ignored local→supabase migrate failed — keeping AsyncStorage key',
        msg,
      );
      migrateError = migrateError ?? new Error(msg);
      // klíč ignored_detected_subscriptions NESMAZAT
    } else {
      migratedIgnored = okCount;
      await AsyncStorage.removeItem(IGNORED_DETECTED_SUBSCRIPTIONS_KEY);
      console.log('[subscriptions] migrated ignored → supabase', migratedIgnored);
    }
  } else if (ignoredRaw != null && parsedIgnored.ok && parsedIgnored.items.length === 0) {
    await AsyncStorage.removeItem(IGNORED_DETECTED_SUBSCRIPTIONS_KEY);
  } else if (ignoredRaw != null && !parsedIgnored.ok) {
    console.warn(
      '[subscriptions] ignored JSON parse failed — keeping AsyncStorage key',
      parsedIgnored.error,
    );
    migrateError = migrateError ?? new Error(parsedIgnored.error);
  }

  const [{ subscriptions, error: subErr }, { ignored, error: ignFetchErr }] =
    await Promise.all([
      fetchSubscriptionsRemote(userId),
      fetchIgnoredSuggestionsRemote(userId),
    ]);

  // Smaž junk i z DB (muj.cez už v DB)
  const junk = (
    await supabase
      .from('monthly_subscriptions')
      .select('id, name')
      .eq('user_id', userId)
  ).data as Array<{ id: string; name: string }> | null;
  if (junk?.length) {
    for (const row of junk) {
      if (!isNonDigitalSubscriptionJunk(row.name)) continue;
      await deleteSubscriptionRemote(row.id, userId);
    }
  }

  const fromDb = subscriptions.filter((s) => !isNonDigitalSubscriptionJunk(s.name));
  const cleaned =
    localSubsFallback && localSubsFallback.length > 0 && fromDb.length === 0
      ? localSubsFallback
      : fromDb;
  const err = migrateError || subErr || ignFetchErr;
  return {
    subscriptions: cleaned,
    ignored,
    error: err,
    migratedSubs,
    migratedIgnored,
  };
}

function cryptoRandomUuid(): string {
  // RN / bun — prefer crypto.randomUUID když je
  try {
    const c = globalThis.crypto as Crypto | undefined;
    if (c?.randomUUID) return c.randomUUID();
  } catch {
    /* ignore */
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
