-- Účtenka u jednorázového společného výdaje (Storage: receipts/{household_id}/{expense_id}.jpg)
alter table public.shared_expenses add column if not exists receipt_url text;

-- Bucket receipts (pokud neexistuje); pro transakce může zůstat veřejný, domácnostní cesty chrání RLS.
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

-- Čtení účtenek domácnosti: jen členové dané domácnosti (první segment cesty = household_id)
drop policy if exists "receipts_household_member_select" on storage.objects;
create policy "receipts_household_member_select" on storage.objects
for select using (
  bucket_id = 'receipts'
  and exists (
    select 1 from public.household_members hm
    where hm.user_id = auth.uid()
      and hm.household_id::text = split_part(name, '/', 1)
  )
);

drop policy if exists "receipts_household_member_insert" on storage.objects;
create policy "receipts_household_member_insert" on storage.objects
for insert with check (
  bucket_id = 'receipts'
  and auth.uid() is not null
  and exists (
    select 1 from public.household_members hm
    where hm.user_id = auth.uid()
      and hm.household_id::text = split_part(name, '/', 1)
  )
);

drop policy if exists "receipts_household_member_update" on storage.objects;
create policy "receipts_household_member_update" on storage.objects
for update using (
  bucket_id = 'receipts'
  and exists (
    select 1 from public.household_members hm
    where hm.user_id = auth.uid()
      and hm.household_id::text = split_part(name, '/', 1)
  )
);

drop policy if exists "receipts_household_member_delete" on storage.objects;
create policy "receipts_household_member_delete" on storage.objects
for delete using (
  bucket_id = 'receipts'
  and exists (
    select 1 from public.household_members hm
    where hm.user_id = auth.uid()
      and hm.household_id::text = split_part(name, '/', 1)
  )
);
