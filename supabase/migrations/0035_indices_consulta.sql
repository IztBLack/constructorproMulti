-- 0035_indices_consulta.sql — Los índices que faltaban para CONSULTAR
-- Depende de: 0002 (tablas base), 0015 (cuadrilla_id), 0024 (comprobantes)
-- Aditivo, idempotente, sin cambio de código. Se puede revertir con `drop index`.
--
-- POR QUÉ ESTA MIGRACIÓN
-- ─────────────────────
-- `0002_schema.sql` crea, para las 13 tablas base, UN solo índice por tabla:
--
--     create index idx_<t>_pull on public.<t> (empresa_id, server_updated_at);
--
-- Ese índice sirve al SYNC (el cursor de pull) y a nada más. Ninguna de las
-- consultas que la app hace todo el día tenía índice:
--
--   · asistencias de una obra en una semana   → seq scan
--   · destajos de un colaborador en un rango  → seq scan
--   · movimientos de caja de una obra         → seq scan
--   · secciones de una cotización             → seq scan
--   · partidas de una sección                 → seq scan
--   · equipo asignado a una obra              → seq scan
--
-- Con los volúmenes de hoy (739 asistencias, 215 movimientos) Postgres resuelve
-- un seq scan en microsegundos y NADIE NOTA NADA. Esta migración no arregla un
-- problema visible: quita el techo antes de llegar a él. Con diez constructoras
-- y tres años de historia son cientos de miles de filas, y entonces cada carga
-- de la pestaña Caja lee la tabla entera.
--
-- POR QUÉ SON PARCIALES (`where deleted_at is null`)
-- ──────────────────────────────────────────────────
-- El esquema NUNCA borra físico: `deleted_at` es un tombstone que viaja por el
-- sync y la fila se queda para siempre. Un índice completo iría engordando con
-- filas que ninguna pantalla vuelve a mirar. El índice parcial sólo cubre las
-- filas vivas, que son las únicas que se consultan, y además le dice al
-- planificador que el filtro `deleted_at is null` —presente en TODAS las
-- consultas de la app— ya está aplicado.
--
-- POR QUÉ NO LLEVAN `empresa_id` AL FRENTE
-- ────────────────────────────────────────
-- Podría parecer natural, ya que RLS filtra por empresa. Pero la condición de
-- RLS no entra en el índice: la aplica el planificador DESPUÉS, sobre las filas
-- que el índice ya devolvió. Lo que discrimina de verdad es `obra_id`
-- (una obra pertenece a una sola empresa), así que ponerlo primero es lo que
-- reduce el conjunto. `empresa_id` delante sólo añadiría bytes a cada entrada.
--
-- POR QUÉ `create index` Y NO `create index concurrently`
-- ───────────────────────────────────────────────────────
-- `concurrently` no puede correr dentro de una transacción, y el endpoint de
-- Management API que usamos para aplicar migraciones envuelve el cuerpo en una.
-- Con las tablas actuales (< 1 000 filas) un `create index` normal bloquea
-- escrituras durante milisegundos. Si alguna tabla llegara a millones de filas,
-- la forma correcta sería sacar ese índice a un script aparte con
-- `concurrently`; queda anotado aquí para el día que haga falta.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Asistencia y destajo — las dos tablas que más crecen
-- ════════════════════════════════════════════════════════════════════════════
-- La nómina de una semana y el pase de lista de un día son SIEMPRE
-- (obra, rango de fechas). La ficha de una persona y la proyección son
-- (colaborador, rango de fechas). Son dos accesos distintos, y cada uno
-- necesita su propio índice: un índice sobre (obra_id, fecha) no sirve para
-- buscar por colaborador.

create index if not exists idx_asistencias_obra_fecha
  on public.asistencias (obra_id, fecha)
  where deleted_at is null;

create index if not exists idx_asistencias_colab_fecha
  on public.asistencias (colaborador_id, fecha)
  where deleted_at is null;

create index if not exists idx_destajos_obra_fecha
  on public.destajos (obra_id, fecha)
  where deleted_at is null;

create index if not exists idx_destajos_colab_fecha
  on public.destajos (colaborador_id, fecha)
  where deleted_at is null;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Caja
-- ════════════════════════════════════════════════════════════════════════════
-- (obra_id, fecha) cubre la pestaña Caja, el estado de cuenta y el flujo por
-- periodo, que siempre ordenan por fecha dentro de una obra.
create index if not exists idx_movimientos_obra_fecha
  on public.movimientos (obra_id, fecha)
  where deleted_at is null;

-- `fecha` sola: el dashboard suma el flujo de TODAS las obras de un mes. Ahí no
-- hay obra que discrimine, y sin este índice el filtro de rango es un seq scan
-- de la tabla completa.
create index if not exists idx_movimientos_fecha
  on public.movimientos (fecha)
  where deleted_at is null;

-- Gasto ligado a una partida del presupuesto ("aportado / %"). Sólo una minoría
-- de movimientos tiene partida, así que el índice parcial es además diminuto.
create index if not exists idx_movimientos_partida
  on public.movimientos (partida_id)
  where partida_id is not null and deleted_at is null;

-- Entradas de caja ligadas a una cotización: alimentan los "pagos unificados"
-- (pagos manuales ∪ entradas de caja) del detalle de cotización.
create index if not exists idx_movimientos_cotizacion
  on public.movimientos (cotizacion_id)
  where cotizacion_id is not null and deleted_at is null;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Cotización → secciones → partidas
-- ════════════════════════════════════════════════════════════════════════════
-- Se leen SIEMPRE ordenadas por `orden` dentro del padre, así que la segunda
-- columna del índice ahorra además el sort.
create index if not exists idx_secciones_cotizacion
  on public.secciones (cotizacion_id, orden)
  where deleted_at is null;

create index if not exists idx_partidas_seccion
  on public.partidas (seccion_id, orden)
  where deleted_at is null;

create index if not exists idx_pagos_cotizacion
  on public.pagos (cotizacion_id, fecha)
  where deleted_at is null;

create index if not exists idx_archivos_cotizacion_cot
  on public.archivos_cotizacion (cotizacion_id, fecha_agregado)
  where deleted_at is null;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Asignación de equipo a obra (N:M, se recorre en los dos sentidos)
-- ════════════════════════════════════════════════════════════════════════════
-- La PK de `obra_colaborador` es compuesta; el orden de sus columnas ya sirve a
-- una de las dos direcciones, pero no a la otra. Se crean las dos explícitas
-- para no depender de cuál quedó primero en la PK.
create index if not exists idx_obra_colaborador_obra
  on public.obra_colaborador (obra_id)
  where deleted_at is null;

create index if not exists idx_obra_colaborador_colab
  on public.obra_colaborador (colaborador_id)
  where deleted_at is null;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Presupuesto de obra
-- ════════════════════════════════════════════════════════════════════════════
-- `idx_obra_presupuesto_obra` ya existe desde 0008, pero es un índice COMPLETO
-- y sin `orden`. Se añade la versión parcial y ordenada; el viejo se deja donde
-- está (quitarlo no aporta nada y esta migración es puramente aditiva).
create index if not exists idx_obra_presupuesto_obra_orden
  on public.obra_presupuesto (obra_id, orden)
  where deleted_at is null;

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Refrescar estadísticas
-- ════════════════════════════════════════════════════════════════════════════
-- Sin `analyze`, el planificador puede seguir prefiriendo el seq scan por tener
-- estadísticas de antes de que estos índices existieran.
analyze public.asistencias;
analyze public.destajos;
analyze public.movimientos;
analyze public.secciones;
analyze public.partidas;
analyze public.pagos;
analyze public.obra_colaborador;
analyze public.archivos_cotizacion;
analyze public.obra_presupuesto;
