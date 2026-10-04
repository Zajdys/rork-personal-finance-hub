-- Save decisions (Ušetři) + partner alert queue for local push delivery
create table if not exists public.save_decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete cascade,
  item_name text not null,
  price numeric not null,
  decision text not null check (decision in ('saved', 'bought', 'unsure')),
  hourly_wage numeric,
  hours_of_work numeric,
  future_value numeric,
  created_at timestamptz not null default now()
);

create index if not exists save_decisions_household_id_idx on public.save_decisions (household_id);
create index if not exists save_decisions_user_id_idx on public.save_decisions (user_id);
create index if not exists save_decisions_created_at_idx on public.save_decisions (created_at desc);

alter table public.save_decisions enable row level security;

drop policy if exists "save_decisions_access" on public.save_decisions;
create policy "save_decisions_access" on public.save_decisions
  for all
  using (
    household_id in (
      select hm.household_id from public.household_members hm
      where hm.user_id = auth.uid()
    )
    or (household_id is null and user_id = auth.uid())
  )
  with check (
    user_id = auth.uid()
    and (
      household_id is null
      or household_id in (
        select hm.household_id from public.household_members hm
        where hm.user_id = auth.uid()
      )
    )
  );

-- Partner alerts: inserted by sender, delivered as local push on recipient device via realtime
create table if not exists public.household_partner_alerts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists household_partner_alerts_recipient_idx
  on public.household_partner_alerts (recipient_user_id, created_at desc);

alter table public.household_partner_alerts enable row level security;

drop policy if exists "household_partner_alerts_select_recipient" on public.household_partner_alerts;
create policy "household_partner_alerts_select_recipient" on public.household_partner_alerts
  for select using (recipient_user_id = auth.uid() or sender_user_id = auth.uid());

drop policy if exists "household_partner_alerts_insert_sender" on public.household_partner_alerts;
create policy "household_partner_alerts_insert_sender" on public.household_partner_alerts
  for insert with check (sender_user_id = auth.uid());

drop policy if exists "household_partner_alerts_update_recipient" on public.household_partner_alerts;
create policy "household_partner_alerts_update_recipient" on public.household_partner_alerts
  for update using (recipient_user_id = auth.uid());

alter publication supabase_realtime add table public.household_partner_alerts;
