-- Datum valuty (value date) vedle transactions.date = zaúčtování.
-- NEPOUŠTĚT automaticky — ke kontrole před aplikací v DB.
alter table public.transactions
  add column if not exists booking_date date;

comment on column public.transactions.booking_date is
  'Datum valuty (value date). transactions.date = datum zaúčtování (booking).';
