-- Atomic wallet operations. App calls these via Drizzle's `sql` template;
-- locking and audit live here so concurrent jobs can't double-spend.

create or replace function public.wallet_reserve(
  p_user_id text, p_amount bigint, p_job_id uuid, p_tool_id uuid, p_description text default null
) returns bigint
language plpgsql security definer set search_path = public
as $$
declare v_available bigint;
begin
  if p_amount <= 0 then raise exception 'wallet_reserve: amount must be positive'; end if;

  update token_wallets
     set available = available - p_amount,
         reserved  = reserved  + p_amount
   where user_id = p_user_id and available >= p_amount
   returning available into v_available;

  if not found then raise exception 'INSUFFICIENT_FUNDS' using errcode = 'P0001'; end if;

  insert into token_transactions (user_id, type, amount, balance_after, tool_id, job_id, description)
  values (p_user_id, 'reserve', p_amount, v_available, p_tool_id, p_job_id, p_description);

  return v_available;
end;
$$;

create or replace function public.wallet_charge(
  p_user_id text, p_amount bigint, p_reserved bigint,
  p_job_id uuid, p_tool_id uuid, p_description text default null
) returns bigint
language plpgsql security definer set search_path = public
as $$
declare v_available bigint; v_refund bigint;
begin
  if p_amount < 0 or p_reserved <= 0 or p_amount > p_reserved then
    raise exception 'wallet_charge: invalid amounts'; end if;

  v_refund := p_reserved - p_amount;

  update token_wallets
     set reserved    = reserved - p_reserved,
         available   = available + v_refund,
         total_spent = total_spent + p_amount
   where user_id = p_user_id and reserved >= p_reserved
   returning available into v_available;

  if not found then raise exception 'wallet_charge: reservation not found'; end if;

  insert into token_transactions (user_id, type, amount, balance_after, tool_id, job_id, description)
  values (p_user_id, 'spend', p_amount, v_available, p_tool_id, p_job_id, p_description);

  if v_refund > 0 then
    insert into token_transactions (user_id, type, amount, balance_after, tool_id, job_id, description, metadata)
    values (p_user_id, 'release', v_refund, v_available, p_tool_id, p_job_id,
            'partial release on charge', jsonb_build_object('reserved', p_reserved, 'charged', p_amount));
  end if;

  return v_available;
end;
$$;

create or replace function public.wallet_refund(
  p_user_id text, p_amount bigint, p_job_id uuid, p_tool_id uuid, p_description text default null
) returns bigint
language plpgsql security definer set search_path = public
as $$
declare v_available bigint;
begin
  if p_amount <= 0 then raise exception 'wallet_refund: amount must be positive'; end if;

  update token_wallets
     set reserved  = reserved - p_amount,
         available = available + p_amount
   where user_id = p_user_id and reserved >= p_amount
   returning available into v_available;

  if not found then raise exception 'wallet_refund: reservation not found'; end if;

  insert into token_transactions (user_id, type, amount, balance_after, tool_id, job_id, description)
  values (p_user_id, 'refund', p_amount, v_available, p_tool_id, p_job_id, p_description);

  return v_available;
end;
$$;

create or replace function public.wallet_credit(
  p_user_id text, p_amount bigint, p_type text,
  p_payment_id uuid default null, p_description text default null
) returns bigint
language plpgsql security definer set search_path = public
as $$
declare v_available bigint;
begin
  if p_amount <= 0 then raise exception 'wallet_credit: amount must be positive'; end if;
  if p_type not in ('purchase','bonus','adjustment') then
    raise exception 'wallet_credit: invalid type %', p_type;
  end if;

  update token_wallets
     set available       = available + p_amount,
         total_purchased = total_purchased + case when p_type = 'purchase' then p_amount else 0 end
   where user_id = p_user_id
   returning available into v_available;

  if not found then
    insert into token_wallets (user_id, available, total_purchased)
    values (p_user_id, p_amount, case when p_type = 'purchase' then p_amount else 0 end)
    returning available into v_available;
  end if;

  insert into token_transactions (user_id, type, amount, balance_after, payment_id, description)
  values (p_user_id, p_type, p_amount, v_available, p_payment_id, p_description);

  return v_available;
end;
$$;

-- Auto-create wallet when a new user signs up via Auth.js
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into token_wallets (user_id, available) values (new.id, 0)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_user_created on "users";
create trigger on_user_created after insert on "users"
  for each row execute function public.handle_new_user();
