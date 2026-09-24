-- Globální crowd cache kategorií obchodníků + uživatelská pravidla

create table if not exists public.merchant_categories (
  merchant_key text primary key,
  category text not null,
  source text not null check (source in ('crowd', 'dictionary', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists merchant_categories_category_idx
  on public.merchant_categories (category);

drop trigger if exists merchant_categories_updated_at on public.merchant_categories;
create trigger merchant_categories_updated_at
before update on public.merchant_categories
for each row execute procedure update_updated_at_column();

alter table public.merchant_categories enable row level security;

drop policy if exists "merchant_categories_select_authenticated" on public.merchant_categories;
create policy "merchant_categories_select_authenticated" on public.merchant_categories
for select to authenticated using (true);

-- Zápis jen service_role / trigger (security definer) — žádný přímý insert od klienta
drop policy if exists "merchant_categories_no_client_write" on public.merchant_categories;

create table if not exists public.user_category_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  merchant_key text not null,
  category text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, merchant_key)
);

create index if not exists user_category_rules_user_id_idx
  on public.user_category_rules (user_id);

create index if not exists user_category_rules_merchant_key_idx
  on public.user_category_rules (merchant_key);

drop trigger if exists user_category_rules_updated_at on public.user_category_rules;
create trigger user_category_rules_updated_at
before update on public.user_category_rules
for each row execute procedure update_updated_at_column();

alter table public.user_category_rules enable row level security;

drop policy if exists "user_category_rules_own_all" on public.user_category_rules;
create policy "user_category_rules_own_all" on public.user_category_rules
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Migrace z legacy user_merchant_categories
insert into public.user_category_rules (user_id, merchant_key, category)
select user_id, merchant_key, category_id
from public.user_merchant_categories
on conflict (user_id, merchant_key) do update
set category = excluded.category, updated_at = now();

-- Crowd: když ≥3 různí uživatelé mají stejný merchant_key → stejnou category,
-- zapiš do merchant_categories (source='crowd').
-- Nikdy neukládá jména osob — jen merchant_key.
create or replace function public.refresh_crowd_merchant_category()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_cat text;
begin
  v_key := coalesce(NEW.merchant_key, OLD.merchant_key);
  if v_key is null or length(trim(v_key)) < 3 then
    return coalesce(NEW, OLD);
  end if;

  -- Pro každou kategorii u tohoto klíče spočítej distinct user_id
  for v_cat in
    select category
    from public.user_category_rules
    where merchant_key = v_key
    group by category
    having count(distinct user_id) >= 3
    order by count(distinct user_id) desc, max(updated_at) desc
    limit 1
  loop
    insert into public.merchant_categories (merchant_key, category, source)
    values (v_key, v_cat, 'crowd')
    on conflict (merchant_key) do update
    set category = excluded.category,
        source = 'crowd',
        updated_at = now();
    return coalesce(NEW, OLD);
  end loop;

  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists user_category_rules_crowd_refresh on public.user_category_rules;
create trigger user_category_rules_crowd_refresh
after insert or update of merchant_key, category or delete
on public.user_category_rules
for each row execute function public.refresh_crowd_merchant_category();

-- Jednorázový backfill crowd z existujících pravidel
insert into public.merchant_categories (merchant_key, category, source)
select merchant_key, category, 'crowd'
from (
  select merchant_key, category, count(distinct user_id) as n
  from public.user_category_rules
  where length(trim(merchant_key)) >= 3
  group by merchant_key, category
  having count(distinct user_id) >= 3
) s
order by n desc
on conflict (merchant_key) do update
set category = excluded.category,
    source = 'crowd',
    updated_at = now();
