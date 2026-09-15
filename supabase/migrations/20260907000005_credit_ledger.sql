create or replace function public.grant_credits(
  p_user_id uuid,
  p_credits integer,
  p_reason text default 'grant',
  p_reference text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  if p_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'missing_user');
  end if;

  if p_credits <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_credits');
  end if;

  if p_reference is not null
    and exists (
      select 1
      from public.usage_logs
      where usage_logs.reference = p_reference
        and usage_logs.event_type = 'credit_grant'
    )
  then
    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'balance', coalesce(
        (select available_credits from public.credit_balances where user_id = p_user_id),
        0
      )
    );
  end if;

  insert into public.credit_balances (user_id, available_credits, lifetime_credits, updated_at)
  values (p_user_id, p_credits, p_credits, now())
  on conflict (user_id) do update
    set available_credits = public.credit_balances.available_credits + excluded.available_credits,
        lifetime_credits = public.credit_balances.lifetime_credits + excluded.lifetime_credits,
        updated_at = now()
  returning available_credits into v_balance;

  insert into public.usage_logs (user_id, event_type, credits_delta, balance_after, reference, metadata)
  values (
    p_user_id,
    'credit_grant',
    p_credits,
    v_balance,
    p_reference,
    p_metadata || jsonb_build_object('reason', p_reason)
  );

  return jsonb_build_object('ok', true, 'duplicate', false, 'balance', v_balance);
end;
$$;

create or replace function public.debit_credits(
  p_user_id uuid,
  p_credits integer,
  p_reason text default 'debit',
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
  v_remaining integer;
begin
  if p_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'missing_user');
  end if;

  if p_credits <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_credits');
  end if;

  update public.credit_balances
  set available_credits = available_credits - p_credits,
      updated_at = now()
  where user_id = p_user_id
    and available_credits >= p_credits
  returning available_credits into v_balance;

  if v_balance is null then
    select available_credits into v_remaining
    from public.credit_balances
    where user_id = p_user_id;

    return jsonb_build_object(
      'ok', false,
      'reason', 'insufficient_credits',
      'balance', coalesce(v_remaining, 0)
    );
  end if;

  insert into public.usage_logs (user_id, event_type, credits_delta, balance_after, metadata)
  values (
    p_user_id,
    'credit_deduct',
    -p_credits,
    v_balance,
    p_metadata || jsonb_build_object('reason', p_reason)
  );

  return jsonb_build_object('ok', true, 'balance', v_balance);
end;
$$;

revoke all on function public.grant_credits(uuid, integer, text, text, jsonb) from public;
revoke all on function public.debit_credits(uuid, integer, text, jsonb) from public;

grant execute on function public.grant_credits(uuid, integer, text, text, jsonb) to service_role;
grant execute on function public.debit_credits(uuid, integer, text, jsonb) to service_role;
