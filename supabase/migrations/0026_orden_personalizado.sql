-- 0026_orden_personalizado.sql — ORDEN PERSONALIZADO sincronizado + MODO de orden.
-- Aditivo, idempotente y no destructivo. NO toca filas ni policies existentes.
--
-- Trae dos cosas:
--   1. Columna `orden` (bigint, default 0) en cada tabla que se puede REORDENAR
--      a mano en la UI (móvil y web). Como cada una ya trae las columnas de sync
--      (server_updated_at + trigger trg_srv_upd), el `orden` viaja en el pull/push
--      existente sin tocar el motor de sincronización. LWW por updated_at resuelve
--      conflictos: si dos equipos reordenan la misma lista, gana el último.
--   2. Columna `ui_orden` (jsonb) en empresa_config: guarda el MODO de orden por
--      lista — { "<listKey>": "nombre" | "personalizado" }. Es GLOBAL por empresa
--      (memoria para todos los dispositivos y usuarios), no por-usuario.
--
-- Convención de `orden`: 0 = sin posición fijada (filas viejas). El desempate
-- secundario sigue siendo el orden natural de cada lista (nombre/fecha/clave), así
-- que ANTES del primer arrastre nada cambia de aspecto. Al reordenar, la app
-- reparte posiciones espaciadas (100, 200, 300…) para permitir inserciones sin
-- renumerar toda la lista.
--
-- Depende de: 0002 (tablas base), 0015 (cuadrillas), 0017 (empresa_config).
-- Correr en el SQL Editor de Supabase (vmkkkrlctakzzqebtyci).

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Columna `orden` en las tablas reordenables.
-- ════════════════════════════════════════════════════════════════════════════
do $$
declare t text;
begin
  foreach t in array array[
    'cuadrillas',          -- orden de las cuadrillas (bloques)
    'cuadrilla_miembro',   -- orden de las personas DENTRO de cada cuadrilla
    'colaboradores',       -- lista de equipo
    'obras',               -- lista de obras
    'cotizaciones',        -- lista de cotizaciones
    'puestos',             -- catálogo de puestos
    'catalogo_conceptos'   -- catálogo de conceptos
  ] loop
    execute format(
      'alter table public.%I add column if not exists orden bigint not null default 0;', t);
    -- Índice de apoyo al ordenamiento por empresa (parcial: solo lo ya fijado).
    execute format(
      'create index if not exists %I on public.%I (empresa_id, orden);',
      'idx_' || t || '_orden', t);
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Modo de orden por lista (jsonb) en empresa_config.
-- ════════════════════════════════════════════════════════════════════════════
-- Mapa { listKey: 'nombre' | 'personalizado' }. Default '{}' → toda lista arranca
-- en su orden natural ('nombre') hasta que alguien la cambie explícitamente.
alter table public.empresa_config
  add column if not exists ui_orden jsonb not null default '{}'::jsonb;

-- El trigger trg_srv_upd y las policies de empresa_config (0017) ya cubren esta
-- columna: se sella server_updated_at en cada update y solo admin/supervisor
-- escriben. No hay que agregar nada más.
