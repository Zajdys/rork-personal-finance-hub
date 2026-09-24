-- Typ 'gift' (příjem/dar krypto) + volitelná poznámka.
-- gift zvyšuje držené množství, NE „Vloženo“ (na rozdíl od buy+deposit).

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
      'transfer_out',
      'gift'
    )
  );

alter table public.investment_transactions
  add column if not exists note text;

comment on column public.investment_transactions.type is
  'gift = příjem/dar (units ↑, Vloženo beze změny). transfer_out = výběr na vlastní wallet.';

comment on column public.investment_transactions.note is
  'Volitelná poznámka (ruční i import).';
