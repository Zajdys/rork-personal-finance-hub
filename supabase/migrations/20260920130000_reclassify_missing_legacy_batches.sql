-- Count missing counterparties only in legacy import batches
-- (no row in the batch has counterparty_account set).
-- New imports leave card/ATM counterparties NULL legitimately.

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
    and t.import_batch_id is not null
    and not exists (
      select 1
      from public.transactions x
      where x.user_id = t.user_id
        and x.import_batch_id = t.import_batch_id
        and x.counterparty_account is not null
    );

  return jsonb_build_object(
    'updated_count', v_updated,
    'missing_counterparty_count', coalesce(v_missing, 0)
  );
end;
$$;
