-- Run this SQL script in Supabase SQL Editor to create all required tables
-- Go to: https://qnpjfwxdiuyagkrqehlx.supabase.co/project/qnpjfwxdiuyagkrqehlx/sql/new

-- Users table
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  username text unique,
  display_name text,
  created_at timestamptz default now()
);

-- Sessions table
create table if not exists sessions (
  token text primary key,
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz default now(),
  expires_at timestamptz
);

-- Subscriptions table
create table if not exists subscriptions (
  user_id uuid primary key references users(id) on delete cascade,
  active boolean default false,
  expires_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Transactions table
create table if not exists transactions (
  id serial primary key,
  user_id text not null,
  broker text,
  raw_hash text not null,
  raw text not null,
  isin text,
  ticker text,
  symbol text,
  name text,
  type text not null,
  qty numeric not null,
  price numeric default 0,
  fee numeric default 0,
  currency text default 'EUR',
  date timestamptz not null,
  created_at timestamptz default now(),
  unique(user_id, raw_hash)
);

-- Positions table
create table if not exists positions (
  user_id text not null,
  symbol text not null,
  name text not null,
  isin text,
  qty numeric not null,
  avg_cost numeric not null,
  currency text not null,
  market_price numeric,
  market_value_czk numeric not null,
  unrealized_pnl_czk numeric not null,
  base_currency text default 'CZK',
  market_value_base numeric,
  unrealized_pnl_base numeric,
  updated_at timestamptz default now(),
  primary key(user_id, symbol)
);

-- FX rates table
create table if not exists fx_rates (
  id serial primary key,
  date date not null,
  base text not null,
  quote text not null,
  rate numeric not null,
  unique(date, base, quote)
);

-- Friendships table
create table if not exists friendships (
  id serial primary key,
  user_id text not null,
  friend_id text not null,
  status text not null default 'pending',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, friend_id)
);

-- Indexes for friendships
create index if not exists idx_friendships_user_id on friendships(user_id);
create index if not exists idx_friendships_friend_id on friendships(friend_id);
create index if not exists idx_friendships_status on friendships(status);

-- Daily login table
create table if not exists daily_login (
  userId text primary key,
  lastLoginDate text not null,
  loginStreak integer not null default 0,
  totalXp integer not null default 0,
  level integer not null default 1,
  createdAt timestamptz default now(),
  updatedAt timestamptz default now()
);

-- Enable Row Level Security (RLS) on all tables
alter table users enable row level security;
alter table sessions enable row level security;
alter table subscriptions enable row level security;
alter table transactions enable row level security;
alter table positions enable row level security;
alter table fx_rates enable row level security;
alter table friendships enable row level security;
alter table daily_login enable row level security;

-- Create policies for public access (adjust based on your security needs)
-- Note: These are permissive policies for development. Adjust for production!

create policy "Allow all operations on users" on users for all using (true) with check (true);
create policy "Allow all operations on sessions" on sessions for all using (true) with check (true);
create policy "Allow all operations on subscriptions" on subscriptions for all using (true) with check (true);
create policy "Allow all operations on transactions" on transactions for all using (true) with check (true);
create policy "Allow all operations on positions" on positions for all using (true) with check (true);
create policy "Allow all operations on fx_rates" on fx_rates for all using (true) with check (true);
create policy "Allow all operations on friendships" on friendships for all using (true) with check (true);
create policy "Allow all operations on daily_login" on daily_login for all using (true) with check (true);
