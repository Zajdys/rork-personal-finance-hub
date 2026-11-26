-- Výkon RLS a indexy (25. 11. 2026)
-- 1) auth.uid() -> (select auth.uid()): Postgres ho spočítá jednou na dotaz, ne pro každý řádek.
-- 2) Sloučení duplicitních permissive policies (stejný přístup, méně kontrol na řádek).
-- 3) Indexy na cizí klíče + (user_id, date) pro transakce.
-- 4) Pomocné funkce označené jako STABLE.
-- Viditelnost dat pro všechny uživatele ověřena před a po (stejné počty řádků).

begin;

-- ===== 2) Sloučení duplicitních policies =====

-- transactions: users_own_transactions (ALL) pokrývá všechny ostatní
drop policy if exists "Users can delete own transactions" on public.transactions;
drop policy if exists "Users can insert own transactions" on public.transactions;
drop policy if exists "Users can view own transactions" on public.transactions;
drop policy if exists "Users can update own transactions" on public.transactions;

-- users: users_upsert_own (ALL) pokrývá všechny ostatní
drop policy if exists "users insert own row" on public.users;
drop policy if exists "users select own row" on public.users;
drop policy if exists "users_select_own" on public.users;
drop policy if exists "users update own row" on public.users;

-- user_profiles: id = user_id u všech řádků; jedna ALL policy
drop policy if exists "users_own_profile" on public.user_profiles;
drop policy if exists "Users can insert own profile" on public.user_profiles;
drop policy if exists "Users can view own profile" on public.user_profiles;
drop policy if exists "Users can update own profile" on public.user_profiles;
create policy user_profiles_own on public.user_profiles for all
  using ((select auth.uid()) = user_id or (select auth.uid()) = id)
  with check ((select auth.uid()) = user_id or (select auth.uid()) = id);

-- recurring_expenses / shared_expenses: tři ekvivalentní "je člen domácnosti" -> jedna
drop policy if exists recurring_expenses_modify_member on public.recurring_expenses;
drop policy if exists recurring_expenses_read_member on public.recurring_expenses;
drop policy if exists recurring_expenses_policy on public.recurring_expenses;
create policy recurring_expenses_member on public.recurring_expenses for all
  using (household_id in (select public.get_user_household_ids()))
  with check (household_id in (select public.get_user_household_ids()));

drop policy if exists shared_expenses_modify_member on public.shared_expenses;
drop policy if exists shared_expenses_read_member on public.shared_expenses;
drop policy if exists shared_expenses_policy on public.shared_expenses;
create policy shared_expenses_member on public.shared_expenses for all
  using (household_id in (select public.get_user_household_ids()))
  with check (household_id in (select public.get_user_household_ids()));

-- recurring_expense_payment_periods: repp_read je totožná s repp_write (ALL)
drop policy if exists repp_read on public.recurring_expense_payment_periods;

-- households: jedna permissive policy na příkaz (restriktivní delete zůstává)
drop policy if exists households_policy on public.households;
drop policy if exists households_create on public.households;
drop policy if exists households_read_member on public.households;
drop policy if exists households_update_member on public.households;
create policy households_select on public.households for select
  using (created_by = (select auth.uid()) or id in (select public.get_user_household_ids()));
create policy households_insert on public.households for insert
  with check (created_by = (select auth.uid()) or id in (select public.get_user_household_ids()));
create policy households_update on public.households for update
  using (id in (select public.get_user_household_ids()))
  with check (id in (select public.get_user_household_ids()));
create policy households_delete on public.households for delete
  using (id in (select public.get_user_household_ids()));

-- ===== 1) auth.uid() -> (select auth.uid()) u všech zbývajících policies =====
-- Generuje se z aktuálních definic (bez ručního přepisu); už zabalené výskyty se přeskočí.
do $rls$
declare r record; q text; w text;
begin
  for r in
    select tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual,'') || coalesce(with_check,'')) ~ '(?<!SELECT )auth\.uid\(\)'
  loop
    q := regexp_replace(r.qual, '(?<!SELECT )auth\.uid\(\)', '(select auth.uid())', 'g');
    w := regexp_replace(r.with_check, '(?<!SELECT )auth\.uid\(\)', '(select auth.uid())', 'g');
    execute format('alter policy %I on public.%I%s%s', r.policyname, r.tablename,
      case when q is not null then ' using (' || q || ')' else '' end,
      case when w is not null then ' with check (' || w || ')' else '' end);
  end loop;
end
$rls$;

-- ===== 4) Pomocné funkce: STABLE (v rámci dotazu vrací stejný výsledek) =====
alter function public.get_user_household_ids() stable;
alter function public.is_split_group_member(uuid) stable;
alter function public.is_split_group_owner(uuid) stable;

-- ===== 3) Indexy =====
create index if not exists idx_transactions_user_date on public.transactions (user_id, date desc);
create index if not exists idx_households_created_by on public.households (created_by);
create index if not exists idx_household_members_user_id on public.household_members (user_id);
create index if not exists idx_recurring_expenses_added_by on public.recurring_expenses (added_by);
create index if not exists idx_recurring_expenses_created_by on public.recurring_expenses (created_by);
create index if not exists idx_recurring_expenses_household_id on public.recurring_expenses (household_id);
create index if not exists idx_recurring_expenses_payer_user_id on public.recurring_expenses (payer_user_id);
create index if not exists idx_shared_expenses_added_by on public.shared_expenses (added_by);
create index if not exists idx_shared_expenses_household_id on public.shared_expenses (household_id);
create index if not exists idx_shared_expenses_payer_user_id on public.shared_expenses (payer_user_id);
create index if not exists idx_investment_records_user_id on public.investment_records (user_id);
create index if not exists idx_reserve_records_user_id on public.reserve_records (user_id);
create index if not exists idx_recurring_expense_payments_user_id on public.recurring_expense_payments (user_id);
create index if not exists idx_household_partner_alerts_household_id on public.household_partner_alerts (household_id);
create index if not exists idx_household_partner_alerts_sender_user_id on public.household_partner_alerts (sender_user_id);
create index if not exists idx_split_groups_created_by on public.split_groups (created_by);
create index if not exists idx_split_expenses_added_by on public.split_expenses (added_by);
create index if not exists idx_split_expenses_paid_by on public.split_expenses (paid_by);
create index if not exists idx_split_expense_shares_member_id on public.split_expense_shares (member_id);
create index if not exists idx_split_settlements_from_member_id on public.split_settlements (from_member_id);
create index if not exists idx_split_settlements_to_member_id on public.split_settlements (to_member_id);
create index if not exists idx_household_settlements_created_by on public.household_settlements (created_by);
create index if not exists idx_household_settlements_from_user_id on public.household_settlements (from_user_id);
create index if not exists idx_household_settlements_to_user_id on public.household_settlements (to_user_id);
create index if not exists idx_recurring_expense_payment_periods_payer_user_id on public.recurring_expense_payment_periods (payer_user_id);
create index if not exists idx_bank_connection_secrets_user_id on public.bank_connection_secrets (user_id);
create index if not exists idx_savings_goal_contributions_user_id on public.savings_goal_contributions (user_id);

commit;
