-- Sync user_profiles.id ↔ user_id (FK na public.users).
-- Upsert jen s user_id dříve generoval náhodné id → user_profiles_id_fkey.

create or replace function public.user_profiles_sync_ids()
returns trigger
language plpgsql
as $$
begin
  if new.user_id is not null then
    new.id := new.user_id;
  elsif new.id is not null then
    new.user_id := new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists user_profiles_sync_ids on public.user_profiles;
create trigger user_profiles_sync_ids
  before insert or update of id, user_id
  on public.user_profiles
  for each row
  execute function public.user_profiles_sync_ids();

comment on function public.user_profiles_sync_ids() is
  'Drží user_profiles.id = user_id (oba odkazují na public.users).';
