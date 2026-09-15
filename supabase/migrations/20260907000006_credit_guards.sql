create or replace function public.guard_credit_balance_update()
returns trigger
language plpgsql
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is not null
    and (
      new.available_credits is distinct from old.available_credits
      or new.lifetime_credits is distinct from old.lifetime_credits
    )
  then
    raise exception 'credit balances are server-managed and cannot be edited by a user session';
  end if;
  return new;
end;
$$;

create trigger credit_balances_guard_update
  before update on public.credit_balances
  for each row
  execute function public.guard_credit_balance_update();

create policy "credit_balances_update_own"
  on public.credit_balances
  for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
