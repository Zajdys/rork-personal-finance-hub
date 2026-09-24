-- RPC: backfill counterparty fields on reimport (only where NULL).
-- SECURITY INVOKER — respects RLS (auth.uid()).

create or replace function public.backfill_counterparty(p_rows jsonb)
returns integer
language sql
security invoker
set search_path = public
as $$
  with upd as (
    update public.transactions t set
      counterparty_account = coalesce(t.counterparty_account, nullif(r.account, '')),
      counterparty_name    = coalesce(t.counterparty_name, nullif(r.name, ''))
    from jsonb_to_recordset(p_rows) as r(unique_key text, account text, name text)
    where t.user_id = auth.uid()
      and t.unique_key = r.unique_key
      and (
        (t.counterparty_account is null and nullif(r.account, '') is not null)
        or (t.counterparty_name is null and nullif(r.name, '') is not null)
      )
    returning 1
  )
  select count(*)::int from upd;
$$;

revoke all on function public.backfill_counterparty(jsonb) from public;
grant execute on function public.backfill_counterparty(jsonb) to authenticated;

-- RPC: mark matching counterparty_account rows as Převod.
-- p_accounts must already be normalized (same form as counterparty_account).

create or replace function public.reclassify_transfers_by_accounts(p_accounts text[])
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_updated int := 0;
  v_missing int := 0;
begin
  if p_accounts is null or cardinality(p_accounts) = 0 then
    return jsonb_build_object('updated_count', 0, 'missing_counterparty_count', 0);
  end if;

  update public.transactions t
  set category = 'Převod'
  where t.user_id = auth.uid()
    and t.counterparty_account is not null
    and t.counterparty_account = any (p_accounts)
    and t.category is distinct from 'Převod';

  get diagnostics v_updated = row_count;

  select count(*)::int into v_missing
  from public.transactions t
  where t.user_id = auth.uid()
    and t.counterparty_account is null
    and coalesce(t.source, '') <> 'manual'
    and t.category is distinct from 'Převod';

  return jsonb_build_object(
    'updated_count', v_updated,
    'missing_counterparty_count', coalesce(v_missing, 0)
  );
end;
$$;

revoke all on function public.reclassify_transfers_by_accounts(text[]) from public;
grant execute on function public.reclassify_transfers_by_accounts(text[]) to authenticated;
