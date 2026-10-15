-- Aplicado en el proyecto kart-telemetria (migracion "suscripciones").
-- Suscripcion de cada cuenta. La crea un trigger al registrarse (7 dias de prueba con todo).
-- El cliente solo puede leer la suya; los cambios vienen del cobro (Mercado Pago / exterior) con la clave de servicio.
create table public.suscripciones (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'pro' check (plan in ('simple', 'pro')),
  estado text not null default 'prueba' check (estado in ('prueba', 'activa', 'cancelada', 'vencida')),
  vence timestamptz not null default (now() + interval '7 days'),
  periodo text check (periodo in ('mensual', 'anual')),
  proveedor text check (proveedor in ('mercadopago', 'lemonsqueezy', 'paddle', 'manual')),
  proveedor_ref text,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
alter table public.suscripciones enable row level security;
create policy "cada uno ve la suya" on public.suscripciones
  for select to authenticated using ((select auth.uid()) = user_id);

create function public.crear_prueba() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.suscripciones (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end $$;
revoke execute on function public.crear_prueba() from public, anon, authenticated;
create trigger al_crear_usuario after insert on auth.users
  for each row execute function public.crear_prueba();

-- Plan efectivo de quien llama. Una cancelada sigue valiendo hasta que vence.
create function public.mi_plan() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select coalesce((
    select jsonb_build_object(
      'plan', case when s.vence > now() and s.estado <> 'vencida' then s.plan else null end,
      'estado', case when s.vence <= now() and s.estado <> 'activa' then 'vencida' else s.estado end,
      'vence', s.vence, 'periodo', s.periodo)
    from public.suscripciones s where s.user_id = (select auth.uid())
  ), jsonb_build_object('plan', null, 'estado', 'sin_cuenta', 'vence', now()));
$$;
revoke execute on function public.mi_plan() from public, anon;
grant execute on function public.mi_plan() to authenticated;
