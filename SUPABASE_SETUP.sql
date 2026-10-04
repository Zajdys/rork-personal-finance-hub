-- ZASTARALÉ. Zdroj pravdy je supabase/migrations/.
-- Nepoužívat pro zakládání DB.
-- Run in Supabase SQL Editor
-- This schema supports auth + household realtime sync

create extension if not exists pgcrypto;

-- App profile table (linked to Supabase auth.users)
create table if not exists users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique check (invite_code ~ '^[0-9]{6}$'),
  created_by uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists household_members (
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table if not exists recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  amount numeric(12,2) not null check (amount > 0),
  due_day int not null check (due_day between 1 and 31),
  category text not null,
  added_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists shared_expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  amount numeric(12,2) not null check (amount > 0),
  payer_user_id uuid not null references users(id) on delete cascade,
  expense_date date not null,
  added_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists recurring_expenses_updated_at on recurring_expenses;
create trigger recurring_expenses_updated_at
before update on recurring_expenses
for each row execute procedure update_updated_at_column();

drop trigger if exists shared_expenses_updated_at on shared_expenses;
create trigger shared_expenses_updated_at
before update on shared_expenses
for each row execute procedure update_updated_at_column();

alter table users enable row level security;
alter table households enable row level security;
alter table household_members enable row level security;
alter table recurring_expenses enable row level security;
alter table shared_expenses enable row level security;

-- SECURITY DEFINER: seznam domácností bez rekurze RLS na household_members
create or replace function public.get_user_household_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(household_id), '{}'::uuid[])
  from public.household_members
  where user_id = auth.uid();
$$;

drop policy if exists "users_select_own" on users;
create policy "users_select_own" on users
for select using (auth.uid() = id);

drop policy if exists "users_upsert_own" on users;
create policy "users_upsert_own" on users
for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "households_read_member" on households;
create policy "households_read_member" on households
for select using (
  exists (
    select 1 from household_members hm
    where hm.household_id = households.id and hm.user_id = auth.uid()
  )
);

drop policy if exists "households_create" on households;
create policy "households_create" on households
for insert with check (created_by = auth.uid());

drop policy if exists "households_delete_creator" on households;
create policy "households_delete_creator" on households
for delete using (created_by = auth.uid());

drop policy if exists "household_members_read_member" on household_members;
drop policy if exists household_members_read_same_household on household_members;
create policy household_members_read_same_household on household_members
for select using (household_id = any (public.get_user_household_ids()));

drop policy if exists "household_members_join_self" on household_members;
drop policy if exists household_members_write_own on household_members;
create policy household_members_write_own on household_members
for insert with check (auth.uid() = user_id);

drop policy if exists "household_members_leave_self" on household_members;
drop policy if exists household_members_delete_own on household_members;
create policy household_members_delete_own on household_members
for delete using (auth.uid() = user_id);

drop policy if exists "recurring_expenses_read_member" on recurring_expenses;
create policy "recurring_expenses_read_member" on recurring_expenses
for select using (
  exists (
    select 1 from household_members hm
    where hm.household_id = recurring_expenses.household_id and hm.user_id = auth.uid()
  )
);

drop policy if exists "recurring_expenses_modify_member" on recurring_expenses;
create policy "recurring_expenses_modify_member" on recurring_expenses
for all using (
  exists (
    select 1 from household_members hm
    where hm.household_id = recurring_expenses.household_id and hm.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from household_members hm
    where hm.household_id = recurring_expenses.household_id and hm.user_id = auth.uid()
  )
);

drop policy if exists "shared_expenses_read_member" on shared_expenses;
create policy "shared_expenses_read_member" on shared_expenses
for select using (
  exists (
    select 1 from household_members hm
    where hm.household_id = shared_expenses.household_id and hm.user_id = auth.uid()
  )
);

drop policy if exists "shared_expenses_modify_member" on shared_expenses;
create policy "shared_expenses_modify_member" on shared_expenses
for all using (
  exists (
    select 1 from household_members hm
    where hm.household_id = shared_expenses.household_id and hm.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from household_members hm
    where hm.household_id = shared_expenses.household_id and hm.user_id = auth.uid()
  )
);

alter publication supabase_realtime add table recurring_expenses;
alter publication supabase_realtime add table shared_expenses;
alter publication supabase_realtime add table household_members;

-- Onboarding profile (idempotent — safe to re-run)
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'users' and column_name = 'employment_status') then
    alter table public.users add column employment_status text;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'users' and column_name = 'monthly_income') then
    alter table public.users add column monthly_income text;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'users' and column_name = 'financial_goals') then
    alter table public.users add column financial_goals jsonb default '[]'::jsonb;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'users' and column_name = 'experience_level') then
    alter table public.users add column experience_level text;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'users' and column_name = 'has_loans') then
    alter table public.users add column has_loans boolean not null default false;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'users' and column_name = 'loan_details') then
    alter table public.users add column loan_details jsonb;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'users' and column_name = 'monthly_budget') then
    alter table public.users add column monthly_budget jsonb;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'users' and column_name = 'onboarding_completed') then
    alter table public.users add column onboarding_completed boolean not null default false;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'users' and column_name = 'welcome_tour_completed') then
    alter table public.users add column welcome_tour_completed boolean not null default false;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'users' and column_name = 'seen_hints') then
    alter table public.users add column seen_hints jsonb not null default '{}'::jsonb;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'users' and column_name = 'investment_goal') then
    alter table public.users add column investment_goal numeric;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'users' and column_name = 'reserve_goal') then
    alter table public.users add column reserve_goal numeric;
  end if;
end $$;

-- Osobní předplatná (MoneyBuddy) — zdroj pravdy pro app CRUD
create table if not exists public.monthly_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'CZK',
  frequency text not null default 'monthly'
    check (frequency in ('monthly', 'yearly')),
  next_payment_date date,
  due_day int check (due_day is null or (due_day between 1 and 31)),
  category text not null,
  merchant_key text,
  source text not null default 'manual'
    check (source in ('manual', 'bank')),
  active boolean not null default true,
  paused boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.monthly_subscriptions enable row level security;
alter table public.monthly_subscriptions force row level security;

drop policy if exists "monthly_subscriptions_own" on public.monthly_subscriptions;
create policy "monthly_subscriptions_own" on public.monthly_subscriptions
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke all on table public.monthly_subscriptions from public, anon;
grant select, insert, update, delete on table public.monthly_subscriptions to authenticated;

-- Skryté návrhy předplatných z výpisů
create table if not exists public.ignored_subscription_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  merchant_key text not null,
  amount numeric(12, 2) not null,
  currency text not null default 'CZK',
  display_name text,
  created_at timestamptz not null default now(),
  unique (user_id, merchant_key, amount, currency)
);

alter table public.ignored_subscription_suggestions enable row level security;
alter table public.ignored_subscription_suggestions force row level security;

drop policy if exists "ignored_subscription_suggestions_own"
  on public.ignored_subscription_suggestions;
create policy "ignored_subscription_suggestions_own"
  on public.ignored_subscription_suggestions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke all on table public.ignored_subscription_suggestions from public, anon;
grant select, insert, update, delete
  on table public.ignored_subscription_suggestions to authenticated;

-- Závazky (MoneyBuddy): public.loans = zdroj pravdy (klient + RLS).
create table if not exists public.loans (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  loan_type text not null,
  loan_amount numeric(14, 2) not null,
  interest_rate numeric(10, 4) not null,
  monthly_payment numeric(12, 2) not null,
  term_months int,
  remaining_months int not null default 0,
  start_date date not null,
  name text,
  color text,
  emoji text,
  is_fixed boolean not null default false,
  fixed_years int,
  fixed_end_date date,
  fixation_start_date date,
  current_balance numeric(14, 2),
  down_payment numeric(14, 2),
  payments_made int,
  installment_start_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists loans_user_id_idx on public.loans (user_id);

alter table public.loans enable row level security;

drop policy if exists "loans_own" on public.loans;
create policy "loans_own" on public.loans
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists loans_set_updated_at on public.loans;
create trigger loans_set_updated_at
before update on public.loans
for each row execute procedure update_updated_at_column();

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'recurring_expenses' and column_name = 'split_type'
  ) then
    alter table public.recurring_expenses add column split_type text not null default 'mine';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'recurring_expenses' and column_name = 'my_share'
  ) then
    alter table public.recurring_expenses add column my_share numeric not null default 100;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'recurring_expenses' and column_name = 'created_by'
  ) then
    alter table public.recurring_expenses add column created_by uuid references public.users(id) on delete set null;
  end if;
end $$;

-- Doplnění created_by ze sloupce added_by (stejný význam u starých řádků)
update public.recurring_expenses
set created_by = added_by
where created_by is null and added_by is not null;

-- Profil upozornění (pravidelné výdaje domácnosti) — každý uživatel vlastní řádek
create table if not exists public.user_profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  recurring_expense_notifications_enabled boolean not null default true,
  notification_days_before int not null default 1,
  notification_time varchar(5) not null default '09:00',
  updated_at timestamptz not null default now()
);

-- Pořadí finančních cílů (pole id v pořadí zleva doprava / shora dolů)
alter table public.user_profiles add column if not exists financial_goal_order jsonb default '[]'::jsonb;

-- Zobrazení profilu v aplikaci (MoneyBuddy)
alter table public.user_profiles add column if not exists first_name text;
alter table public.user_profiles add column if not exists last_name text;
alter table public.user_profiles add column if not exists avatar_url text;

-- Verze automatické kategorizace (app CATEGORIZATION_VERSION)
alter table public.user_profiles add column if not exists categories_version int not null default 0;

alter table public.user_profiles enable row level security;

drop policy if exists "user_profiles_select_own" on public.user_profiles;
create policy "user_profiles_select_own" on public.user_profiles
for select using (auth.uid() = user_id);

drop policy if exists "user_profiles_upsert_own" on public.user_profiles;
create policy "user_profiles_upsert_own" on public.user_profiles
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Uvolnění starého CHECK na category (vlastní názvy z custom_categories)
alter table public.recurring_expenses drop constraint if exists recurring_expenses_category_check;

-- Vlastní kategorie pravidelných výdajů (sdílené v domácnosti podle household_id)
create table if not exists public.custom_categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  emoji text not null default '📦',
  created_at timestamptz not null default now(),
  unique (household_id, name)
);

create index if not exists custom_categories_household_id_idx on public.custom_categories (household_id);

alter table public.custom_categories enable row level security;

drop policy if exists "custom_categories_select" on public.custom_categories;
create policy "custom_categories_select" on public.custom_categories
for select using (
  exists (
    select 1 from household_members hm
    where hm.household_id = custom_categories.household_id and hm.user_id = auth.uid()
  )
);

drop policy if exists "custom_categories_insert" on public.custom_categories;
create policy "custom_categories_insert" on public.custom_categories
for insert with check (
  user_id = auth.uid()
  and exists (
    select 1 from household_members hm
    where hm.household_id = custom_categories.household_id and hm.user_id = auth.uid()
  )
);

drop policy if exists "custom_categories_update" on public.custom_categories;
create policy "custom_categories_update" on public.custom_categories
for update using (
  exists (
    select 1 from household_members hm
    where hm.household_id = custom_categories.household_id and hm.user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from household_members hm
    where hm.household_id = custom_categories.household_id and hm.user_id = auth.uid()
  )
);

drop policy if exists "custom_categories_delete" on public.custom_categories;
create policy "custom_categories_delete" on public.custom_categories
for delete using (
  exists (
    select 1 from household_members hm
    where hm.household_id = custom_categories.household_id and hm.user_id = auth.uid()
  )
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'custom_categories'
  ) then
    alter publication supabase_realtime add table custom_categories;
  end if;
end $$;

-- Frekvence pravidelných výdajů + měsíc kotvy (čtvrtletí / pololetí / rok)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'recurring_expenses' and column_name = 'frequency'
  ) then
    alter table public.recurring_expenses add column frequency text not null default 'monthly';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'recurring_expenses' and column_name = 'due_month'
  ) then
    alter table public.recurring_expenses add column due_month int;
  end if;
end $$;

-- Sdílené výdaje: kategorie, režim dělení, volitelné sloupce (kompatibilita)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'shared_expenses' and column_name = 'category'
  ) then
    alter table public.shared_expenses add column category text not null default 'Ostatní';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'shared_expenses' and column_name = 'split_mode'
  ) then
    alter table public.shared_expenses add column split_mode text not null default 'equal';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'shared_expenses' and column_name = 'frequency'
  ) then
    alter table public.shared_expenses add column frequency varchar default 'monthly';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'shared_expenses' and column_name = 'due_month'
  ) then
    alter table public.shared_expenses add column due_month integer;
  end if;
end $$;

-- Osobní transakce MoneyBuddy (sync z zařízení, archiv po letech)
create table if not exists public.transactions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- date = zaúčtování; booking_date = valuta (nullable)
  date date not null,
  booking_date date,
  amount numeric(14, 2) not null,
  type text not null check (type in ('income', 'expense')),
  category text not null,
  description text not null,
  source text not null default 'manual',
  import_batch_id text,
  unique_key text,
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists transactions_user_id_date_idx on public.transactions (user_id, date desc);

alter table public.transactions add column if not exists booking_date date;

alter table public.transactions add column if not exists receipt_url text;

alter table public.transactions add column if not exists unique_key text;

alter table public.transactions add column if not exists external_id text;

-- Zdroj kategorie: user | crowd | dictionary | keyword | transfer | import
alter table public.transactions add column if not exists category_source text;
alter table public.transactions drop constraint if exists transactions_category_source_check;
alter table public.transactions add constraint transactions_category_source_check
  check (
    category_source is null
    or category_source in ('user', 'crowd', 'dictionary', 'keyword', 'transfer', 'import')
  );

-- Normalizovaný klíč obchodníka (normalizeMerchantKey) — párování s user_category_rules
alter table public.transactions add column if not exists merchant_key text;
create index if not exists transactions_user_merchant_key_idx
  on public.transactions (user_id, merchant_key)
  where merchant_key is not null;

-- Cizí měny: amount vždy CZK; original_* + exchange_rate u cizích plateb
alter table public.transactions add column if not exists original_amount numeric(14, 2);
alter table public.transactions add column if not exists original_currency text;
alter table public.transactions add column if not exists exchange_rate numeric(18, 8);

create table if not exists public.exchange_rates (
  date date not null,
  currency text not null,
  rate numeric(18, 8) not null,
  amount int not null default 1,
  created_at timestamptz not null default now(),
  primary key (date, currency)
);
create index if not exists exchange_rates_currency_date_idx
  on public.exchange_rates (currency, date desc);
alter table public.exchange_rates enable row level security;
drop policy if exists "exchange_rates_authenticated_select" on public.exchange_rates;
create policy "exchange_rates_authenticated_select"
  on public.exchange_rates for select to authenticated using (true);

-- Deduplikace bankovních importů (NULL unique_key se v UNIQUE neporovnává — vždy plnit z appky)
create unique index if not exists transactions_user_unique_key_uidx
  on public.transactions (user_id, unique_key);

create unique index if not exists transactions_external_id_key
  on public.transactions (external_id);

drop trigger if exists transactions_updated_at on public.transactions;
create trigger transactions_updated_at
before update on public.transactions
for each row execute procedure update_updated_at_column();

alter table public.transactions enable row level security;

drop policy if exists "transactions_own_all" on public.transactions;
create policy "transactions_own_all" on public.transactions
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Účtenky (Storage bucket `receipts`, veřejné čtení)
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "receipts_public_read" on storage.objects;
create policy "receipts_public_read"
on storage.objects for select
using (bucket_id = 'receipts');

drop policy if exists "receipts_insert_own" on storage.objects;
create policy "receipts_insert_own"
on storage.objects for insert
with check (
  bucket_id = 'receipts'
  and auth.uid() is not null
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "receipts_delete_own" on storage.objects;
create policy "receipts_delete_own"
on storage.objects for delete
using (
  bucket_id = 'receipts'
  and auth.uid() is not null
  and split_part(name, '/', 1) = auth.uid()::text
);

-- Profilové fotky (bucket `avatars`, veřejné čtení; cesta userId/avatar.jpg)
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Public read avatars" on storage.objects;
create policy "Public read avatars" on storage.objects
for select using (bucket_id = 'avatars');

drop policy if exists "Users upload own avatar" on storage.objects;
create policy "Users upload own avatar" on storage.objects
for insert with check (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "Users update own avatar" on storage.objects;
create policy "Users update own avatar" on storage.objects
for update using (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);

-- Investice a rezerva (MoneyBuddy)
create table if not exists public.investment_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  amount numeric not null,
  note text,
  date date not null,
  created_at timestamptz not null default now()
);

create table if not exists public.reserve_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  amount numeric not null,
  note text,
  date date not null,
  created_at timestamptz not null default now()
);

create index if not exists investment_records_user_id_date_idx on public.investment_records (user_id, date desc);
create index if not exists reserve_records_user_id_date_idx on public.reserve_records (user_id, date desc);

alter table public.investment_records enable row level security;
alter table public.reserve_records enable row level security;

drop policy if exists "investment_records_own" on public.investment_records;
create policy "investment_records_own" on public.investment_records
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "reserve_records_own" on public.reserve_records;
create policy "reserve_records_own" on public.reserve_records
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Měsíční zaplacení pravidelných výdajů per uživatel (nahrazuje sdílené paid_by_me / paid_by_partner na řádku)
create table if not exists public.recurring_expense_payments (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.recurring_expenses(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  month_year varchar(7) not null,
  paid boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (expense_id, user_id, month_year)
);

create index if not exists recurring_expense_payments_expense_month_idx
  on public.recurring_expense_payments (expense_id, month_year);

drop trigger if exists recurring_expense_payments_updated_at on public.recurring_expense_payments;
create trigger recurring_expense_payments_updated_at
before update on public.recurring_expense_payments
for each row execute procedure update_updated_at_column();

alter table public.recurring_expense_payments enable row level security;

drop policy if exists "recurring_expense_payments_select_member" on public.recurring_expense_payments;
drop policy if exists users_own_payments on public.recurring_expense_payments;
drop policy if exists payments_read_household on public.recurring_expense_payments;
create policy payments_read_household on public.recurring_expense_payments
for select using (
  exists (
    select 1 from public.recurring_expenses e
    where e.id = expense_id
      and e.household_id = any (public.get_user_household_ids())
  )
);

drop policy if exists "recurring_expense_payments_insert_self" on public.recurring_expense_payments;
drop policy if exists "recurring_expense_payments_update_self" on public.recurring_expense_payments;
drop policy if exists "recurring_expense_payments_delete_self" on public.recurring_expense_payments;
drop policy if exists payments_write_own on public.recurring_expense_payments;
create policy payments_write_own on public.recurring_expense_payments
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'recurring_expense_payments'
  ) then
    alter publication supabase_realtime add table public.recurring_expense_payments;
  end if;
end $$;

-- Distinct YYYY-MM z transakcí (Správa importů); RLS omezí na řádky přihlášeného uživatele
create or replace function public.list_distinct_transaction_months()
returns table(month text)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct to_char(date::date, 'YYYY-MM') as month
  from public.transactions
  order by 1 desc;
$$;

grant execute on function public.list_distinct_transaction_months() to authenticated;

-- Učení kategorizace: mapování obchodníka na kategorii per uživatel
create table if not exists public.user_merchant_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  merchant_key text not null,
  category_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, merchant_key)
);

create index if not exists user_merchant_categories_user_id_idx
  on public.user_merchant_categories (user_id);

drop trigger if exists user_merchant_categories_updated_at on public.user_merchant_categories;
create trigger user_merchant_categories_updated_at
before update on public.user_merchant_categories
for each row execute procedure update_updated_at_column();

alter table public.user_merchant_categories enable row level security;

drop policy if exists "user_merchant_categories_own_all" on public.user_merchant_categories;
create policy "user_merchant_categories_own_all" on public.user_merchant_categories
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
