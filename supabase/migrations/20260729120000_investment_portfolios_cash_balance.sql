-- Free funds / cash balance on broker account (XTB Total from CASH OPERATION HISTORY)

alter table public.investment_portfolios
  add column if not exists cash_balance numeric;
