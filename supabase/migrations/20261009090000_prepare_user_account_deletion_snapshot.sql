-- Snapshot funkce z produkce (2026-10-09), aby repo odpovídalo DB. Idempotentní.
CREATE OR REPLACE FUNCTION public.prepare_user_account_deletion(target_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  new_owner uuid;
  hh record;
  prevedeno int := 0;
  odplatceno int := 0;
begin
  -- A) předat vlastnictví domácností dalšímu členu
  for hh in
    select h.id from public.households h
    where h.created_by = target_user
  loop
    select hm.user_id into new_owner
    from public.household_members hm
    where hm.household_id = hh.id and hm.user_id <> target_user
    order by hm.user_id
    limit 1;

    if new_owner is not null then
      update public.households set created_by = new_owner where id = hh.id;
      prevedeno := prevedeno + 1;
    end if;
    -- když další člen není, domácnost odejde s uživatelem přes CASCADE
  end loop;

  -- B) položky, kde byl plátcem, zpět na "každý platí svůj podíl"
  update public.recurring_expenses
  set payment_mode = 'each_own_share', payer_user_id = null
  where payer_user_id = target_user;
  get diagnostics odplatceno = row_count;

  update public.recurring_expense_payment_periods
  set payment_mode = 'each_own_share', payer_user_id = null
  where payer_user_id = target_user;

  update public.shared_expenses
  set payment_mode = 'each_own_share', payer_user_id = null
  where payer_user_id = target_user;

  return jsonb_build_object(
    'households_transferred', prevedeno,
    'expenses_unassigned', odplatceno
  );
end;
$function$;

revoke all on function public.prepare_user_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.prepare_user_account_deletion(uuid) to service_role;
