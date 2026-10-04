-- Vlastní bankovní účty: DB = zdroj pravdy (dříve AsyncStorage ownerBanks).
-- bank je sloupec (UI seskupuje bank → účty). account_number_normalized plní trigger, ne klient.
-- reclassify_own_account_transfers() čte účty z této tabulky (bez parametru od klienta).

create table if not exists public.owner_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  bank text,
  account_label text,
  holder_name text,
  account_number text not null,
  account_number_normalized text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, account_number_normalized)
);

create index if not exists owner_bank_accounts_user_id_idx
  on public.owner_bank_accounts (user_id);

drop trigger if exists owner_bank_accounts_set_updated_at on public.owner_bank_accounts;
create trigger owner_bank_accounts_set_updated_at
before update on public.owner_bank_accounts
for each row execute procedure update_updated_at_column();

-- Normalizace čísla účtu před insert/update (mirror public.normalize_cz_account).
create or replace function public.owner_bank_accounts_set_normalized()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  n text;
begin
  n := public.normalize_cz_account(NEW.account_number);
  if n is null or n = '' then
    raise exception 'owner_bank_accounts: invalid account_number';
  end if;
  NEW.account_number_normalized := n;
  return NEW;
end;
$$;

drop trigger if exists owner_bank_accounts_set_normalized on public.owner_bank_accounts;
create trigger owner_bank_accounts_set_normalized
before insert or update of account_number on public.owner_bank_accounts
for each row execute procedure public.owner_bank_accounts_set_normalized();

alter table public.owner_bank_accounts enable row level security;

drop policy if exists "owner_bank_accounts_own" on public.owner_bank_accounts;
create policy "owner_bank_accounts_own" on public.owner_bank_accounts
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke all on table public.owner_bank_accounts from public, anon;
grant select, insert, update, delete on table public.owner_bank_accounts to authenticated;

revoke all on function public.owner_bank_accounts_set_normalized() from public, anon;

-- Reclassify: bez parametru — účty z owner_bank_accounts pro auth.uid().
drop function if exists public.reclassify_own_account_transfers(text[]);

create or replace function public.reclassify_own_account_transfers()
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

  select array_agg(distinct o.account_number_normalized)
  into v_norm
  from public.owner_bank_accounts o
  where o.user_id = auth.uid()
    and o.account_number_normalized is not null
    and o.account_number_normalized <> '';

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

revoke all on function public.reclassify_own_account_transfers() from public, anon;
grant execute on function public.reclassify_own_account_transfers() to authenticated;
