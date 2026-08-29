-- 0034_proyeccion_guardada.sql — PROYECCIONES DE NÓMINA GUARDADAS
-- Depende de: 0001 (empresas, auth_tiene_rol), 0019 (aislamiento entre
--             empresas), 0022 (rol contador), 0027 (sueldos fuera de
--             `colaboradores`, por la RLS de campo)
-- Aditivo e idempotente. No toca tablas ni policies existentes.
--
-- QUÉ ES
-- ──────
-- La pantalla de proyección arma la raya ESPERADA de una semana: quiénes, qué
-- días, con qué sueldo, más destajos, anticipos y descuentos. Hasta ahora ese
-- escenario vivía solo en memoria y moría al salir de la pantalla: hacer la
-- cuenta antes de ir al banco y querer volver a ella al día siguiente
-- significaba rehacerla entera.
--
-- Esta tabla le da memoria: escenarios con nombre («Simulación 20 de mayo») que
-- se abren para consultar, se editan, se duplican para probar una variante y se
-- eliminan.
--
-- POR QUÉ EL ESCENARIO VA EN UNA SOLA COLUMNA DE TEXTO
-- ────────────────────────────────────────────────────
-- `escenario` es el JSON completo del escenario, y NO tres tablas relacionales
-- (proyección → participantes → ajustes). Tres razones:
--
--   1. Es un árbol que solo la app entiende (mapas de conjuntos de días,
--      plazas, préstamos por día, configuración de redondeo) y que SIEMPRE se
--      lee y se escribe completo. Nadie va a consultar «todas las proyecciones
--      donde Fulanito trabajó el jueves».
--   2. Tres tablas serían tres bloques de RLS, tres índices y un borrado en
--      cascada a mano, a cambio de una consulta que no existe.
--   3. El formato lo fija `ProyeccionEstado.toJson` del móvil (y su gemelo de
--      la web cuando llegue la paridad). La columna `esquema` dice con qué
--      versión se escribió, para que una app vieja que reciba una proyección
--      nueva pueda decir «no la entiendo» en vez de leerla mal y enseñar una
--      raya equivocada.
--
-- Se usa `text` y no `jsonb` a propósito: el motor de sync del móvil (Drift)
-- copia columnas tal cual y no sabe de jsonb — es la misma razón por la que
-- `empresa_config.pdf_textos` se lee y escribe directo y no por el sync.
-- Aquí queremos que viaje por el sync normal, así que viaja como texto.
--
-- LO QUE NO SE GUARDA
-- ───────────────────
-- Nada de lo CAPTURADO: ni asistencias ni destajos. Al abrir una proyección se
-- vuelven a leer de la base. Guardar una copia haría que una proyección de hace
-- dos semanas enseñara el pase de lista de entonces aunque después se hubiera
-- corregido, que es exactamente al revés de para lo que sirve.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. La tabla
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.proyeccion_guardada (
  id                 uuid primary key,
  empresa_id         uuid not null references public.empresas(id) on delete cascade,

  nombre             text not null default '',

  -- Lunes 00:00 de la semana proyectada, epoch millis. Sube a columna —en vez
  -- de quedarse solo dentro del JSON— porque la lista se ordena y se agrupa por
  -- semana, y hacerlo desde el texto obligaría a parsear todas las filas.
  lunes_millis       bigint not null,

  -- Obra que se estaba viendo; '' = todas. Misma razón: es etiqueta de lista.
  obra_filtro        text not null default '',

  escenario          text not null default '{}',
  esquema            integer not null default 1,

  -- Total y personas al momento de guardar. Son una FOTO para poder pintar la
  -- lista sin recalcular veinte escenarios; el número de verdad se recalcula al
  -- abrir, y por eso la app los enseña rotulados como «al guardar».
  total_snapshot     double precision not null default 0,
  personas_snapshot  integer not null default 0,

  notas              text not null default '',
  orden              bigint not null default 0,

  created_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  server_updated_at  bigint not null default 0,
  deleted_at         bigint
);

create index if not exists idx_proyeccion_guardada_semana
  on public.proyeccion_guardada (empresa_id, lunes_millis desc);
create index if not exists idx_proyeccion_guardada_reciente
  on public.proyeccion_guardada (empresa_id, updated_at desc);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. RLS
-- ════════════════════════════════════════════════════════════════════════════
-- Una proyección contiene SUELDOS de todo el equipo: es exactamente el dato que
-- la 0027 sacó de `colaboradores` para que el personal de campo pudiera leer los
-- nombres de sus compañeros sin leer lo que cobran. Así que la puerta es la
-- misma que la de los sueldos:
--   admin, supervisor  → leen y escriben
--   contador           → lee (necesita el panorama; no arma escenarios)
--   colaborador        → NADA
--   cliente            → NADA. Sin policy, no ve filas.
--
-- No hay policy de DELETE porque el borrado es lógico (`deleted_at`) y pasa por
-- UPDATE, igual que en el resto del esquema.
alter table public.proyeccion_guardada enable row level security;

drop policy if exists proyeccion_guardada_read on public.proyeccion_guardada;
create policy proyeccion_guardada_read on public.proyeccion_guardada
  for select using (
    public.auth_tiene_rol(empresa_id, 'admin', 'supervisor', 'contador')
  );

drop policy if exists proyeccion_guardada_insert on public.proyeccion_guardada;
create policy proyeccion_guardada_insert on public.proyeccion_guardada
  for insert with check (
    public.auth_tiene_rol(empresa_id, 'admin', 'supervisor')
  );

drop policy if exists proyeccion_guardada_update on public.proyeccion_guardada;
create policy proyeccion_guardada_update on public.proyeccion_guardada
  for update using (
    public.auth_tiene_rol(empresa_id, 'admin', 'supervisor')
  ) with check (
    public.auth_tiene_rol(empresa_id, 'admin', 'supervisor')
  );

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Sincronización
-- ════════════════════════════════════════════════════════════════════════════
-- La tabla trae el juego completo de columnas de sync. Con el trigger y el
-- índice de cursor queda lista para que el móvil la jale.
--
-- OJO AL DESPLEGAR: el móvil crea su tabla local en el esquema v14 pero la deja
-- FUERA de `SyncService.pushOrder` a propósito, porque empujar contra una tabla
-- que el servidor todavía no tiene haría fallar el push del ciclo entero —y con
-- él la subida de asistencias y nómina. Una vez aplicada esta migración, el
-- único cambio pendiente en el móvil es añadir 'proyeccion_guardada' a esa
-- lista; no hace falta otra migración de esquema local.
do $$
begin
  drop trigger if exists trg_srv_upd on public.proyeccion_guardada;
  create trigger trg_srv_upd before insert or update on public.proyeccion_guardada
    for each row execute function public.set_server_updated_at();
  create index if not exists idx_proyeccion_guardada_pull
    on public.proyeccion_guardada (empresa_id, server_updated_at);
end $$;
