-- Category on split expenses (idempotent if already applied in dashboard)
alter table public.split_expenses
  add column if not exists category text not null default 'ostatni';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'split_expenses_category_check'
  ) then
    alter table public.split_expenses
      add constraint split_expenses_category_check
      check (
        category in (
          'jidlo',
          'doprava',
          'ubytovani',
          'zabava',
          'nakupy',
          'zdravi',
          'ostatni'
        )
      );
  end if;
end $$;
