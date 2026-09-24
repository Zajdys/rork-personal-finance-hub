-- merchant_key na transakcích + unique index na user_profiles.user_id (už může existovat)
alter table public.transactions
  add column if not exists merchant_key text;

create index if not exists transactions_user_merchant_key_idx
  on public.transactions (user_id, merchant_key)
  where merchant_key is not null;

comment on column public.transactions.merchant_key is
  'Normalizovaný klíč obchodníka (normalizeMerchantKey) — párování s user_category_rules';
