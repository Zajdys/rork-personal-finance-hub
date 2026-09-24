-- Zámek historie portfolio_snapshots: kompletní dny se nepřepočítávají.
alter table public.portfolio_snapshots
  add column if not exists locked boolean not null default false;

comment on column public.portfolio_snapshots.locked is
  'true = den spočítán kompletně (všechny držené pozice měly cenu); nepřepisovat. Dnešní/nekompletní = false.';

create index if not exists portfolio_snapshots_unlocked_idx
  on public.portfolio_snapshots (portfolio_id, date)
  where locked = false;

-- Po smazání vadných dnů a ověření grafu (volitelné — zmrazit zbytek historie):
-- update public.portfolio_snapshots
-- set locked = true
-- where date < (timezone('utc', now()))::date;

