-- APLICAR AL PUBLICAR LA 2.0 (no antes: la 1.9 comparte sin cuenta y dejaria de poder hacerlo).
-- Crear links compartidos pasa a ser del plan Pro y se controla en el servidor.
create or replace function public.crear_compartido(p_data jsonb)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id text;
  v_plan text;
begin
  if (select auth.uid()) is null then
    raise exception 'ingresa a tu cuenta para compartir' using errcode = '42501';
  end if;
  select case when s.vence > now() and s.estado <> 'vencida' then s.plan end into v_plan
    from public.suscripciones s where s.user_id = (select auth.uid());
  if v_plan is distinct from 'pro' then
    raise exception 'compartir por link es del plan Pro' using errcode = '42501';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'datos invalidos';
  end if;
  if pg_column_size(p_data) >= 3000000 then
    raise exception 'reporte demasiado grande';
  end if;
  v_id := translate(encode(extensions.gen_random_bytes(9), 'base64'), '+/', '-_');
  insert into public.compartidos (id, data) values (v_id, p_data);
  return v_id;
end;
$function$;
revoke execute on function public.crear_compartido(jsonb) from public, anon;
grant execute on function public.crear_compartido(jsonb) to authenticated;
