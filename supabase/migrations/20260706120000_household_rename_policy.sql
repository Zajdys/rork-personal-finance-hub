-- Allow household members to rename their household
drop policy if exists "households_update_member" on public.households;
create policy "households_update_member" on public.households
for update
using (
  exists (
    select 1 from public.household_members hm
    where hm.household_id = households.id and hm.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.household_members hm
    where hm.household_id = households.id and hm.user_id = auth.uid()
  )
);
