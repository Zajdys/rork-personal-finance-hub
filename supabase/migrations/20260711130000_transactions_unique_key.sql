-- Deduplikace importů z více bank (Fio, KB, Raiffeisen, …)
alter table public.transactions add column if not exists unique_key text;

create unique index if not exists transactions_user_unique_key_uidx
  on public.transactions (user_id, unique_key)
  where unique_key is not null;
