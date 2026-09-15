create table if not exists public.credit_balances (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  available_credits integer not null default 0
    constraint credit_balances_available_check check (available_credits >= 0),
  lifetime_credits integer not null default 0
    constraint credit_balances_lifetime_check check (lifetime_credits >= 0),
  updated_at timestamptz not null default now()
);

alter table public.credit_balances enable row level security;

create policy "credit_balances_select_own"
  on public.credit_balances
  for select
  using ((select auth.uid()) = user_id);

create index if not exists credit_balances_updated_at_idx
  on public.credit_balances (updated_at desc);
