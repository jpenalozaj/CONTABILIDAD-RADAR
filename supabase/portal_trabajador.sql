-- RADAR — Portal del Trabajador (Fase 1b)
--
-- Cada trabajador puede tener su PROPIA cuenta de Supabase Auth (distinta
-- de la cuenta del contador) para ver, de solo lectura, sus propias
-- liquidaciones de sueldo de periodos que el contador ya marco "Pagado"
-- -- nunca el resto de los datos de la empresa.
--
-- Como aplicar: Supabase Dashboard > SQL Editor > pegar este archivo
-- completo > Run. Es seguro volver a correrlo (usa IF NOT EXISTS / OR
-- REPLACE en todo). Requiere que supabase/schema.sql ya este aplicado
-- (crea la tabla radar_data que este archivo extiende con una policy
-- adicional de solo lectura).
--
-- Flujo pensado para no necesitar jamas la Service Role Key en el
-- navegador (mismo principio que el resto de RADAR: ninguna credencial
-- privilegiada toca el cliente):
--   1. El contador genera un codigo de invitacion de un solo uso desde la
--      ficha del trabajador (fila nueva en portal_links, sin
--      trabajador_auth_id asignado todavia) y se lo entrega al trabajador
--      fuera de banda (de palabra, WhatsApp, etc. -- nunca por un canal
--      que RADAR controle).
--   2. El trabajador crea su propia cuenta (email + contrasena) en la
--      pantalla del Portal y canjea ese codigo una sola vez, via la
--      funcion canjear_codigo_portal() -- jamas con un UPDATE directo del
--      cliente (ver nota de seguridad mas abajo).
--   3. Desde ahi, su propia cuenta queda vinculada a esa ficha de
--      trabajador para siempre (o hasta que el contador revoque el
--      acceso con activo=false).

create table if not exists portal_links (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade, -- cuenta del contador, dueno real de los datos
  empresa_id         text not null,
  trabajador_id      text not null,
  codigo             text not null unique, -- codigo de invitacion de un solo uso
  trabajador_auth_id uuid references auth.users(id) on delete cascade,          -- se completa al canjear el codigo
  activo             boolean not null default true,                            -- el contador revoca aqui, no borrando la fila
  created_at         timestamptz not null default now()
);

create index if not exists portal_links_user_idx on portal_links(user_id);
create unique index if not exists portal_links_trabajador_auth_idx
  on portal_links(trabajador_auth_id) where trabajador_auth_id is not null;

alter table portal_links enable row level security;

-- El contador ve y administra (crear/revocar) sus propias invitaciones.
drop policy if exists "portal_links_contador_all" on portal_links;
create policy "portal_links_contador_all" on portal_links
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- El trabajador ya vinculado puede leer SU PROPIA fila (para saber a que
-- empresa/ficha corresponde) -- nunca puede escribirla directamente; el
-- vinculo inicial se hace solo a traves de la funcion de mas abajo.
drop policy if exists "portal_links_trabajador_select" on portal_links;
create policy "portal_links_trabajador_select" on portal_links
  for select using (auth.uid() = trabajador_auth_id);

-- Nota de seguridad -- por que el canje de codigo NO es un UPDATE directo
-- del cliente con policy "using (trabajador_auth_id is null)":
-- una policy asi solo exige que la FILA no tenga dueno todavia, pero no
-- puede exigir que el cliente conozca el codigo exacto (RLS filtra filas,
-- no valida "intenciones" del cliente) -- un atacante podria enviar un
-- UPDATE sin filtrar por codigo y auto-asignarse CUALQUIER invitacion
-- pendiente de cualquier trabajador. La funcion de abajo si fuerza la
-- igualdad exacta del codigo dentro de su propia logica, server-side.
create or replace function canjear_codigo_portal(p_codigo text)
returns table(empresa_id text, trabajador_id text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id text;
  v_trabajador_id text;
begin
  update portal_links
    set trabajador_auth_id = auth.uid()
    where codigo = p_codigo
      and trabajador_auth_id is null
      and activo = true
    returning portal_links.empresa_id, portal_links.trabajador_id
    into v_empresa_id, v_trabajador_id;

  if v_empresa_id is null then
    raise exception 'Codigo invalido, ya usado, o revocado.';
  end if;

  return query select v_empresa_id, v_trabajador_id;
end;
$$;

revoke all on function canjear_codigo_portal(text) from public;
grant execute on function canjear_codigo_portal(text) to authenticated;

-- Datos reales: un trabajador ya vinculado (via portal_links, activo)
-- puede leer de radar_data SOLO su propia ficha, el nombre/RUT de su
-- empresa, y sus liquidaciones de periodos que el contador ya marco
-- "Pagado" en procesos_rem -- antes de eso no ve nada (la visibilidad la
-- activa el contador a mano, no es automatica por existir la liquidacion).
-- Se agrega como policy ADICIONAL -- se combina con "radar_data_select_own"
-- (OR), nunca la reemplaza ni le da mas acceso al contador.
drop policy if exists "radar_data_select_portal_trabajador" on radar_data;
create policy "radar_data_select_portal_trabajador" on radar_data
  for select using (
    exists (
      select 1 from portal_links pl
      where pl.trabajador_auth_id = auth.uid()
        and pl.activo = true
        and pl.user_id = radar_data.user_id
        and (
          (radar_data.collection = 'trabajadores' and radar_data.row_id = pl.trabajador_id)
          or (radar_data.collection = 'empresas' and radar_data.row_id = pl.empresa_id)
          or (
            radar_data.collection = 'remuneraciones'
            and radar_data.payload->>'trabajadorId' = pl.trabajador_id
            and exists (
              select 1 from radar_data proc
              where proc.user_id = pl.user_id
                and proc.collection = 'procesos_rem'
                and proc.payload->>'periodo' = radar_data.payload->>'periodo'
                and proc.payload->>'estado' = 'pagado'
            )
          )
        )
    )
  );
