-- Cizí měny u bankovních / ručních transakcí + cache kurzů ČNB.
-- amount = vždy CZK (zdroj pravdy pro součty).
-- original_* + exchange_rate = null u čistě českých transakcí.

alter table public.transactions
  add column if not exists original_amount numeric(14, 2);

alter table public.transactions
  add column if not exists original_currency text;

alter table public.transactions
  add column if not exists exchange_rate numeric(18, 8);

comment on column public.transactions.amount is
  'Částka vždy v CZK — zdroj pravdy pro součty, kategorie a grafy.';
comment on column public.transactions.original_amount is
  'Původní částka v original_currency (null = transakce v CZK).';
comment on column public.transactions.original_currency is
  'ISO kód původní měny (EUR, USD, …); null u CZK.';
comment on column public.transactions.exchange_rate is
  'Kurz ČNB: kolik CZK za 1 jednotku original_currency (po dělení ČNB množstvím).';

create table if not exists public.exchange_rates (
  date date not null,
  currency text not null,
  rate numeric(18, 8) not null,
  amount int not null default 1,
  created_at timestamptz not null default now(),
  primary key (date, currency)
);

comment on table public.exchange_rates is
  'Denní kurzy ČNB (devizový trh). rate = CZK za `amount` jednotek měny (jako v denni_kurz.txt).';
comment on column public.exchange_rates.rate is
  'Kurz z ČNB pro dané množství (amount) jednotek měny.';
comment on column public.exchange_rates.amount is
  'Množství jednotek měny, ke kterému se vztahuje rate (1, 100, 1000…).';

create index if not exists exchange_rates_currency_date_idx
  on public.exchange_rates (currency, date desc);

alter table public.exchange_rates enable row level security;

drop policy if exists "exchange_rates_authenticated_select" on public.exchange_rates;
create policy "exchange_rates_authenticated_select"
  on public.exchange_rates
  for select
  to authenticated
  using (true);

-- Zápis jen service_role (edge funkce); authenticated nemá INSERT/UPDATE/DELETE policy.
