alter table public.recurring_expenses
  drop column if exists paid,
  drop column if exists paid_at,
  drop column if exists paid_by_me,
  drop column if exists paid_by_partner,
  drop column if exists paid_reset_date,
  drop column if exists paid_month;
