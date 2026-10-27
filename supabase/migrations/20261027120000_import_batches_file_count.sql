-- Evidence importních dávek s počtem souborů (Free limit).
-- Aplikováno v produkci přes Supabase MCP — soubor = zdroj pravdy v repu.

create table if not exists public.import_batches (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  file_count integer not null default 1 check (file_count >= 1 and file_count <= 500),
  created_at timestamptz not null default now()
);

create index if not exists import_batches_user_created_idx
  on public.import_batches (user_id, created_at);

comment on table public.import_batches is
  'Jedna dávka = jeden potvrzený import (PDF/CSV). file_count = počet souborů ve výběru. Řádky se nemažou (kvóta se nevrací).';

-- Klient nesmí podvrhnout created_at — vždy now() pro authenticated/anon.
create or replace function public.import_batches_force_created_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.created_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists import_batches_force_created_at on public.import_batches;
create trigger import_batches_force_created_at
  before insert on public.import_batches
  for each row
  execute function public.import_batches_force_created_at();

alter table public.import_batches enable row level security;

revoke all on table public.import_batches from public, anon, authenticated;
grant select, insert on table public.import_batches to authenticated;

drop policy if exists import_batches_select_own on public.import_batches;
create policy import_batches_select_own
  on public.import_batches for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists import_batches_insert_own on public.import_batches;
create policy import_batches_insert_own
  on public.import_batches for insert
  to authenticated
  with check (user_id = auth.uid());

-- Žádný UPDATE / DELETE policy — kvóta se smazáním transakcí nevrací.

-- Backfill: 1 soubor na existující import_batch_id z transactions.
insert into public.import_batches (id, user_id, file_count, created_at)
select
  t.import_batch_id::uuid,
  t.user_id,
  1,
  min(t.created_at)
from public.transactions t
where t.import_batch_id is not null
  and t.user_id is not null
group by t.import_batch_id, t.user_id
on conflict (id) do nothing;
