-- App Store / privacy: partner nesmí číst celý řádek public.users (měsíční příjem, cíle…).
-- Místo toho SECURITY DEFINER RPC vrací jen id, display_name, email členů mých domácností.

drop policy if exists "users select household members" on public.users;

create or replace function public.get_household_member_profiles()
returns table (
  id uuid,
  display_name text,
  email text
)
language sql
stable
security definer
set search_path = public
as $$
  select distinct
    u.id,
    u.display_name,
    u.email
  from public.users u
  inner join public.household_members hm on hm.user_id = u.id
  where hm.household_id in (
    select hm2.household_id
    from public.household_members hm2
    where hm2.user_id = auth.uid()
  );
$$;

revoke all on function public.get_household_member_profiles() from public;
revoke all on function public.get_household_member_profiles() from anon;
grant execute on function public.get_household_member_profiles() to authenticated;

comment on function public.get_household_member_profiles() is
  'Minimální profily (id, display_name, email) členů domácností, kde je auth.uid() členem.';
