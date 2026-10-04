/**
 * SQL: rozšíření investment_transactions o typy interest + tax (XTB úroky / WHT).
 * Aplikuj ručně v Supabase SQL editoru, pak nastav
 * INVESTMENT_TX_INTEREST_TAX_ENABLED = true v constants/feature-flags.ts.
 *
 * -- Až po aplikaci tohoto SQL:
 * --   constants/feature-flags.ts → INVESTMENT_TX_INTEREST_TAX_ENABLED = true
 */

alter table public.investment_transactions
  drop constraint if exists investment_transactions_type_check;

alter table public.investment_transactions
  add constraint investment_transactions_type_check
  check (
    type in (
      'buy',
      'sell',
      'dividend',
      'deposit',
      'withdrawal',
      'fee',
      'promo',
      'transfer_out',
      'gift',
      'interest',
      'tax'
    )
  );

comment on column public.investment_transactions.type is
  'interest = úrok z volných prostředků (cash ↑, ne Vloženo). tax = WHT / daň z úroku (cash ↓).';
