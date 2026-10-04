import { supabase, supabaseUrl } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';
import {
  DEFAULT_SPLIT_EXPENSE_CATEGORY,
  normalizeSplitExpenseCategory,
  type SplitExpenseCategoryId,
} from '@/lib/split-expense-categories';
import { parseMoneyInput } from '@/lib/parse-money-input';

export type { SplitExpenseCategoryId } from '@/lib/split-expense-categories';
export {
  DEFAULT_SPLIT_EXPENSE_CATEGORY,
  SPLIT_EXPENSE_CATEGORIES,
  normalizeSplitExpenseCategory,
  splitExpenseCategoryEmoji,
  splitExpenseCategoryLabel,
} from '@/lib/split-expense-categories';

function logSupabaseError(
  op: string,
  table: string,
  error: { message: string; code?: string; details?: string },
) {
  const url = `${supabaseUrl}/rest/v1/${table}`;
  console.error(`[Supabase ${op}] selhalo`, table, url, error.message, error.code ?? '', error.details ?? '');
}

/**
 * supabase-js posílá Authorization: Bearer <access_token> automaticky.
 * Bez session by šel jen anon key → auth.uid() = null → RLS insert fail.
 */
async function ensureSplitAuthSession(): Promise<{ session: Session | null; error: Error | null }> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error('[SplitGroups auth] getSession selhalo', error);
    return { session: null, error: new Error(error.message) };
  }
  if (!data.session?.access_token || !data.session.user?.id) {
    console.error('[SplitGroups auth] chybí user access token — request by šel jen s anon apikey');
    return { session: null, error: new Error('Přihlášení vypršelo, přihlas se znovu') };
  }
  return { session: data.session, error: null };
}

export type SplitExpenseSplitType = 'equal' | 'exact' | 'percentage' | 'shares';

export type SplitGroup = {
  id: string;
  name: string;
  currency: string;
  created_by: string;
  created_at: string;
  icon: string | null;
  invite_code: string | null;
  is_archived: boolean;
  archived_at: string | null;
};

export type SplitGroupMember = {
  id: string;
  group_id: string;
  user_id: string | null;
  display_name: string;
  created_at: string;
};

export type SplitExpenseShare = {
  id: string;
  expense_id: string;
  member_id: string;
  amount_owed: number;
};

export type SplitExpense = {
  id: string;
  group_id: string;
  paid_by: string;
  amount: number;
  description: string;
  date: string;
  split_type: SplitExpenseSplitType;
  category: SplitExpenseCategoryId;
  created_at: string;
  receipt_url: string | null;
  shares: SplitExpenseShare[];
};

export type SplitSettlement = {
  id: string;
  group_id: string;
  from_member_id: string;
  to_member_id: string;
  amount: number;
  settled_at: string;
};

/** Net balance: kladné = ostatní jim dluží, záporné = oni dluží. */
export type SplitMemberBalance = {
  memberId: string;
  displayName: string;
  balance: number;
};

export type SplitSimplifiedDebt = {
  fromMemberId: string;
  fromDisplayName: string;
  toMemberId: string;
  toDisplayName: string;
  amount: number;
};

export type AddExpenseShareInput = {
  memberId: string;
  /** exact: částka; percentage: %; shares: váha podílu */
  value: number;
};

function mapGroup(row: Record<string, unknown>): SplitGroup {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    currency: String(row.currency ?? 'CZK'),
    created_by: String(row.created_by),
    created_at: String(row.created_at ?? ''),
    icon: row.icon == null || row.icon === '' ? null : String(row.icon),
    invite_code:
      row.invite_code == null || row.invite_code === '' ? null : String(row.invite_code),
    is_archived: row.is_archived === true,
    archived_at:
      row.archived_at == null || row.archived_at === '' ? null : String(row.archived_at),
  };
}

function mapMember(row: Record<string, unknown>): SplitGroupMember {
  return {
    id: String(row.id),
    group_id: String(row.group_id),
    user_id: row.user_id == null || row.user_id === '' ? null : String(row.user_id),
    display_name: String(row.display_name ?? ''),
    created_at: String(row.created_at ?? ''),
  };
}

function mapShare(row: Record<string, unknown>): SplitExpenseShare {
  return {
    id: String(row.id),
    expense_id: String(row.expense_id),
    member_id: String(row.member_id),
    amount_owed: Number(row.amount_owed) || 0,
  };
}

function mapExpense(row: Record<string, unknown>, shares: SplitExpenseShare[] = []): SplitExpense {
  return {
    id: String(row.id),
    group_id: String(row.group_id),
    paid_by: String(row.paid_by),
    amount: Number(row.amount) || 0,
    description: String(row.description ?? ''),
    date: String(row.date ?? ''),
    split_type: String(row.split_type ?? 'equal') as SplitExpenseSplitType,
    category: normalizeSplitExpenseCategory(row.category),
    created_at: String(row.created_at ?? ''),
    receipt_url:
      row.receipt_url == null || row.receipt_url === '' ? null : String(row.receipt_url),
    shares,
  };
}

function mapSettlement(row: Record<string, unknown>): SplitSettlement {
  return {
    id: String(row.id),
    group_id: String(row.group_id),
    from_member_id: String(row.from_member_id),
    to_member_id: String(row.to_member_id),
    amount: Number(row.amount) || 0,
    settled_at: String(row.settled_at ?? ''),
  };
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function parseSplitShareInput(raw: string): number {
  return parseMoneyInput(raw) ?? 0;
}

export function parseSplitShareIntegerInput(raw: string): number {
  const n = parseInt(String(raw).trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Vytvoří vstupy pro buildExpenseShareRows z formuláře. */
export function buildShareInputsFromForm(
  splitType: SplitExpenseSplitType,
  participantIds: string[],
  shareValues: Record<string, string>,
): AddExpenseShareInput[] {
  return participantIds.map((memberId) => {
    if (splitType === 'equal') return { memberId, value: 1 };
    const raw = shareValues[memberId] ?? '';
    if (splitType === 'shares') {
      return { memberId, value: parseSplitShareIntegerInput(raw) };
    }
    return { memberId, value: parseSplitShareInput(raw) };
  });
}

export type SplitShareValidation = {
  valid: boolean;
  exactSum?: number;
  exactDiff?: number;
  percentageSum?: number;
  percentageDiff?: number;
  sharesWeightSum?: number;
};

/** Validace podílů před uložením (UI i server). */
export function validateSplitShareInputs(
  amount: number,
  splitType: SplitExpenseSplitType,
  shares: AddExpenseShareInput[],
): SplitShareValidation {
  if (!shares.length || !(amount > 0)) return { valid: false };

  if (splitType === 'equal') {
    return { valid: true };
  }

  if (splitType === 'exact') {
    const exactSum = roundMoney(shares.reduce((acc, s) => acc + roundMoney(s.value), 0));
    const exactDiff = roundMoney(amount - exactSum);
    const valid = shares.every((s) => s.value >= 0) && Math.abs(exactDiff) <= 0.02;
    return { valid, exactSum, exactDiff };
  }

  if (splitType === 'percentage') {
    const percentageSum = roundMoney(shares.reduce((acc, s) => acc + s.value, 0));
    const percentageDiff = roundMoney(100 - percentageSum);
    const valid = shares.every((s) => s.value > 0) && Math.abs(percentageDiff) <= 0.05;
    return { valid, percentageSum, percentageDiff };
  }

  const sharesWeightSum = shares.reduce((acc, s) => acc + s.value, 0);
  const valid = shares.every((s) => Number.isInteger(s.value) && s.value > 0) && sharesWeightSum > 0;
  return { valid, sharesWeightSum };
}

/** Předvyplnění polí podle uloženého výdaje (edit). */
export function prefillShareValuesFromExpense(expense: SplitExpense): Record<string, string> {
  const values: Record<string, string> = {};
  if (expense.split_type === 'equal') return values;

  if (expense.split_type === 'percentage' && expense.amount > 0) {
    for (const s of expense.shares) {
      values[s.member_id] = String(Math.round((s.amount_owed / expense.amount) * 10000) / 100);
    }
    return values;
  }

  if (expense.split_type === 'exact') {
    for (const s of expense.shares) {
      values[s.member_id] = String(s.amount_owed);
    }
    return values;
  }

  if (expense.split_type === 'shares') {
    const positive = expense.shares.map((s) => s.amount_owed).filter((a) => a > 0);
    const minWeight = positive.length ? Math.min(...positive) : 1;
    for (const s of expense.shares) {
      values[s.member_id] = String(Math.max(1, Math.round(s.amount_owed / minWeight)));
    }
    return values;
  }

  return values;
}

/** Spočítá amount_owed řádky podle split_type. */
export function buildExpenseShareRows(
  amount: number,
  splitType: SplitExpenseSplitType,
  shares: AddExpenseShareInput[],
): { member_id: string; amount_owed: number }[] {
  if (!shares.length) throw new Error('Výdaj musí mít alespoň jednoho účastníka');
  if (!(amount > 0)) throw new Error('Částka musí být kladná');

  if (splitType === 'equal') {
    const n = shares.length;
    const base = roundMoney(amount / n);
    const rows = shares.map((s, i) => ({
      member_id: s.memberId,
      amount_owed: i < n - 1 ? base : roundMoney(amount - base * (n - 1)),
    }));
    return rows;
  }

  if (splitType === 'exact') {
    const rows = shares.map((s) => ({
      member_id: s.memberId,
      amount_owed: roundMoney(s.value),
    }));
    const sum = roundMoney(rows.reduce((a, r) => a + r.amount_owed, 0));
    if (Math.abs(sum - amount) > 0.02) {
      throw new Error(`Součet přesných částek (${sum}) se neshoduje s výdajem (${amount})`);
    }
    return rows;
  }

  if (splitType === 'percentage') {
    const pctSum = shares.reduce((a, s) => a + s.value, 0);
    if (Math.abs(pctSum - 100) > 0.05) {
      throw new Error(`Součet procent musí být 100 (teď ${pctSum})`);
    }
    const rows = shares.map((s, i) => {
      if (i < shares.length - 1) {
        return { member_id: s.memberId, amount_owed: roundMoney((amount * s.value) / 100) };
      }
      const allocated = roundMoney(
        shares.slice(0, -1).reduce((a, x) => a + (amount * x.value) / 100, 0),
      );
      return { member_id: s.memberId, amount_owed: roundMoney(amount - allocated) };
    });
    return rows;
  }

  // shares (váhy — celá kladná čísla)
  const weightSum = shares.reduce((a, s) => a + s.value, 0);
  if (!(weightSum > 0)) throw new Error('Součet podílů musí být kladný');
  if (shares.some((s) => !Number.isInteger(s.value) || s.value <= 0)) {
    throw new Error('Podíly musí být kladná celá čísla');
  }
  const rows = shares.map((s, i) => {
    if (i < shares.length - 1) {
      return { member_id: s.memberId, amount_owed: roundMoney((amount * s.value) / weightSum) };
    }
    const allocated = roundMoney(
      shares.slice(0, -1).reduce((a, x) => a + (amount * x.value) / weightSum, 0),
    );
    return { member_id: s.memberId, amount_owed: roundMoney(amount - allocated) };
  });
  return rows;
}

/**
 * Net balance z výdajů + settlementů.
 * Kladné = mají dostat peníze; záporné = mají poslat.
 */
export function computeMemberBalances(params: {
  members: SplitGroupMember[];
  expenses: SplitExpense[];
  settlements: SplitSettlement[];
}): SplitMemberBalance[] {
  const balance = new Map<string, number>();
  const names = new Map<string, string>();
  for (const m of params.members) {
    balance.set(m.id, 0);
    names.set(m.id, m.display_name);
  }

  for (const e of params.expenses) {
    if (!balance.has(e.paid_by)) continue;
    balance.set(e.paid_by, (balance.get(e.paid_by) ?? 0) + e.amount);
    for (const s of e.shares) {
      if (!balance.has(s.member_id)) continue;
      balance.set(s.member_id, (balance.get(s.member_id) ?? 0) - s.amount_owed);
    }
  }

  for (const st of params.settlements) {
    // from zaplatil to → from zlepší (méně dluží), to zhorší (dostal peníze)
    if (balance.has(st.from_member_id)) {
      balance.set(st.from_member_id, (balance.get(st.from_member_id) ?? 0) + st.amount);
    }
    if (balance.has(st.to_member_id)) {
      balance.set(st.to_member_id, (balance.get(st.to_member_id) ?? 0) - st.amount);
    }
  }

  return params.members.map((m) => ({
    memberId: m.id,
    displayName: m.display_name,
    balance: roundMoney(balance.get(m.id) ?? 0),
  }));
}

/** Greedy min-cash-flow: páruje největší dlužníky s největšími věřiteli. */
export function simplifyDebts(balances: SplitMemberBalance[]): SplitSimplifiedDebt[] {
  const EPS = 0.005;
  const debtors = balances
    .filter((b) => b.balance < -EPS)
    .map((b) => ({ ...b, balance: b.balance }))
    .sort((a, b) => a.balance - b.balance);
  const creditors = balances
    .filter((b) => b.balance > EPS)
    .map((b) => ({ ...b, balance: b.balance }))
    .sort((a, b) => b.balance - a.balance);

  const transfers: SplitSimplifiedDebt[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const owe = -debtor.balance;
    const due = creditor.balance;
    const amount = roundMoney(Math.min(owe, due));
    if (amount > EPS) {
      transfers.push({
        fromMemberId: debtor.memberId,
        fromDisplayName: debtor.displayName,
        toMemberId: creditor.memberId,
        toDisplayName: creditor.displayName,
        amount,
      });
    }
    debtor.balance = roundMoney(debtor.balance + amount);
    creditor.balance = roundMoney(creditor.balance - amount);
    if (Math.abs(debtor.balance) <= EPS) i += 1;
    if (Math.abs(creditor.balance) <= EPS) j += 1;
  }

  return transfers;
}

export async function fetchSplitGroupsRemote(): Promise<{
  groups: SplitGroup[];
  members: SplitGroupMember[];
  error: Error | null;
}> {
  try {
    const { data: groupsData, error: gErr } = await supabase
      .from('split_groups')
      .select('*')
      .order('created_at', { ascending: false });

    if (gErr) {
      logSupabaseError('fetchSplitGroups', 'split_groups', gErr);
      return { groups: [], members: [], error: new Error(gErr.message) };
    }

    const groups = (groupsData ?? []).map((r) => mapGroup(r as Record<string, unknown>));
    const groupIds = groups.map((g) => g.id);
    if (!groupIds.length) return { groups: [], members: [], error: null };

    const { data: membersData, error: mErr } = await supabase
      .from('split_group_members')
      .select('*')
      .in('group_id', groupIds)
      .order('created_at', { ascending: true });

    if (mErr) {
      logSupabaseError('fetchSplitMembers', 'split_group_members', mErr);
      return { groups, members: [], error: new Error(mErr.message) };
    }

    return {
      groups,
      members: (membersData ?? []).map((r) => mapMember(r as Record<string, unknown>)),
      error: null,
    };
  } catch (err) {
    console.error('[Supabase fetchSplitGroups] network selhalo', `${supabaseUrl}/rest/v1/split_groups`, err);
    return { groups: [], members: [], error: err instanceof Error ? err : new Error(String(err)) };
  }
}

export async function createSplitGroupRemote(params: {
  userId: string;
  name: string;
  currency?: string;
  icon?: string | null;
  creatorDisplayName: string;
}): Promise<{ group: SplitGroup | null; member: SplitGroupMember | null; error: Error | null }> {
  try {
    const { session, error: authErr } = await ensureSplitAuthSession();
    if (authErr || !session) {
      return { group: null, member: null, error: authErr ?? new Error('Přihlášení vypršelo, přihlas se znovu') };
    }
    // RLS with check: created_by = auth.uid() — musí sedět s JWT, ne s libovolným params.userId
    const authUserId = session.user.id;
    if (params.userId && params.userId !== authUserId) {
      console.warn(
        '[SplitGroups createSplitGroup] params.userId != session.user.id; používám session',
        { paramsUserId: params.userId, authUserId },
      );
    }

    const { data: groupRow, error: gErr } = await supabase
      .from('split_groups')
      .insert({
        name: params.name.trim(),
        currency: params.currency?.trim() || 'CZK',
        created_by: authUserId,
        icon: params.icon ?? null,
      })
      .select('*')
      .single();

    if (gErr || !groupRow) {
      if (gErr) logSupabaseError('createSplitGroup', 'split_groups', gErr);
      return { group: null, member: null, error: new Error(gErr?.message ?? 'Nepodařilo se vytvořit rozdělení') };
    }

    const group = mapGroup(groupRow as Record<string, unknown>);

    const { data: memberRow, error: mErr } = await supabase
      .from('split_group_members')
      .insert({
        group_id: group.id,
        user_id: authUserId,
        display_name: params.creatorDisplayName.trim() || 'Já',
      })
      .select('*')
      .single();

    if (mErr || !memberRow) {
      if (mErr) logSupabaseError('createSplitGroupMember', 'split_group_members', mErr);
      await supabase.from('split_groups').delete().eq('id', group.id);
      return { group: null, member: null, error: new Error(mErr?.message ?? 'Nepodařilo se přidat tvůrce') };
    }

    return {
      group,
      member: mapMember(memberRow as Record<string, unknown>),
      error: null,
    };
  } catch (err) {
    console.error('[Supabase createSplitGroup] network selhalo', `${supabaseUrl}/rest/v1/split_groups`, err);
    return { group: null, member: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

export async function joinSplitGroupByCodeRemote(params: {
  code: string;
  memberDisplayName: string;
}): Promise<{ group: SplitGroup | null; error: Error | null }> {
  try {
    const { error: authErr } = await ensureSplitAuthSession();
    if (authErr) {
      return { group: null, error: authErr };
    }

    const code = params.code.trim();
    if (!/^\d{6}$/.test(code)) {
      return { group: null, error: new Error('Zadej platný 6místný kód') };
    }

    const { data, error } = await supabase.rpc('join_split_group_by_code', {
      code,
      member_display_name: params.memberDisplayName.trim() || 'Já',
    });

    if (error) {
      console.error('[Supabase joinSplitGroupByCode] selhalo', error.message, error.code ?? '');
      return { group: null, error: new Error(error.message) };
    }

    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null | undefined;
    if (!row?.id) {
      return { group: null, error: new Error('Nepodařilo se připojit k rozdělení') };
    }

    return { group: mapGroup(row), error: null };
  } catch (err) {
    console.error('[Supabase joinSplitGroupByCode] network selhalo', err);
    return { group: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

export async function updateSplitGroupArchiveRemote(
  groupId: string,
  archived: boolean,
): Promise<{ group: SplitGroup | null; error: Error | null }> {
  try {
    const { error: authErr } = await ensureSplitAuthSession();
    if (authErr) {
      return { group: null, error: authErr };
    }

    const { data, error } = await supabase
      .from('split_groups')
      .update({
        is_archived: archived,
        archived_at: archived ? new Date().toISOString() : null,
      })
      .eq('id', groupId)
      .select('*')
      .single();

    if (error || !data) {
      if (error) logSupabaseError('updateSplitGroupArchive', 'split_groups', error);
      return {
        group: null,
        error: new Error(error?.message ?? 'Nepodařilo se změnit stav archivace'),
      };
    }

    return { group: mapGroup(data as Record<string, unknown>), error: null };
  } catch (err) {
    console.error('[Supabase updateSplitGroupArchive] network selhalo', err);
    return { group: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

export async function addSplitGroupMemberRemote(params: {
  groupId: string;
  displayName: string;
  userId?: string | null;
}): Promise<{ member: SplitGroupMember | null; error: Error | null }> {
  try {
    const { error: authErr } = await ensureSplitAuthSession();
    if (authErr) {
      return { member: null, error: authErr };
    }

    const { data, error } = await supabase
      .from('split_group_members')
      .insert({
        group_id: params.groupId,
        user_id: params.userId ?? null,
        display_name: params.displayName.trim(),
      })
      .select('*')
      .single();

    if (error || !data) {
      if (error) logSupabaseError('addSplitMember', 'split_group_members', error);
      return { member: null, error: new Error(error?.message ?? 'Nepodařilo se přidat člena') };
    }
    return { member: mapMember(data as Record<string, unknown>), error: null };
  } catch (err) {
    console.error(
      '[Supabase addSplitMember] network selhalo',
      `${supabaseUrl}/rest/v1/split_group_members`,
      err,
    );
    return { member: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

export type FoundUserByEmail = {
  id: string;
  email: string;
  display_name: string;
};

/** Lookup registrovaného uživatele podle emailu (RPC — RLS na users jinak blokuje). */
export async function findUserByEmailRemote(
  email: string,
): Promise<{ user: FoundUserByEmail | null; error: Error | null }> {
  try {
    const { error: authErr } = await ensureSplitAuthSession();
    if (authErr) return { user: null, error: authErr };

    const trimmed = email.trim();
    if (!trimmed) return { user: null, error: new Error('Zadej e-mail') };

    const { data, error } = await supabase.rpc('find_user_by_email', { p_email: trimmed });
    if (error) {
      logSupabaseError('findUserByEmail', 'rpc/find_user_by_email', error);
      return { user: null, error: new Error(error.message) };
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row !== 'object') return { user: null, error: null };

    const r = row as Record<string, unknown>;
    if (!r.id) return { user: null, error: null };

    return {
      user: {
        id: String(r.id),
        email: String(r.email ?? trimmed),
        display_name: String(r.display_name ?? r.email ?? trimmed),
      },
      error: null,
    };
  } catch (err) {
    console.error('[Supabase findUserByEmail] selhalo', err);
    return { user: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

export async function fetchSplitExpensesForGroupRemote(groupId: string): Promise<{
  expenses: SplitExpense[];
  settlements: SplitSettlement[];
  error: Error | null;
}> {
  try {
    const { data: expensesData, error: eErr } = await supabase
      .from('split_expenses')
      .select('*')
      .eq('group_id', groupId)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });

    if (eErr) {
      logSupabaseError('fetchSplitExpenses', 'split_expenses', eErr);
      return { expenses: [], settlements: [], error: new Error(eErr.message) };
    }

    const expenseRows = (expensesData ?? []) as Record<string, unknown>[];
    const expenseIds = expenseRows.map((r) => String(r.id));

    let shares: SplitExpenseShare[] = [];
    if (expenseIds.length) {
      const { data: sharesData, error: sErr } = await supabase
        .from('split_expense_shares')
        .select('*')
        .in('expense_id', expenseIds);

      if (sErr) {
        logSupabaseError('fetchSplitShares', 'split_expense_shares', sErr);
        return { expenses: [], settlements: [], error: new Error(sErr.message) };
      }
      shares = (sharesData ?? []).map((r) => mapShare(r as Record<string, unknown>));
    }

    const sharesByExpense = new Map<string, SplitExpenseShare[]>();
    for (const s of shares) {
      const list = sharesByExpense.get(s.expense_id) ?? [];
      list.push(s);
      sharesByExpense.set(s.expense_id, list);
    }

    const expenses = expenseRows.map((r) =>
      mapExpense(r, sharesByExpense.get(String(r.id)) ?? []),
    );

    const { data: settlementsData, error: stErr } = await supabase
      .from('split_settlements')
      .select('*')
      .eq('group_id', groupId)
      .order('settled_at', { ascending: false });

    if (stErr) {
      logSupabaseError('fetchSplitSettlements', 'split_settlements', stErr);
      return { expenses, settlements: [], error: new Error(stErr.message) };
    }

    return {
      expenses,
      settlements: (settlementsData ?? []).map((r) => mapSettlement(r as Record<string, unknown>)),
      error: null,
    };
  } catch (err) {
    console.error(
      '[Supabase fetchSplitExpenses] network selhalo',
      `${supabaseUrl}/rest/v1/split_expenses`,
      err,
    );
    return {
      expenses: [],
      settlements: [],
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

export async function addSplitExpenseRemote(params: {
  groupId: string;
  paidBy: string;
  amount: number;
  description: string;
  date?: string;
  splitType: SplitExpenseSplitType;
  category?: SplitExpenseCategoryId | string;
  shares: AddExpenseShareInput[];
}): Promise<{ expense: SplitExpense | null; error: Error | null }> {
  try {
    const { session, error: authErr } = await ensureSplitAuthSession();
    if (authErr || !session) {
      return { expense: null, error: authErr ?? new Error('Přihlášení vypršelo, přihlas se znovu') };
    }

    const category = normalizeSplitExpenseCategory(
      params.category ?? DEFAULT_SPLIT_EXPENSE_CATEGORY,
    );
    const shareRows = buildExpenseShareRows(params.amount, params.splitType, params.shares);

    const { data: expenseRow, error: eErr } = await supabase
      .from('split_expenses')
      .insert({
        group_id: params.groupId,
        paid_by: params.paidBy,
        amount: params.amount,
        description: params.description.trim(),
        date: params.date ?? new Date().toISOString().slice(0, 10),
        split_type: params.splitType,
        category,
        added_by: session.user.id,
      })
      .select('*')
      .single();

    if (eErr || !expenseRow) {
      if (eErr) logSupabaseError('addSplitExpense', 'split_expenses', eErr);
      return { expense: null, error: new Error(eErr?.message ?? 'Nepodařilo se uložit výdaj') };
    }

    const expenseId = String((expenseRow as Record<string, unknown>).id);
    const { data: insertedShares, error: sErr } = await supabase
      .from('split_expense_shares')
      .insert(shareRows.map((r) => ({ ...r, expense_id: expenseId })))
      .select('*');

    if (sErr) {
      logSupabaseError('addSplitShares', 'split_expense_shares', sErr);
      await supabase.from('split_expenses').delete().eq('id', expenseId);
      return { expense: null, error: new Error(sErr.message) };
    }

    return {
      expense: mapExpense(
        expenseRow as Record<string, unknown>,
        (insertedShares ?? []).map((r) => mapShare(r as Record<string, unknown>)),
      ),
      error: null,
    };
  } catch (err) {
    console.error('[Supabase addSplitExpense] selhalo', `${supabaseUrl}/rest/v1/split_expenses`, err);
    return { expense: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

export async function updateSplitExpenseRemote(params: {
  expenseId: string;
  groupId: string;
  paidBy: string;
  amount: number;
  description: string;
  date?: string;
  splitType: SplitExpenseSplitType;
  category?: SplitExpenseCategoryId | string;
  shares: AddExpenseShareInput[];
}): Promise<{ expense: SplitExpense | null; error: Error | null }> {
  try {
    const { error: authErr } = await ensureSplitAuthSession();
    if (authErr) {
      return { expense: null, error: authErr };
    }

    const category = normalizeSplitExpenseCategory(
      params.category ?? DEFAULT_SPLIT_EXPENSE_CATEGORY,
    );
    const shareRows = buildExpenseShareRows(params.amount, params.splitType, params.shares);

    const { data: expenseRow, error: eErr } = await supabase
      .from('split_expenses')
      .update({
        paid_by: params.paidBy,
        amount: params.amount,
        description: params.description.trim(),
        date: params.date ?? new Date().toISOString().slice(0, 10),
        split_type: params.splitType,
        category,
      })
      .eq('id', params.expenseId)
      .eq('group_id', params.groupId)
      .select('*')
      .single();

    if (eErr || !expenseRow) {
      if (eErr) logSupabaseError('updateSplitExpense', 'split_expenses', eErr);
      return { expense: null, error: new Error(eErr?.message ?? 'Nepodařilo se upravit výdaj') };
    }

    const { error: delErr } = await supabase
      .from('split_expense_shares')
      .delete()
      .eq('expense_id', params.expenseId);

    if (delErr) {
      logSupabaseError('replaceSplitSharesDelete', 'split_expense_shares', delErr);
      return { expense: null, error: new Error(delErr.message) };
    }

    const { data: insertedShares, error: sErr } = await supabase
      .from('split_expense_shares')
      .insert(shareRows.map((r) => ({ ...r, expense_id: params.expenseId })))
      .select('*');

    if (sErr) {
      logSupabaseError('replaceSplitSharesInsert', 'split_expense_shares', sErr);
      return { expense: null, error: new Error(sErr.message) };
    }

    return {
      expense: mapExpense(
        expenseRow as Record<string, unknown>,
        (insertedShares ?? []).map((r) => mapShare(r as Record<string, unknown>)),
      ),
      error: null,
    };
  } catch (err) {
    console.error('[Supabase updateSplitExpense] selhalo', `${supabaseUrl}/rest/v1/split_expenses`, err);
    return { expense: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

export async function updateSplitExpenseReceiptRemote(params: {
  expenseId: string;
  groupId: string;
  receiptUrl: string | null;
}): Promise<{ error: Error | null }> {
  try {
    const { error: authErr } = await ensureSplitAuthSession();
    if (authErr) return { error: authErr };

    const { error } = await supabase
      .from('split_expenses')
      .update({ receipt_url: params.receiptUrl })
      .eq('id', params.expenseId)
      .eq('group_id', params.groupId);

    if (error) {
      logSupabaseError('updateSplitExpenseReceipt', 'split_expenses', error);
      return { error: new Error(error.message) };
    }
    return { error: null };
  } catch (err) {
    console.error('[Supabase updateSplitExpenseReceipt] network selhalo', err);
    return { error: err instanceof Error ? err : new Error(String(err)) };
  }
}

export async function deleteSplitExpenseRemote(
  expenseId: string,
): Promise<{ error: Error | null }> {
  try {
    const { error: authErr } = await ensureSplitAuthSession();
    if (authErr) return { error: authErr };

    const { error } = await supabase.from('split_expenses').delete().eq('id', expenseId);
    if (error) {
      logSupabaseError('deleteSplitExpense', 'split_expenses', error);
      return { error: new Error(error.message) };
    }
    return { error: null };
  } catch (err) {
    console.error('[Supabase deleteSplitExpense] selhalo', `${supabaseUrl}/rest/v1/split_expenses`, err);
    return { error: err instanceof Error ? err : new Error(String(err)) };
  }
}

export async function addSplitSettlementRemote(params: {
  groupId: string;
  fromMemberId: string;
  toMemberId: string;
  amount: number;
}): Promise<{ settlement: SplitSettlement | null; error: Error | null }> {
  try {
    const { error: authErr } = await ensureSplitAuthSession();
    if (authErr) {
      return { settlement: null, error: authErr };
    }

    const { data, error } = await supabase
      .from('split_settlements')
      .insert({
        group_id: params.groupId,
        from_member_id: params.fromMemberId,
        to_member_id: params.toMemberId,
        amount: params.amount,
      })
      .select('*')
      .single();

    if (error || !data) {
      if (error) logSupabaseError('addSplitSettlement', 'split_settlements', error);
      return {
        settlement: null,
        error: new Error(error?.message ?? 'Nepodařilo se uložit vyrovnání'),
      };
    }
    return { settlement: mapSettlement(data as Record<string, unknown>), error: null };
  } catch (err) {
    console.error(
      '[Supabase addSplitSettlement] network selhalo',
      `${supabaseUrl}/rest/v1/split_settlements`,
      err,
    );
    return { settlement: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
}
