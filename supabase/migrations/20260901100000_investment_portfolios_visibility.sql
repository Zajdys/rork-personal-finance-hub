-- Personal vs shared investment portfolios

alter table public.investment_portfolios
  add column if not exists owner_user_id uuid references auth.users(id),
  add column if not exists visibility text not null default 'shared'
    check (visibility in ('personal', 'shared'));

-- Explicit personal portfolio (eToro, 704 transactions)
update public.investment_portfolios
set
  owner_user_id = '7ce943bd-eb89-4c95-9022-39a08901320a',
  visibility = 'personal',
  household_id = null
where id = '9cfcc7cb-82df-4050-b28b-691d10f2fe72';

-- Remaining portfolios: infer owner + visibility from household
do $$
declare
  r record;
  v_owner uuid;
  v_is_personal boolean;
begin
  for r in
    select p.id, p.household_id, h.name as household_name, h.created_by
    from public.investment_portfolios p
    left join public.households h on h.id = p.household_id
    where p.owner_user_id is null
  loop
    if r.household_id is null then
      raise notice 'investment_portfolios migration: portfolio % has no household, skipping owner inference', r.id;
      continue;
    end if;

    v_is_personal := lower(trim(coalesce(r.household_name, ''))) in ('osobní', 'osobni', 'personal');

    if r.created_by is not null then
      v_owner := r.created_by;
    else
      select hm.user_id into v_owner
      from public.household_members hm
      where hm.household_id = r.household_id
      order by hm.joined_at nulls last, hm.user_id
      limit 1;

      if v_owner is not null then
        raise notice 'investment_portfolios migration: portfolio % — owner from first household member %', r.id, v_owner;
      end if;
    end if;

    if v_owner is null then
      raise notice 'investment_portfolios migration: portfolio % — could not resolve owner', r.id;
      continue;
    end if;

    update public.investment_portfolios
    set
      owner_user_id = v_owner,
      visibility = case when v_is_personal then 'personal' else 'shared' end,
      household_id = case when v_is_personal then null else r.household_id end
    where id = r.id;
  end loop;
end $$;

-- Fallback: any portfolio still missing owner (should not happen)
update public.investment_portfolios p
set owner_user_id = sub.user_id
from (
  select distinct on (p2.id) p2.id as portfolio_id, hm.user_id
  from public.investment_portfolios p2
  join public.household_members hm on hm.household_id = p2.household_id
  where p2.owner_user_id is null and p2.household_id is not null
  order by p2.id, hm.joined_at nulls last, hm.user_id
) sub
where p.id = sub.portfolio_id and p.owner_user_id is null;

alter table public.investment_portfolios
  alter column owner_user_id set not null;

alter table public.investment_portfolios
  alter column visibility set default 'personal';

alter table public.investment_portfolios
  drop constraint if exists investment_portfolios_visibility_household_check;

alter table public.investment_portfolios
  add constraint investment_portfolios_visibility_household_check
  check (
    (visibility = 'personal' and household_id is null)
    or (visibility = 'shared' and household_id is not null)
  );

create index if not exists investment_portfolios_owner_user_id_idx
  on public.investment_portfolios (owner_user_id);

create index if not exists investment_portfolios_visibility_household_idx
  on public.investment_portfolios (visibility, household_id);

-- RLS: investment_portfolios
drop policy if exists "household_access" on public.investment_portfolios;

drop policy if exists "portfolio_personal_or_shared" on public.investment_portfolios;
create policy "portfolio_personal_or_shared" on public.investment_portfolios
  for all
  using (
    (visibility = 'personal' and owner_user_id = auth.uid())
    or (
      visibility = 'shared'
      and household_id in (
        select hm.household_id from public.household_members hm where hm.user_id = auth.uid()
      )
    )
  )
  with check (
    owner_user_id = auth.uid()
    and (
      (visibility = 'personal' and household_id is null)
      or (
        visibility = 'shared'
        and household_id in (
          select hm.household_id from public.household_members hm where hm.user_id = auth.uid()
        )
      )
    )
  );

-- RLS: investment_positions
drop policy if exists "portfolio_access" on public.investment_positions;

drop policy if exists "portfolio_positions_access" on public.investment_positions;
create policy "portfolio_positions_access" on public.investment_positions
  for all
  using (
    exists (
      select 1 from public.investment_portfolios p
      where p.id = portfolio_id
        and (
          (p.visibility = 'personal' and p.owner_user_id = auth.uid())
          or (
            p.visibility = 'shared'
            and p.household_id in (
              select hm.household_id from public.household_members hm where hm.user_id = auth.uid()
            )
          )
        )
    )
  )
  with check (
    exists (
      select 1 from public.investment_portfolios p
      where p.id = portfolio_id
        and (
          (p.visibility = 'personal' and p.owner_user_id = auth.uid())
          or (
            p.visibility = 'shared'
            and p.household_id in (
              select hm.household_id from public.household_members hm where hm.user_id = auth.uid()
            )
          )
        )
    )
  );

-- RLS: investment_transactions
drop policy if exists "portfolio_access" on public.investment_transactions;

drop policy if exists "portfolio_transactions_access" on public.investment_transactions;
create policy "portfolio_transactions_access" on public.investment_transactions
  for all
  using (
    exists (
      select 1 from public.investment_portfolios p
      where p.id = portfolio_id
        and (
          (p.visibility = 'personal' and p.owner_user_id = auth.uid())
          or (
            p.visibility = 'shared'
            and p.household_id in (
              select hm.household_id from public.household_members hm where hm.user_id = auth.uid()
            )
          )
        )
    )
  )
  with check (
    exists (
      select 1 from public.investment_portfolios p
      where p.id = portfolio_id
        and (
          (p.visibility = 'personal' and p.owner_user_id = auth.uid())
          or (
            p.visibility = 'shared'
            and p.household_id in (
              select hm.household_id from public.household_members hm where hm.user_id = auth.uid()
            )
          )
        )
    )
  );
