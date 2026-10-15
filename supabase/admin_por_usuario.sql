-- Aplicado en el proyecto kart-telemetria (migracion "admin_por_usuario").
-- El administrador queda fijado a la cuenta (por id), no solo al mail.
alter table public.admins add column user_id uuid references auth.users(id) on delete cascade;
update public.admins a set user_id = u.id from auth.users u where lower(u.email) = lower(a.email);

create or replace function public.es_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins a join auth.users u on u.id = a.user_id
                 where a.user_id = (select auth.uid()) and u.email_confirmed_at is not null);
$$;

-- Cuenta del dueno: Pro sin vencimiento practico.
update public.suscripciones s set plan = 'pro', estado = 'activa', vence = now() + interval '10 years', proveedor = 'manual', proveedor_ref = null, actualizado = now()
from public.admins a where a.user_id = s.user_id;
