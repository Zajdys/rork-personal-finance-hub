-- Salt Edge open banking: connections + staging transactions

alter table public.users
  add column if not exists salt_edge_customer_id text;

alter table public.users
  add column if not exists salt_edge_connection_id text;

create table if not exists public.salt_edge_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id text not null unique,
  bank_name text,
  account_id text,
  status text not null default 'active',
  last_sync timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists salt_edge_connections_user_id_idx
  on public.salt_edge_connections (user_id);

create table if not exists public.salt_edge_transactions (
  id uuid primary key default gen_random_uuid(),
  connection_id text not null references public.salt_edge_connections(connection_id) on delete cascade,
  salt_edge_tx_id text not null unique,
  amount numeric(10, 2) not null,
  signed_amount numeric(10, 2),
  description text,
  date date not null,
  imported boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists salt_edge_transactions_connection_id_idx
  on public.salt_edge_transactions (connection_id);

create index if not exists salt_edge_transactions_imported_idx
  on public.salt_edge_transactions (connection_id, imported);

alter table public.salt_edge_connections enable row level security;
alter table public.salt_edge_transactions enable row level security;

drop policy if exists "salt_edge_connections_own" on public.salt_edge_connections;
create policy "salt_edge_connections_own" on public.salt_edge_connections
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "salt_edge_transactions_via_connection" on public.salt_edge_transactions;
create policy "salt_edge_transactions_via_connection" on public.salt_edge_transactions
  for select using (
    exists (
      select 1 from public.salt_edge_connections c
      where c.connection_id = salt_edge_transactions.connection_id
        and c.user_id = auth.uid()
    )
  );
