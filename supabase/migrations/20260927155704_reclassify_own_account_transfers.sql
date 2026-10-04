-- Reclassify imported transactions whose counterparty is an own account → Převod.
-- SECURITY INVOKER — jen řádky auth.uid(); nikdy nepřepisuje category_source = 'user'.
--
-- Normalizace (mirror utils/normalizeAccount.ts):
-- 1) trim + odstranit mezery
-- 2) IBAN (2 písmena + …, len≥15): uppercase; CZ 24 znaků → domestic
--    CZ IBAN: CZ + 2 check + 4 banka + 6 předčíslí + 10 číslo → [prefix-]number/bank
--    (nuly na začátku předčíslí/čísla pryč; prázdné číslo → '0')
-- 3) domestic `prefix-number/bank` nebo `number/bank` (banka 4 číslice):
--    stejné stripování nul na předčíslí a čísle
-- 4) jinak vrátit řetězec beze změn (po strip spaces)

create or replace function public.normalize_cz_account(p_raw text)
returns text
language plpgsql
immutable
strict
set search_path = public
as $$
declare
  s text;
  iban text;
  bank text;
  prefix_raw text;
  number_raw text;
  prefix text;
  number text;
  m text[];
begin
  s := regexp_replace(trim(p_raw), '\s+', '', 'g');
  if s = '' then
    return null;
  end if;

  iban := upper(s);
  if iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]+$' and length(iban) >= 15 then
    if left(iban, 2) = 'CZ' and length(iban) = 24 then
      -- CZ + 2 + 4 bank + 6 prefix + 10 number
      bank := substring(iban from 5 for 4);
      prefix_raw := substring(iban from 9 for 6);
      number_raw := substring(iban from 15 for 10);
      prefix := nullif(ltrim(prefix_raw, '0'), '');
      number := coalesce(nullif(ltrim(number_raw, '0'), ''), '0');
      if prefix is not null then
        return prefix || '-' || number || '/' || bank;
      end if;
      return number || '/' || bank;
    end if;
    return iban;
  end if;

  -- optional prefix-number/bank
  m := regexp_match(s, '^(?:([0-9]{1,6})-)?([0-9]{2,16})/([0-9]{4})$');
  if m is not null then
    prefix_raw := m[1];
    number_raw := m[2];
    bank := m[3];
    number := coalesce(nullif(ltrim(number_raw, '0'), ''), '0');
    if prefix_raw is not null and prefix_raw <> '' then
      prefix := nullif(ltrim(prefix_raw, '0'), '');
      if prefix is not null then
        return prefix || '-' || number || '/' || bank;
      end if;
    end if;
    return number || '/' || bank;
  end if;

  return s;
end;
$$;

revoke all on function public.normalize_cz_account(text) from public, anon;
grant execute on function public.normalize_cz_account(text) to authenticated;

create or replace function public.reclassify_own_account_transfers(p_accounts text[])
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_updated int := 0;
  v_norm text[];
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_accounts is null or cardinality(p_accounts) = 0 then
    return 0;
  end if;

  select array_agg(distinct n)
  into v_norm
  from (
    select public.normalize_cz_account(a) as n
    from unnest(p_accounts) as a
  ) x
  where n is not null;

  if v_norm is null or cardinality(v_norm) = 0 then
    return 0;
  end if;

  update public.transactions t
  set
    category = 'Převod',
    category_source = 'transfer'
  where t.user_id = auth.uid()
    and t.counterparty_account is not null
    and public.normalize_cz_account(t.counterparty_account) = any (v_norm)
    and t.category_source in ('import', 'dictionary', 'keyword', 'crowd')
    and (
      t.category is distinct from 'Převod'
      or t.category_source is distinct from 'transfer'
    );

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke all on function public.reclassify_own_account_transfers(text[]) from public, anon;
grant execute on function public.reclassify_own_account_transfers(text[]) to authenticated;
