-- RLS: členové vidí všechny členy svých domácností + všechny platby v nich.
-- get_user_household_ids() je SECURITY DEFINER → bez rekurze na household_members.

-- ---------------------------------------------------------------------------
-- household_members
-- ---------------------------------------------------------------------------
drop policy if exists household_members_policy on public.household_members;
drop policy if exists "household_members_policy" on public.household_members;
drop policy if exists "household_members_read_member" on public.household_members;
drop policy if exists "household_members_join_self" on public.household_members;
drop policy if exists "household_members_leave_self" on public.household_members;
drop policy if exists household_members_read_same_household on public.household_members;
drop policy if exists household_members_write_own on public.household_members;
drop policy if exists household_members_delete_own on public.household_members;

create policy household_members_read_same_household
  on public.household_members for select
  using (household_id = any (public.get_user_household_ids()));

create policy household_members_write_own
  on public.household_members for insert
  with check (auth.uid() = user_id);

create policy household_members_delete_own
  on public.household_members for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- recurring_expense_payments
-- ---------------------------------------------------------------------------
drop policy if exists users_own_payments on public.recurring_expense_payments;
drop policy if exists "users_own_payments" on public.recurring_expense_payments;
drop policy if exists "recurring_expense_payments_select_member" on public.recurring_expense_payments;
drop policy if exists "recurring_expense_payments_insert_self" on public.recurring_expense_payments;
drop policy if exists "recurring_expense_payments_update_self" on public.recurring_expense_payments;
drop policy if exists "recurring_expense_payments_delete_self" on public.recurring_expense_payments;
drop policy if exists payments_read_household on public.recurring_expense_payments;
drop policy if exists payments_write_own on public.recurring_expense_payments;

create policy payments_read_household
  on public.recurring_expense_payments for select
  using (
    exists (
      select 1
      from public.recurring_expenses e
      where e.id = expense_id
        and e.household_id = any (public.get_user_household_ids())
    )
  );

create policy payments_write_own
  on public.recurring_expense_payments for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
