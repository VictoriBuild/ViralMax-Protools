create table if not exists public.usage_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_type text not null,
  credits_delta integer not null default 0,
  balance_after integer,
  reference text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.usage_logs enable row level security;

create policy "usage_logs_select_own"
  on public.usage_logs
  for select
  using ((select auth.uid()) = user_id);

create index if not exists usage_logs_user_created_idx
  on public.usage_logs (user_id, created_at desc);

create index if not exists usage_logs_event_type_idx
  on public.usage_logs (event_type);

create unique index if not exists usage_logs_reference_idx
  on public.usage_logs (reference)
  where reference is not null;
