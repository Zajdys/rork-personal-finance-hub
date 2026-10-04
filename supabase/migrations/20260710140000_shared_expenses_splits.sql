-- Jednorázové společné výdaje domácnosti (split + kategorie)
alter table public.shared_expenses add column if not exists category text not null default 'Ostatní';
alter table public.shared_expenses add column if not exists split_type text not null default 'half';
alter table public.shared_expenses add column if not exists split_percent numeric default 50;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'shared_expenses_split_type_check'
  ) then
    alter table public.shared_expenses
      add constraint shared_expenses_split_type_check
      check (split_type in ('me', 'half', 'custom'));
  end if;
end $$;

-- Sjednocená policy (idempotentní)
drop policy if exists "shared_expenses_access" on public.shared_expenses;
create policy "shared_expenses_access" on public.shared_expenses
  for all
  using (
    household_id in (
      select household_id from public.household_members
      where user_id = auth.uid()
    )
  )
  with check (
    household_id in (
      select household_id from public.household_members
      where user_id = auth.uid()
    )
  );
