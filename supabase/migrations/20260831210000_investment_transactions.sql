-- Investment transactions (transaction-level model alongside investment_positions)

create table if not exists public.investment_transactions (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.investment_portfolios(id) on delete cascade,
  type text not null check (type in ('buy', 'sell', 'dividend', 'deposit', 'withdrawal', 'fee')),
  ticker text,
  isin text,
  units numeric,
  price_per_unit numeric,
  amount numeric not null,
  fee numeric not null default 0,
  original_currency text not null default 'USD',
  date date not null,
  external_id text unique,
  import_batch_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists investment_transactions_portfolio_id_idx
  on public.investment_transactions (portfolio_id);

create index if not exists investment_transactions_ticker_idx
  on public.investment_transactions (ticker);

create index if not exists investment_transactions_date_idx
  on public.investment_transactions (date);

create index if not exists investment_transactions_external_id_idx
  on public.investment_transactions (external_id);

alter table public.investment_transactions enable row level security;

-- Same access model as investment_positions.portfolio_access (household via household_members).
drop policy if exists "portfolio_access" on public.investment_transactions;
create policy "portfolio_access" on public.investment_transactions
  for all
  using (
    portfolio_id in (
      select p.id
      from public.investment_portfolios p
      where p.household_id in (
        select hm.household_id
        from public.household_members hm
        where hm.user_id = auth.uid()
      )
    )
  )
  with check (
    portfolio_id in (
      select p.id
      from public.investment_portfolios p
      where p.household_id in (
        select hm.household_id
        from public.household_members hm
        where hm.user_id = auth.uid()
      )
    )
  );
