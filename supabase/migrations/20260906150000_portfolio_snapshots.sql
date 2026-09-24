-- Daily portfolio net-worth snapshots (forward-filling chart history)

create table if not exists public.portfolio_snapshots (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.investment_portfolios(id) on delete cascade,
  date date not null,
  total_value_usd numeric not null,
  created_at timestamptz not null default now(),
  unique (portfolio_id, date)
);

create index if not exists portfolio_snapshots_portfolio_id_idx
  on public.portfolio_snapshots (portfolio_id);

create index if not exists portfolio_snapshots_date_idx
  on public.portfolio_snapshots (date);

create index if not exists portfolio_snapshots_portfolio_date_idx
  on public.portfolio_snapshots (portfolio_id, date desc);

alter table public.portfolio_snapshots enable row level security;

drop policy if exists "portfolio_snapshots_access" on public.portfolio_snapshots;
create policy "portfolio_snapshots_access" on public.portfolio_snapshots
  for all
  using (
    exists (
      select 1 from public.investment_portfolios p
      where p.id = portfolio_id
        and (
          (p.visibility = 'personal' and p.owner_user_id = auth.uid())
          or (
            p.visibility = 'shared'
            and p.household_id in (
              select hm.household_id from public.household_members hm where hm.user_id = auth.uid()
            )
          )
        )
    )
  )
  with check (
    exists (
      select 1 from public.investment_portfolios p
      where p.id = portfolio_id
        and (
          (p.visibility = 'personal' and p.owner_user_id = auth.uid())
          or (
            p.visibility = 'shared'
            and p.household_id in (
              select hm.household_id from public.household_members hm where hm.user_id = auth.uid()
            )
          )
        )
    )
  );
