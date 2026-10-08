-- XTB (a další lot-based brokeři): identifikátor pozice / lotu pro FIFO náklad po lotu.
-- Spojuje buy/sell stejné otevřené pozice (Position ID / Order ID z exportu).
alter table public.investment_transactions
  add column if not exists lot_id text null;

comment on column public.investment_transactions.lot_id is
  'Broker position/lot id (např. XTB Position ID). Null = průměr / bez lotů.';

-- Lookup nákladů po lotu v rámci portfolia (null lot_id index nezatěžuje)
create index if not exists investment_transactions_portfolio_id_lot_id_idx
  on public.investment_transactions (portfolio_id, lot_id)
  where lot_id is not null;
