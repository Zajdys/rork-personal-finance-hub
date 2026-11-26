-- GDPR: po smazání účtu smazat kontakt i z Brevo (event "delete" v edge funkci brevo-sync).
create or replace function public.users_brevo_delete()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_secret text;
begin
  if old.email is null or position('@' in old.email) = 0 then
    return old;
  end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'brevo_sync_secret' limit 1;
  if v_secret is null then
    return old;
  end if;
  perform net.http_post(
    url := 'https://jcwbkydaeeqcbdcxgnad.supabase.co/functions/v1/brevo-sync',
    body := jsonb_build_object('event', 'delete', 'email', lower(trim(old.email))),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-sync-secret', v_secret),
    timeout_milliseconds := 10000
  );
  return old;
exception when others then
  -- Mazání účtu nesmí nikdy spadnout kvůli e-mailu
  return old;
end;
$function$;

revoke all on function public.users_brevo_delete() from public, anon, authenticated;

drop trigger if exists trg_users_brevo_delete on public.users;
create trigger trg_users_brevo_delete
  after delete on public.users
  for each row execute function public.users_brevo_delete();
