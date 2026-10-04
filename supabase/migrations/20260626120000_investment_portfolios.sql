-- Investment portfolios & positions (per household)

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

create table if not exists public.investment_portfolios (
  id uuid default gen_random_uuid() primary key,
  household_id uuid references public.households(id) on delete cascade,
  name text not null,
  broker text not null,
  currency text not null default 'EUR',
  created_at timestamptz default now()
);

create table if not exists public.investment_positions (
  id uuid default gen_random_uuid() primary key,
  portfolio_id uuid not null references public.investment_portfolios(id) on delete cascade,
  ticker text not null,
  units numeric not null,
  invested_usd numeric,
  current_price numeric,
  current_value_usd numeric,
  change_percent numeric,
  first_buy_date timestamptz,
  currency text not null default 'USD',
  updated_at timestamptz default now()
);

create index if not exists investment_portfolios_household_id_idx
  on public.investment_portfolios (household_id);

create index if not exists investment_positions_portfolio_id_idx
  on public.investment_positions (portfolio_id);

alter table public.investment_portfolios enable row level security;
alter table public.investment_positions enable row level security;

drop policy if exists "household_access" on public.investment_portfolios;
create policy "household_access" on public.investment_portfolios
  for all
  using (household_id = any (public.get_user_household_ids()))
  with check (household_id = any (public.get_user_household_ids()));

drop policy if exists "portfolio_access" on public.investment_positions;
create policy "portfolio_access" on public.investment_positions
  for all
  using (
    portfolio_id in (
      select id from public.investment_portfolios
      where household_id = any (public.get_user_household_ids())
    )
  )
  with check (
    portfolio_id in (
      select id from public.investment_portfolios
      where household_id = any (public.get_user_household_ids())
    )
  );
