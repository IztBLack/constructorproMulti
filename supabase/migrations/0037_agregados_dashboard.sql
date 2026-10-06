-- 0037_agregados_dashboard.sql — Que sume Postgres, no JavaScript
-- Depende de: 0002 (movimientos, obras, obra_colaborador, secciones, partidas),
--             0035 (los índices que estas funciones aprovechan)
-- Aditivo: crea funciones nuevas, no toca ninguna tabla ni ninguna policy.
--
-- ════════════════════════════════════════════════════════════════════════════
-- EL PROBLEMA
-- ════════════════════════════════════════════════════════════════════════════
-- El dashboard de /admin calculaba tres cosas trayéndose las filas crudas al
-- servidor de Next y sumándolas en un `for`:
--
--   1. Saldo por obra      → `listMovimientosEmpresa()`: TODOS los movimientos
--                            de la historia de la empresa, con `select('*')`,
--                            para después filtrar por obra en memoria.
--   2. Equipo activo       → todas las filas de `obra_colaborador`, para contar.
--   3. KPI Pipeline        → tres consultas encadenadas (cotizaciones →
--                            secciones → partidas) y un triple bucle.
--
-- Con 215 movimientos eso es gratis. Con 200 000 es transferir la tabla entera
-- por HTTP en cada carga del dashboard. Y hay algo peor que la lentitud: este
-- proyecto tiene `max_rows = 1000` en PostgREST, así que a partir de la fila
-- 1 001 la respuesta **se recorta sin error** y el saldo simplemente sale mal.
--
-- ════════════════════════════════════════════════════════════════════════════
-- QUÉ HACEN ESTAS FUNCIONES — Y QUÉ NO
-- ════════════════════════════════════════════════════════════════════════════
-- Agregan. Nada más. Devuelven sumas y conteos crudos.
--
-- Lo que **deliberadamente NO hacen** es aplicar reglas de negocio:
--   · el saldo (`entradas − salidas`) lo sigue calculando `resumenFlujo` en TS,
--     que es el puerto de `flujo_calculator.dart`;
--   · el IVA del pipeline lo sigue aplicando `calcularPipeline` en TS;
--   · la clasificación nómina/material/otros sigue en `distribucionGasto`.
--
-- La razón es la misma que gobierna todo el repo: cada regla de negocio vive en
-- UN sitio, y ya está duplicada entre Dart y TypeScript porque el móvil es
-- offline-first. Meterla también en SQL sería la tercera copia, en el único de
-- los tres lenguajes que no tiene tests. Estas funciones mueven el ACARREO de
-- datos a la base; el criterio se queda donde ya estaba probado.
--
-- ════════════════════════════════════════════════════════════════════════════
-- SEGURIDAD
-- ════════════════════════════════════════════════════════════════════════════
-- Las tres son SECURITY INVOKER (el modo por defecto, escrito explícito para
-- que se lea): corren con los permisos de quien llama, así que **RLS se aplica
-- igual que en una consulta normal**. Un admin ve su empresa; un cliente no ve
-- nada de esto. No hay que filtrar por `empresa_id` a mano —y no se debe: sería
-- una segunda fuente de verdad sobre quién ve qué, que podría discrepar de las
-- policies.
--
-- `set search_path = public` va en las tres por higiene, no por necesidad: en
-- una función SECURITY INVOKER no es una escalada, pero deja la resolución de
-- nombres fijada y no dependiente de quien llame.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Flujo de caja por obra
-- ════════════════════════════════════════════════════════════════════════════
-- Sustituye a `listMovimientosEmpresa()`: una fila por obra en vez de una fila
-- por movimiento. El saldo NO se calcula aquí a propósito (ver arriba).
create or replace function public.flujo_por_obra()
returns table (obra_id uuid, entradas double precision, salidas double precision)
language sql stable security invoker set search_path = public
as $$
  select m.obra_id,
         coalesce(sum(m.monto) filter (where m.tipo = 'ENTRADA'), 0) as entradas,
         coalesce(sum(m.monto) filter (where m.tipo = 'SALIDA'),  0) as salidas
    from public.movimientos m
   where m.deleted_at is null
   group by m.obra_id;
$$;

comment on function public.flujo_por_obra() is
  'Entradas y salidas acumuladas por obra. Una fila por obra. RLS aplica: '
  'sólo agrega lo que el usuario que llama ya podría leer fila a fila.';

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Equipo activo por obra
-- ════════════════════════════════════════════════════════════════════════════
-- "Activo" = asignación sin fecha de salida. Es la misma condición que usaba el
-- conteo en TypeScript; aquí no hay criterio nuevo, sólo el `count`.
--
-- `deleted_at is null` se añade a la condición: el conteo en TypeScript NO lo
-- comprobaba, así que una asignación borrada lógicamente seguía sumando al
-- número de gente en la obra. Es una corrección, y se anota como tal porque
-- cambia un número visible en el dashboard.
create or replace function public.equipo_activo_por_obra()
returns table (obra_id uuid, activos integer)
language sql stable security invoker set search_path = public
as $$
  select oc.obra_id, count(*)::integer as activos
    from public.obra_colaborador oc
   where oc.fecha_salida is null
     and oc.deleted_at is null
   group by oc.obra_id;
$$;

comment on function public.equipo_activo_por_obra() is
  'Colaboradores con asignación viva (sin fecha_salida, sin deleted_at) por obra.';

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Subtotal por cotización
-- ════════════════════════════════════════════════════════════════════════════
-- Sustituye al encadenado cotizaciones → secciones → partidas del KPI Pipeline.
-- Devuelve el subtotal CRUDO (Σ cantidad × precio_unitario) junto con la
-- bandera de IVA, para que quien llama aplique la fórmula del pipeline. No se
-- aplica aquí ni el IVA ni el descuento: esa es la regla de negocio, y vive en
-- TypeScript y en Dart, no en SQL.
--
-- El `left join` importa: una cotización sin partidas debe salir con subtotal 0,
-- no desaparecer. Si desapareciera, el pipeline seguiría dando el mismo número
-- —sumar 0 no cambia nada— pero el llamante perdería la capacidad de distinguir
-- "cotización vacía" de "cotización que no existe", y eso sí importa para
-- pintar la lista.
create or replace function public.subtotal_por_cotizacion(p_estados text[])
returns table (cotizacion_id uuid, iva_enabled boolean, subtotal double precision)
language sql stable security invoker set search_path = public
as $$
  select c.id,
         c.iva_enabled,
         coalesce(sum(p.cantidad * p.precio_unitario), 0) as subtotal
    from public.cotizaciones c
    left join public.secciones s
           on s.cotizacion_id = c.id and s.deleted_at is null
    left join public.partidas  p
           on p.seccion_id = s.id     and p.deleted_at is null
   where c.deleted_at is null
     and c.estado = any(p_estados)
   group by c.id, c.iva_enabled;
$$;

comment on function public.subtotal_por_cotizacion(text[]) is
  'Subtotal crudo (Σ cantidad × precio_unitario) por cotización en los estados '
  'dados, con su bandera de IVA. NO aplica IVA ni descuento: esa regla vive en '
  'la app, no en la base.';

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Permisos de ejecución
-- ════════════════════════════════════════════════════════════════════════════
-- `authenticated` basta: las tres son de dashboard de oficina. `anon` no las
-- necesita, y no dárselas es una superficie menos —aunque RLS ya devolvería
-- vacío, el mejor permiso es el que no se concede.
revoke all on function public.flujo_por_obra()               from public, anon;
revoke all on function public.equipo_activo_por_obra()       from public, anon;
revoke all on function public.subtotal_por_cotizacion(text[]) from public, anon;

grant execute on function public.flujo_por_obra()                to authenticated;
grant execute on function public.equipo_activo_por_obra()        to authenticated;
grant execute on function public.subtotal_por_cotizacion(text[]) to authenticated;
