alter table public.user_profiles
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version text,
  add column if not exists age_confirmed_at timestamptz;

comment on column public.user_profiles.terms_accepted_at is 'Čas souhlasu s Podmínkami + Zásadami při registraci';
comment on column public.user_profiles.terms_version is 'Verze legal textů (např. 2026-10-09)';
comment on column public.user_profiles.age_confirmed_at is 'Čas potvrzení, že uživateli je 18+';
