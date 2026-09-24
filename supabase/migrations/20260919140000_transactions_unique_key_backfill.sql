-- Backfill transactions.unique_key for existing bank-imported rows.
-- DO NOT APPLY until reviewed. Delete known duplicate rows first (32 extras),
-- otherwise UNIQUE (user_id, unique_key) will block updates within duplicate groups.
--
-- Formula (matches lib/bank-import-unique-key.ts WITHOUT bankTransactionId):
--   {user_id}|{bank}|{date}|{amount}|{normalized description}
-- where date = zaúčtování (column `date`), amount = toFixed(2),
-- description = lower(trim(collapse whitespace)).
--
-- Bank transaction codes (RB/KB „Kód transakce“) are NOT stored on old rows,
-- so this backfill cannot emit the `txid:` form. After deploy, either:
--   (a) keep these composite keys and accept that new RB imports with txid
--       keys will not collide with them (prefer delete+reimport for RB), or
--   (b) wipe bank_import / raiffeisenbank / … rows and reimport with the app.
--
-- Does not touch RLS.

alter table public.transactions add column if not exists unique_key text;
alter table public.transactions add column if not exists external_id text;

-- Ensure non-partial unique index (NULLs still not equal to each other in PG)
drop index if exists public.transactions_user_unique_key_uidx;
create unique index if not exists transactions_user_unique_key_uidx
  on public.transactions (user_id, unique_key);

create unique index if not exists transactions_external_id_key
  on public.transactions (external_id);

-- One keeper per fingerprint (oldest created_at, then id); leave other dupes NULL.
with fingerprinted as (
  select
    id,
    user_id,
    (
      user_id::text
      || '|'
      || lower(trim(coalesce(nullif(source, ''), 'bank_import')))
      || '|'
      || to_char(date, 'YYYY-MM-DD')
      || '|'
      || trim(to_char(amount, 'FM999999999990.00'))
      || '|'
      || lower(trim(regexp_replace(coalesce(description, ''), '\s+', ' ', 'g')))
    ) as fingerprint,
    created_at
  from public.transactions
  where unique_key is null
),
ranked as (
  select
    id,
    fingerprint,
    row_number() over (
      partition by user_id, fingerprint
      order by created_at asc nulls last, id asc
    ) as rn
  from fingerprinted
)
update public.transactions t
set unique_key = r.fingerprint
from ranked r
where t.id = r.id
  and r.rn = 1
  and t.unique_key is null;
