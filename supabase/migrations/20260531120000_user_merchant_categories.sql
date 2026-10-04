-- Učení kategorizace: mapování obchodníka na kategorii per uživatel
create table if not exists public.user_merchant_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  merchant_key text not null,
  category_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, merchant_key)
);

create index if not exists user_merchant_categories_user_id_idx
  on public.user_merchant_categories (user_id);

drop trigger if exists user_merchant_categories_updated_at on public.user_merchant_categories;
create trigger user_merchant_categories_updated_at
before update on public.user_merchant_categories
for each row execute procedure update_updated_at_column();

alter table public.user_merchant_categories enable row level security;

drop policy if exists "user_merchant_categories_own_all" on public.user_merchant_categories;
create policy "user_merchant_categories_own_all" on public.user_merchant_categories
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
