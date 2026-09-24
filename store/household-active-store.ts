import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { hasSupabaseSession, logSupabaseDataError } from '@/lib/supabase-session';

const STORAGE_KEY_PREFIX = 'active_household_id';

export type UserHousehold = {
  id: string;
  name: string;
  /** 6místný invite kód z `households.invite_code` (camelCase v appce). */
  inviteCode: string | null;
  /** Zakladatel domácnosti (`households.created_by`). */
  createdBy: string | null;
};

const HOUSEHOLD_EMOJIS = ['🏠', '🏡', '🏢', '🛋️', '💼', '🌿', '✨', '🏘️'] as const;

export function householdEmoji(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash + id.charCodeAt(i)) % HOUSEHOLD_EMOJIS.length;
  }
  return HOUSEHOLD_EMOJIS[hash]!;
}

function storageKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}_${userId}`;
}

function pickInviteCode(household: Record<string, unknown>): string | null {
  const raw = household.invite_code ?? household.inviteCode;
  if (raw == null) return null;
  const s = String(raw).trim();
  return s.length > 0 ? s : null;
}

function mapHouseholdRow(row: Record<string, unknown>): UserHousehold {
  const join = row.households ?? row.household;
  const h = Array.isArray(join) ? join[0] : join;
  const household = (h && typeof h === 'object' ? h : {}) as Record<string, unknown>;
  return {
    id: String(row.household_id ?? household.id ?? ''),
    name: String(household.name ?? 'Domácnost'),
    inviteCode: pickInviteCode(household),
    createdBy:
      household.created_by != null
        ? String(household.created_by)
        : household.createdBy != null
          ? String(household.createdBy)
          : null,
  };
}

interface HouseholdActiveState {
  activeHouseholdId: string | null;
  households: UserHousehold[];
  isHydrated: boolean;
  hydrate: (userId: string) => Promise<void>;
  fetchHouseholds: (userId: string) => Promise<UserHousehold[]>;
  /** Načte invite_code přímo z `households` (fallback, když embed v seznamu chybí). */
  fetchInviteCode: (householdId: string) => Promise<string | null>;
  setActiveHouseholdId: (userId: string, householdId: string | null) => Promise<void>;
  updateHouseholdName: (householdId: string, name: string) => void;
  patchHousehold: (householdId: string, patch: Partial<UserHousehold>) => void;
  reset: () => void;
}

export const useHouseholdActiveStore = create<HouseholdActiveState>((set, get) => ({
  activeHouseholdId: null,
  households: [],
  isHydrated: false,

  hydrate: async (userId) => {
    try {
      const stored = await AsyncStorage.getItem(storageKey(userId));
      set({ activeHouseholdId: stored || null, isHydrated: true });
    } catch (e) {
      console.warn('[household-active] hydrate', e);
      set({ isHydrated: true });
    }
  },

  fetchHouseholds: async (userId) => {
    if (!userId || !(await hasSupabaseSession())) {
      return get().households;
    }

    const { data, error } = await supabase
      .from('household_members')
      .select('household_id, households(id, name, invite_code, created_by)')
      .eq('user_id', userId);

    if (error) {
      logSupabaseDataError('[household-active] fetchHouseholds', error);
      return get().households;
    }

    console.log('[household-active] fetchHouseholds raw', JSON.stringify(data));

    const households: UserHousehold[] = (data ?? []).map((row) =>
      mapHouseholdRow(row as Record<string, unknown>),
    );

    console.log('[household-active] fetchHouseholds mapped', households);

    set({ households });

    const { activeHouseholdId } = get();
    if (activeHouseholdId && !households.some((h) => h.id === activeHouseholdId)) {
      await get().setActiveHouseholdId(userId, households[0]?.id ?? null);
    } else if (!activeHouseholdId && households.length > 0) {
      await get().setActiveHouseholdId(userId, households[0]!.id);
    }

    return households;
  },

  fetchInviteCode: async (householdId) => {
    if (!(await hasSupabaseSession())) return null;
    const { data, error } = await supabase
      .from('households')
      .select('invite_code')
      .eq('id', householdId)
      .maybeSingle();
    if (error) {
      logSupabaseDataError('[household-active] fetchInviteCode', error);
      return null;
    }
    const code = data?.invite_code != null ? String(data.invite_code).trim() : '';
    return code.length > 0 ? code : null;
  },

  setActiveHouseholdId: async (userId, householdId) => {
    set({ activeHouseholdId: householdId });
    try {
      if (householdId) {
        await AsyncStorage.setItem(storageKey(userId), householdId);
      } else {
        await AsyncStorage.removeItem(storageKey(userId));
      }
    } catch (e) {
      console.warn('[household-active] persist', e);
    }
  },

  updateHouseholdName: (householdId, name) => {
    set((state) => ({
      households: state.households.map((h) => (h.id === householdId ? { ...h, name } : h)),
    }));
  },

  patchHousehold: (householdId, patch) => {
    set((state) => ({
      households: state.households.map((h) => (h.id === householdId ? { ...h, ...patch } : h)),
    }));
  },

  reset: () => set({ activeHouseholdId: null, households: [], isHydrated: false }),
}));
