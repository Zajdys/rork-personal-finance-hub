-- Hotovost po měnách (varianta A). cash_balance zůstává scalar v měně portfolia.
alter table public.investment_portfolios
  add column if not exists cash_balances jsonb not null default '{}'::jsonb;
