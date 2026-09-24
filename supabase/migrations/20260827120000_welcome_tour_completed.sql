-- Welcome tour po onboardingu + příprava na jednorázové nápovědy
alter table public.users
  add column if not exists welcome_tour_completed boolean not null default false;

alter table public.users
  add column if not exists seen_hints jsonb not null default '{}'::jsonb;

-- Stávající uživatelé, co už prošli onboardingem, tour znovu neukazovat
update public.users
set welcome_tour_completed = true
where onboarding_completed = true
  and welcome_tour_completed = false;
