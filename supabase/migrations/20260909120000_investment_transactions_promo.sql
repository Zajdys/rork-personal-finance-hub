-- Promo / free-share deposits: type 'promo' (counts in cash, not in „Vloženo“).
alter table public.investment_transactions
  drop constraint if exists investment_transactions_type_check;

alter table public.investment_transactions
  add constraint investment_transactions_type_check
  check (type in ('buy', 'sell', 'dividend', 'deposit', 'withdrawal', 'fee', 'promo'));

-- Known Trading 212 Free Shares Promotion rows (keep for cash flow, exclude from deposits).
update public.investment_transactions
set type = 'promo'
where type = 'deposit'
  and (
    external_id like 't212:eea1f808%'
    or external_id like 't212:019f1392-a9e1%'
  );
