-- Allow authenticated users to look up another user by exact email (for split group invites).
-- public.users RLS only allows selecting own row, so we need a narrow security-definer helper.

create or replace function public.find_user_by_email(p_email text)
returns table (
  id uuid,
  email text,
  display_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    u.id,
    u.email,
    coalesce(nullif(trim(u.display_name), ''), u.email) as display_name
  from public.users u
  where lower(u.email) = lower(trim(p_email))
  limit 1;
$$;

revoke all on function public.find_user_by_email(text) from public;
grant execute on function public.find_user_by_email(text) to authenticated;
