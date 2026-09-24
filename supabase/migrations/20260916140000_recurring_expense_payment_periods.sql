-- Historie režimu platby u pravidelných výdajů (effective_from).
-- get_user_household_ids() vrací uuid[] → porovnání přes = ANY.

create table if not exists public.recurring_expense_payment_periods (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.recurring_expenses(id) on delete cascade,
  payment_mode text not null,
  payer_user_id uuid references public.users(id),
  effective_from date not null,
  created_at timestamptz not null default now(),
  constraint repp_mode_check check (
    (payment_mode = 'each_own_share' and payer_user_id is null)
    or (payment_mode = 'single_payer' and payer_user_id is not null)
  ),
  constraint repp_unique_start unique (expense_id, effective_from)
);

create index if not exists repp_expense_idx
  on public.recurring_expense_payment_periods (expense_id, effective_from desc);

-- backfill: každá existující položka dostane jedno období od svého založení
insert into public.recurring_expense_payment_periods
  (expense_id, payment_mode, payer_user_id, effective_from)
select id, payment_mode, payer_user_id, created_at::date
from public.recurring_expenses
on conflict (expense_id, effective_from) do nothing;

alter table public.recurring_expense_payment_periods enable row level security;

drop policy if exists repp_read on public.recurring_expense_payment_periods;
create policy repp_read
  on public.recurring_expense_payment_periods for select
  using (exists (
    select 1 from public.recurring_expenses e
    where e.id = expense_id
      and e.household_id = any (public.get_user_household_ids())
  ));

drop policy if exists repp_write on public.recurring_expense_payment_periods;
create policy repp_write
  on public.recurring_expense_payment_periods for all
  using (exists (
    select 1 from public.recurring_expenses e
    where e.id = expense_id
      and e.household_id = any (public.get_user_household_ids())
  ))
  with check (exists (
    select 1 from public.recurring_expenses e
    where e.id = expense_id
      and e.household_id = any (public.get_user_household_ids())
  ));
