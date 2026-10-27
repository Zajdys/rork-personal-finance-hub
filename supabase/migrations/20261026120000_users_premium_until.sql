alter table public.users
  add column if not exists premium_until timestamptz;

-- premium_until smí měnit jen server (webhook přes service_role), ne klient
create or replace function public.users_protect_premium_until()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.premium_until := null;
    elsif new.premium_until is distinct from old.premium_until then
      new.premium_until := old.premium_until;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists users_protect_premium_until on public.users;
create trigger users_protect_premium_until
  before insert or update on public.users
  for each row execute function public.users_protect_premium_until();

-- má někdo v mé domácnosti (včetně mě) aktivní premium? Vrací jen boolean.
create or replace function public.household_has_premium()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = (select auth.uid())
      and u.premium_until > now()
  ) or exists (
    select 1
    from public.household_members me
    join public.household_members them on them.household_id = me.household_id
    join public.users u on u.id = them.user_id
    where me.user_id = (select auth.uid())
      and u.premium_until > now()
  );
$$;

revoke all on function public.household_has_premium() from public, anon;
grant execute on function public.household_has_premium() to authenticated;
