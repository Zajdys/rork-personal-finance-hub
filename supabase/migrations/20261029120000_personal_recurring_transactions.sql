-- Osobní pravidelné platby (mimo domácnost) + vazba na transactions.

create table if not exists public.personal_recurring_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in ('income', 'expense')),
  title text not null,
  amount numeric not null check (amount > 0),
  currency text not null default 'CZK',
  category text not null,
  subcategory text null,
  frequency text not null check (
    frequency in ('weekly', 'monthly', 'quarterly', 'biannual', 'yearly')
  ),
  start_date date not null,
  next_date date not null,
  end_date date null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists personal_recurring_user_active_idx
  on public.personal_recurring_transactions (user_id, active)
  where active = true;

create index if not exists personal_recurring_next_date_idx
  on public.personal_recurring_transactions (user_id, next_date)
  where active = true;

alter table public.personal_recurring_transactions enable row level security;

drop policy if exists personal_recurring_select_own on public.personal_recurring_transactions;
create policy personal_recurring_select_own
  on public.personal_recurring_transactions for select
  using (user_id = auth.uid());

drop policy if exists personal_recurring_insert_own on public.personal_recurring_transactions;
create policy personal_recurring_insert_own
  on public.personal_recurring_transactions for insert
  with check (user_id = auth.uid());

drop policy if exists personal_recurring_update_own on public.personal_recurring_transactions;
create policy personal_recurring_update_own
  on public.personal_recurring_transactions for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists personal_recurring_delete_own on public.personal_recurring_transactions;
create policy personal_recurring_delete_own
  on public.personal_recurring_transactions for delete
  using (user_id = auth.uid());

-- Vazba transakce → pravidlo
alter table public.transactions
  add column if not exists recurring_id uuid null
    references public.personal_recurring_transactions (id) on delete set null;

create unique index if not exists transactions_recurring_id_date_uidx
  on public.transactions (recurring_id, date)
  where recurring_id is not null;

create index if not exists transactions_recurring_id_idx
  on public.transactions (recurring_id)
  where recurring_id is not null;
