-- Заменяет handle_new_user из 0001: вместе с пустым кошельком сразу даёт 100
-- бонусных токенов и пишет в ledger операцию type='bonus' (с description'ом для аудита).
--
-- Идемпотентно: миграция перезаписывает функцию и пересоздаёт триггер.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_bonus bigint := 100;
begin
  insert into token_wallets (user_id, available)
  values (new.id, v_bonus)
  on conflict (user_id) do nothing;

  insert into token_transactions (user_id, type, amount, balance_after, description, metadata)
  values (new.id, 'bonus', v_bonus, v_bonus, 'Welcome bonus',
          jsonb_build_object('source', 'onboarding'));

  return new;
end;
$$;

drop trigger if exists on_user_created on "users";
create trigger on_user_created after insert on "users"
  for each row execute function public.handle_new_user();
