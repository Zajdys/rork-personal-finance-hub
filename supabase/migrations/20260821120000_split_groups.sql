-- Split groups (Tricount-like expense splitting) — independent of household_*

do $$
begin
  create type public.split_expense_split_type as enum (
    'equal',
    'exact',
    'percentage',
    'shares'
  );
exception
  when duplicate_object then null;
end $$;

create or replace function public.get_user_split_group_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(group_id), '{}'::uuid[])
  from public.split_group_members
  where user_id = auth.uid();
$$;

create table if not exists public.split_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  currency text not null default 'CZK',
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  icon text
);

create table if not exists public.split_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.split_groups(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  display_name text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists split_group_members_group_user_uidx
  on public.split_group_members (group_id, user_id)
  where user_id is not null;

create table if not exists public.split_expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.split_groups(id) on delete cascade,
  paid_by uuid not null references public.split_group_members(id) on delete restrict,
  amount numeric not null check (amount > 0),
  description text not null default '',
  date date not null default (current_date),
  split_type public.split_expense_split_type not null default 'equal',
  created_at timestamptz not null default now()
);

create table if not exists public.split_expense_shares (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.split_expenses(id) on delete cascade,
  member_id uuid not null references public.split_group_members(id) on delete cascade,
  amount_owed numeric not null check (amount_owed >= 0),
  unique (expense_id, member_id)
);

create table if not exists public.split_settlements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.split_groups(id) on delete cascade,
  from_member_id uuid not null references public.split_group_members(id) on delete restrict,
  to_member_id uuid not null references public.split_group_members(id) on delete restrict,
  amount numeric not null check (amount > 0),
  settled_at timestamptz not null default now(),
  check (from_member_id <> to_member_id)
);

create index if not exists split_groups_created_by_idx
  on public.split_groups (created_by);

create index if not exists split_group_members_group_id_idx
  on public.split_group_members (group_id);

create index if not exists split_group_members_user_id_idx
  on public.split_group_members (user_id);

create index if not exists split_expenses_group_id_idx
  on public.split_expenses (group_id);

create index if not exists split_expenses_paid_by_idx
  on public.split_expenses (paid_by);

create index if not exists split_expense_shares_expense_id_idx
  on public.split_expense_shares (expense_id);

create index if not exists split_expense_shares_member_id_idx
  on public.split_expense_shares (member_id);

create index if not exists split_settlements_group_id_idx
  on public.split_settlements (group_id);

alter table public.split_groups enable row level security;
alter table public.split_group_members enable row level security;
alter table public.split_expenses enable row level security;
alter table public.split_expense_shares enable row level security;
alter table public.split_settlements enable row level security;

-- Groups: members see/manage; creator can insert (and briefly see before joining as member)
drop policy if exists "split_groups_access" on public.split_groups;
create policy "split_groups_access" on public.split_groups
  for all
  using (
    id = any (public.get_user_split_group_ids())
    or created_by = auth.uid()
  )
  with check (
    created_by = auth.uid()
    or id = any (public.get_user_split_group_ids())
  );

-- Members: access via membership; bootstrap insert allowed for group creator
drop policy if exists "split_group_members_access" on public.split_group_members;
create policy "split_group_members_access" on public.split_group_members
  for all
  using (group_id = any (public.get_user_split_group_ids()))
  with check (
    group_id = any (public.get_user_split_group_ids())
    or group_id in (
      select g.id from public.split_groups g
      where g.created_by = auth.uid()
    )
  );

drop policy if exists "split_expenses_access" on public.split_expenses;
create policy "split_expenses_access" on public.split_expenses
  for all
  using (group_id = any (public.get_user_split_group_ids()))
  with check (group_id = any (public.get_user_split_group_ids()));

drop policy if exists "split_expense_shares_access" on public.split_expense_shares;
create policy "split_expense_shares_access" on public.split_expense_shares
  for all
  using (
    expense_id in (
      select e.id from public.split_expenses e
      where e.group_id = any (public.get_user_split_group_ids())
    )
  )
  with check (
    expense_id in (
      select e.id from public.split_expenses e
      where e.group_id = any (public.get_user_split_group_ids())
    )
  );

drop policy if exists "split_settlements_access" on public.split_settlements;
create policy "split_settlements_access" on public.split_settlements
  for all
  using (group_id = any (public.get_user_split_group_ids()))
  with check (group_id = any (public.get_user_split_group_ids()));
