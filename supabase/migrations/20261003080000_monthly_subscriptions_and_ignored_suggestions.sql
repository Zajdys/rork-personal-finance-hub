-- Osobní předplatná + skryté návrhy z výpisů
-- (SQL už může být v DB z ručního běhu v SQL Editoru — idempotentní.)
-- RLS: jen vlastník; anon bez přístupu

-- 1) Osobní předplatná (NE recurring_expenses / domácnost)
create table if not exists public.monthly_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null default 'CZK',
  frequency text not null default 'monthly'
    check (frequency in ('monthly', 'yearly')),
  next_payment_date date,
  due_day int check (due_day is null or (due_day between 1 and 31)),
  category text not null,
  merchant_key text,
  source text not null default 'manual'
    check (source in ('manual', 'bank')),
  active boolean not null default true,
  paused boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists monthly_subscriptions_user_id_idx
  on public.monthly_subscriptions (user_id);

create index if not exists monthly_subscriptions_user_merchant_idx
  on public.monthly_subscriptions (user_id, merchant_key);

drop trigger if exists monthly_subscriptions_updated_at on public.monthly_subscriptions;
create trigger monthly_subscriptions_updated_at
  before update on public.monthly_subscriptions
  for each row execute procedure public.update_updated_at_column();

alter table public.monthly_subscriptions enable row level security;
alter table public.monthly_subscriptions force row level security;

drop policy if exists "monthly_subscriptions_own" on public.monthly_subscriptions;
create policy "monthly_subscriptions_own" on public.monthly_subscriptions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke all on table public.monthly_subscriptions from public, anon;
grant select, insert, update, delete on table public.monthly_subscriptions to authenticated;

-- 2) Ignorované návrhy z výpisů (merchant_key + částka)
create table if not exists public.ignored_subscription_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  merchant_key text not null,
  amount numeric(12, 2) not null,
  currency text not null default 'CZK',
  display_name text,
  created_at timestamptz not null default now(),
  unique (user_id, merchant_key, amount, currency)
);

create index if not exists ignored_subscription_suggestions_user_id_idx
  on public.ignored_subscription_suggestions (user_id);

alter table public.ignored_subscription_suggestions enable row level security;
alter table public.ignored_subscription_suggestions force row level security;

drop policy if exists "ignored_subscription_suggestions_own"
  on public.ignored_subscription_suggestions;
create policy "ignored_subscription_suggestions_own"
  on public.ignored_subscription_suggestions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke all on table public.ignored_subscription_suggestions from public, anon;
grant select, insert, update, delete
  on table public.ignored_subscription_suggestions to authenticated;
