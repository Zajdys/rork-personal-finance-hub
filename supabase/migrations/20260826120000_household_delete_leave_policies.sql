-- DELETE domácnosti (jen zakladatel) + opuštění (smazání vlastního členství)
drop policy if exists "households_delete_creator" on public.households;
create policy "households_delete_creator" on public.households
for delete
using (created_by = auth.uid());

drop policy if exists "household_members_leave_self" on public.household_members;
create policy "household_members_leave_self" on public.household_members
for delete
using (user_id = auth.uid());
