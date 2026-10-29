/**
 * Katalog a persistence „Rychlých akcí“ na Přehledu.
 * Ukládání: user_profiles.quick_actions (text[]) + AsyncStorage cache.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LucideIcon } from 'lucide-react-native';
import {
  PlusCircle,
  ArrowDownCircle,
  Upload,
  TrendingUp,
  PiggyBank,
  UsersRound,
  Calendar,
  Target,
  Wallet,
  Landmark,
  Repeat,
  CreditCard,
  Tv,
  Users,
  Building2,
  Download,
} from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import type { PremiumFeatureId } from '@/constants/premium';
import type { Href } from 'expo-router';

export type QuickActionId =
  | 'add_expense'
  | 'add_income'
  | 'import'
  | 'investice'
  | 'save'
  | 'split'
  | 'monthly_report'
  | 'plan'
  | 'budgets'
  | 'goals'
  | 'emergency_fund'
  | 'recurring'
  | 'loans'
  | 'subscriptions'
  | 'household'
  | 'bank_accounts'
  | 'export';

export type QuickActionKind = 'route' | 'sheet';

export type QuickActionDef = {
  id: QuickActionId;
  label: string;
  icon: LucideIcon;
  color: string;
  premium: boolean;
  /** Pro paywall u free uživatelů */
  premiumFeature?: PremiumFeatureId;
  kind: QuickActionKind;
  /** Expo route (kind === 'route') */
  route?: Href;
  /** QuickAdd sheet (kind === 'sheet') */
  sheetType?: 'income' | 'expense';
};

/** Akce bez existující routy — záměrně mimo katalog. */
export const QUICK_ACTIONS_SKIPPED_NO_ROUTE = ['categories'] as const;

export const DEFAULT_QUICK_ACTION_IDS: QuickActionId[] = [
  'investice',
  'save',
  'split',
  'monthly_report',
];

export const MAX_QUICK_ACTIONS = 8;

export const QUICK_ACTIONS_CATALOG: QuickActionDef[] = [
  {
    id: 'add_expense',
    label: 'Přidat výdaj',
    icon: PlusCircle,
    color: '#EF4444',
    premium: false,
    kind: 'sheet',
    sheetType: 'expense',
  },
  {
    id: 'add_income',
    label: 'Přidat příjem',
    icon: ArrowDownCircle,
    color: '#10B981',
    premium: false,
    kind: 'sheet',
    sheetType: 'income',
  },
  {
    id: 'import',
    label: 'Nahrát výpis',
    icon: Upload,
    color: '#6366F1',
    premium: false,
    kind: 'route',
    route: '/bank-import',
  },
  {
    id: 'investice',
    label: 'Investice',
    icon: TrendingUp,
    color: '#8B5CF6',
    premium: true,
    premiumFeature: 'investments',
    kind: 'route',
    route: '/investice',
  },
  {
    id: 'save',
    label: 'Ušetři',
    icon: PiggyBank,
    color: '#EC4899',
    premium: true,
    premiumFeature: 'save',
    kind: 'route',
    route: '/save',
  },
  {
    id: 'split',
    label: 'Rozděl útratu',
    icon: UsersRound,
    color: '#14B8A6',
    premium: false,
    kind: 'route',
    route: '/split-groups',
  },
  {
    id: 'monthly_report',
    label: 'Měsíční report',
    icon: Calendar,
    color: '#F59E0B',
    premium: true,
    premiumFeature: 'monthly_report',
    kind: 'route',
    route: '/monthly-report',
  },
  {
    id: 'plan',
    label: 'Plán',
    icon: Target,
    color: '#8B5CF6',
    premium: false,
    kind: 'route',
    route: '/(tabs)/plan',
  },
  {
    id: 'budgets',
    label: 'Rozpočty',
    icon: Wallet,
    color: '#3B82F6',
    premium: true,
    premiumFeature: 'financial_goals',
    kind: 'route',
    route: '/(tabs)/plan',
  },
  {
    id: 'goals',
    label: 'Spořicí cíle',
    icon: Target,
    color: '#10B981',
    premium: true,
    premiumFeature: 'financial_goals',
    kind: 'route',
    route: '/(tabs)/plan',
  },
  {
    id: 'emergency_fund',
    label: 'Rezerva',
    icon: Landmark,
    color: '#059669',
    premium: true,
    premiumFeature: 'financial_goals',
    kind: 'route',
    route: '/reserve-detail',
  },
  {
    id: 'recurring',
    label: 'Pravidelné platby',
    icon: Repeat,
    color: '#6366F1',
    premium: false,
    kind: 'route',
    route: '/personal-recurring',
  },
  {
    id: 'loans',
    label: 'Závazky a úvěry',
    icon: CreditCard,
    color: '#8B5CF6',
    premium: false,
    kind: 'route',
    route: '/loans',
  },
  {
    id: 'subscriptions',
    label: 'Předplatné',
    icon: Tv,
    color: '#F97316',
    premium: true,
    premiumFeature: 'subscriptions',
    kind: 'route',
    // Sekce je na Přehledu — žádná samostatná list obrazovka
    route: '/(tabs)',
  },
  {
    id: 'household',
    label: 'Domácnost',
    icon: Users,
    color: '#0EA5E9',
    premium: true,
    premiumFeature: 'household',
    kind: 'route',
    route: '/(tabs)/household',
  },
  {
    id: 'bank_accounts',
    label: 'Bankovní účty',
    icon: Building2,
    color: '#64748B',
    premium: false,
    kind: 'route',
    route: '/bank-accounts',
  },
  {
    id: 'export',
    label: 'Export dat',
    icon: Download,
    color: '#475569',
    premium: false,
    kind: 'route',
    route: '/privacy-data-management',
  },
];

const CATALOG_BY_ID = new Map(QUICK_ACTIONS_CATALOG.map((a) => [a.id, a]));

const CACHE_KEY = (userId: string) => `quick_actions_v1:${userId}`;

export function getQuickActionDef(id: string): QuickActionDef | undefined {
  return CATALOG_BY_ID.get(id as QuickActionId);
}

export function normalizeQuickActionIds(raw: unknown): QuickActionId[] {
  if (!Array.isArray(raw)) return [...DEFAULT_QUICK_ACTION_IDS];
  const out: QuickActionId[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const id = String(item ?? '').trim();
    if (!id || seen.has(id)) continue;
    if (!CATALOG_BY_ID.has(id as QuickActionId)) continue;
    seen.add(id);
    out.push(id as QuickActionId);
    if (out.length >= MAX_QUICK_ACTIONS) break;
  }
  return out.length > 0 ? out : [...DEFAULT_QUICK_ACTION_IDS];
}

export function resolveQuickActions(ids: QuickActionId[]): QuickActionDef[] {
  return ids.map((id) => CATALOG_BY_ID.get(id)).filter(Boolean) as QuickActionDef[];
}

async function readCache(userId: string): Promise<QuickActionId[] | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY(userId));
    if (!raw) return null;
    return normalizeQuickActionIds(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function writeCache(userId: string, ids: QuickActionId[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY(userId), JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

/**
 * Nejdřív cache (rychlé UI), pak sync ze Supabase.
 */
export async function loadQuickActionIds(userId: string): Promise<{
  ids: QuickActionId[];
  fromCache: boolean;
}> {
  const cached = await readCache(userId);
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('quick_actions')
      .eq('user_id', userId)
      .maybeSingle();
    if (!error && data) {
      const remote = data.quick_actions;
      if (remote == null) {
        // sloupec prázdný → výchozí (nebo cache)
        const ids = cached ?? [...DEFAULT_QUICK_ACTION_IDS];
        await writeCache(userId, ids);
        return { ids, fromCache: Boolean(cached) };
      }
      const ids = normalizeQuickActionIds(remote);
      await writeCache(userId, ids);
      return { ids, fromCache: false };
    }
  } catch (e) {
    console.warn('[quick-actions] load remote', e);
  }
  const ids = cached ?? [...DEFAULT_QUICK_ACTION_IDS];
  return { ids, fromCache: true };
}

export async function saveQuickActionIds(
  userId: string,
  ids: QuickActionId[],
): Promise<{ error: Error | null }> {
  const normalized = normalizeQuickActionIds(ids);
  await writeCache(userId, normalized);

  const { data, error } = await supabase
    .from('user_profiles')
    .update({ quick_actions: normalized })
    .eq('user_id', userId)
    .select('user_id')
    .maybeSingle();

  if (!error && data) return { error: null };

  const { error: upErr } = await supabase.from('user_profiles').upsert({
    id: userId,
    user_id: userId,
    quick_actions: normalized,
  });
  return { error: upErr ? new Error(upErr.message) : null };
}
