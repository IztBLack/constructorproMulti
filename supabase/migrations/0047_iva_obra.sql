-- 0047_iva_obra.sql — TASA DE IVA DE CADA OBRA (para separar el IVA cobrado)
-- Depende de: 0002 (obras, cotizaciones), 0006 (clientes, obras.cliente_id),
--             0017 (cotizaciones.iva_porcentaje), 0039 (obra_contrato.iva_pct),
--             0042 (auth_residente_obra). Solo agrega UNA función: no crea ni
--             cambia tablas, columnas ni policies. Idempotente.
--
-- EL PROBLEMA
-- ───────────
-- En el estado de cuenta, COSTO TOTAL es el presupuesto + extras SIN IVA, pero
-- RECIBIDO suma las ENTRADAS de caja, que en una obra que cobra con IVA ya lo
-- traen (un anticipo "30 % más IVA" entra como base × 1.16). El PENDIENTE y el
-- % cobrado salían inflados por el IVA. La web ahora separa cada entrada en
-- base + IVA (`web/src/lib/cliente/estado-cuenta-calculo.ts`); para eso necesita
-- saber con qué tasa cobra cada obra.
--
-- DE DÓNDE SALE LA TASA (en este orden)
-- ─────────────────────────────────────
--   1. `obra_contrato.iva_pct` (0039) si la obra tiene fila de contrato, AUNQUE
--      sea 0: es el IVA que ya usan sus estimaciones, y un 0 guardado ahí es
--      "esta obra se cobra sin IVA". Es también donde el admin la fija o la
--      corrige desde el detalle de la obra (sin anticipo ni retenciones, una
--      fila de contrato no cambia nada más: "sin fila = todo en cero").
--   2. si no, la cotización de la que nació la obra: `obras.cotizacion_origen_id`
--      (lo pone "convertir en obra", 0002); si no está, la CONVERTIDA con ese
--      `obra_id` o, si la obra ya existía y se le ligó, la ACEPTADA; la más
--      vieja. `iva_porcentaje` si `iva_enabled`, 0 si se cotizó sin IVA (es
--      el mismo criterio que la hoja para facturar, `lib/data/fiscal.ts`).
--   3. si no hay ninguna, 0: la obra no cobra IVA y el estado de cuenta queda
--      exactamente como antes.
--
-- POR QUÉ UNA FUNCIÓN (y no leer las tablas desde la web)
-- ───────────────────────────────────────────────────────
-- El cliente del portal tiene que ver los mismos números que la oficina, pero
-- NO lee `obra_contrato` (lo lee solo la oficina, F3-3: trae anticipo,
-- retenciones y notas). La tasa sola no es secreta: viene en cada factura que
-- recibe. Esta función, SECURITY DEFINER, entrega SOLO la tasa y de dónde
-- salió, y solo de obras que quien llama ya puede ver:
--   · oficina de la empresa (admin, supervisor, contador),
--   · residente con esa obra asignada (0042),
--   · el cliente dueño de la obra (mismo criterio que `avance_obra_portal`).
-- Una sola regla en un solo lugar para las dos vías (oficina y portal) y para
-- la utilidad. Obras ajenas, colaborador, compras, almacén o sin sesión: no
-- regresan fila (la web lo toma como "sin IVA", el estado de cuenta de antes).
--
-- Se recibe un arreglo para que el comparativo de utilidad no haga una llamada
-- por obra.

create or replace function public.iva_obras(p_obra_ids uuid[])
returns table (obra_id uuid, iva_pct numeric, origen text)
language sql
stable
security definer
set search_path = public
as $$
  select o.id,
         round(coalesce(c.iva_pct, q.iva_pct, 0)::numeric, 4),
         case
           when c.obra_id is not null then 'contrato'
           when q.iva_pct is not null then 'cotizacion'
           else 'ninguno'
         end
    from public.obras o
    left join public.obra_contrato c
      on c.obra_id = o.id and c.empresa_id = o.empresa_id and c.deleted_at is null
    left join lateral (
      select (case when k.iva_enabled then k.iva_porcentaje else 0 end)::numeric as iva_pct
        from public.cotizaciones k
       where k.empresa_id = o.empresa_id
         and k.deleted_at is null
         and (   k.id = o.cotizacion_origen_id
              or (k.obra_id = o.id and k.estado in ('CONVERTIDA', 'ACEPTADA')))
       order by (k.id = o.cotizacion_origen_id) desc nulls last,
                (k.estado = 'CONVERTIDA') desc, k.fecha, k.created_at, k.id
       limit 1
    ) q on true
   where auth.uid() is not null
     and o.id = any(p_obra_ids)
     and (
       public.auth_tiene_rol(o.empresa_id, 'admin', 'supervisor', 'contador')
       or public.auth_residente_obra(o.empresa_id, o.id)
       or exists (
         select 1 from public.clientes cl
          where cl.id = o.cliente_id and cl.empresa_id = o.empresa_id
            and cl.user_id = auth.uid() and cl.deleted_at is null
       )
     );
$$;

revoke all on function public.iva_obras(uuid[]) from public, anon;
grant execute on function public.iva_obras(uuid[]) to authenticated;
