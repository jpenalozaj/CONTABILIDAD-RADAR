-- RADAR — Fase 1: persistencia real con Supabase
--
-- Como aplicar: Supabase Dashboard > SQL Editor > pegar todo este archivo > Run.
-- Es seguro volver a correrlo (usa IF NOT EXISTS / OR REPLACE en todo).

-- Una sola tabla generica guarda todas las "colecciones" del frontend
-- (empresas, plan_cuentas, evaluaciones, entries, remuneraciones,
-- documentos, tareas, log) como filas JSON. Esto evita modelar 8 tablas
-- relacionales distintas mientras el modelo de datos del prototipo sigue
-- evolucionando; se puede normalizar mas adelante si hace falta para
-- reportes o performance a mayor escala.
create table if not exists radar_data (
  user_id     uuid not null references auth.users(id) on delete cascade,
  collection  text not null,
  row_id      text not null,
  payload     jsonb not null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, collection, row_id)
);

create index if not exists radar_data_user_collection_idx
  on radar_data (user_id, collection);

alter table radar_data enable row level security;

-- auth.uid() va envuelto en "(select ...)" en las 4 policies de abajo:
-- Postgres cachea el resultado una sola vez por query (lo trata como un
-- InitPlan estable) en vez de re-evaluarlo fila por fila durante el scan
-- -- mismo resultado de seguridad, mejor plan de ejecucion a medida que
-- crece radar_data (patron recomendado por el propio equipo de Supabase).
drop policy if exists "radar_data_select_own" on radar_data;
create policy "radar_data_select_own" on radar_data
  for select using ((select auth.uid()) = user_id);

drop policy if exists "radar_data_insert_own" on radar_data;
create policy "radar_data_insert_own" on radar_data
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists "radar_data_update_own" on radar_data;
create policy "radar_data_update_own" on radar_data
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "radar_data_delete_own" on radar_data;
create policy "radar_data_delete_own" on radar_data
  for delete using ((select auth.uid()) = user_id);
