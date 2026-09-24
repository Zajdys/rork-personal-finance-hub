-- Verzování kategorizace + zdroj kategorie transakce
-- 2026-03-23

alter table public.user_profiles
  add column if not exists categories_version int not null default 0;

-- Produkční schéma má PK `id` (ne user_id) — sjednoť default + unique na user_id
alter table public.user_profiles alter column id set default gen_random_uuid();
create unique index if not exists user_profiles_user_id_uidx on public.user_profiles (user_id);

comment on column public.user_profiles.categories_version is
  'Poslední aplikovaná CATEGORIZATION_VERSION z appky; při nižší hodnotě běží přepočet na pozadí.';

alter table public.transactions
  add column if not exists category_source text;

alter table public.transactions
  drop constraint if exists transactions_category_source_check;

alter table public.transactions
  add constraint transactions_category_source_check
  check (
    category_source is null
    or category_source in ('user', 'crowd', 'dictionary', 'keyword', 'transfer', 'import')
  );

comment on column public.transactions.category_source is
  'Odkud kategorie pochází: user | crowd | dictionary | keyword | transfer | import';

-- Backfill stávajících dat
update public.transactions
set category_source = 'transfer'
where category = 'Převod'
  and (category_source is null or category_source = '');

update public.transactions
set category_source = 'dictionary'
where category is distinct from 'Převod'
  and (category_source is null or category_source = '');
