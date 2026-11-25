-- Notificaciones push: "Ana agregó un gasto en Casa".
--
-- Flujo: la app guarda el gasto (save_expense) y después llama a la Edge Function
-- `notify-expense`. La función, con la service role, llama a `claim_expense_push`, que
-- valida que quien avisa sea el autor, marca el gasto como notificado (una sola vez) y
-- devuelve los tokens de los demás miembros con cuenta. Los tokens nunca llegan a la app.

-- Un token por dispositivo; si en el celular entra otra persona, el token pasa a ella.
create table push_tokens (
  token       text primary key check (length(token) between 1 and 200),
  user_id     uuid not null references profiles (id) on delete cascade,
  platform    text not null check (platform in ('android', 'ios', 'web')),
  updated_at  timestamptz not null default now()
);
create index push_tokens_by_user on push_tokens (user_id);
alter table push_tokens enable row level security;
-- Sin políticas: solo se accede por las funciones de abajo.
revoke all on push_tokens from public, anon, authenticated;

alter table expenses add column push_sent_at timestamptz;

create function register_push_token(p_token text, p_platform text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  insert into push_tokens (token, user_id, platform)
  values (p_token, auth.uid(), p_platform)
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end $$;

create function unregister_push_token(p_token text) returns void
language sql security definer set search_path = public as $$
  delete from push_tokens where token = p_token and user_id = auth.uid();
$$;

-- Solo para la Edge Function (service_role). Devuelve vacío si no corresponde avisar:
-- el gasto no existe, no es de p_actor, está borrado, es del grupo personal, es viejo
-- (más de 10 minutos) o ya se avisó.
create function claim_expense_push(p_expense_id uuid, p_actor uuid)
returns table (token text, actor_name text, group_id uuid, group_name text,
               description text, amount_minor bigint, currency char(3))
language plpgsql security definer set search_path = public as $$
begin
  update expenses e set push_sent_at = now()
  from groups g
  where e.id = p_expense_id and g.id = e.group_id
    and e.created_by = p_actor and e.deleted_at is null and e.push_sent_at is null
    and e.created_at > now() - interval '10 minutes'
    and g.kind <> 'personal' and g.deleted_at is null;
  if not found then return; end if;

  return query
    select t.token, p.display_name, g.id, g.name, e.description, e.amount_minor, e.currency
    from expenses e
    join groups g on g.id = e.group_id
    join profiles p on p.id = p_actor
    join group_members m on m.group_id = g.id and m.left_at is null and m.user_id is not null and m.user_id <> p_actor
    join push_tokens t on t.user_id = m.user_id
    where e.id = p_expense_id;
end $$;

-- La Edge Function borra los tokens que Expo informa como dados de baja.
create function forget_push_tokens(p_tokens text[]) returns void
language sql security definer set search_path = public as $$
  delete from push_tokens where token = any (p_tokens);
$$;

revoke execute on all functions in schema public from public, anon;
grant execute on function register_push_token(text, text), unregister_push_token(text) to authenticated;
revoke execute on function claim_expense_push(uuid, uuid), forget_push_tokens(text[]) from authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function claim_expense_push(uuid, uuid), forget_push_tokens(text[]) to service_role;
    grant select, insert, update, delete on push_tokens to service_role;
  end if;
end $$;
