-- Anycoin + transfer_out + source (manual vs import)
-- Spusť dřív, než nasadíš app kód, který tyto hodnoty zapisuje.

-- 1) Rozšíření type CHECK o transfer_out
alter table public.investment_transactions
  drop constraint if exists investment_transactions_type_check;

alter table public.investment_transactions
  add constraint investment_transactions_type_check
  check (
    type in (
      'buy',
      'sell',
      'dividend',
      'deposit',
      'withdrawal',
      'fee',
      'promo',
      'transfer_out'
    )
  );

-- 2) Zdroj transakce: import (CSV) vs ruční
alter table public.investment_transactions
  add column if not exists source text not null default 'import';

alter table public.investment_transactions
  drop constraint if exists investment_transactions_source_check;

alter table public.investment_transactions
  add constraint investment_transactions_source_check
  check (source in ('import', 'manual'));

comment on column public.investment_transactions.source is
  'import = z CSV/XLSX brokera; manual = ručně přidaná transakce (reimport nesmí smazat).';

comment on column public.investment_transactions.type is
  'transfer_out = výběr na vlastní wallet (Trezor) — nesnižuje držené množství ani Vloženo.';
