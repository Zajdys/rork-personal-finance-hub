-- Kontomatik AIS: bank_connections / secrets / link sessions / transactions enrich / RPC for service role
-- Reviewed version (Claude): RPC has full body, SECURITY INVOKER (service_role bypasses RLS),
-- execute only for service_role; unique on bank_connections uses NULLS NOT DISTINCT (PG17).

-- 1) bank_connections (client: SELECT only)
create table if not exists public.bank_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null default 'kontomatik',
  bank text not null,
  kontomatik_target text,
  official_name text,
  account_ibans text[] not null default '{}',
  status text not null default 'pending'
    check (status in ('pending', 'active', 'error', 'expired', 'revoked')),
  consent_expires_at timestamptz,
  last_sync_at timestamptz,
  last_sync_status text,
  last_error_message text,
  sync_window_start timestamptz,
  sync_count_in_window int not null default 0 check (sync_count_in_window >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bank_connections_user_bank_target_key
    unique nulls not distinct (user_id, bank, kontomatik_target)
);

create index if not exists bank_connections_user_id_idx on public.bank_connections (user_id);
create index if not exists bank_connections_active_idx on public.bank_connections (status) where status = 'active';

drop trigger if exists bank_connections_set_updated_at on public.bank_connections;
create trigger bank_connections_set_updated_at
  before update on public.bank_connections
  for each row execute procedure public.update_updated_at_column();

alter table public.bank_connections enable row level security;
alter table public.bank_connections force row level security;

drop policy if exists "bank_connections_select_own" on public.bank_connections;
create policy "bank_connections_select_own" on public.bank_connections
  for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.bank_connections from public, anon, authenticated;
grant select on table public.bank_connections to authenticated;

-- 2) secrets (no access for anon/authenticated)
create table if not exists public.bank_connection_secrets (
  connection_id uuid primary key references public.bank_connections (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  multiple_access_id_enc bytea not null,
  multiple_access_id_nonce bytea not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists bank_connection_secrets_set_updated_at on public.bank_connection_secrets;
create trigger bank_connection_secrets_set_updated_at
  before update on public.bank_connection_secrets
  for each row execute procedure public.update_updated_at_column();

alter table public.bank_connection_secrets enable row level security;
alter table public.bank_connection_secrets force row level security;
revoke all on table public.bank_connection_secrets from public, anon, authenticated;

-- 3) pending SignIn redirections (service role only)
create table if not exists public.bank_link_sessions (
  redirection_id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'created'
    check (status in ('created', 'completed', 'expired', 'error')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists bank_link_sessions_user_id_idx on public.bank_link_sessions (user_id);

alter table public.bank_link_sessions enable row level security;
alter table public.bank_link_sessions force row level security;
revoke all on table public.bank_link_sessions from public, anon, authenticated;

-- 4) transactions enrich
alter table public.transactions add column if not exists kontomatik_tx_id text;
comment on column public.transactions.kontomatik_tx_id is
  'Stable AIS id: sha256(iban|bookedOn|amount|partyIban|title|currencyBalance), or ...|bal:missing|seq:N. Not part of unique_key.';

create unique index if not exists transactions_user_kontomatik_tx_id_uidx
  on public.transactions (user_id, kontomatik_tx_id)
  where kontomatik_tx_id is not null;

alter table public.transactions add column if not exists import_needs_review boolean not null default false;
comment on column public.transactions.import_needs_review is
  'Ambiguous dedup match (2+ candidates) during AIS/PDF import - manual review.';

create index if not exists transactions_import_needs_review_idx
  on public.transactions (user_id) where import_needs_review = true;

-- 5) import for a given user - service_role only (VPS)
create or replace function public.import_bank_transactions_for_user(p_user_id uuid, p_rows jsonb)
returns setof public.transactions
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_user_id is null then
    raise exception 'p_user_id required' using errcode = '22023';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a json array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 10000 then
    raise exception 'too many rows: %', jsonb_array_length(p_rows);
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_rows) e
    where coalesce(e->>'unique_key', '') = ''
       or e->>'type' not in ('income', 'expense')
       or e->>'amount' is null
       or e->>'date' is null
  ) then
    raise exception 'invalid row in import batch' using errcode = '22023';
  end if;

  return query
  with ins as (
    insert into public.transactions (
      user_id, date, booking_date, amount, type, category, description, source,
      import_batch_id, receipt_url, is_refund, counterparty_account,
      counterparty_name, merchant_key, original_amount, original_currency,
      exchange_rate, category_source, external_id, unique_key,
      kontomatik_tx_id, import_needs_review
    )
    select
      p_user_id, r.date, r.booking_date, r.amount, r.type,
      coalesce(nullif(trim(r.category), ''), 'Ostatní'),
      coalesce(r.description, 'Bez názvu'),
      coalesce(r.source, 'bank_import'),
      r.import_batch_id, r.receipt_url, coalesce(r.is_refund, false),
      r.counterparty_account, r.counterparty_name, r.merchant_key,
      r.original_amount, r.original_currency, r.exchange_rate,
      r.category_source, r.external_id, r.unique_key,
      r.kontomatik_tx_id, coalesce(r.import_needs_review, false)
    from jsonb_to_recordset(p_rows) as r(
      date date, booking_date date, amount numeric, type varchar,
      category varchar, description text, source varchar,
      import_batch_id uuid, receipt_url text, is_refund boolean,
      counterparty_account text, counterparty_name text, merchant_key text,
      original_amount numeric, original_currency text, exchange_rate numeric,
      category_source text, external_id text, unique_key text,
      kontomatik_tx_id text, import_needs_review boolean
    )
    on conflict do nothing
    returning *
  )
  select * from ins;
end;
$$;

revoke all on function public.import_bank_transactions_for_user(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.import_bank_transactions_for_user(uuid, jsonb) to service_role;
