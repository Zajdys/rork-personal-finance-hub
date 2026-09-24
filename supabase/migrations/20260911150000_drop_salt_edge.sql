-- Salt Edge removal (tables already dropped in production; keep migration for other envs).
drop table if exists public.salt_edge_transactions cascade;
drop table if exists public.salt_edge_connections cascade;

alter table public.users
  drop column if exists salt_edge_customer_id;

alter table public.users
  drop column if exists salt_edge_connection_id;
