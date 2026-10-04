-- PostgREST/Supabase upsert ON CONFLICT (user_id, unique_key) vyžaduje
-- ne-partial UNIQUE index. Partial index (WHERE unique_key IS NOT NULL)
-- způsobuje: "there is no unique or exclusion constraint matching the ON CONFLICT specification"
--
-- PostgreSQL UNIQUE stejně dovolí více řádků s unique_key IS NULL
-- (NULL se v UNIQUE nepovažují za shodné), partial WHERE tedy není potřebné.

drop index if exists public.transactions_user_unique_key_uidx;

create unique index if not exists transactions_user_unique_key_uidx
  on public.transactions (user_id, unique_key);
