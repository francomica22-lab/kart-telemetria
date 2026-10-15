-- Aplicado en el proyecto kart-telemetria (migracion "bajas_admin").
-- Link al portal de cliente (Lemon Squeezy) para cambiar tarjeta / facturas.
alter table public.suscripciones add column portal_url text;

-- Pedidos de baja y de arrepentimiento (los crea la funcion "cancelar"; los sin cuenta, la pagina publica).
create table public.pedidos_baja (
  id bigint generated always as identity primary key,
  creado timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  email text not null check (char_length(email) between 3 and 200),
  tipo text not null check (tipo in ('baja', 'arrepentimiento')),
  motivo text check (char_length(motivo) <= 600),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'resuelto')),
  proveedor text, proveedor_ref text
);
alter table public.pedidos_baja enable row level security;
-- desde la pagina publica (sin cuenta) solo se puede agregar un pedido pendiente
create policy "pedido publico" on public.pedidos_baja for insert to anon, authenticated
  with check (estado = 'pendiente' and proveedor is null and proveedor_ref is null and (user_id is null or user_id = (select auth.uid())));

-- Plan efectivo: suma proveedor y portal para el panel de cuenta.
create or replace function public.mi_plan() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select coalesce((
    select jsonb_build_object(
      'plan', case when s.vence > now() and s.estado <> 'vencida' then s.plan else null end,
      'estado', case when s.vence <= now() and s.estado <> 'activa' then 'vencida' else s.estado end,
      'vence', s.vence, 'periodo', s.periodo, 'proveedor', s.proveedor, 'portal', s.portal_url)
    from public.suscripciones s where s.user_id = (select auth.uid())
  ), jsonb_build_object('plan', null, 'estado', 'sin_cuenta', 'vence', now()));
$$;

-- Administradores: por mail, y solo si la cuenta tiene el mail confirmado.
create table public.admins (email text primary key);
alter table public.admins enable row level security;
insert into public.admins values ('franco.mica22@gmail.com');

create function public.es_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from auth.users u join public.admins a on lower(a.email) = lower(u.email)
                 where u.id = (select auth.uid()) and u.email_confirmed_at is not null);
$$;
revoke execute on function public.es_admin() from public, anon;
grant execute on function public.es_admin() to authenticated;

-- Todo el panel en una llamada; si no es admin, error.
create function public.admin_resumen() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  if not public.es_admin() then raise exception 'no autorizado' using errcode = '42501'; end if;
  select jsonb_build_object(
    'generado', now(),
    'usuarios', coalesce((select jsonb_agg(x order by x.creado desc) from (
        select u.id, u.email, u.created_at creado, u.last_sign_in_at ultimo_ingreso, u.email_confirmed_at is not null confirmado,
               s.plan, s.estado, s.vence, s.periodo, s.proveedor
        from auth.users u left join public.suscripciones s on s.user_id = u.id) x), '[]'),
    'pedidos_baja', coalesce((select jsonb_agg(p order by p.creado desc) from public.pedidos_baja p), '[]'),
    'tablas', coalesce((select jsonb_agg(jsonb_build_object('tabla', c.relname, 'filas', c.reltuples::bigint, 'bytes', pg_total_relation_size(c.oid)) order by pg_total_relation_size(c.oid) desc)
        from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'), '[]'),
    'base_bytes', pg_database_size(current_database()),
    'circuitos', coalesce((select jsonb_agg(x order by x.tandas desc) from (
        select coalesce(circuito_nombre, circuito_key) circuito, count(*) tandas, count(distinct dispositivo) equipos,
               min(mejor_tiempo) mejor, min(fecha) desde, max(fecha) hasta,
               jsonb_agg(distinct categoria) filter (where categoria is not null) categorias
        from public.envios group by 1) x), '[]'),
    'envios', coalesce((select jsonb_agg(x order by x.created_at desc) from (
        select id, created_at, dispositivo, app_version, plataforma, coalesce(circuito_nombre, circuito_key) circuito, categoria, chasis, motor,
               fecha, hora, mejor_tiempo, promedio, vueltas, potencia_hp, fallas_motor, setup, clima
        from public.envios order by created_at desc limit 500) x), '[]'),
    'compartidos', jsonb_build_object('total', (select count(*) from public.compartidos), 'vistas', (select coalesce(sum(vistas), 0) from public.compartidos),
        'bytes', (select coalesce(sum(pg_column_size(data)), 0) from public.compartidos),
        'lista', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'creado', created_at, 'vence', expires_at, 'vistas', vistas, 'bytes', pg_column_size(data),
            'titulo', (select string_agg(round((s->'top'->>0)::numeric, 3)::text, ' vs ') from jsonb_array_elements(data->'sessions') s)) order by created_at desc)
            from public.compartidos), '[]'))
  ) into r;
  return r;
end $$;
revoke execute on function public.admin_resumen() from public, anon;
grant execute on function public.admin_resumen() to authenticated;

-- Acciones del admin: dar un plan a mano (amigos, cortesias) y marcar un pedido como resuelto.
create function public.admin_dar_plan(p_email text, p_plan text, p_dias int) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid;
begin
  if not public.es_admin() then raise exception 'no autorizado' using errcode = '42501'; end if;
  if p_plan not in ('simple', 'pro') or p_dias not between 1 and 3650 then raise exception 'plan o dias invalidos'; end if;
  select id into uid from auth.users where lower(email) = lower(p_email);
  if uid is null then raise exception 'no hay una cuenta con ese mail'; end if;
  insert into public.suscripciones (user_id, plan, estado, vence, proveedor, actualizado)
  values (uid, p_plan, 'activa', now() + make_interval(days => p_dias), 'manual', now())
  on conflict (user_id) do update set plan = excluded.plan, estado = 'activa', vence = excluded.vence, proveedor = 'manual', proveedor_ref = null, actualizado = now();
end $$;
revoke execute on function public.admin_dar_plan(text, text, int) from public, anon;
grant execute on function public.admin_dar_plan(text, text, int) to authenticated;

create function public.admin_resolver_pedido(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_admin() then raise exception 'no autorizado' using errcode = '42501'; end if;
  update public.pedidos_baja set estado = 'resuelto' where id = p_id;
end $$;
revoke execute on function public.admin_resolver_pedido(bigint) from public, anon;
grant execute on function public.admin_resolver_pedido(bigint) to authenticated;
