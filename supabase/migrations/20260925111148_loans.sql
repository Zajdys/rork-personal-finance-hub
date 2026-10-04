-- Závazky (loans): DB = zdroj pravdy, RLS jen vlastník.
-- Klient migruje existující lokální AsyncStorage záznamy při startu.

create table if not exists public.loans (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  loan_type text not null,
  loan_amount numeric(14, 2) not null,
  interest_rate numeric(10, 4) not null,
  monthly_payment numeric(12, 2) not null,
  term_months int,
  remaining_months int not null default 0,
  start_date date not null,
  name text,
  color text,
  emoji text,
  is_fixed boolean not null default false,
  fixed_years int,
  fixed_end_date date,
  fixation_start_date date,
  current_balance numeric(14, 2),
  down_payment numeric(14, 2),
  payments_made int,
  installment_start_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists loans_user_id_idx on public.loans (user_id);

alter table public.loans enable row level security;

drop policy if exists "loans_own" on public.loans;
create policy "loans_own" on public.loans
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- updated_at (stejná fn jako ostatní tabulky)
drop trigger if exists loans_set_updated_at on public.loans;
create trigger loans_set_updated_at
before update on public.loans
for each row execute procedure update_updated_at_column();

comment on table public.loans is 'Osobní závazky uživatele (MoneyBuddy LoanItem).';
