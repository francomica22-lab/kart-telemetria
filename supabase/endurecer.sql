-- Aplicado en el proyecto kart-telemetria (migracion "endurecer_suscripciones").
-- Fecha del primer pago de la suscripcion vigente (para el plazo de 10 dias del arrepentimiento).
alter table public.suscripciones add column inicio_pago timestamptz;

-- El formulario publico solo puede escribir estas columnas (no la fecha ni el estado).
revoke insert on public.pedidos_baja from anon, authenticated;
grant insert (email, tipo, motivo, user_id) on public.pedidos_baja to anon, authenticated;

-- mi_plan: suma el usuario (para que el plan guardado en el equipo no lo herede otra cuenta) y el inicio del pago.
create or replace function public.mi_plan() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select coalesce((
    select jsonb_build_object(
      'plan', case when s.vence > now() and s.estado <> 'vencida' then s.plan else null end,
      'estado', case when s.vence <= now() and s.estado <> 'activa' then 'vencida' else s.estado end,
      'vence', s.vence, 'periodo', s.periodo, 'proveedor', s.proveedor, 'portal', s.portal_url,
      'inicio_pago', s.inicio_pago, 'uid', s.user_id)
    from public.suscripciones s where s.user_id = (select auth.uid())
  ), jsonb_build_object('plan', null, 'estado', 'sin_cuenta', 'vence', now(), 'uid', (select auth.uid())));
$$;
