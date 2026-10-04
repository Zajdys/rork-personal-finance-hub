-- investment_transactions: unikátnost external_id per portfolio (ne globálně).
-- Dříve: external_id text unique → konflikt při stejném external_id napříč portfolii.
-- Po: unique (portfolio_id, external_id). Klient: onConflict 'portfolio_id,external_id'.

alter table public.investment_transactions
  drop constraint if exists investment_transactions_external_id_key;

-- Pokud unique vznikl jako index (starší PG / rename):
drop index if exists investment_transactions_external_id_key;

create unique index if not exists investment_transactions_portfolio_id_external_id_key
  on public.investment_transactions (portfolio_id, external_id);

-- Původní non-unique index na samotném external_id necháme (lookup).
