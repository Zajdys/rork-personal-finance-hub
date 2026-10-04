alter table public.investment_portfolios
  add column if not exists cash_balances jsonb not null default '{}'::jsonb;

comment on column public.investment_portfolios.cash_balances is
  'Hotovost po měnách, např. {"EUR": 2.91, "USD": 0}. cash_balance zůstává v měně portfolia kvůli zpětné kompatibilitě.';
