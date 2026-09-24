import { supabase } from '@/lib/supabase';
import { hasSupabaseSession, isSessionLostError } from '@/lib/supabase-session';

export type HouseholdMemberProfile = {
  userId: string;
  /** Křestní jméno z user_profiles, jinak e-mail / display_name. */
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  firstName: string | null;
};

function pickDisplayName(opts: {
  firstName: string | null;
  displayName: string | null;
  email: string | null;
  fallback: string;
}): string {
  const first = (opts.firstName ?? '').trim();
  if (first) return first.split(/\s+/)[0] ?? first;
  const dn = (opts.displayName ?? '').trim();
  if (dn) return dn.split(/\s+/)[0] ?? dn;
  const email = (opts.email ?? '').trim();
  if (email) return email;
  return opts.fallback;
}

/** Členové domácnosti s profilem (first_name + avatar). */
export async function fetchHouseholdMembersWithProfiles(
  householdId: string,
  fallbackLabel = 'Člen',
): Promise<{ members: HouseholdMemberProfile[]; error: Error | null }> {
  if (!householdId || !(await hasSupabaseSession())) {
    return { members: [], error: null };
  }

  const { data, error } = await supabase
    .from('household_members')
    .select('user_id, users(id, display_name, email)')
    .eq('household_id', householdId);

  if (error) {
    if (isSessionLostError(error)) return { members: [], error: null };
    return { members: [], error: new Error(error.message) };
  }

  const rows = (data ?? []) as {
    user_id: string;
    users?:
      | { id?: string; display_name?: string | null; email?: string | null }
      | { id?: string; display_name?: string | null; email?: string | null }[]
      | null;
  }[];

  const userIds = rows.map((r) => String(r.user_id)).filter(Boolean);
  const profileByUser = new Map<
    string,
    { first_name: string | null; avatar_url: string | null }
  >();

  if (userIds.length > 0) {
    const { data: profiles, error: pErr } = await supabase
      .from('user_profiles')
      .select('user_id, first_name, avatar_url')
      .in('user_id', userIds);
    if (!pErr && profiles) {
      for (const p of profiles as {
        user_id: string;
        first_name: string | null;
        avatar_url: string | null;
      }[]) {
        profileByUser.set(String(p.user_id), {
          first_name: p.first_name,
          avatar_url: p.avatar_url,
        });
      }
    }
  }

  const members: HouseholdMemberProfile[] = rows.map((row) => {
    const uRaw = row.users;
    const u = Array.isArray(uRaw) ? uRaw[0] : uRaw;
    const profile = profileByUser.get(String(row.user_id));
    const email = u?.email != null ? String(u.email) : null;
    const displayName = pickDisplayName({
      firstName: profile?.first_name ?? null,
      displayName: u?.display_name != null ? String(u.display_name) : null,
      email,
      fallback: fallbackLabel,
    });
    return {
      userId: String(row.user_id),
      displayName,
      email,
      avatarUrl: profile?.avatar_url ?? null,
      firstName: profile?.first_name ?? null,
    };
  });

  return { members, error: null };
}

export type HouseholdMemberRpcResult = { ok: true } | { ok: false; error: { code: string; message: string } };

function normalizeRpcError(error: { code?: string; message?: string } | null): {
  code: string;
  message: string;
} {
  const code = String(error?.code ?? '');
  const message = String(error?.message ?? '');
  // PostgREST někdy dává SQLSTATE jen v message
  const fromMsg = message.match(/\b(42501|22023)\b/);
  return {
    code: code || (fromMsg?.[1] ?? ''),
    message,
  };
}

export async function rpcRemoveHouseholdMember(
  householdId: string,
  memberUserId: string,
): Promise<HouseholdMemberRpcResult> {
  const { error } = await supabase.rpc('remove_household_member', {
    p_household: householdId,
    p_member: memberUserId,
  });
  if (error) return { ok: false, error: normalizeRpcError(error) };
  return { ok: true };
}

export async function rpcTransferHouseholdAdmin(
  householdId: string,
  newAdminUserId: string,
): Promise<HouseholdMemberRpcResult> {
  const { error } = await supabase.rpc('transfer_household_admin', {
    p_household: householdId,
    p_new_admin: newAdminUserId,
  });
  if (error) return { ok: false, error: normalizeRpcError(error) };
  return { ok: true };
}

export async function rpcLeaveHousehold(householdId: string): Promise<HouseholdMemberRpcResult> {
  const { error } = await supabase.rpc('leave_household', {
    p_household: householdId,
  });
  if (error) return { ok: false, error: normalizeRpcError(error) };
  return { ok: true };
}

/** Mapování Postgres errcode → i18n klíč (caller doplní t()). */
export function householdMemberRpcErrorKey(
  error: { code: string; message: string },
): 'hhMembersErrForbidden' | 'hhMembersErrInvalid' | 'hhMembersErrGeneric' {
  const code = error.code;
  const msg = error.message.toLowerCase();
  if (code === '42501' || msg.includes('42501') || /permission|not.*(admin|owner|allowed)/i.test(msg)) {
    return 'hhMembersErrForbidden';
  }
  if (
    code === '22023' ||
    msg.includes('22023') ||
    /cannot leave|must transfer|not a member|invalid/i.test(msg)
  ) {
    return 'hhMembersErrInvalid';
  }
  return 'hhMembersErrGeneric';
}

/**
 * Jméno autora/plátce výdaje: NULL / neznámý id → „bývalý člen“.
 */
export function resolveHouseholdActorLabel(opts: {
  userId: string | null | undefined;
  members: ReadonlyArray<{ userId: string; name: string }>;
  currentUserId?: string | null;
  meLabel: string;
  formerLabel: string;
}): string {
  const uid = opts.userId != null && String(opts.userId).trim() !== '' ? String(opts.userId) : null;
  if (!uid) return opts.formerLabel;
  const member = opts.members.find((m) => m.userId === uid);
  if (!member) return opts.formerLabel;
  if (opts.currentUserId && member.userId === opts.currentUserId) return opts.meLabel;
  const trimmed = member.name.trim();
  if (!trimmed) return opts.formerLabel;
  const first = trimmed.split(/\s+/)[0] ?? trimmed;
  return first.length > 10 ? `${first.slice(0, 9)}…` : first;
}
