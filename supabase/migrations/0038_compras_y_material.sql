-- 0038_compras_y_material.sql — COMPRAS Y MATERIAL (módulo `compras`)
-- Fase F2 del alcance ampliado (docs/PLAN_ALCANCE_AMPLIADO.md §3, RF2.1–RF2.7,
-- RD2.1, RR2.1).
-- Depende de: 0001 (auth_tiene_rol), 0002 (obras, movimientos,
--             set_server_updated_at), 0019 (aislamiento), 0022 (contador),
--             0024/0028 (patrón de bucket privado), 0035 (módulo `compras` en el
--             catálogo), 0036 (`movimientos.categoria_costo`), 0037
--             (`fiscal_rfc_valido`, formato de claves SAT).
-- NO depende de 0039/0040/0041 (se escriben en paralelo): en una base nueva
-- esta corre ANTES que ellas, en producción probablemente después.
-- Aditivo e idempotente. No toca filas existentes ni policies existentes.
--
-- QUÉ ES
-- ──────
-- El material es el otro gran costo de la obra junto con la mano de obra, y hoy
-- solo existe como una salida de caja genérica. Aquí vive la cadena completa:
--
--   requisición (campo)  →  aprobación (admin)  →  orden de compra (admin)
--        →  recepción en obra con remisión (supervisor)  →  pago (contador)
--                                                              │
--                          movimiento de caja SALIDA/MATERIAL ◄┘  (sin captura doble)
--
-- QUIÉN HACE QUÉ (RR2.1; el rol "compras" de F6 todavía no existe)
-- ────────────────────────────────────────────────────────────────
--   supervisor  → pide material (requisición) y recibe en obra
--   admin       → aprueba, arma y emite órdenes de compra, cancela; también
--                 puede hacer lo del supervisor y lo del contador
--   contador    → paga (crea el movimiento de caja), liga la factura del
--                 proveedor; lee todo
--   colaborador → nada (sin policy = sin filas)
--   cliente     → nada: las compras son costo interno de la obra
--
-- LO QUE SE EMITIÓ NO CAMBIA
-- ──────────────────────────
-- Una orden de compra EMITIDA es lo que se le mandó al proveedor: sus renglones,
-- precios, IVA, proveedor y condiciones quedan congelados por TRIGGER (aplica a
-- policies, RPC y llave de servicio, como en 0036). Si hay que corregir, se
-- cancela y se hace otra.
--
-- ESTADOS QUE SE CALCULAN, NO SE ESCRIBEN
-- ───────────────────────────────────────
-- · Requisición: PENDIENTE → APROBADA | RECHAZADA los decide el admin. Después,
--   APROBADA / PARCIAL / COMPRADA salen de cuánto de cada renglón ya está en
--   una orden de compra no cancelada (también en borrador: así lo que ya se está
--   comprando no vuelve a salir en "por comprar").
-- · Orden de compra: EMITIDA / PARCIAL / RECIBIDA salen de lo recibido contra
--   lo pedido. La base los recalcula sola al cambiar renglones o recepciones:
--   nadie puede escribir "RECIBIDA" a mano. La web tiene la misma regla en
--   `web/src/lib/compras/` (con pruebas) para enseñar faltantes.
--
-- EL PAGO CREA EL MOVIMIENTO DE CAJA (RF2.5)
-- ──────────────────────────────────────────
-- `pagar_orden_compra` inserta en UNA transacción la SALIDA en la caja de la obra
-- (categoria 'MATERIAL', categoria_costo 'MATERIAL') y la fila de
-- `pagos_proveedor` que la referencia. La utilidad por obra (F1) cuenta esa
-- salida como material; las órdenes de compra NO son costo por sí mismas, así
-- que no hay doble conteo. Si alguien corrige o borra ese movimiento desde la
-- caja (web o móvil), un trigger lo refleja en el pago: la caja manda. El
-- trigger nunca falla, para no atorar la sincronización del móvil (lección del
-- error 23514).
--
-- FACTURA DEL PROVEEDOR
-- ─────────────────────
-- Una orden de compra puede llevar el XML/PDF de la factura (CFDI 4.0) del
-- proveedor. La web la lee con `lib/fiscal/cfdi.ts` y guarda aquí el folio
-- fiscal, RFC del emisor, total e IVA. Un mismo folio no puede ligarse a dos
-- órdenes (índice único). Alimenta la hoja "Gastos por obra" del paquete del
-- contador (F1b): esos gastos dejan de ser "¿tiene factura? — no sé".
--
-- ENDURECIMIENTO (revisión de seguridad, docs/PROGRESO_ALCANCE.md, SEG-*)
-- ─────────────────────────────────────────────────────────────────────
-- · SEG-A1: una orden ya EMITIDA y cualquier recepción no se borran
--   FÍSICAMENTE, ni directo ni en la cascada de borrar la obra.
-- · SEG-M1: la foto de remisión y los archivos de factura que una fila tiene
--   ligados no se borran del bucket; la remisión ligada solo la cambia el admin.

-- ════════════════════════════════════════════════════════════════════════════
-- 0. Utilidades
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.compras_ahora_ms()
returns bigint
language sql
stable
as $$ select (extract(epoch from now()) * 1000)::bigint $$;

-- Texto → uuid sin reventar: las policies de Storage reciben rutas que escribe
-- el navegador, y un cast directo lanzaría error en vez de negar.
create or replace function public.compras_uuid(p text)
returns uuid
language sql
immutable
as $$
  select case
    when p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p::uuid
    else null
  end
$$;

-- La evidencia no se borra físicamente (SEG-A1). Mismo cuerpo que en 0036 (ver
-- ahí el porqué): solo deja pasar la cascada de eliminar la empresa completa.
create or replace function public._evidencia_no_se_borra()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.empresas e where e.id = old.empresa_id) then
    return old;
  end if;
  raise exception 'EVIDENCIA_INMUTABLE: un registro de % que ya es evidencia no se borra (usa el borrado lógico o cancélalo).',
    tg_table_name using errcode = 'P0001';
end $$;
revoke all on function public._evidencia_no_se_borra() from public, anon, authenticated;

-- Nombre de quien está en sesión, para sellar "quién pidió / quién recibió".
-- Mismo criterio que 0041 (que corre después en una base nueva, por eso no se
-- reusa su función).
create or replace function public.compras_nombre_usuario()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(trim(coalesce(u.raw_user_meta_data->>'nombre', '')), ''), '')
    from auth.users u where u.id = auth.uid()
$$;
revoke all on function public.compras_nombre_usuario() from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Proveedores (RF2.6)
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.proveedores (
  id                 uuid primary key,
  empresa_id         uuid not null references public.empresas(id) on delete cascade,
  nombre             text not null,
  rfc                text,
  contacto           text not null default '',   -- a quién se le habla
  telefono           text not null default '',
  correo             text not null default '',
  dias_credito       integer not null default 0,
  notas              text not null default '',
  created_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  server_updated_at  bigint not null default 0,
  deleted_at         bigint,
  constraint proveedores_nombre check (char_length(btrim(nombre)) between 1 and 200),
  constraint proveedores_rfc check (rfc is null or public.fiscal_rfc_valido(rfc)),
  constraint proveedores_dias_credito check (dias_credito between 0 and 365),
  constraint proveedores_textos check (
    char_length(contacto) <= 200 and char_length(telefono) <= 40
    and char_length(correo) <= 200 and char_length(notas) <= 2000
  )
);

-- Un RFC, un proveedor (vivo) por empresa: así la factura que se sube encuentra
-- a su proveedor sin ambigüedad.
create unique index if not exists uq_proveedores_rfc
  on public.proveedores (empresa_id, upper(rfc))
  where rfc is not null and deleted_at is null;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Catálogo de materiales (RF2.1) — separado del catálogo de conceptos
-- ════════════════════════════════════════════════════════════════════════════
-- `catalogo_conceptos` es lo que se VENDE (partidas de cotización); esto es lo
-- que se COMPRA. Mezclarlos haría que "Cemento gris" apareciera como partida de
-- cotización y "Losa de azotea" como material.
create table if not exists public.materiales (
  id                 uuid primary key,
  empresa_id         uuid not null references public.empresas(id) on delete cascade,
  nombre             text not null,
  unidad             text not null default 'pza',
  -- Se actualiza solo al EMITIR una orden de compra (RPC `emitir_orden_compra`).
  ultimo_precio      double precision,
  -- Proveedor habitual: se sugiere al armar la orden de compra.
  proveedor_id       uuid references public.proveedores(id) on delete set null,
  -- Opcionales, como en 0037: sirven para leer facturas y para el contador.
  clave_sat          text,
  unidad_sat         text,
  notas              text not null default '',
  created_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  server_updated_at  bigint not null default 0,
  deleted_at         bigint,
  constraint materiales_nombre check (char_length(btrim(nombre)) between 1 and 200),
  constraint materiales_unidad check (char_length(unidad) <= 20),
  constraint materiales_precio check (ultimo_precio is null or ultimo_precio >= 0),
  constraint materiales_clave_sat_formato check (clave_sat is null or clave_sat ~ '^[0-9]{8}$'),
  constraint materiales_unidad_sat_formato check (unidad_sat is null or unidad_sat ~ '^[A-Z0-9]{1,3}$'),
  constraint materiales_notas check (char_length(notas) <= 2000)
);

create index if not exists idx_materiales_empresa on public.materiales (empresa_id, nombre);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Requisiciones (RF2.2): lo que se pide desde la obra
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.requisiciones (
  id                 uuid primary key,   -- lo genera el cliente: un reintento no duplica
  empresa_id         uuid not null references public.empresas(id) on delete cascade,
  obra_id            uuid not null references public.obras(id)    on delete cascade,
  -- Consecutivo POR EMPRESA ("la requisición 14"). Lo pone el trigger.
  folio              integer not null default 0,
  estado             text not null default 'PENDIENTE',
  -- Para cuándo se necesita en obra (medianoche de México, epoch ms). Opcional.
  para_cuando        bigint,
  notas              text not null default '',
  -- Sellos del trigger: el formulario no los puede falsear.
  pedido_por         uuid,
  pedido_por_nombre  text not null default '',
  decidido_por       uuid,
  decidido_at        bigint,
  motivo_rechazo     text,
  created_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  server_updated_at  bigint not null default 0,
  deleted_at         bigint,
  constraint requisiciones_folio_unico unique (empresa_id, folio),
  constraint requisiciones_estado check (
    estado in ('PENDIENTE', 'APROBADA', 'RECHAZADA', 'COMPRADA', 'PARCIAL')
  ),
  constraint requisiciones_rechazo_con_motivo check (
    estado <> 'RECHAZADA' or coalesce(btrim(motivo_rechazo), '') <> ''
  ),
  constraint requisiciones_notas check (char_length(notas) <= 2000),
  constraint requisiciones_motivo check (motivo_rechazo is null or char_length(motivo_rechazo) <= 1000)
);

create index if not exists idx_requisiciones_obra on public.requisiciones (obra_id, folio);
create index if not exists idx_requisiciones_estado on public.requisiciones (empresa_id, estado);

create table if not exists public.requisicion_renglon (
  id                 uuid primary key,
  empresa_id         uuid not null references public.empresas(id)      on delete cascade,
  requisicion_id     uuid not null references public.requisiciones(id) on delete cascade,
  -- Del catálogo si existe; si no, texto libre (el supervisor no espera a que
  -- den de alta "alambre recocido" para pedirlo).
  material_id        uuid references public.materiales(id) on delete set null,
  descripcion        text not null,
  unidad             text not null default '',
  cantidad           double precision not null,
  notas              text not null default '',
  orden              bigint not null default 0,
  created_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  server_updated_at  bigint not null default 0,
  deleted_at         bigint,
  constraint requisicion_renglon_desc check (char_length(btrim(descripcion)) between 1 and 300),
  constraint requisicion_renglon_cantidad check (cantidad > 0 and cantidad < 1e9),
  constraint requisicion_renglon_textos check (char_length(unidad) <= 20 and char_length(notas) <= 500)
);

create index if not exists idx_requisicion_renglon_req on public.requisicion_renglon (requisicion_id, orden);

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Órdenes de compra (RF2.3)
-- ════════════════════════════════════════════════════════════════════════════
-- Una orden = UN proveedor y UNA obra: el pago cae en la caja de esa obra. Al
-- convertir requisiciones se agrupa por (obra, proveedor).
create table if not exists public.ordenes_compra (
  id                 uuid primary key,
  empresa_id         uuid not null references public.empresas(id)    on delete cascade,
  obra_id            uuid not null references public.obras(id)       on delete cascade,
  proveedor_id       uuid not null references public.proveedores(id) on delete restrict,
  folio              integer not null default 0,   -- por empresa, lo pone el trigger
  fecha              bigint not null default (extract(epoch from now()) * 1000)::bigint,
  estado             text not null default 'BORRADOR',
  -- Precios de los renglones SIN IVA; el IVA va desglosado (así lo pide la
  -- factura del proveedor). 0 = sin IVA.
  iva_pct            double precision not null default 16,
  condiciones        text not null default '',     -- entrega, forma de pago…
  dias_credito       integer not null default 0,   -- se copia del proveedor al crearla
  fecha_entrega      bigint,
  notas              text not null default '',
  texto_final        text,                          -- párrafo final del PDF (0032)
  -- Se calculan AL EMITIR (trigger) y quedan fijos.
  subtotal           double precision,
  iva                double precision,
  total              double precision,
  emitida_at         bigint,
  emitida_por        uuid,
  cancelada_at       bigint,
  cancelada_por      uuid,
  -- Factura del proveedor (CFDI 4.0). Rutas en el bucket `compras`.
  factura_uuid       text,
  factura_rfc        text,
  factura_total      double precision,
  factura_iva        double precision,
  factura_fecha      bigint,
  factura_xml_path   text,
  factura_pdf_path   text,
  factura_resumen    jsonb,                          -- conceptos leídos del XML (para mostrar)
  created_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  server_updated_at  bigint not null default 0,
  deleted_at         bigint,
  constraint ordenes_compra_folio_unico unique (empresa_id, folio),
  constraint ordenes_compra_estado check (
    estado in ('BORRADOR', 'EMITIDA', 'PARCIAL', 'RECIBIDA', 'CANCELADA')
  ),
  constraint ordenes_compra_iva check (iva_pct >= 0 and iva_pct <= 100),
  constraint ordenes_compra_dias check (dias_credito between 0 and 365),
  constraint ordenes_compra_textos check (
    char_length(condiciones) <= 2000 and char_length(notas) <= 2000
  ),
  -- Emitida = con totales. Un borrador no tiene totales (se calculan al emitir).
  constraint ordenes_compra_totales check (
    (estado = 'BORRADOR' and total is null and emitida_at is null)
    or (estado in ('EMITIDA', 'PARCIAL', 'RECIBIDA')
        and subtotal is not null and iva is not null and total is not null and emitida_at is not null)
    or (estado = 'CANCELADA' and cancelada_at is not null)
  ),
  constraint ordenes_compra_factura_uuid check (
    factura_uuid is null
    or factura_uuid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  constraint ordenes_compra_factura_rfc check (factura_rfc is null or public.fiscal_rfc_valido(factura_rfc)),
  -- Los archivos solo en la carpeta de la empresa dueña.
  constraint ordenes_compra_factura_rutas check (
    (factura_xml_path is null or factura_xml_path like empresa_id::text || '/facturas/' || id::text || '/%')
    and (factura_pdf_path is null or factura_pdf_path like empresa_id::text || '/facturas/' || id::text || '/%')
  )
);

create index if not exists idx_ordenes_compra_obra on public.ordenes_compra (obra_id, folio);
create index if not exists idx_ordenes_compra_proveedor on public.ordenes_compra (proveedor_id);
-- Dedup por folio fiscal: una factura ampara UNA orden de compra.
create unique index if not exists uq_ordenes_compra_factura
  on public.ordenes_compra (empresa_id, upper(factura_uuid))
  where factura_uuid is not null and deleted_at is null;

create table if not exists public.orden_compra_renglon (
  id                      uuid primary key,
  empresa_id              uuid not null references public.empresas(id)         on delete cascade,
  orden_compra_id         uuid not null references public.ordenes_compra(id)   on delete cascade,
  -- De qué renglón de requisición sale (nulo = compra directa).
  requisicion_renglon_id  uuid references public.requisicion_renglon(id) on delete set null,
  material_id             uuid references public.materiales(id) on delete set null,
  descripcion             text not null,
  unidad                  text not null default '',
  cantidad                double precision not null,
  precio_unitario         double precision not null default 0,   -- sin IVA
  orden                   bigint not null default 0,
  created_at              bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at              bigint not null default (extract(epoch from now()) * 1000)::bigint,
  server_updated_at       bigint not null default 0,
  deleted_at              bigint,
  constraint oc_renglon_desc check (char_length(btrim(descripcion)) between 1 and 300),
  constraint oc_renglon_cantidad check (cantidad > 0 and cantidad < 1e9),
  constraint oc_renglon_precio check (precio_unitario >= 0 and precio_unitario < 1e10),
  constraint oc_renglon_unidad check (char_length(unidad) <= 20)
);

create index if not exists idx_oc_renglon_oc on public.orden_compra_renglon (orden_compra_id, orden);
create index if not exists idx_oc_renglon_req on public.orden_compra_renglon (requisicion_renglon_id)
  where requisicion_renglon_id is not null;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Recepciones en obra (RF2.4)
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.recepciones (
  id                  uuid primary key,
  empresa_id          uuid not null references public.empresas(id)       on delete cascade,
  orden_compra_id     uuid not null references public.ordenes_compra(id) on delete cascade,
  -- La obra de la orden; la copia el trigger (sirve a existencias y a la ruta).
  obra_id             uuid not null references public.obras(id)          on delete cascade,
  fecha               bigint not null default (extract(epoch from now()) * 1000)::bigint,
  -- Foto de la remisión: `<empresa>/remisiones/<recepcion_id>/<archivo>`.
  remision_uri        text,
  notas               text not null default '',
  recibido_por        uuid,
  recibido_por_nombre text not null default '',
  created_at          bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at          bigint not null default (extract(epoch from now()) * 1000)::bigint,
  server_updated_at   bigint not null default 0,
  deleted_at          bigint,
  constraint recepciones_notas check (char_length(notas) <= 2000),
  constraint recepciones_remision check (
    remision_uri is null or remision_uri like empresa_id::text || '/remisiones/' || id::text || '/%'
  )
);

create index if not exists idx_recepciones_oc on public.recepciones (orden_compra_id);
create index if not exists idx_recepciones_obra on public.recepciones (obra_id);

-- Un renglón por renglón de la orden. Sin UPDATE: si se capturó mal, se borra
-- la recepción completa y se vuelve a registrar (queda el rastro).
create table if not exists public.recepcion_renglon (
  id                       uuid primary key,
  empresa_id               uuid not null references public.empresas(id)              on delete cascade,
  recepcion_id             uuid not null references public.recepciones(id)           on delete cascade,
  orden_compra_renglon_id  uuid not null references public.orden_compra_renglon(id) on delete cascade,
  cantidad_recibida        double precision not null,
  notas                    text not null default '',   -- "venían 3 bultos rotos"
  created_at               bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at               bigint not null default (extract(epoch from now()) * 1000)::bigint,
  server_updated_at        bigint not null default 0,
  deleted_at               bigint,
  constraint recepcion_renglon_cantidad check (cantidad_recibida >= 0 and cantidad_recibida < 1e9),
  constraint recepcion_renglon_notas check (char_length(notas) <= 500)
);

create index if not exists idx_recepcion_renglon_rec on public.recepcion_renglon (recepcion_id);
create index if not exists idx_recepcion_renglon_ocr on public.recepcion_renglon (orden_compra_renglon_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Pagos a proveedor (RF2.5, RF2.6)
-- ════════════════════════════════════════════════════════════════════════════
-- Solo se crean con `pagar_orden_compra` (no hay policy de INSERT/UPDATE): así
-- cada pago tiene SIEMPRE su movimiento de caja. Sin CHECK sobre el monto a
-- propósito: el trigger espejo copia lo que diga la caja y no debe fallar nunca.
create table if not exists public.pagos_proveedor (
  id                 uuid primary key,
  empresa_id         uuid not null references public.empresas(id)       on delete cascade,
  orden_compra_id    uuid not null references public.ordenes_compra(id) on delete cascade,
  proveedor_id       uuid not null references public.proveedores(id)    on delete restrict,
  monto              double precision not null,
  fecha              bigint not null,
  metodo_pago        text not null default 'TRANSFERENCIA',
  referencia         text not null default '',
  notas              text not null default '',
  movimiento_id      uuid not null,
  pagado_por         uuid,
  created_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  server_updated_at  bigint not null default 0,
  deleted_at         bigint
);

create unique index if not exists uq_pagos_proveedor_mov on public.pagos_proveedor (movimiento_id);
create index if not exists idx_pagos_proveedor_oc on public.pagos_proveedor (orden_compra_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 7. Existencias por obra y traspasos (RF2.7, versión simple)
-- ════════════════════════════════════════════════════════════════════════════
-- Existencia = recibido − consumido − traspasado a otra obra + traspasado desde
-- otra obra ± ajustes. Solo cuenta material del CATÁLOGO (renglones con
-- `material_id`): el texto libre no se puede sumar entre obras con seguridad.
create table if not exists public.material_movimiento (
  id                 uuid primary key,
  empresa_id         uuid not null references public.empresas(id)  on delete cascade,
  obra_id            uuid not null references public.obras(id)     on delete cascade,
  material_id        uuid not null references public.materiales(id) on delete cascade,
  tipo               text not null,
  -- CONSUMO y TRASPASO: positiva. AJUSTE: con signo (+ sobró / − se perdió).
  cantidad           double precision not null,
  obra_destino_id    uuid references public.obras(id) on delete cascade,
  fecha              bigint not null default (extract(epoch from now()) * 1000)::bigint,
  notas              text not null default '',
  registrado_por     uuid,
  created_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  server_updated_at  bigint not null default 0,
  deleted_at         bigint,
  constraint material_movimiento_tipo check (tipo in ('CONSUMO', 'TRASPASO', 'AJUSTE')),
  constraint material_movimiento_cantidad check (
    (tipo in ('CONSUMO', 'TRASPASO') and cantidad > 0 and cantidad < 1e9)
    or (tipo = 'AJUSTE' and cantidad <> 0 and abs(cantidad) < 1e9)
  ),
  constraint material_movimiento_destino check (
    (tipo = 'TRASPASO' and obra_destino_id is not null and obra_destino_id <> obra_id)
    or (tipo <> 'TRASPASO' and obra_destino_id is null)
  ),
  constraint material_movimiento_notas check (char_length(notas) <= 500)
);

create index if not exists idx_material_mov_obra on public.material_movimiento (obra_id, material_id);
create index if not exists idx_material_mov_destino on public.material_movimiento (obra_destino_id)
  where obra_destino_id is not null;

-- ════════════════════════════════════════════════════════════════════════════
-- 8. Cálculos que la base hace sola
-- ════════════════════════════════════════════════════════════════════════════
-- Mismas reglas que `web/src/lib/compras/calculo.ts` (hay pruebas de paridad en
-- `web/src/db/compras.test.ts`). Tolerancia de 1e-6 para no pelear con el
-- redondeo de double precision (10 × 0.1 ≠ 1 exacto).

-- 8a. Estado de una requisición ya decidida (APROBADA/PARCIAL/COMPRADA) según
-- cuánto de cada renglón está en órdenes de compra no canceladas.
create or replace function public._requisicion_estado_calculado(p_req uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  with pedidos as (
    select rr.id, rr.cantidad
      from public.requisicion_renglon rr
     where rr.requisicion_id = p_req and rr.deleted_at is null
  ),
  ordenado as (
    select ocr.requisicion_renglon_id as id, sum(ocr.cantidad) as c
      from public.orden_compra_renglon ocr
      join public.ordenes_compra oc on oc.id = ocr.orden_compra_id
     where ocr.deleted_at is null
       and oc.deleted_at is null
       and oc.estado <> 'CANCELADA'
       and ocr.requisicion_renglon_id in (select id from pedidos)
     group by ocr.requisicion_renglon_id
  )
  select case
    when count(*) = 0 then 'APROBADA'
    when bool_and(coalesce(o.c, 0) >= p.cantidad - 1e-6) then 'COMPRADA'
    when bool_or(coalesce(o.c, 0) > 1e-6) then 'PARCIAL'
    else 'APROBADA'
  end
  from pedidos p
  left join ordenado o on o.id = p.id
$$;
revoke all on function public._requisicion_estado_calculado(uuid) from public, anon, authenticated;

-- 8b. Estado de una orden ya emitida según lo recibido.
create or replace function public._orden_compra_estado_calculado(p_oc uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  with pedidos as (
    select r.id, r.cantidad
      from public.orden_compra_renglon r
     where r.orden_compra_id = p_oc and r.deleted_at is null
  ),
  recibido as (
    select rr.orden_compra_renglon_id as id, sum(rr.cantidad_recibida) as c
      from public.recepcion_renglon rr
      join public.recepciones rc on rc.id = rr.recepcion_id
     where rr.deleted_at is null and rc.deleted_at is null
       and rc.orden_compra_id = p_oc
     group by rr.orden_compra_renglon_id
  )
  select case
    when count(*) = 0 then 'EMITIDA'
    when bool_and(coalesce(r.c, 0) >= p.cantidad - 1e-6) then 'RECIBIDA'
    when bool_or(coalesce(r.c, 0) > 1e-6) then 'PARCIAL'
    else 'EMITIDA'
  end
  from pedidos p
  left join recibido r on r.id = p.id
$$;
revoke all on function public._orden_compra_estado_calculado(uuid) from public, anon, authenticated;

-- 8c. Totales de una orden: importe = round(cantidad × precio, 2) por renglón,
-- subtotal = Σ importes, IVA = round(subtotal × iva% / 100, 2), total = suma.
create or replace function public._orden_compra_totales(p_oc uuid, p_iva_pct double precision)
returns table (subtotal numeric, iva numeric, total numeric, renglones integer)
language sql
stable
security definer
set search_path = public
as $$
  with s as (
    select coalesce(sum(round((r.cantidad * r.precio_unitario)::numeric, 2)), 0) as sub,
           count(*)::integer as n
      from public.orden_compra_renglon r
     where r.orden_compra_id = p_oc and r.deleted_at is null
  )
  select s.sub,
         round(s.sub * p_iva_pct::numeric / 100, 2),
         s.sub + round(s.sub * p_iva_pct::numeric / 100, 2),
         s.n
    from s
$$;
revoke all on function public._orden_compra_totales(uuid, double precision) from public, anon, authenticated;

-- 8d. Recalcular estados (los llaman los triggers de abajo).
create or replace function public._requisiciones_recalcular(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.requisiciones r
     set estado = public._requisicion_estado_calculado(r.id),
         updated_at = public.compras_ahora_ms()
   where r.id = any(p_ids)
     and r.estado in ('APROBADA', 'PARCIAL', 'COMPRADA')
     and r.estado is distinct from public._requisicion_estado_calculado(r.id);
end $$;
revoke all on function public._requisiciones_recalcular(uuid[]) from public, anon, authenticated;

create or replace function public._orden_compra_recalcular(p_oc uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ordenes_compra oc
     set estado = public._orden_compra_estado_calculado(oc.id),
         updated_at = public.compras_ahora_ms()
   where oc.id = p_oc
     and oc.estado in ('EMITIDA', 'PARCIAL', 'RECIBIDA')
     and oc.estado is distinct from public._orden_compra_estado_calculado(oc.id);
end $$;
revoke all on function public._orden_compra_recalcular(uuid) from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 9. Triggers
-- ════════════════════════════════════════════════════════════════════════════
-- 9a. Folios consecutivos por empresa (candado por empresa como en 0036; si
-- aun así chocaran, la llave única lo detiene). No se reusan.
create or replace function public._requisicion_folio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('requisicion_folio:' || new.empresa_id::text));
  select coalesce(max(folio), 0) + 1 into new.folio
    from public.requisiciones where empresa_id = new.empresa_id;
  -- Sellos: quién pidió y en qué estado nace.
  new.estado            := 'PENDIENTE';
  new.pedido_por        := auth.uid();
  new.pedido_por_nombre := coalesce(public.compras_nombre_usuario(), '');
  new.decidido_por      := null;
  new.decidido_at       := null;
  new.motivo_rechazo    := null;
  return new;
end $$;

drop trigger if exists trg_requisicion_folio on public.requisiciones;
create trigger trg_requisicion_folio
  before insert on public.requisiciones
  for each row execute function public._requisicion_folio();

create or replace function public._orden_compra_folio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('orden_compra_folio:' || new.empresa_id::text));
  select coalesce(max(folio), 0) + 1 into new.folio
    from public.ordenes_compra where empresa_id = new.empresa_id;
  -- Nace en borrador, sin totales ni sellos (se ponen al emitir).
  new.estado        := 'BORRADOR';
  new.subtotal      := null;
  new.iva           := null;
  new.total         := null;
  new.emitida_at    := null;
  new.emitida_por   := null;
  new.cancelada_at  := null;
  new.cancelada_por := null;
  return new;
end $$;

drop trigger if exists trg_orden_compra_folio on public.ordenes_compra;
create trigger trg_orden_compra_folio
  before insert on public.ordenes_compra
  for each row execute function public._orden_compra_folio();

-- 9b. Guarda de la requisición.
create or replace function public._requisicion_guarda()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.id <> old.id or new.empresa_id <> old.empresa_id or new.folio <> old.folio
     or new.pedido_por is distinct from old.pedido_por
     or new.pedido_por_nombre is distinct from old.pedido_por_nombre then
    raise exception 'No se puede cambiar el folio, la empresa ni quién pidió una requisición.';
  end if;

  if old.estado = 'PENDIENTE' then
    if new.estado = 'PENDIENTE' then
      new.decidido_por := null;
      new.decidido_at := null;
      new.motivo_rechazo := null;
    elsif new.estado in ('APROBADA', 'RECHAZADA') then
      -- Decide el admin (la RLS solo le deja a él salir de PENDIENTE). El
      -- sello lo pone la base.
      new.decidido_por := auth.uid();
      new.decidido_at := public.compras_ahora_ms();
      if new.estado = 'APROBADA' then
        new.motivo_rechazo := null;
        new.estado := public._requisicion_estado_calculado(new.id);
      end if;
    else
      raise exception 'Una requisición por aprobar solo puede aprobarse o rechazarse.';
    end if;
    return new;
  end if;

  -- Ya decidida: lo que se pidió queda como se pidió.
  if (new.obra_id, new.para_cuando, new.notas, new.decidido_por, new.decidido_at, new.motivo_rechazo)
     is distinct from
     (old.obra_id, old.para_cuando, old.notas, old.decidido_por, old.decidido_at, old.motivo_rechazo) then
    raise exception 'La requisición ya se aprobó o se rechazó: ya no se puede cambiar.';
  end if;

  if old.estado = 'RECHAZADA' then
    if new.estado <> 'RECHAZADA' then
      raise exception 'Una requisición rechazada no cambia de estado. Pide una nueva.';
    end if;
  else
    -- APROBADA / PARCIAL / COMPRADA: el estado lo calcula la base, siempre.
    new.estado := public._requisicion_estado_calculado(new.id);
    if new.deleted_at is distinct from old.deleted_at and new.estado <> 'APROBADA' then
      raise exception 'Esta requisición ya está en una orden de compra: cancela la orden primero.';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists trg_requisicion_guarda on public.requisiciones;
create trigger trg_requisicion_guarda
  before update on public.requisiciones
  for each row execute function public._requisicion_guarda();

-- 9c. Renglones de requisición: solo mientras está PENDIENTE.
create or replace function public._requisicion_renglon_guarda()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
begin
  if tg_op = 'UPDATE' and new.requisicion_id <> old.requisicion_id then
    raise exception 'Un renglón no se puede mover a otra requisición.';
  end if;
  select estado into v_estado from public.requisiciones
   where id = case when tg_op = 'DELETE' then old.requisicion_id else new.requisicion_id end;
  if v_estado is not null and v_estado <> 'PENDIENTE' then
    raise exception 'La requisición ya se aprobó o se rechazó: sus renglones no se pueden cambiar.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

drop trigger if exists trg_requisicion_renglon_guarda on public.requisicion_renglon;
create trigger trg_requisicion_renglon_guarda
  before insert or update or delete on public.requisicion_renglon
  for each row execute function public._requisicion_renglon_guarda();

-- 9d. Guarda de la orden de compra.
create or replace function public._orden_compra_guarda()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t record;
begin
  if new.id <> old.id or new.empresa_id <> old.empresa_id or new.folio <> old.folio then
    raise exception 'No se puede cambiar la empresa ni el folio de una orden de compra.';
  end if;

  -- ── Borrador ──
  if old.estado = 'BORRADOR' then
    if new.estado = 'BORRADOR' then
      new.subtotal := null; new.iva := null; new.total := null;
      new.emitida_at := null; new.emitida_por := null;
      return new;
    elsif new.estado = 'EMITIDA' then
      if new.deleted_at is not null then
        raise exception 'Una orden borrada no se emite.';
      end if;
      select * into v_t from public._orden_compra_totales(new.id, new.iva_pct);
      if v_t.renglones = 0 then
        raise exception 'Agrega al menos un renglón antes de emitir la orden.';
      end if;
      new.subtotal    := v_t.subtotal;
      new.iva         := v_t.iva;
      new.total       := v_t.total;
      new.emitida_at  := public.compras_ahora_ms();
      new.emitida_por := auth.uid();
      new.estado      := 'EMITIDA';
      return new;
    elsif new.estado = 'CANCELADA' then
      new.cancelada_at  := public.compras_ahora_ms();
      new.cancelada_por := auth.uid();
      return new;
    else
      raise exception 'Una orden en borrador solo puede emitirse o cancelarse.';
    end if;
  end if;

  -- ── Emitida (o cancelada): lo que vio el proveedor no cambia ──
  if (new.obra_id, new.proveedor_id, new.fecha, new.iva_pct, new.condiciones, new.dias_credito,
      new.fecha_entrega, new.notas, new.texto_final, new.subtotal, new.iva, new.total,
      new.emitida_at, new.emitida_por)
     is distinct from
     (old.obra_id, old.proveedor_id, old.fecha, old.iva_pct, old.condiciones, old.dias_credito,
      old.fecha_entrega, old.notas, old.texto_final, old.subtotal, old.iva, old.total,
      old.emitida_at, old.emitida_por) then
    raise exception 'La orden ya se emitió: lo que se le mandó al proveedor no se puede cambiar. Cancélala y haz otra.';
  end if;
  if new.deleted_at is distinct from old.deleted_at then
    raise exception 'Una orden emitida no se borra: cancélala.';
  end if;

  if old.estado = 'CANCELADA' then
    if new.estado <> 'CANCELADA' or (new.cancelada_at, new.cancelada_por) is distinct from (old.cancelada_at, old.cancelada_por) then
      raise exception 'Una orden cancelada no se reabre.';
    end if;
    return new;
  end if;

  if new.estado = 'CANCELADA' then
    if exists (
      select 1 from public.recepciones r
       where r.orden_compra_id = new.id and r.deleted_at is null
    ) then
      raise exception 'Ya se recibió material de esta orden: no se puede cancelar.';
    end if;
    if exists (
      select 1 from public.pagos_proveedor p
       where p.orden_compra_id = new.id and p.deleted_at is null
    ) then
      raise exception 'Esta orden tiene pagos: anúlalos antes de cancelarla.';
    end if;
    new.cancelada_at  := public.compras_ahora_ms();
    new.cancelada_por := auth.uid();
    return new;
  end if;

  -- EMITIDA / PARCIAL / RECIBIDA: lo calcula la base.
  new.estado := public._orden_compra_estado_calculado(new.id);
  return new;
end $$;

drop trigger if exists trg_orden_compra_guarda on public.ordenes_compra;
create trigger trg_orden_compra_guarda
  before update on public.ordenes_compra
  for each row execute function public._orden_compra_guarda();

-- 9d'. Lo que se le mandó al proveedor no se borra FÍSICAMENTE (SEG-A1): una
-- orden que se emitió alguna vez (aunque luego se cancelara). Un borrador sí.
drop trigger if exists trg_orden_compra_evidencia on public.ordenes_compra;
create trigger trg_orden_compra_evidencia
  before delete on public.ordenes_compra
  for each row when (old.emitida_at is not null)
  execute function public._evidencia_no_se_borra();

-- 9e. Renglones de la orden: solo en BORRADOR.
create or replace function public._orden_compra_renglon_guarda()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
begin
  if tg_op = 'UPDATE' and new.orden_compra_id <> old.orden_compra_id then
    raise exception 'Un renglón no se puede mover a otra orden.';
  end if;
  select estado into v_estado from public.ordenes_compra
   where id = case when tg_op = 'DELETE' then old.orden_compra_id else new.orden_compra_id end;
  if v_estado is not null and v_estado <> 'BORRADOR' then
    raise exception 'La orden ya se emitió: sus renglones no se pueden cambiar.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

drop trigger if exists trg_orden_compra_renglon_guarda on public.orden_compra_renglon;
create trigger trg_orden_compra_renglon_guarda
  before insert or update or delete on public.orden_compra_renglon
  for each row execute function public._orden_compra_renglon_guarda();

-- 9f. Al cambiar renglones de una orden, o su estado, se recalculan las
-- requisiciones de donde salen.
create or replace function public._oc_renglon_recalcular_req()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
begin
  select array_agg(distinct rr.requisicion_id) into v_ids
    from public.requisicion_renglon rr
   where rr.id in (
     case when tg_op in ('UPDATE', 'DELETE') then old.requisicion_renglon_id end,
     case when tg_op in ('UPDATE', 'INSERT') then new.requisicion_renglon_id end
   );
  if v_ids is not null then
    perform public._requisiciones_recalcular(v_ids);
  end if;
  return null;
end $$;

drop trigger if exists trg_oc_renglon_recalcular_req on public.orden_compra_renglon;
create trigger trg_oc_renglon_recalcular_req
  after insert or update or delete on public.orden_compra_renglon
  for each row execute function public._oc_renglon_recalcular_req();

create or replace function public._oc_recalcular_req()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
begin
  select array_agg(distinct rr.requisicion_id) into v_ids
    from public.orden_compra_renglon ocr
    join public.requisicion_renglon rr on rr.id = ocr.requisicion_renglon_id
   where ocr.orden_compra_id = new.id;
  if v_ids is not null then
    perform public._requisiciones_recalcular(v_ids);
  end if;
  return null;
end $$;

drop trigger if exists trg_oc_recalcular_req on public.ordenes_compra;
create trigger trg_oc_recalcular_req
  after update of estado, deleted_at on public.ordenes_compra
  for each row
  when (old.estado is distinct from new.estado or old.deleted_at is distinct from new.deleted_at)
  execute function public._oc_recalcular_req();

-- 9g. Recepciones: sellos, y la obra sale de la orden.
create or replace function public._recepcion_sellos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_oc public.ordenes_compra%rowtype;
begin
  if tg_op = 'INSERT' then
    select * into v_oc from public.ordenes_compra where id = new.orden_compra_id;
    if not found or v_oc.empresa_id <> new.empresa_id then
      raise exception 'Orden de compra no encontrada.';
    end if;
    if v_oc.estado not in ('EMITIDA', 'PARCIAL') or v_oc.deleted_at is not null then
      raise exception 'Solo se recibe material de una orden emitida que todavía tiene faltantes.';
    end if;
    new.obra_id             := v_oc.obra_id;
    new.recibido_por        := auth.uid();
    new.recibido_por_nombre := coalesce(public.compras_nombre_usuario(), '');
    return new;
  end if;

  if (new.id, new.empresa_id, new.orden_compra_id, new.obra_id, new.fecha, new.recibido_por, new.recibido_por_nombre)
     is distinct from
     (old.id, old.empresa_id, old.orden_compra_id, old.obra_id, old.fecha, old.recibido_por, old.recibido_por_nombre) then
    raise exception 'De una recepción solo se cambian la foto de la remisión y las notas. Si se capturó mal, bórrala y regístrala otra vez.';
  end if;
  -- La remisión ya ligada es evidencia de lo que llegó (SEG-M1): ponerla la
  -- primera vez lo hace quien recibe; CAMBIARLA o quitarla, solo el admin (o
  -- la llave de servicio). Sin esto, subir otra foto y religarla dejaba el
  -- archivo viejo sin dueño y borrable.
  if old.remision_uri is not null
     and new.remision_uri is distinct from old.remision_uri
     and auth.uid() is not null
     and not public.auth_tiene_rol(old.empresa_id, 'admin') then
    raise exception 'La foto de la remisión ya quedó registrada: solo el administrador la cambia.';
  end if;
  return new;
end $$;

drop trigger if exists trg_recepcion_sellos on public.recepciones;
create trigger trg_recepcion_sellos
  before insert or update on public.recepciones
  for each row execute function public._recepcion_sellos();

-- Una recepción (lo que llegó a la obra) no se borra FÍSICAMENTE (SEG-A1): la
-- corrección es su borrado lógico, del admin.
drop trigger if exists trg_recepcion_evidencia on public.recepciones;
create trigger trg_recepcion_evidencia
  before delete on public.recepciones
  for each row execute function public._evidencia_no_se_borra();

-- 9h. Renglón recibido: tiene que ser de la MISMA orden que la recepción.
create or replace function public._recepcion_renglon_guarda()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if (new.id, new.empresa_id, new.recepcion_id, new.orden_compra_renglon_id, new.cantidad_recibida, new.notas)
       is distinct from
       (old.id, old.empresa_id, old.recepcion_id, old.orden_compra_renglon_id, old.cantidad_recibida, old.notas) then
      raise exception 'Lo recibido no se edita: borra la recepción y regístrala otra vez.';
    end if;
    return new;
  end if;
  if not exists (
    select 1
      from public.recepciones rc
      join public.orden_compra_renglon ocr on ocr.orden_compra_id = rc.orden_compra_id
     where rc.id = new.recepcion_id
       and ocr.id = new.orden_compra_renglon_id
       and ocr.deleted_at is null
       and rc.empresa_id = new.empresa_id
  ) then
    raise exception 'Ese renglón no es de la orden que se está recibiendo.';
  end if;
  return new;
end $$;

drop trigger if exists trg_recepcion_renglon_guarda on public.recepcion_renglon;
create trigger trg_recepcion_renglon_guarda
  before insert or update on public.recepcion_renglon
  for each row execute function public._recepcion_renglon_guarda();

-- 9i. Al recibir (o borrar una recepción) se recalcula el estado de la orden.
create or replace function public._recepcion_renglon_recalcular()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_oc uuid;
begin
  select rc.orden_compra_id into v_oc from public.recepciones rc
   where rc.id = case when tg_op = 'DELETE' then old.recepcion_id else new.recepcion_id end;
  if v_oc is not null then
    perform public._orden_compra_recalcular(v_oc);
  end if;
  return null;
end $$;

drop trigger if exists trg_recepcion_renglon_recalcular on public.recepcion_renglon;
create trigger trg_recepcion_renglon_recalcular
  after insert or update or delete on public.recepcion_renglon
  for each row execute function public._recepcion_renglon_recalcular();

create or replace function public._recepcion_recalcular()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._orden_compra_recalcular(
    case when tg_op = 'DELETE' then old.orden_compra_id else new.orden_compra_id end
  );
  return null;
end $$;

drop trigger if exists trg_recepcion_recalcular on public.recepciones;
create trigger trg_recepcion_recalcular
  after update of deleted_at or delete on public.recepciones
  for each row execute function public._recepcion_recalcular();

-- 9j. La caja manda: si el movimiento de un pago se corrige o se borra (desde la
-- web o el móvil), el pago lo refleja. NUNCA lanza: un error aquí atoraría la
-- sincronización del teléfono.
create or replace function public._movimiento_espejo_pago_proveedor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update public.pagos_proveedor
       set deleted_at = coalesce(deleted_at, public.compras_ahora_ms()),
           updated_at = public.compras_ahora_ms()
     where movimiento_id = old.id and deleted_at is null;
    return old;
  end if;
  update public.pagos_proveedor
     set monto = new.monto,
         fecha = new.fecha,
         deleted_at = new.deleted_at,
         updated_at = public.compras_ahora_ms()
   where movimiento_id = new.id
     and (monto, fecha, deleted_at) is distinct from (new.monto, new.fecha, new.deleted_at);
  return new;
exception when others then
  -- Nunca bloquear la caja por el espejo.
  return case when tg_op = 'DELETE' then old else new end;
end $$;

drop trigger if exists trg_movimiento_espejo_pago_proveedor on public.movimientos;
create trigger trg_movimiento_espejo_pago_proveedor
  after update of monto, fecha, deleted_at or delete on public.movimientos
  for each row execute function public._movimiento_espejo_pago_proveedor();

-- 9k. Movimiento de material: sello de quién lo registró.
create or replace function public._material_movimiento_sellos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.registrado_por := auth.uid();
  else
    if (new.id, new.empresa_id, new.registrado_por) is distinct from (old.id, old.empresa_id, old.registrado_por) then
      raise exception 'No se puede cambiar quién registró el movimiento.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_material_movimiento_sellos on public.material_movimiento;
create trigger trg_material_movimiento_sellos
  before insert or update on public.material_movimiento
  for each row execute function public._material_movimiento_sellos();

-- ════════════════════════════════════════════════════════════════════════════
-- 10. RLS
-- ════════════════════════════════════════════════════════════════════════════
alter table public.proveedores          enable row level security;
alter table public.materiales           enable row level security;
alter table public.requisiciones        enable row level security;
alter table public.requisicion_renglon  enable row level security;
alter table public.ordenes_compra       enable row level security;
alter table public.orden_compra_renglon enable row level security;
alter table public.recepciones          enable row level security;
alter table public.recepcion_renglon    enable row level security;
alter table public.pagos_proveedor      enable row level security;
alter table public.material_movimiento  enable row level security;

-- Lectura: toda la oficina (admin, supervisor, contador), salvo los pagos.
do $$
declare t text;
begin
  foreach t in array array[
    'proveedores', 'materiales', 'requisiciones', 'requisicion_renglon', 'ordenes_compra',
    'orden_compra_renglon', 'recepciones', 'recepcion_renglon', 'material_movimiento'
  ] loop
    execute format('drop policy if exists %1$s_read on public.%1$I;', t);
    execute format(
      'create policy %1$s_read on public.%1$I for select using '
      '(public.auth_tiene_rol(empresa_id, ''admin'', ''supervisor'', ''contador''));', t);
  end loop;
end $$;

-- Pagos: el dinero es del admin y del contador (el supervisor ve la caja, pero
-- el control de lo que se le debe a cada proveedor no le toca).
drop policy if exists pagos_proveedor_read on public.pagos_proveedor;
create policy pagos_proveedor_read on public.pagos_proveedor
  for select using (public.auth_tiene_rol(empresa_id, 'admin', 'contador'));
-- Sin policies de escritura: solo `pagar_orden_compra` / `anular_pago_proveedor`.

-- 10a. Proveedores: admin y contador (el contador captura RFC y días de crédito).
drop policy if exists proveedores_insert on public.proveedores;
create policy proveedores_insert on public.proveedores
  for insert with check (public.auth_tiene_rol(empresa_id, 'admin', 'contador'));
drop policy if exists proveedores_update on public.proveedores;
create policy proveedores_update on public.proveedores
  for update
  using (public.auth_tiene_rol(empresa_id, 'admin', 'contador'))
  with check (public.auth_tiene_rol(empresa_id, 'admin', 'contador'));

-- 10b. Materiales: admin (es quien compra). El proveedor habitual, de la misma empresa.
drop policy if exists materiales_insert on public.materiales;
create policy materiales_insert on public.materiales
  for insert with check (
    public.auth_tiene_rol(empresa_id, 'admin')
    and (proveedor_id is null or exists (
      select 1 from public.proveedores p
       where p.id = proveedor_id and p.empresa_id = materiales.empresa_id
    ))
  );
drop policy if exists materiales_update on public.materiales;
create policy materiales_update on public.materiales
  for update
  using (public.auth_tiene_rol(empresa_id, 'admin'))
  with check (
    public.auth_tiene_rol(empresa_id, 'admin')
    and (proveedor_id is null or exists (
      select 1 from public.proveedores p
       where p.id = proveedor_id and p.empresa_id = materiales.empresa_id
    ))
  );

-- 10c. Requisiciones: admin y supervisor piden (en una obra de su empresa).
-- El supervisor edita/borra solo las SUYAS y solo mientras están por aprobar;
-- salir de PENDIENTE (aprobar/rechazar) solo lo puede el admin.
drop policy if exists requisiciones_insert on public.requisiciones;
create policy requisiciones_insert on public.requisiciones
  for insert with check (
    public.auth_tiene_rol(empresa_id, 'admin', 'supervisor')
    and estado = 'PENDIENTE'
    and exists (
      select 1 from public.obras o
       where o.id = obra_id and o.empresa_id = requisiciones.empresa_id
    )
  );

drop policy if exists requisiciones_update_supervisor on public.requisiciones;
create policy requisiciones_update_supervisor on public.requisiciones
  for update
  using (
    public.auth_tiene_rol(empresa_id, 'supervisor')
    and pedido_por = auth.uid()
    and estado = 'PENDIENTE'
  )
  with check (
    public.auth_tiene_rol(empresa_id, 'supervisor')
    and pedido_por = auth.uid()
    and estado = 'PENDIENTE'
    and exists (
      select 1 from public.obras o
       where o.id = obra_id and o.empresa_id = requisiciones.empresa_id
    )
  );

drop policy if exists requisiciones_update_admin on public.requisiciones;
create policy requisiciones_update_admin on public.requisiciones
  for update
  using (public.auth_tiene_rol(empresa_id, 'admin'))
  with check (
    public.auth_tiene_rol(empresa_id, 'admin')
    and exists (
      select 1 from public.obras o
       where o.id = obra_id and o.empresa_id = requisiciones.empresa_id
    )
  );

-- Renglones: del padre de la misma empresa; el supervisor solo en las suyas.
drop policy if exists requisicion_renglon_insert on public.requisicion_renglon;
create policy requisicion_renglon_insert on public.requisicion_renglon
  for insert with check (
    exists (
      select 1 from public.requisiciones r
       where r.id = requisicion_id
         and r.empresa_id = requisicion_renglon.empresa_id
         and (public.auth_tiene_rol(r.empresa_id, 'admin')
              or (public.auth_tiene_rol(r.empresa_id, 'supervisor') and r.pedido_por = auth.uid()))
    )
    and (material_id is null or exists (
      select 1 from public.materiales m
       where m.id = material_id and m.empresa_id = requisicion_renglon.empresa_id
    ))
  );

drop policy if exists requisicion_renglon_update on public.requisicion_renglon;
create policy requisicion_renglon_update on public.requisicion_renglon
  for update
  using (
    exists (
      select 1 from public.requisiciones r
       where r.id = requisicion_id
         and (public.auth_tiene_rol(r.empresa_id, 'admin')
              or (public.auth_tiene_rol(r.empresa_id, 'supervisor') and r.pedido_por = auth.uid()))
    )
  )
  with check (
    exists (
      select 1 from public.requisiciones r
       where r.id = requisicion_id
         and r.empresa_id = requisicion_renglon.empresa_id
         and (public.auth_tiene_rol(r.empresa_id, 'admin')
              or (public.auth_tiene_rol(r.empresa_id, 'supervisor') and r.pedido_por = auth.uid()))
    )
    and (material_id is null or exists (
      select 1 from public.materiales m
       where m.id = material_id and m.empresa_id = requisicion_renglon.empresa_id
    ))
  );

-- 10d. Órdenes de compra: solo admin, solo borradores (emitir y cancelar van
-- por RPC). Obra y proveedor de la misma empresa.
drop policy if exists ordenes_compra_insert on public.ordenes_compra;
create policy ordenes_compra_insert on public.ordenes_compra
  for insert with check (
    public.auth_tiene_rol(empresa_id, 'admin')
    and estado = 'BORRADOR'
    and factura_uuid is null
    and exists (
      select 1 from public.obras o
       where o.id = obra_id and o.empresa_id = ordenes_compra.empresa_id
    )
    and exists (
      select 1 from public.proveedores p
       where p.id = proveedor_id and p.empresa_id = ordenes_compra.empresa_id
    )
  );

drop policy if exists ordenes_compra_update on public.ordenes_compra;
create policy ordenes_compra_update on public.ordenes_compra
  for update
  using (public.auth_tiene_rol(empresa_id, 'admin') and estado = 'BORRADOR')
  with check (
    public.auth_tiene_rol(empresa_id, 'admin')
    and estado = 'BORRADOR'
    and exists (
      select 1 from public.obras o
       where o.id = obra_id and o.empresa_id = ordenes_compra.empresa_id
    )
    and exists (
      select 1 from public.proveedores p
       where p.id = proveedor_id and p.empresa_id = ordenes_compra.empresa_id
    )
  );

-- Renglones: padre BORRADOR de la misma empresa; el renglón de requisición
-- tiene que ser de una requisición APROBADA de la MISMA obra; el material, de
-- la misma empresa.
create or replace function public._oc_renglon_padres_validos(
  p_empresa uuid, p_oc uuid, p_req_renglon uuid, p_material uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- Primero el rol: así la función no sirve para sondear filas de otra empresa.
  select public.auth_tiene_rol(p_empresa, 'admin')
    and exists (
      select 1 from public.ordenes_compra oc
       where oc.id = p_oc and oc.empresa_id = p_empresa and oc.estado = 'BORRADOR'
    )
    and (p_material is null or exists (
      select 1 from public.materiales m where m.id = p_material and m.empresa_id = p_empresa
    ))
    and (p_req_renglon is null or exists (
      select 1
        from public.requisicion_renglon rr
        join public.requisiciones r on r.id = rr.requisicion_id
        join public.ordenes_compra oc on oc.id = p_oc
       where rr.id = p_req_renglon
         and rr.deleted_at is null
         and r.empresa_id = p_empresa
         and r.deleted_at is null
         and r.obra_id = oc.obra_id
         and r.estado in ('APROBADA', 'PARCIAL', 'COMPRADA')
    ))
$$;
revoke all on function public._oc_renglon_padres_validos(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public._oc_renglon_padres_validos(uuid, uuid, uuid, uuid) to authenticated;

drop policy if exists orden_compra_renglon_insert on public.orden_compra_renglon;
create policy orden_compra_renglon_insert on public.orden_compra_renglon
  for insert with check (
    public.auth_tiene_rol(empresa_id, 'admin')
    and public._oc_renglon_padres_validos(empresa_id, orden_compra_id, requisicion_renglon_id, material_id)
  );

drop policy if exists orden_compra_renglon_update on public.orden_compra_renglon;
create policy orden_compra_renglon_update on public.orden_compra_renglon
  for update
  using (public.auth_tiene_rol(empresa_id, 'admin'))
  with check (
    public.auth_tiene_rol(empresa_id, 'admin')
    and public._oc_renglon_padres_validos(empresa_id, orden_compra_id, requisicion_renglon_id, material_id)
  );

-- 10e. Recepciones: admin y supervisor reciben (la orden, de su empresa; el
-- trigger exige que esté emitida). Editan foto y notas; el borrado lógico es
-- del admin (corregir una captura).
drop policy if exists recepciones_insert on public.recepciones;
create policy recepciones_insert on public.recepciones
  for insert with check (
    public.auth_tiene_rol(empresa_id, 'admin', 'supervisor')
    and exists (
      select 1 from public.ordenes_compra oc
       where oc.id = orden_compra_id and oc.empresa_id = recepciones.empresa_id
    )
  );

drop policy if exists recepciones_update on public.recepciones;
create policy recepciones_update on public.recepciones
  for update
  using (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor') and deleted_at is null)
  with check (
    public.auth_tiene_rol(empresa_id, 'admin', 'supervisor')
    and (deleted_at is null or public.auth_tiene_rol(empresa_id, 'admin'))
  );

drop policy if exists recepcion_renglon_insert on public.recepcion_renglon;
create policy recepcion_renglon_insert on public.recepcion_renglon
  for insert with check (
    public.auth_tiene_rol(empresa_id, 'admin', 'supervisor')
    and exists (
      select 1 from public.recepciones r
       where r.id = recepcion_id and r.empresa_id = recepcion_renglon.empresa_id
         and r.deleted_at is null
    )
  );

-- 10f. Movimientos de material: admin y supervisor, obras y material de su empresa.
drop policy if exists material_movimiento_insert on public.material_movimiento;
create policy material_movimiento_insert on public.material_movimiento
  for insert with check (
    public.auth_tiene_rol(empresa_id, 'admin', 'supervisor')
    and exists (select 1 from public.obras o where o.id = obra_id and o.empresa_id = material_movimiento.empresa_id)
    and exists (select 1 from public.materiales m where m.id = material_id and m.empresa_id = material_movimiento.empresa_id)
    and (obra_destino_id is null or exists (
      select 1 from public.obras o where o.id = obra_destino_id and o.empresa_id = material_movimiento.empresa_id
    ))
  );

drop policy if exists material_movimiento_update on public.material_movimiento;
create policy material_movimiento_update on public.material_movimiento
  for update
  using (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor'))
  with check (
    public.auth_tiene_rol(empresa_id, 'admin', 'supervisor')
    and exists (select 1 from public.obras o where o.id = obra_id and o.empresa_id = material_movimiento.empresa_id)
    and exists (select 1 from public.materiales m where m.id = material_id and m.empresa_id = material_movimiento.empresa_id)
    and (obra_destino_id is null or exists (
      select 1 from public.obras o where o.id = obra_destino_id and o.empresa_id = material_movimiento.empresa_id
    ))
  );

-- ════════════════════════════════════════════════════════════════════════════
-- 11. Existencias (vista calculada, RF2.7)
-- ════════════════════════════════════════════════════════════════════════════
-- `security_invoker`: la vista se lee con la RLS de quien consulta (sin eso,
-- una vista corre como su dueño y se saltaría el aislamiento por empresa).
create or replace view public.existencias_obra
with (security_invoker = true) as
select empresa_id, obra_id, material_id,
       sum(recibido)  as recibido,
       sum(consumido) as consumido,
       sum(traspaso_entrada) as traspaso_entrada,
       sum(traspaso_salida)  as traspaso_salida,
       sum(ajuste)    as ajuste,
       sum(recibido - consumido + traspaso_entrada - traspaso_salida + ajuste) as existencia
from (
  select rc.empresa_id, rc.obra_id, ocr.material_id,
         rr.cantidad_recibida as recibido, 0::double precision as consumido,
         0::double precision as traspaso_entrada, 0::double precision as traspaso_salida,
         0::double precision as ajuste
    from public.recepcion_renglon rr
    join public.recepciones rc on rc.id = rr.recepcion_id
    join public.orden_compra_renglon ocr on ocr.id = rr.orden_compra_renglon_id
   where rr.deleted_at is null and rc.deleted_at is null and ocr.material_id is not null
  union all
  select mm.empresa_id, mm.obra_id, mm.material_id,
         0, case when mm.tipo = 'CONSUMO' then mm.cantidad else 0 end,
         0, case when mm.tipo = 'TRASPASO' then mm.cantidad else 0 end,
         case when mm.tipo = 'AJUSTE' then mm.cantidad else 0 end
    from public.material_movimiento mm
   where mm.deleted_at is null
  union all
  select mm.empresa_id, mm.obra_destino_id, mm.material_id,
         0, 0, mm.cantidad, 0, 0
    from public.material_movimiento mm
   where mm.deleted_at is null and mm.tipo = 'TRASPASO'
) x
group by empresa_id, obra_id, material_id;

revoke all on public.existencias_obra from anon;
grant select on public.existencias_obra to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 12. RPC
-- ════════════════════════════════════════════════════════════════════════════
-- Todas devuelven jsonb {ok, error?, ...} como el resto de RPC de la app.

-- 12a. Emitir (solo admin): el trigger calcula y congela los totales; aquí,
-- además, el catálogo aprende el último precio y el proveedor habitual.
create or replace function public.emitir_orden_compra(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_oc public.ordenes_compra%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'No autenticado');
  end if;
  select * into v_oc from public.ordenes_compra
   where id = p_id and deleted_at is null
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Orden de compra no encontrada');
  end if;
  if not public.auth_tiene_rol(v_oc.empresa_id, 'admin') then
    return jsonb_build_object('ok', false, 'error', 'Solo un administrador puede emitir órdenes de compra.');
  end if;
  if v_oc.estado <> 'BORRADOR' then
    return jsonb_build_object('ok', false, 'error', 'Esta orden ya se había emitido.');
  end if;
  if not exists (
    select 1 from public.orden_compra_renglon where orden_compra_id = p_id and deleted_at is null
  ) then
    return jsonb_build_object('ok', false, 'error', 'Agrega al menos un renglón antes de emitirla.');
  end if;

  update public.ordenes_compra
     set estado = 'EMITIDA', updated_at = public.compras_ahora_ms()
   where id = p_id
  returning * into v_oc;

  -- Último precio por material (si el material sale dos veces, el más caro:
  -- mejor presupuestar de más que de menos) y proveedor habitual si no tenía.
  update public.materiales m
     set ultimo_precio = x.precio,
         proveedor_id  = coalesce(m.proveedor_id, v_oc.proveedor_id),
         updated_at    = public.compras_ahora_ms()
    from (
      select r.material_id, max(r.precio_unitario) as precio
        from public.orden_compra_renglon r
       where r.orden_compra_id = p_id and r.deleted_at is null and r.material_id is not null
       group by r.material_id
    ) x
   where m.id = x.material_id and m.empresa_id = v_oc.empresa_id;

  return jsonb_build_object('ok', true, 'estado', v_oc.estado, 'total', v_oc.total, 'folio', v_oc.folio);
end $$;

revoke all on function public.emitir_orden_compra(uuid) from public, anon;
grant execute on function public.emitir_orden_compra(uuid) to authenticated;

-- 12b. Cancelar (solo admin). El trigger exige que no haya recepciones ni pagos.
create or replace function public.cancelar_orden_compra(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_oc public.ordenes_compra%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'No autenticado');
  end if;
  select * into v_oc from public.ordenes_compra
   where id = p_id and deleted_at is null
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Orden de compra no encontrada');
  end if;
  if not public.auth_tiene_rol(v_oc.empresa_id, 'admin') then
    return jsonb_build_object('ok', false, 'error', 'Solo un administrador puede cancelar órdenes de compra.');
  end if;
  if v_oc.estado = 'CANCELADA' then
    return jsonb_build_object('ok', true, 'estado', 'CANCELADA');
  end if;
  if exists (select 1 from public.recepciones r where r.orden_compra_id = p_id and r.deleted_at is null) then
    return jsonb_build_object('ok', false, 'error', 'Ya se recibió material de esta orden: no se puede cancelar.');
  end if;
  if exists (select 1 from public.pagos_proveedor p where p.orden_compra_id = p_id and p.deleted_at is null) then
    return jsonb_build_object('ok', false, 'error', 'Esta orden tiene pagos: anúlalos antes de cancelarla.');
  end if;
  update public.ordenes_compra
     set estado = 'CANCELADA', updated_at = public.compras_ahora_ms()
   where id = p_id;
  return jsonb_build_object('ok', true, 'estado', 'CANCELADA');
end $$;

revoke all on function public.cancelar_orden_compra(uuid) from public, anon;
grant execute on function public.cancelar_orden_compra(uuid) to authenticated;

-- 12c. Pagar (admin o contador): crea la SALIDA en la caja de la obra y el pago,
-- en la misma transacción. `p_id` lo genera el navegador: un doble clic o un
-- reintento devuelve el mismo pago en vez de pagar dos veces.
create or replace function public.pagar_orden_compra(
  p_id         uuid,
  p_oc         uuid,
  p_monto      double precision,
  p_fecha      bigint,
  p_metodo     text,
  p_referencia text default '',
  p_notas      text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_oc        public.ordenes_compra%rowtype;
  v_prov      public.proveedores%rowtype;
  v_existente public.pagos_proveedor%rowtype;
  v_pagado    double precision;
  v_saldo     double precision;
  v_mov       uuid := gen_random_uuid();
  v_now       bigint := public.compras_ahora_ms();
  v_concepto  text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'No autenticado');
  end if;
  if p_id is null then
    return jsonb_build_object('ok', false, 'error', 'Falta el identificador del pago.');
  end if;

  select * into v_oc from public.ordenes_compra
   where id = p_oc and deleted_at is null
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Orden de compra no encontrada');
  end if;
  if not public.auth_tiene_rol(v_oc.empresa_id, 'admin', 'contador') then
    return jsonb_build_object('ok', false, 'error', 'Solo el administrador o el contador registran pagos a proveedores.');
  end if;

  -- Reintento del mismo pago: no se duplica.
  select * into v_existente from public.pagos_proveedor where id = p_id;
  if found then
    if v_existente.orden_compra_id <> p_oc then
      return jsonb_build_object('ok', false, 'error', 'Identificador de pago repetido.');
    end if;
    return jsonb_build_object('ok', true, 'id', v_existente.id, 'movimiento_id', v_existente.movimiento_id, 'repetido', true);
  end if;

  if v_oc.estado not in ('EMITIDA', 'PARCIAL', 'RECIBIDA') then
    return jsonb_build_object('ok', false, 'error', 'Solo se pagan órdenes emitidas (no borradores ni canceladas).');
  end if;
  if p_monto is null or p_monto <= 0 or p_monto >= 1e10 then
    return jsonb_build_object('ok', false, 'error', 'El monto debe ser mayor que cero.');
  end if;
  if p_fecha is null or p_fecha <= 0 then
    return jsonb_build_object('ok', false, 'error', 'Falta la fecha del pago.');
  end if;
  if p_metodo is null or p_metodo not in ('EFECTIVO', 'TRANSFERENCIA', 'CHEQUE', 'OTRO') then
    return jsonb_build_object('ok', false, 'error', 'Forma de pago no válida.');
  end if;
  if char_length(coalesce(p_referencia, '')) > 200 or char_length(coalesce(p_notas, '')) > 500 then
    return jsonb_build_object('ok', false, 'error', 'La referencia o las notas son demasiado largas.');
  end if;

  select coalesce(sum(monto), 0) into v_pagado
    from public.pagos_proveedor
   where orden_compra_id = p_oc and deleted_at is null;
  v_saldo := round((v_oc.total - v_pagado)::numeric, 2)::double precision;
  if p_monto > v_saldo + 0.01 then
    return jsonb_build_object('ok', false,
      'error', format('El pago pasa de lo que se debe de esta orden (saldo: %s).', to_char(v_saldo, 'FM999G999G990D00')));
  end if;

  select * into v_prov from public.proveedores where id = v_oc.proveedor_id;
  v_concepto := left(format('Pago OC-%s · %s', v_oc.folio, coalesce(v_prov.nombre, 'Proveedor')), 200);

  -- La salida de caja (RF2.5). `categoria` en el texto que ya usan web y móvil
  -- para material; `categoria_costo` para la utilidad por obra (0036).
  insert into public.movimientos (
    id, obra_id, fecha, tipo, categoria, concepto, monto, metodo_pago, referencia,
    nombre, categoria_costo, empresa_id, created_at, updated_at
  ) values (
    v_mov, v_oc.obra_id, p_fecha, 'SALIDA', 'MATERIAL', v_concepto, p_monto, p_metodo,
    coalesce(p_referencia, ''), left(coalesce(v_prov.nombre, ''), 200), 'MATERIAL',
    v_oc.empresa_id, v_now, v_now
  );

  insert into public.pagos_proveedor (
    id, empresa_id, orden_compra_id, proveedor_id, monto, fecha, metodo_pago,
    referencia, notas, movimiento_id, pagado_por, created_at, updated_at
  ) values (
    p_id, v_oc.empresa_id, p_oc, v_oc.proveedor_id, p_monto, p_fecha, p_metodo,
    coalesce(p_referencia, ''), coalesce(p_notas, ''), v_mov, auth.uid(), v_now, v_now
  );

  return jsonb_build_object('ok', true, 'id', p_id, 'movimiento_id', v_mov,
    'saldo', round((v_saldo - p_monto)::numeric, 2));
end $$;

revoke all on function public.pagar_orden_compra(uuid, uuid, double precision, bigint, text, text, text) from public, anon;
grant execute on function public.pagar_orden_compra(uuid, uuid, double precision, bigint, text, text, text) to authenticated;

-- 12d. Anular un pago (admin o contador): borra (lógico) el pago y su
-- movimiento de caja. El espejo de 9j deja todo coherente.
create or replace function public.anular_pago_proveedor(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p   public.pagos_proveedor%rowtype;
  v_now bigint := public.compras_ahora_ms();
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'No autenticado');
  end if;
  select * into v_p from public.pagos_proveedor where id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Pago no encontrado');
  end if;
  if not public.auth_tiene_rol(v_p.empresa_id, 'admin', 'contador') then
    return jsonb_build_object('ok', false, 'error', 'Solo el administrador o el contador anulan pagos.');
  end if;
  if v_p.deleted_at is not null then
    return jsonb_build_object('ok', true);
  end if;
  update public.pagos_proveedor set deleted_at = v_now, updated_at = v_now where id = p_id;
  update public.movimientos
     set deleted_at = v_now, updated_at = v_now
   where id = v_p.movimiento_id and empresa_id = v_p.empresa_id and deleted_at is null;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.anular_pago_proveedor(uuid) from public, anon;
grant execute on function public.anular_pago_proveedor(uuid) to authenticated;

-- 12e. Ligar la factura del proveedor (admin o contador). La web ya leyó el XML
-- con `lib/fiscal/cfdi.ts`; aquí se valida la forma y se deduplica por folio.
-- `p_uuid = null` quita la factura.
create or replace function public.ligar_factura_orden_compra(
  p_oc       uuid,
  p_uuid     text,
  p_rfc      text,
  p_total    double precision,
  p_iva      double precision,
  p_fecha    bigint,
  p_xml_path text,
  p_pdf_path text,
  p_resumen  jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_oc   public.ordenes_compra%rowtype;
  v_otra integer;
  v_uuid text := upper(nullif(btrim(coalesce(p_uuid, '')), ''));
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'No autenticado');
  end if;
  select * into v_oc from public.ordenes_compra where id = p_oc and deleted_at is null for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Orden de compra no encontrada');
  end if;
  if not public.auth_tiene_rol(v_oc.empresa_id, 'admin', 'contador') then
    return jsonb_build_object('ok', false, 'error', 'Solo el administrador o el contador ligan facturas.');
  end if;
  if v_oc.estado in ('BORRADOR', 'CANCELADA') then
    return jsonb_build_object('ok', false, 'error', 'La factura se liga a una orden emitida.');
  end if;

  if v_uuid is null then
    update public.ordenes_compra
       set factura_uuid = null, factura_rfc = null, factura_total = null, factura_iva = null,
           factura_fecha = null, factura_xml_path = null, factura_pdf_path = null,
           factura_resumen = null, updated_at = public.compras_ahora_ms()
     where id = p_oc;
    return jsonb_build_object('ok', true);
  end if;

  select o.folio into v_otra from public.ordenes_compra o
   where o.empresa_id = v_oc.empresa_id and upper(o.factura_uuid) = v_uuid
     and o.id <> p_oc and o.deleted_at is null
   limit 1;
  if found then
    return jsonb_build_object('ok', false,
      'error', format('Esa factura ya está ligada a la orden OC-%s.', v_otra));
  end if;

  update public.ordenes_compra
     set factura_uuid     = v_uuid,
         factura_rfc      = upper(nullif(btrim(coalesce(p_rfc, '')), '')),
         factura_total    = p_total,
         factura_iva      = p_iva,
         factura_fecha    = p_fecha,
         factura_xml_path = p_xml_path,
         factura_pdf_path = p_pdf_path,
         factura_resumen  = p_resumen,
         updated_at       = public.compras_ahora_ms()
   where id = p_oc;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.ligar_factura_orden_compra(uuid, text, text, double precision, double precision, bigint, text, text, jsonb) from public, anon;
grant execute on function public.ligar_factura_orden_compra(uuid, text, text, double precision, double precision, bigint, text, text, jsonb) to authenticated;

-- 12f. Las columnas de factura NO las toca el trigger de "emitida no cambia"
-- (se ligan después de emitir). El resto de la fila sí queda congelada.

-- ════════════════════════════════════════════════════════════════════════════
-- 13. Bucket privado `compras`
-- ════════════════════════════════════════════════════════════════════════════
-- Rutas:
--   <empresa_id>/remisiones/<recepcion_id>/<archivo>   foto de la remisión
--   <empresa_id>/facturas/<orden_compra_id>/<archivo>  XML y PDF del proveedor
-- 10 MB como `comprobantes`: una foto sin comprimir cabe; un CFDI pesa KB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'compras', 'compras', false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf', 'application/xml', 'text/xml']
)
on conflict (id) do update set
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  public             = false;

drop policy if exists compras_obj_select on storage.objects;
create policy compras_obj_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'compras'
    and public.auth_tiene_rol(public.compras_uuid((storage.foldername(name))[1]), 'admin', 'supervisor', 'contador')
  );

-- Subir: solo a la carpeta de una recepción / orden que EXISTE en esa empresa.
drop policy if exists compras_obj_insert on storage.objects;
create policy compras_obj_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'compras'
    and (
      (
        (storage.foldername(name))[2] = 'remisiones'
        and public.auth_tiene_rol(public.compras_uuid((storage.foldername(name))[1]), 'admin', 'supervisor')
        and exists (
          select 1 from public.recepciones r
           where r.id::text = (storage.foldername(name))[3]
             and r.empresa_id::text = (storage.foldername(name))[1]
             and r.deleted_at is null
        )
      )
      or (
        (storage.foldername(name))[2] = 'facturas'
        and public.auth_tiene_rol(public.compras_uuid((storage.foldername(name))[1]), 'admin', 'contador')
        and exists (
          select 1 from public.ordenes_compra o
           where o.id::text = (storage.foldername(name))[3]
             and o.empresa_id::text = (storage.foldername(name))[1]
             and o.deleted_at is null
        )
      )
    )
  );

-- ¿El objeto es la remisión de una recepción o el XML/PDF de la factura de una
-- orden? Entonces es evidencia ligada y no se borra (SEG-M1). Lo que se subió y
-- nunca se ligó (una subida que falló) o lo que ya se desligó (el admin cambió
-- la remisión, se quitó la factura) sí se puede limpiar. SECURITY DEFINER para
-- que la respuesta no dependa de la RLS de quien borra. Sin policy de UPDATE en
-- el bucket, nada se sobreescribe con el mismo nombre.
create or replace function public._compras_obj_protegido(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.recepciones r where r.remision_uri = p_name)
      or exists (select 1 from public.ordenes_compra o
                  where o.factura_xml_path = p_name or o.factura_pdf_path = p_name)
$$;
revoke all on function public._compras_obj_protegido(text) from public, anon;
grant execute on function public._compras_obj_protegido(text) to authenticated;

drop policy if exists compras_obj_delete on storage.objects;
create policy compras_obj_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'compras'
    and (
      ((storage.foldername(name))[2] = 'remisiones'
        and public.auth_tiene_rol(public.compras_uuid((storage.foldername(name))[1]), 'admin', 'supervisor'))
      or ((storage.foldername(name))[2] = 'facturas'
        and public.auth_tiene_rol(public.compras_uuid((storage.foldername(name))[1]), 'admin', 'contador'))
    )
    and not public._compras_obj_protegido(name)
  );

-- ════════════════════════════════════════════════════════════════════════════
-- 14. Sincronización (listas para el móvil cuando le toque, D6)
-- ════════════════════════════════════════════════════════════════════════════
do $$
declare t text;
begin
  foreach t in array array[
    'proveedores', 'materiales', 'requisiciones', 'requisicion_renglon', 'ordenes_compra',
    'orden_compra_renglon', 'recepciones', 'recepcion_renglon', 'pagos_proveedor', 'material_movimiento'
  ] loop
    execute format('drop trigger if exists trg_srv_upd on public.%I;', t);
    execute format(
      'create trigger trg_srv_upd before insert or update on public.%I '
      'for each row execute function public.set_server_updated_at();', t);
    execute format(
      'create index if not exists idx_%1$s_pull on public.%1$s (empresa_id, server_updated_at);', t);
  end loop;
end $$;

-- Correr en el SQL Editor de Supabase DESPUÉS de 0037. No se aplica a producción
-- sin el visto bueno de Mario (docs/PROGRESO_ALCANCE.md, regla de oro).
