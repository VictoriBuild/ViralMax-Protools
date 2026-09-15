create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

create or replace function public.guard_profile_update()
returns trigger
language plpgsql
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is not null then
    if new.api_token_hash is distinct from old.api_token_hash then
      raise exception 'api token cannot be modified directly by a user session';
    end if;
    if new.plan_tier is distinct from old.plan_tier then
      raise exception 'plan tier cannot be modified directly by a user session';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_guard_update
  before update on public.profiles
  for each row
  execute function public.guard_profile_update();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, metadata)
  values (
    new.id,
    new.email,
    jsonb_build_object('email_confirmed', new.email_confirmed_at is not null)
  )
  on conflict (id) do nothing;

  insert into public.credit_balances (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
