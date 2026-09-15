create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text unique,
  display_name text,
  avatar_url text,
  plan_tier text not null default 'free'
    constraint profiles_plan_tier_check check (plan_tier in ('free', 'pro')),
  api_token_hash text unique,
  api_token_created_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles
  for select
  using ((select auth.uid()) = id);

create policy "profiles_update_own"
  on public.profiles
  for update
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create index if not exists profiles_plan_tier_idx on public.profiles (plan_tier);
