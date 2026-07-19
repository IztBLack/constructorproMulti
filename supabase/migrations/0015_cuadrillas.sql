-- 0015_cuadrillas.sql — CUADRILLAS: grupo GLOBAL reutilizable que rota entre obras.
-- Aditivo, idempotente y no destructivo. NO toca filas ni policies existentes.
-- Convenciones espejo de 0002 (sync cols, trigger trg_srv_upd, id uuid sin default,
-- empresa_id -> empresas ON DELETE CASCADE inline, FKs de dominio DEFERRABLE) y de
-- 0014 (policies granulares: colaborador lee, admin/supervisor escriben).
-- Depende de: 0001 (auth_tiene_rol), 0002 (set_server_updated_at, obras, colaboradores,
-- asistencias, destajos). Correr en el SQL Editor de Supabase (vmkkkrlctakzzqebtyci).

-- ════════════════════════════════════════════════════════════════════════════
-- 1. cuadrillas — catálogo GLOBAL por empresa (rota entre obras).
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.cuadrillas (
  id                  uuid primary key,
  nombre              text not null,
  especialidad        text not null default 'MIXTA', -- ALBANILERIA|ACERO|CIMBRA|INSTALACIONES|ACABADOS|MIXTA
  jefe_colaborador_id uuid,                            -- cabo/jefe (opcional)
  activa              boolean not null default true,
  empresa_id          uuid not null references public.empresas(id) on delete cascade,
  created_at          bigint not null default 0,
  updated_at          bigint not null default 0,
  server_updated_at   bigint not null default 0,
  deleted_at          bigint,
  constraint fk_cuad_jefe foreign key (jefe_colaborador_id)
    references public.colaboradores(id) deferrable initially deferred
);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. cuadrilla_miembro — N:M cuadrilla↔colaborador con historial (clon de
--    obra_colaborador). PK compuesta.
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.cuadrilla_miembro (
  cuadrilla_id       uuid not null,
  colaborador_id     uuid not null,
  fecha_ingreso      bigint not null,
  fecha_salida       bigint,
  empresa_id         uuid not null references public.empresas(id) on delete cascade,
  created_at         bigint not null default 0,
  updated_at         bigint not null default 0,
  server_updated_at  bigint not null default 0,
  deleted_at         bigint,
  primary key (cuadrilla_id, colaborador_id),
  constraint fk_cm_cuad foreign key (cuadrilla_id)
    references public.cuadrillas(id) deferrable initially deferred,
  constraint fk_cm_colab foreign key (colaborador_id)
    references public.colaboradores(id) deferrable initially deferred
);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. asignacion_cuadrilla_obra — asignación TEMPORAL cuadrilla↔obra.
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.asignacion_cuadrilla_obra (
  id                 uuid primary key,
  cuadrilla_id       uuid not null,
  obra_id            uuid not null,
  fecha_inicio       bigint not null,
  fecha_fin          bigint,
  fase               text not null default '',        -- fase/etapa de la obra
  empresa_id         uuid not null references public.empresas(id) on delete cascade,
  created_at         bigint not null default 0,
  updated_at         bigint not null default 0,
  server_updated_at  bigint not null default 0,
  deleted_at         bigint,
  constraint fk_aco_cuad foreign key (cuadrilla_id)
    references public.cuadrillas(id) deferrable initially deferred,
  constraint fk_aco_obra foreign key (obra_id)
    references public.obras(id) deferrable initially deferred
);

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Columna opcional cuadrilla_id en las tablas de captura (nullable, aditiva).
--    La asistencia/destajo sigue siendo INDIVIDUAL; esto solo etiqueta el grupo.
-- ════════════════════════════════════════════════════════════════════════════
alter table public.asistencias add column if not exists cuadrilla_id uuid;
alter table public.destajos    add column if not exists cuadrilla_id uuid;

-- FKs de la columna nueva (idempotentes, DEFERRABLE como el resto de dominio,
-- NO ACTION on delete: las cuadrillas se dan de baja por soft-delete, no se borran).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fk_asist_cuadrilla') then
    alter table public.asistencias
      add constraint fk_asist_cuadrilla foreign key (cuadrilla_id)
      references public.cuadrillas(id) deferrable initially deferred;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_dest_cuadrilla') then
    alter table public.destajos
      add constraint fk_dest_cuadrilla foreign key (cuadrilla_id)
      references public.cuadrillas(id) deferrable initially deferred;
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Índices — cursor de pull (empresa_id, server_updated_at) + lookups útiles.
-- ════════════════════════════════════════════════════════════════════════════
create index if not exists idx_cuadrillas_pull
  on public.cuadrillas (empresa_id, server_updated_at);
create index if not exists idx_cuadrilla_miembro_pull
  on public.cuadrilla_miembro (empresa_id, server_updated_at);
create index if not exists idx_asignacion_cuadrilla_obra_pull
  on public.asignacion_cuadrilla_obra (empresa_id, server_updated_at);

create index if not exists idx_cuadrillas_jefe
  on public.cuadrillas (jefe_colaborador_id);
create index if not exists idx_cuadrilla_miembro_colab
  on public.cuadrilla_miembro (colaborador_id);
create index if not exists idx_asignacion_cuadrilla
  on public.asignacion_cuadrilla_obra (cuadrilla_id);
create index if not exists idx_asignacion_obra
  on public.asignacion_cuadrilla_obra (obra_id);

-- Lookups de la etiqueta opcional (parciales: solo filas etiquetadas).
create index if not exists idx_asistencias_cuadrilla
  on public.asistencias (cuadrilla_id) where cuadrilla_id is not null;
create index if not exists idx_destajos_cuadrilla
  on public.destajos (cuadrilla_id) where cuadrilla_id is not null;

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Trigger server_updated_at en las 3 tablas nuevas.
-- ════════════════════════════════════════════════════════════════════════════
do $$
declare t text;
begin
  foreach t in array array[
    'cuadrillas','cuadrilla_miembro','asignacion_cuadrilla_obra'
  ] loop
    execute format('drop trigger if exists trg_srv_upd on public.%I;', t);
    execute format(
      'create trigger trg_srv_upd before insert or update on public.%I '
      'for each row execute function public.set_server_updated_at();', t);
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 7. RLS — espejo de colaboradores (post-0014): colaborador LEE; admin/supervisor
--    escriben. Solo aplica a las 3 tablas NUEVAS. Las tablas viejas no se tocan.
-- ════════════════════════════════════════════════════════════════════════════
do $$
declare t text;
begin
  foreach t in array array[
    'cuadrillas','cuadrilla_miembro','asignacion_cuadrilla_obra'
  ] loop
    execute format('alter table public.%I enable row level security;', t);

    -- Lectura: admin/supervisor/colaborador.
    execute format('drop policy if exists %I on public.%I;', t || '_staff_read', t);
    execute format(
      'create policy %I on public.%I for select '
      'using (public.auth_tiene_rol(empresa_id, ''admin'',''supervisor'',''colaborador''));',
      t || '_staff_read', t);

    -- Alta: solo admin/supervisor.
    execute format('drop policy if exists %I on public.%I;', t || '_staff_insert', t);
    execute format(
      'create policy %I on public.%I for insert '
      'with check (public.auth_tiene_rol(empresa_id, ''admin'',''supervisor''));',
      t || '_staff_insert', t);

    -- Edición (incluye soft-delete vía deleted_at): solo admin/supervisor.
    execute format('drop policy if exists %I on public.%I;', t || '_staff_update', t);
    execute format(
      'create policy %I on public.%I for update '
      'using (public.auth_tiene_rol(empresa_id, ''admin'',''supervisor'')) '
      'with check (public.auth_tiene_rol(empresa_id, ''admin'',''supervisor''));',
      t || '_staff_update', t);

    -- Borrado físico: solo admin/supervisor.
    execute format('drop policy if exists %I on public.%I;', t || '_staff_delete', t);
    execute format(
      'create policy %I on public.%I for delete '
      'using (public.auth_tiene_rol(empresa_id, ''admin'',''supervisor''));',
      t || '_staff_delete', t);
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 8. GRANTs — redundantes con los default privileges de Supabase, explícitos
--    para portabilidad. RLS sigue siendo la puerta real. Idempotentes.
-- ════════════════════════════════════════════════════════════════════════════
do $$
declare t text;
begin
  foreach t in array array[
    'cuadrillas','cuadrilla_miembro','asignacion_cuadrilla_obra'
  ] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated;', t);
    execute format('grant all on public.%I to service_role;', t);
  end loop;
end $$;
