-- 0039_avance_y_estimaciones.sql — AVANCE FÍSICO POR PARTIDA y ESTIMACIONES
-- Fase F3 del alcance ampliado (docs/PLAN_ALCANCE_AMPLIADO.md §3, RF3.1–RF3.7,
-- RD3.1, RR3.1).
-- Depende de: 0001 (auth_tiene_rol), 0002 (obras, movimientos,
--             set_server_updated_at), 0006 (clientes), 0008/0012
--             (obra_presupuesto + sección), 0019 (auth_cliente_empresa_ids,
--             lección del padre), 0022 (contador), 0036 (extras aprobados:
--             orden_cambio / orden_cambio_renglon), 0037 (cobro_fiscal)
-- NO depende de 0040 ni de 0041 (se escriben en paralelo). Aditivo e idempotente.
--
-- QUÉ ES
-- ──────
-- Una ESTIMACIÓN es el cobro por avance: se valúa lo que se hizo en un periodo
-- con los precios del contrato (el presupuesto de la obra) y se le descuentan
-- la AMORTIZACIÓN del anticipo, el FONDO DE GARANTÍA y las demás RETENCIONES
-- pactadas. Lo que queda es lo que el cliente paga ("alcance líquido").
--
--   1. `obra_contrato`   — anticipo, % de amortización, % de fondo de garantía e
--                          IVA de la obra (1 a 1 con la obra).
--   2. `obra_retencion`  — otras retenciones que aplican a CADA estimación
--                          (5 al millar en obra pública, lo que se pacte): % o
--                          monto fijo.
--   3. `avance_partida`  — lo que se hizo, por partida del presupuesto (o por
--                          renglón de un extra APROBADO), capturado en campo.
--   4. `estimaciones` + `estimacion_renglon` — la estimación, sus cantidades del
--                          periodo y sus deducciones ya calculadas.
--   5. RPC: enviar, responder (cliente), registrar la respuesta que llegó por
--      fuera (oficina), marcar cobrada (admin/contador) y el avance que ve el
--      cliente en su portal.
--   6. `cobro_fiscal` gana el origen `estimacion_id` (F1b): cada estimación
--      autorizada es un cobro para facturar.
--
-- EL AVANCE SE GUARDA INCREMENTAL, NO ACUMULADO
-- ─────────────────────────────────────────────
-- Cada fila de `avance_partida` es "lo que se hizo" ese día en esa partida
-- (`cantidad`, en la unidad de la partida). El acumulado es la suma. Por qué:
--   · cada captura queda como evidencia fechada y con su nota ("eje 1-3,
--     12.5 × 3.2"): son los NÚMEROS GENERADORES de la estimación;
--   · dos capturas del mismo día (dos supervisores, o el móvil sin señal) se
--     suman en vez de pisarse: no hay "último que escribe gana";
--   · una corrección es otra fila (negativa) o el borrado lógico de la mala, y
--     la base no deja que el acumulado quede abajo de cero.
-- La pantalla deja capturar "llevamos en total X" y lo convierte a la
-- diferencia con lo que ya había.
--
-- LO QUE SE ENVIÓ NO CAMBIA (mismo enfoque que los extras, 0036)
-- ─────────────────────────────────────────────────────────────
--    BORRADOR ──enviar (admin)──► ENVIADA ──cliente/oficina──► AUTORIZADA ──admin/contador──► COBRADA
--                                     └───────────────────────► RECHAZADA
-- Al ENVIAR se toma la FOTO (`snapshot_json`: renglones con contratado,
-- anterior, este periodo y acumulado; deducciones; números generadores) y un
-- trigger congela la estimación. Corregir una enviada = que el cliente la
-- rechace y hacer otra. El dinero sale de las columnas guardadas (las mismas de
-- la foto), nunca de recalcular.
--
-- LAS CUENTAS VIVEN EN LA WEB, LA BASE LAS VIGILA
-- ────────────────────────────────────────────────
-- La propuesta, el redondeo y las deducciones los calcula
-- `web/src/lib/estimaciones/` (con pruebas). La base no las repite; guarda lo
-- que resultó y, al ENVIAR, revisa lo que no puede fallar nunca:
--   · las identidades del dinero (CHECK): subtotal = bruto − amortización,
--     total = subtotal + IVA, neto = total − fondo − retenciones, nada negativo;
--   · cada importe = round(cantidad × precio, 2) (columna GENERADA);
--   · el bruto = Σ importes;
--   · el precio de cada renglón = el del presupuesto (o del extra) hoy;
--   · lo estimado acumulado por partida no pasa de lo contratado. Lo que se hizo
--     DE MÁS se cobra con un extra aprobado (0036): sus renglones son partidas
--     estimables aparte, con su propia cantidad;
--   · la amortización no pasa de lo que queda del anticipo.
--
-- POR QUÉ EL CONTRATO NO VA EN `obras`
-- ────────────────────────────────────
-- RLS filtra filas, no columnas (lección de 0027 y de 0036 con el margen): el
-- colaborador de campo lee su fila de `obras`. El anticipo y las retenciones
-- van en tablas aparte que solo lee la oficina. El cliente ve lo suyo en la
-- FOTO de cada estimación que se le manda.
--
-- QUIÉN (RLS, RR3.1)
-- ──────────────────
--   admin       → todo: contrato, retenciones, avance, crea/edita/envía
--                 estimaciones, registra la respuesta que llegó por fuera,
--                 marca cobrada.
--   supervisor  → captura el avance (edita/borra solo lo que ÉL capturó); lee
--                 contrato, retenciones y estimaciones. No hay datos de
--                 utilidad en nada de esto (D1): son precios de venta.
--   contador    → lee todo; marca cobrada y la liga con la entrada de caja.
--   colaborador → NADA.
--   cliente     → lee SUS estimaciones enviadas (la fila con su foto, no los
--                 renglones vivos) y las AUTORIZA o RECHAZA por RPC
--                 (`responder_estimacion`, patrón de `responder_orden_cambio`).
--                 El avance físico de su obra lo ve por `avance_obra_portal`,
--                 sin las notas ni quién capturó.
--
-- ENDURECIMIENTO (revisión de seguridad, docs/PROGRESO_ALCANCE.md, SEG-*)
-- ─────────────────────────────────────────────────────────────────────
-- · SEG-A1: una estimación que salió de BORRADOR y una captura de avance ya
--   estimada no se borran FÍSICAMENTE (tampoco en la cascada de la obra).
-- · SEG-B2: la foto que ve el cliente ya no copia la NOTA de las capturas
--   (son internas, F3-15): los generadores van con fecha y cantidad.
-- · SEG-B6: al editar un renglón de estimación se revalida que la partida sea
--   de la obra (lo mismo que al crearlo).
-- · SEG-B8: una captura de avance que ya respalda una estimación enviada no se
--   edita ni se borra (la corrección es otra captura, negativa si hace falta).

-- ════════════════════════════════════════════════════════════════════════════
-- 0. Utilidades
-- ════════════════════════════════════════════════════════════════════════════
-- Nombre de quien captura (del registro de su cuenta). Propia de 0039 para no
-- depender de 0041, que trae una igual para la bitácora.
create or replace function public._estimaciones_nombre_usuario()
returns text
language sql stable security definer set search_path = public
as $$
  select coalesce(nullif(trim(coalesce(u.raw_user_meta_data->>'nombre', '')), ''), '')
    from auth.users u where u.id = auth.uid()
$$;
revoke all on function public._estimaciones_nombre_usuario() from public, anon, authenticated;

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

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Contrato de la obra: anticipo, amortización, fondo de garantía, IVA
-- ════════════════════════════════════════════════════════════════════════════
-- Sin fila = sin anticipo ni retenciones (todo en cero).
create table if not exists public.obra_contrato (
  obra_id                uuid primary key references public.obras(id) on delete cascade,
  empresa_id             uuid not null references public.empresas(id) on delete cascade,
  -- Lo que el cliente dio por adelantado. Es un MONTO (lo que de verdad se
  -- pagó); la pantalla deja capturarlo como % del contrato y lo convierte.
  anticipo_monto         numeric(14,2) not null default 0,
  -- La entrada de caja con que se pagó el anticipo (opcional). La hoja para
  -- facturar la usa para relacionar el CFDI del anticipo (tipo 07).
  anticipo_movimiento_id uuid references public.movimientos(id) on delete set null,
  -- % de CADA estimación que se descuenta del anticipo. Lo normal es el mismo
  -- % del anticipo sobre el contrato (anticipo de 30% → se amortiza 30%).
  amortizacion_pct       numeric(7,4) not null default 0,
  -- % del importe de CADA estimación que el cliente retiene como garantía y
  -- regresa al cerrar la obra (lo típico es 5%).
  fondo_garantia_pct     numeric(7,4) not null default 0,
  -- IVA que se traslada en las estimaciones. 0 = el presupuesto se cobra sin
  -- IVA (como hoy el estado de cuenta).
  iva_pct                numeric(7,4) not null default 0,
  notas                  text not null default '',
  created_at             bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at             bigint not null default (extract(epoch from now()) * 1000)::bigint,
  server_updated_at      bigint not null default 0,
  deleted_at             bigint,
  constraint obra_contrato_anticipo check (anticipo_monto >= 0 and anticipo_monto < 1e12),
  constraint obra_contrato_pcts check (
    amortizacion_pct between 0 and 100
    and fondo_garantia_pct between 0 and 100
    and iva_pct between 0 and 100
  ),
  constraint obra_contrato_notas check (char_length(notas) <= 2000)
);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Retenciones de la obra (se aplican a cada estimación)
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.obra_retencion (
  id                 uuid primary key,
  empresa_id         uuid not null references public.empresas(id) on delete cascade,
  obra_id            uuid not null references public.obras(id)    on delete cascade,
  concepto           text not null check (char_length(btrim(concepto)) between 1 and 120),
  -- PORCENTAJE sobre el importe de la estimación (sin IVA) o MONTO fijo por
  -- estimación.
  tipo               text not null default 'PORCENTAJE' check (tipo in ('PORCENTAJE', 'MONTO')),
  valor              numeric(14,4) not null check (valor >= 0 and valor < 1e10),
  orden              integer not null default 0,
  created_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  server_updated_at  bigint not null default 0,
  deleted_at         bigint,
  constraint obra_retencion_pct check (tipo <> 'PORCENTAJE' or valor <= 100)
);

create index if not exists idx_obra_retencion_obra on public.obra_retencion (obra_id, orden);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Avance físico por partida (RF3.1)
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.avance_partida (
  id                       uuid primary key,
  empresa_id               uuid not null references public.empresas(id) on delete cascade,
  obra_id                  uuid not null references public.obras(id)    on delete cascade,
  -- A qué se le avanzó: una partida del presupuesto o un renglón de un extra
  -- APROBADO (lo que se contrató después). Exactamente uno.
  presupuesto_id           uuid references public.obra_presupuesto(id) on delete cascade,
  orden_cambio_renglon_id  uuid references public.orden_cambio_renglon(id) on delete cascade,
  -- Día en que se hizo: medianoche de México en epoch ms (como asistencias).
  fecha                    bigint not null check (fecha > 0),
  -- Lo que se hizo ese día, en la unidad de la partida. Negativo = corrección.
  cantidad                 numeric(14,4) not null check (cantidad <> 0 and abs(cantidad) < 1e9),
  -- Cómo se midió (número generador): "eje 1-3, 12.5 × 3.2".
  nota                     text not null default '' check (char_length(nota) <= 500),
  -- Los pone el trigger, no el formulario.
  capturo_id               uuid,
  capturo_nombre           text not null default '',
  created_at               bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at               bigint not null default (extract(epoch from now()) * 1000)::bigint,
  server_updated_at        bigint not null default 0,
  deleted_at               bigint,
  constraint avance_partida_origen check (num_nonnulls(presupuesto_id, orden_cambio_renglon_id) = 1)
);

create index if not exists idx_avance_partida_obra on public.avance_partida (obra_id, fecha);
create index if not exists idx_avance_partida_presupuesto on public.avance_partida (presupuesto_id)
  where presupuesto_id is not null;
create index if not exists idx_avance_partida_extra on public.avance_partida (orden_cambio_renglon_id)
  where orden_cambio_renglon_id is not null;

-- Quién capturó lo sella la base; la partida y la obra no se mueven; y el
-- acumulado de la partida nunca queda abajo de cero. SECURITY DEFINER para
-- sumar TODAS las capturas de la partida sin depender de la RLS de quien escribe.
--
-- SEG-B8: una captura que YA RESPALDA una estimación que cuenta (ENVIADA,
-- AUTORIZADA o COBRADA) queda fija: no cambia su fecha, cantidad, nota ni su
-- borrado lógico. "Respalda" = hay una estimación que cuenta, de esta obra, con
-- un renglón vivo de ESTA partida y cuyo periodo termina en o después de la
-- fecha de la captura: lo estimado sale de "lo ejecutado hasta el fin del
-- periodo" (F3-5/F3-6), así que también cuenta lo capturado antes del periodo.
-- Una RECHAZADA no cuenta (libera sus cantidades, F3-6): lo capturado se puede
-- corregir para rehacerla. La corrección de algo ya estimado es OTRA captura
-- (negativa si hace falta), que entra en la siguiente estimación.
create or replace function public._avance_estimado(
  p_obra uuid, p_presupuesto uuid, p_extra uuid, p_fecha bigint
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return exists (
    select 1
      from public.estimaciones e
      join public.estimacion_renglon er on er.estimacion_id = e.id
     where e.obra_id = p_obra
       and e.estado in ('ENVIADA', 'AUTORIZADA', 'COBRADA')
       and e.deleted_at is null
       and e.periodo_fin >= p_fecha
       and er.deleted_at is null
       and (   (p_presupuesto is not null and er.presupuesto_id = p_presupuesto)
            or (p_extra is not null and er.orden_cambio_renglon_id = p_extra))
  );
end $$;
revoke all on function public._avance_estimado(uuid, uuid, uuid, bigint) from public, anon, authenticated;

create or replace function public._avance_partida_guarda()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acum numeric;
begin
  if tg_op = 'INSERT' then
    new.capturo_id     := auth.uid();
    new.capturo_nombre := coalesce(public._estimaciones_nombre_usuario(), '');
  else
    if new.id <> old.id or new.empresa_id <> old.empresa_id or new.obra_id <> old.obra_id
       or new.presupuesto_id is distinct from old.presupuesto_id
       or new.orden_cambio_renglon_id is distinct from old.orden_cambio_renglon_id then
      raise exception 'Una captura de avance no se puede mover a otra partida u obra.';
    end if;
    new.capturo_id     := old.capturo_id;
    new.capturo_nombre := old.capturo_nombre;
    -- SEG-B8 (ver arriba).
    if (new.fecha, new.cantidad, new.nota, new.deleted_at)
         is distinct from (old.fecha, old.cantidad, old.nota, old.deleted_at)
       and public._avance_estimado(old.obra_id, old.presupuesto_id, old.orden_cambio_renglon_id, old.fecha) then
      raise exception 'AVANCE_ESTIMADO: esta captura ya respalda una estimación enviada; no se cambia. Corrige con otra captura (negativa si hace falta).'
        using errcode = 'P0001';
    end if;
  end if;

  select coalesce(sum(a.cantidad), 0) into v_acum
    from public.avance_partida a
   where a.deleted_at is null
     and a.id <> new.id
     and (   (new.presupuesto_id is not null and a.presupuesto_id = new.presupuesto_id)
          or (new.orden_cambio_renglon_id is not null
              and a.orden_cambio_renglon_id = new.orden_cambio_renglon_id));
  if new.deleted_at is null then
    v_acum := v_acum + new.cantidad;
  end if;
  if v_acum < 0 then
    raise exception 'El avance acumulado de la partida quedaría abajo de cero (%).', v_acum;
  end if;

  return new;
end $$;

drop trigger if exists trg_avance_partida_guarda on public.avance_partida;
create trigger trg_avance_partida_guarda
  before insert or update on public.avance_partida
  for each row execute function public._avance_partida_guarda();

-- Y tampoco se borra FÍSICAMENTE (SEG-A1): ni directo ni en la cascada de
-- borrar la obra o la partida del presupuesto.
create or replace function public._avance_partida_no_borrar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public._avance_estimado(old.obra_id, old.presupuesto_id, old.orden_cambio_renglon_id, old.fecha)
     and exists (select 1 from public.empresas e where e.id = old.empresa_id) then
    raise exception 'EVIDENCIA_INMUTABLE: una captura de avance que ya respalda una estimación no se borra.'
      using errcode = 'P0001';
  end if;
  return old;
end $$;
revoke all on function public._avance_partida_no_borrar() from public, anon, authenticated;

drop trigger if exists trg_avance_partida_evidencia on public.avance_partida;
create trigger trg_avance_partida_evidencia
  before delete on public.avance_partida
  for each row execute function public._avance_partida_no_borrar();

-- ════════════════════════════════════════════════════════════════════════════
-- 4. La estimación
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.estimaciones (
  id                  uuid primary key,
  empresa_id          uuid not null references public.empresas(id) on delete cascade,
  obra_id             uuid not null references public.obras(id)    on delete cascade,
  -- Consecutivo POR OBRA ("estimación 3"). Lo pone el trigger de alta.
  folio               integer not null default 0,
  -- Días (medianoche de México, epoch ms), ambos incluidos.
  periodo_inicio      bigint not null,
  periodo_fin         bigint not null,
  estado              text not null default 'BORRADOR'
                        check (estado in ('BORRADOR', 'ENVIADA', 'AUTORIZADA', 'RECHAZADA', 'COBRADA')),
  -- La última (finiquito): amortiza TODO lo que quede del anticipo.
  es_finiquito        boolean not null default false,
  notas               text not null default '' check (char_length(notas) <= 2000),
  -- Párrafo final del PDF (0032/0033, tipo `estimacion`).
  texto_final         text,

  -- Las cuentas (las calcula la web; ver encabezado). Pesos con centavos.
  importe_bruto       numeric(14,2) not null default 0,
  amortizacion        numeric(14,2) not null default 0,
  subtotal            numeric(14,2) not null default 0,
  iva_pct             numeric(7,4)  not null default 0,
  iva                 numeric(14,2) not null default 0,
  total               numeric(14,2) not null default 0,
  fondo_garantia_pct  numeric(7,4)  not null default 0,
  fondo_garantia      numeric(14,2) not null default 0,
  -- [{concepto, tipo, valor, importe}] tal como se aplicaron.
  retenciones         jsonb not null default '[]'::jsonb,
  retenciones_total   numeric(14,2) not null default 0,
  -- Lo que el cliente paga por esta estimación.
  neto                numeric(14,2) not null default 0,

  -- La FOTO de lo enviado. Nula en BORRADOR.
  snapshot_json       jsonb,
  enviado_at          bigint,
  enviado_por         uuid,

  -- La respuesta. `respuesta_origen`: PORTAL (la dio el cliente con su
  -- cuenta) u OFICINA (la registró el admin porque llegó firmada en papel, por
  -- correo o por WhatsApp). `respondido_nombre` se copia para que la evidencia
  -- sobreviva aunque se borre la cuenta.
  respondido_at       bigint,
  respondido_por      uuid,
  respondido_nombre   text,
  respuesta_origen    text check (respuesta_origen in ('PORTAL', 'OFICINA')),
  motivo_rechazo      text,

  -- Cobro: cuándo, quién lo marcó y (opcional) con qué entrada de caja.
  cobrado_at          bigint,
  cobrado_por         uuid,
  movimiento_id       uuid references public.movimientos(id) on delete set null,

  created_at          bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at          bigint not null default (extract(epoch from now()) * 1000)::bigint,
  server_updated_at   bigint not null default 0,
  deleted_at          bigint,

  constraint estimaciones_folio_unico unique (obra_id, folio),
  constraint estimaciones_periodo check (periodo_inicio > 0 and periodo_fin >= periodo_inicio),
  constraint estimaciones_pcts check (
    iva_pct between 0 and 100 and fondo_garantia_pct between 0 and 100
  ),
  -- Las identidades del dinero. Si la web mandara algo que no cuadra, se
  -- rechaza aquí: una estimación que no suma no es evidencia de nada.
  constraint estimaciones_dinero_cuadra check (
    subtotal = importe_bruto - amortizacion
    and total = subtotal + iva
    and neto = total - fondo_garantia - retenciones_total
  ),
  constraint estimaciones_dinero_positivo check (
    importe_bruto >= 0 and amortizacion >= 0 and amortizacion <= importe_bruto
    and iva >= 0 and fondo_garantia >= 0 and retenciones_total >= 0 and neto >= 0
  ),
  constraint estimaciones_retenciones_lista check (jsonb_typeof(retenciones) = 'array'),
  -- Cada estado trae lo suyo (mismo molde que 0036).
  constraint estimaciones_estado_coherente check (
    (estado = 'BORRADOR' and snapshot_json is null and enviado_at is null
       and respondido_at is null and cobrado_at is null)
    or (estado = 'ENVIADA' and snapshot_json is not null and enviado_at is not null
       and respondido_at is null and cobrado_at is null)
    or (estado = 'AUTORIZADA' and snapshot_json is not null and enviado_at is not null
       and respondido_at is not null and cobrado_at is null)
    or (estado = 'RECHAZADA' and snapshot_json is not null and enviado_at is not null
       and respondido_at is not null and cobrado_at is null
       and coalesce(btrim(motivo_rechazo), '') <> '')
    or (estado = 'COBRADA' and snapshot_json is not null and enviado_at is not null
       and respondido_at is not null and cobrado_at is not null)
  )
);

create index if not exists idx_estimaciones_obra on public.estimaciones (obra_id, folio);
-- Un solo BORRADOR vivo por obra: la propuesta "lo hecho que no se ha
-- estimado" y lo que queda del anticipo se calculan contra lo ya enviado; con
-- dos borradores a la vez, los dos propondrían lo mismo.
create unique index if not exists uq_estimacion_borrador on public.estimaciones (obra_id)
  where estado = 'BORRADOR' and deleted_at is null;
-- Una entrada de caja paga UNA estimación.
create unique index if not exists uq_estimacion_movimiento on public.estimaciones (movimiento_id)
  where movimiento_id is not null;

create table if not exists public.estimacion_renglon (
  id                       uuid primary key,
  empresa_id               uuid not null references public.empresas(id)     on delete cascade,
  estimacion_id            uuid not null references public.estimaciones(id) on delete cascade,
  -- La partida que se estima (misma regla que el avance). Si alguien borra de
  -- verdad la partida, el renglón se queda con su texto (la foto ya lo tiene).
  presupuesto_id           uuid references public.obra_presupuesto(id) on delete set null,
  orden_cambio_renglon_id  uuid references public.orden_cambio_renglon(id) on delete set null,
  concepto                 text not null default '',
  unidad                   text not null default '',
  seccion                  text,
  -- Cantidad de ESTE periodo.
  cantidad                 numeric(14,4) not null check (cantidad > 0 and cantidad < 1e9),
  -- Precio unitario del contrato (copiado del presupuesto o del extra).
  precio_unitario          numeric(16,4) not null check (precio_unitario >= 0 and precio_unitario < 1e11),
  -- Nadie lo escribe: es round(cantidad × precio, 2), siempre.
  importe                  numeric(14,2) generated always as (round(cantidad * precio_unitario, 2)) stored,
  orden                    integer not null default 0,
  created_at               bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at               bigint not null default (extract(epoch from now()) * 1000)::bigint,
  server_updated_at        bigint not null default 0,
  deleted_at               bigint,
  constraint estimacion_renglon_origen check (num_nonnulls(presupuesto_id, orden_cambio_renglon_id) <= 1)
);

create index if not exists idx_estimacion_renglon on public.estimacion_renglon (estimacion_id, orden);
create unique index if not exists uq_estimacion_renglon_partida
  on public.estimacion_renglon (estimacion_id, presupuesto_id)
  where presupuesto_id is not null and deleted_at is null;
create unique index if not exists uq_estimacion_renglon_extra
  on public.estimacion_renglon (estimacion_id, orden_cambio_renglon_id)
  where orden_cambio_renglon_id is not null and deleted_at is null;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Triggers: folio y candados
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public._estimacion_folio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('estimacion_folio:' || new.obra_id::text));
  select coalesce(max(folio), 0) + 1 into new.folio
    from public.estimaciones
   where obra_id = new.obra_id;
  return new;
end $$;

drop trigger if exists trg_estimacion_folio on public.estimaciones;
create trigger trg_estimacion_folio
  before insert on public.estimaciones
  for each row execute function public._estimacion_folio();

-- La estimación enviada no se toca. Aplica a TODO el que escriba.
create or replace function public._estimacion_guarda()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id <> old.id or new.empresa_id <> old.empresa_id
     or new.obra_id <> old.obra_id or new.folio <> old.folio then
    raise exception 'No se puede cambiar la obra, la empresa ni el folio de una estimación.';
  end if;

  if new.estado <> old.estado and not (
       (old.estado = 'BORRADOR'   and new.estado = 'ENVIADA')
    or (old.estado = 'ENVIADA'    and new.estado in ('AUTORIZADA', 'RECHAZADA'))
    or (old.estado = 'AUTORIZADA' and new.estado = 'COBRADA')
  ) then
    raise exception 'Una estimación % no puede pasar a %.', lower(old.estado), lower(new.estado);
  end if;

  if old.estado <> 'BORRADOR' then
    if new.periodo_inicio        is distinct from old.periodo_inicio
       or new.periodo_fin        is distinct from old.periodo_fin
       or new.es_finiquito       is distinct from old.es_finiquito
       or new.notas              is distinct from old.notas
       or new.texto_final        is distinct from old.texto_final
       or new.importe_bruto      is distinct from old.importe_bruto
       or new.amortizacion       is distinct from old.amortizacion
       or new.subtotal           is distinct from old.subtotal
       or new.iva_pct            is distinct from old.iva_pct
       or new.iva                is distinct from old.iva
       or new.total              is distinct from old.total
       or new.fondo_garantia_pct is distinct from old.fondo_garantia_pct
       or new.fondo_garantia     is distinct from old.fondo_garantia
       or new.retenciones        is distinct from old.retenciones
       or new.retenciones_total  is distinct from old.retenciones_total
       or new.neto               is distinct from old.neto
       or new.snapshot_json      is distinct from old.snapshot_json
       or new.enviado_at         is distinct from old.enviado_at
       or new.enviado_por        is distinct from old.enviado_por then
      raise exception 'La estimación ya se envió al cliente: lo enviado no se puede cambiar.';
    end if;

    if old.respondido_at is not null and (
         new.respondido_at     is distinct from old.respondido_at
      or new.respondido_por    is distinct from old.respondido_por
      or new.respondido_nombre is distinct from old.respondido_nombre
      or new.respuesta_origen  is distinct from old.respuesta_origen
      or new.motivo_rechazo    is distinct from old.motivo_rechazo
    ) then
      raise exception 'La respuesta a la estimación no se puede cambiar.';
    end if;

    if old.cobrado_at is not null and (
         new.cobrado_at  is distinct from old.cobrado_at
      or new.cobrado_por is distinct from old.cobrado_por
    ) then
      raise exception 'La fecha de cobro de la estimación no se puede cambiar.';
    end if;

    if new.deleted_at is distinct from old.deleted_at then
      raise exception 'Una estimación enviada no se borra.';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists trg_estimacion_guarda on public.estimaciones;
create trigger trg_estimacion_guarda
  before update on public.estimaciones
  for each row execute function public._estimacion_guarda();

-- Lo que se le envió al cliente tampoco se borra FÍSICAMENTE (SEG-A1): ni
-- directo ni en la cascada de borrar la obra. Un borrador sí.
drop trigger if exists trg_estimacion_evidencia on public.estimaciones;
create trigger trg_estimacion_evidencia
  before delete on public.estimaciones
  for each row when (old.estado <> 'BORRADOR')
  execute function public._evidencia_no_se_borra();

-- Los renglones solo se tocan mientras la estimación es BORRADOR.
create or replace function public._estimacion_renglon_guarda()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
  v_padre  uuid;
begin
  if tg_op = 'UPDATE' and new.estimacion_id <> old.estimacion_id then
    raise exception 'Un renglón no se puede mover a otra estimación.';
  end if;

  v_padre := case when tg_op = 'DELETE' then old.estimacion_id else new.estimacion_id end;
  select estado into v_estado from public.estimaciones where id = v_padre;

  -- En un UPDATE que solo pone en NULL la partida (su borrado real, FK
  -- `on delete set null`) no se estorba: el texto queda y la foto ya existe.
  if tg_op = 'UPDATE'
     and new.concepto = old.concepto and new.cantidad = old.cantidad
     and new.precio_unitario = old.precio_unitario
     and new.deleted_at is not distinct from old.deleted_at
     and ((old.presupuesto_id is not null and new.presupuesto_id is null)
       or (old.orden_cambio_renglon_id is not null and new.orden_cambio_renglon_id is null)) then
    return new;
  end if;

  if v_estado is not null and v_estado <> 'BORRADOR' then
    raise exception 'La estimación ya se envió: sus renglones no se pueden cambiar.';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end $$;

drop trigger if exists trg_estimacion_renglon_guarda on public.estimacion_renglon;
create trigger trg_estimacion_renglon_guarda
  before insert or update or delete on public.estimacion_renglon
  for each row execute function public._estimacion_renglon_guarda();

-- ════════════════════════════════════════════════════════════════════════════
-- 6. RLS
-- ════════════════════════════════════════════════════════════════════════════
alter table public.obra_contrato      enable row level security;
alter table public.obra_retencion     enable row level security;
alter table public.avance_partida     enable row level security;
alter table public.estimaciones       enable row level security;
alter table public.estimacion_renglon enable row level security;

-- ── obra_contrato: oficina lee, admin escribe ───────────────────────────────
drop policy if exists obra_contrato_read on public.obra_contrato;
create policy obra_contrato_read on public.obra_contrato
  for select using (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor', 'contador'));

drop policy if exists obra_contrato_insert on public.obra_contrato;
create policy obra_contrato_insert on public.obra_contrato
  for insert with check (
    public.auth_tiene_rol(empresa_id, 'admin')
    and exists (
      select 1 from public.obras o
       where o.id = obra_id and o.empresa_id = obra_contrato.empresa_id
    )
    and (anticipo_movimiento_id is null or exists (
      select 1 from public.movimientos m
       where m.id = anticipo_movimiento_id
         and m.empresa_id = obra_contrato.empresa_id
         and m.obra_id = obra_contrato.obra_id
         and m.tipo = 'ENTRADA'
    ))
  );

drop policy if exists obra_contrato_update on public.obra_contrato;
create policy obra_contrato_update on public.obra_contrato
  for update
  using (public.auth_tiene_rol(empresa_id, 'admin'))
  with check (
    public.auth_tiene_rol(empresa_id, 'admin')
    and exists (
      select 1 from public.obras o
       where o.id = obra_id and o.empresa_id = obra_contrato.empresa_id
    )
    and (anticipo_movimiento_id is null or exists (
      select 1 from public.movimientos m
       where m.id = anticipo_movimiento_id
         and m.empresa_id = obra_contrato.empresa_id
         and m.obra_id = obra_contrato.obra_id
         and m.tipo = 'ENTRADA'
    ))
  );

-- ── obra_retencion: igual ───────────────────────────────────────────────────
drop policy if exists obra_retencion_read on public.obra_retencion;
create policy obra_retencion_read on public.obra_retencion
  for select using (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor', 'contador'));

drop policy if exists obra_retencion_insert on public.obra_retencion;
create policy obra_retencion_insert on public.obra_retencion
  for insert with check (
    public.auth_tiene_rol(empresa_id, 'admin')
    and exists (
      select 1 from public.obras o
       where o.id = obra_id and o.empresa_id = obra_retencion.empresa_id
    )
  );

drop policy if exists obra_retencion_update on public.obra_retencion;
create policy obra_retencion_update on public.obra_retencion
  for update
  using (public.auth_tiene_rol(empresa_id, 'admin'))
  with check (
    public.auth_tiene_rol(empresa_id, 'admin')
    and exists (
      select 1 from public.obras o
       where o.id = obra_id and o.empresa_id = obra_retencion.empresa_id
    )
  );

-- ── avance_partida: supervisor y admin capturan ────────────────────────────
drop policy if exists avance_partida_read on public.avance_partida;
create policy avance_partida_read on public.avance_partida
  for select using (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor', 'contador'));

-- La partida tiene que ser de ESTA obra (y de esta empresa); el renglón de
-- extra, de un extra APROBADO de esta obra. Así nadie cuelga avance de una
-- partida ajena ni de un extra que el cliente no autorizó.
drop policy if exists avance_partida_insert on public.avance_partida;
create policy avance_partida_insert on public.avance_partida
  for insert with check (
    public.auth_tiene_rol(empresa_id, 'admin', 'supervisor')
    and exists (
      select 1 from public.obras o
       where o.id = obra_id and o.empresa_id = avance_partida.empresa_id
    )
    and (
      (presupuesto_id is not null and exists (
        select 1 from public.obra_presupuesto p
         where p.id = avance_partida.presupuesto_id
           and p.obra_id = avance_partida.obra_id
           and p.empresa_id = avance_partida.empresa_id
           and p.deleted_at is null
      ))
      or
      (orden_cambio_renglon_id is not null and exists (
        select 1 from public.orden_cambio_renglon r
          join public.orden_cambio oc on oc.id = r.orden_cambio_id
         where r.id = avance_partida.orden_cambio_renglon_id
           and r.deleted_at is null
           and oc.obra_id = avance_partida.obra_id
           and oc.empresa_id = avance_partida.empresa_id
           and oc.estado = 'APROBADA'
           and oc.deleted_at is null
      ))
    )
  );

-- Editar o borrar (lógico): el admin cualquiera; el supervisor, lo suyo.
drop policy if exists avance_partida_update on public.avance_partida;
create policy avance_partida_update on public.avance_partida
  for update
  using (
    public.auth_tiene_rol(empresa_id, 'admin')
    or (public.auth_tiene_rol(empresa_id, 'supervisor') and capturo_id = auth.uid())
  )
  with check (
    public.auth_tiene_rol(empresa_id, 'admin')
    or (public.auth_tiene_rol(empresa_id, 'supervisor') and capturo_id = auth.uid())
  );

-- ── estimaciones ────────────────────────────────────────────────────────────
drop policy if exists estimaciones_read_oficina on public.estimaciones;
create policy estimaciones_read_oficina on public.estimaciones
  for select using (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor', 'contador'));

-- El cliente: su empresa Y su obra, solo lo que ya se le mandó.
drop policy if exists estimaciones_read_cliente on public.estimaciones;
create policy estimaciones_read_cliente on public.estimaciones
  for select using (
    estado in ('ENVIADA', 'AUTORIZADA', 'RECHAZADA', 'COBRADA')
    and deleted_at is null
    and empresa_id in (select public.auth_cliente_empresa_ids())
    and obra_id in (
      select o.id from public.obras o
       where o.empresa_id = estimaciones.empresa_id
         and o.cliente_id in (
           select c.id from public.clientes c
            where c.user_id = auth.uid() and c.deleted_at is null
         )
    )
  );

-- Alta: solo el admin, solo BORRADOR y sin nada de lo que ponen las RPC.
drop policy if exists estimaciones_insert on public.estimaciones;
create policy estimaciones_insert on public.estimaciones
  for insert with check (
    public.auth_tiene_rol(empresa_id, 'admin')
    and estado = 'BORRADOR'
    and snapshot_json is null
    and respondido_at is null
    and cobrado_at is null
    and movimiento_id is null
    and exists (
      select 1 from public.obras o
       where o.id = obra_id and o.empresa_id = estimaciones.empresa_id
    )
  );

-- Edición (incluido el borrado lógico): solo borradores, y sigue borrador.
drop policy if exists estimaciones_update on public.estimaciones;
create policy estimaciones_update on public.estimaciones
  for update
  using (public.auth_tiene_rol(empresa_id, 'admin') and estado = 'BORRADOR')
  with check (
    public.auth_tiene_rol(empresa_id, 'admin')
    and estado = 'BORRADOR'
    and snapshot_json is null
    and movimiento_id is null
    and exists (
      select 1 from public.obras o
       where o.id = obra_id and o.empresa_id = estimaciones.empresa_id
    )
  );

-- ── estimacion_renglon (el cliente NO: ve la foto) ─────────────────────────
drop policy if exists estimacion_renglon_read on public.estimacion_renglon;
create policy estimacion_renglon_read on public.estimacion_renglon
  for select using (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor', 'contador'));

-- El padre, BORRADOR y de la misma empresa; la partida, de la MISMA obra.
drop policy if exists estimacion_renglon_insert on public.estimacion_renglon;
create policy estimacion_renglon_insert on public.estimacion_renglon
  for insert with check (
    public.auth_tiene_rol(empresa_id, 'admin')
    and exists (
      select 1 from public.estimaciones e
       where e.id = estimacion_id
         and e.empresa_id = estimacion_renglon.empresa_id
         and e.estado = 'BORRADOR'
         and (
           (estimacion_renglon.presupuesto_id is not null and exists (
             select 1 from public.obra_presupuesto p
              where p.id = estimacion_renglon.presupuesto_id
                and p.obra_id = e.obra_id
                and p.empresa_id = e.empresa_id
           ))
           or
           (estimacion_renglon.orden_cambio_renglon_id is not null and exists (
             select 1 from public.orden_cambio_renglon r
               join public.orden_cambio oc on oc.id = r.orden_cambio_id
              where r.id = estimacion_renglon.orden_cambio_renglon_id
                and oc.obra_id = e.obra_id
                and oc.empresa_id = e.empresa_id
                and oc.estado = 'APROBADA'
           ))
         )
    )
  );

-- SEG-B6: al editar se revalida lo mismo que al crear (la partida o el renglón
-- del extra, de la MISMA obra). Si no, un UPDATE podía colgar el renglón de una
-- partida de otra obra. Un renglón que se está BORRANDO (lógico) no se revalida:
-- así se puede quitar el que se quedó sin partida porque alguien la borró de
-- verdad (FK `on delete set null`).
drop policy if exists estimacion_renglon_update on public.estimacion_renglon;
create policy estimacion_renglon_update on public.estimacion_renglon
  for update
  using (public.auth_tiene_rol(empresa_id, 'admin'))
  with check (
    public.auth_tiene_rol(empresa_id, 'admin')
    and exists (
      select 1 from public.estimaciones e
       where e.id = estimacion_id
         and e.empresa_id = estimacion_renglon.empresa_id
         and e.estado = 'BORRADOR'
         and (
           estimacion_renglon.deleted_at is not null
           or
           (estimacion_renglon.presupuesto_id is not null and exists (
             select 1 from public.obra_presupuesto p
              where p.id = estimacion_renglon.presupuesto_id
                and p.obra_id = e.obra_id
                and p.empresa_id = e.empresa_id
           ))
           or
           (estimacion_renglon.orden_cambio_renglon_id is not null and exists (
             select 1 from public.orden_cambio_renglon r
               join public.orden_cambio oc on oc.id = r.orden_cambio_id
              where r.id = estimacion_renglon.orden_cambio_renglon_id
                and oc.obra_id = e.obra_id
                and oc.empresa_id = e.empresa_id
                and oc.estado = 'APROBADA'
           ))
         )
    )
  );

-- ════════════════════════════════════════════════════════════════════════════
-- 7. RPC
-- ════════════════════════════════════════════════════════════════════════════
-- Todas devuelven jsonb {ok, error?, ...} como el resto de RPC de la app.

-- 7a. Cantidad ya estimada de una partida en las estimaciones que cuentan
-- (enviadas, autorizadas, cobradas), sin contar `p_excepto`.
create or replace function public._estimado_previo(
  p_obra uuid, p_presupuesto uuid, p_extra uuid, p_excepto uuid
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(er.cantidad), 0)
    from public.estimacion_renglon er
    join public.estimaciones e on e.id = er.estimacion_id
   where e.obra_id = p_obra
     and e.id <> p_excepto
     and e.estado in ('ENVIADA', 'AUTORIZADA', 'COBRADA')
     and e.deleted_at is null
     and er.deleted_at is null
     and (   (p_presupuesto is not null and er.presupuesto_id = p_presupuesto)
          or (p_extra is not null and er.orden_cambio_renglon_id = p_extra));
$$;
revoke all on function public._estimado_previo(uuid, uuid, uuid, uuid) from public, anon, authenticated;

-- 7b. La FOTO. Solo la llama `enviar_estimacion`, que valida antes.
create or replace function public._estimacion_snapshot(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with e as (
    select * from public.estimaciones where id = p_id
  ),
  c as (
    select oc.* from public.obra_contrato oc, e
     where oc.obra_id = e.obra_id and oc.deleted_at is null
  ),
  previas as (
    select coalesce(sum(x.importe_bruto), 0) as bruto,
           coalesce(sum(x.amortizacion), 0)  as amortizado,
           coalesce(sum(x.fondo_garantia), 0) as fondo
      from public.estimaciones x, e
     where x.obra_id = e.obra_id and x.id <> e.id
       and x.estado in ('ENVIADA', 'AUTORIZADA', 'COBRADA') and x.deleted_at is null
  ),
  r as (
    select er.*,
           coalesce(p.cantidad, ocr.cantidad) as contratado,
           public._estimado_previo(e.obra_id, er.presupuesto_id, er.orden_cambio_renglon_id, e.id) as anterior,
           case when er.orden_cambio_renglon_id is not null then 'extra' else 'presupuesto' end as origen,
           ocab.folio as extra_folio
      from public.estimacion_renglon er
      join e on e.id = er.estimacion_id
      left join public.obra_presupuesto p on p.id = er.presupuesto_id
      left join public.orden_cambio_renglon ocr on ocr.id = er.orden_cambio_renglon_id
      left join public.orden_cambio ocab on ocab.id = ocr.orden_cambio_id
     where er.deleted_at is null
  )
  select jsonb_build_object(
    'folio', e.folio,
    'obra', (select o.nombre from public.obras o where o.id = e.obra_id),
    'periodo_inicio', e.periodo_inicio,
    'periodo_fin', e.periodo_fin,
    'es_finiquito', e.es_finiquito,
    'notas', e.notas,
    'renglones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'origen', r.origen,
        'extra_folio', r.extra_folio,
        'concepto', r.concepto,
        'unidad', r.unidad,
        'seccion', r.seccion,
        'contratado', r.contratado,
        'anterior', r.anterior,
        'cantidad', r.cantidad,
        'acumulado', r.anterior + r.cantidad,
        'precio_unitario', r.precio_unitario,
        'importe', r.importe,
        -- Números generadores: lo capturado en campo dentro del periodo. SIN la
        -- nota de la captura (SEG-B2): la foto la lee el cliente y las notas
        -- son internas (F3-15), igual que en `avance_obra_portal`.
        'generadores', coalesce((
          select jsonb_agg(jsonb_build_object(
            'fecha', a.fecha, 'cantidad', a.cantidad
          ) order by a.fecha, a.created_at)
            from public.avance_partida a
           where a.deleted_at is null
             and a.fecha between e.periodo_inicio and e.periodo_fin
             and (   (r.presupuesto_id is not null and a.presupuesto_id = r.presupuesto_id)
                  or (r.orden_cambio_renglon_id is not null
                      and a.orden_cambio_renglon_id = r.orden_cambio_renglon_id))
        ), '[]'::jsonb)
      ) order by r.orden, r.created_at)
      from r
    ), '[]'::jsonb),
    'importes', jsonb_build_object(
      'bruto', e.importe_bruto,
      'amortizacion', e.amortizacion,
      'subtotal', e.subtotal,
      'iva_pct', e.iva_pct,
      'iva', e.iva,
      'total', e.total,
      'fondo_garantia_pct', e.fondo_garantia_pct,
      'fondo_garantia', e.fondo_garantia,
      'retenciones', e.retenciones,
      'retenciones_total', e.retenciones_total,
      'neto', e.neto
    ),
    'contrato', jsonb_build_object(
      'anticipo', coalesce((select anticipo_monto from c), 0),
      'amortizacion_pct', coalesce((select amortizacion_pct from c), 0),
      'amortizado_previo', (select amortizado from previas),
      'anticipo_por_amortizar', greatest(
        0, coalesce((select anticipo_monto from c), 0) - (select amortizado from previas) - e.amortizacion
      )
    ),
    'acumulados', jsonb_build_object(
      'bruto_previo', (select bruto from previas),
      'bruto_acumulado', (select bruto from previas) + e.importe_bruto,
      'fondo_previo', (select fondo from previas),
      'fondo_acumulado', (select fondo from previas) + e.fondo_garantia
    )
  )
  from e;
$$;
revoke all on function public._estimacion_snapshot(uuid) from public, anon, authenticated;

-- 7c. Enviar (solo admin): valida lo que no puede fallar, toma la foto y congela.
create or replace function public.enviar_estimacion(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_e         public.estimaciones%rowtype;
  v_r         record;
  v_now       bigint := (extract(epoch from now()) * 1000)::bigint;
  v_bruto     numeric;
  v_contrat   numeric;
  v_pu        numeric;
  v_previo    numeric;
  v_anticipo  numeric;
  v_amortizado numeric;
  v_snap      jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'No autenticado');
  end if;

  select * into v_e from public.estimaciones where id = p_id and deleted_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Estimación no encontrada');
  end if;
  if not public.auth_tiene_rol(v_e.empresa_id, 'admin') then
    return jsonb_build_object('ok', false, 'error', 'Solo un administrador puede enviar estimaciones al cliente.');
  end if;

  -- Una a la vez por obra: los acumulados de una dependen de las anteriores.
  perform pg_advisory_xact_lock(hashtext('estimacion_obra:' || v_e.obra_id::text));
  select * into v_e from public.estimaciones where id = p_id for update;

  if v_e.estado <> 'BORRADOR' then
    return jsonb_build_object('ok', false, 'error', 'Esta estimación ya se había enviado.');
  end if;

  if not exists (
    select 1 from public.estimacion_renglon where estimacion_id = p_id and deleted_at is null
  ) then
    return jsonb_build_object('ok', false, 'error', 'Agrega al menos una partida antes de enviarla.');
  end if;

  select coalesce(sum(importe), 0) into v_bruto
    from public.estimacion_renglon where estimacion_id = p_id and deleted_at is null;
  if v_bruto <> v_e.importe_bruto then
    return jsonb_build_object('ok', false,
      'error', 'Los importes no coinciden con las partidas: vuelve a calcular la estimación.');
  end if;

  for v_r in
    select * from public.estimacion_renglon where estimacion_id = p_id and deleted_at is null
  loop
    v_contrat := null;
    if v_r.presupuesto_id is not null then
      select p.cantidad::numeric, round(p.precio_unitario::numeric, 4) into v_contrat, v_pu
        from public.obra_presupuesto p
       where p.id = v_r.presupuesto_id and p.obra_id = v_e.obra_id and p.deleted_at is null;
    elsif v_r.orden_cambio_renglon_id is not null then
      select r.cantidad::numeric, round(r.precio_unitario::numeric, 4) into v_contrat, v_pu
        from public.orden_cambio_renglon r
        join public.orden_cambio oc on oc.id = r.orden_cambio_id
       where r.id = v_r.orden_cambio_renglon_id and r.deleted_at is null
         and oc.obra_id = v_e.obra_id and oc.estado = 'APROBADA' and oc.deleted_at is null;
    end if;
    if v_contrat is null then
      return jsonb_build_object('ok', false,
        'error', format('«%s» ya no está en el presupuesto de la obra: quítala de la estimación.', v_r.concepto));
    end if;
    if v_pu <> v_r.precio_unitario then
      return jsonb_build_object('ok', false,
        'error', format('El precio de «%s» cambió en el presupuesto: vuelve a calcular la estimación.', v_r.concepto));
    end if;
    v_previo := public._estimado_previo(v_e.obra_id, v_r.presupuesto_id, v_r.orden_cambio_renglon_id, p_id);
    if v_previo + v_r.cantidad > round(v_contrat, 4) then
      return jsonb_build_object('ok', false,
        'error', format('En «%s» se estimaría más de lo contratado (contratado %s, ya estimado %s, esta %s). Lo que se hizo de más se cobra con un extra aprobado por el cliente.',
          v_r.concepto, round(v_contrat, 4), v_previo, v_r.cantidad));
    end if;
  end loop;

  select coalesce(anticipo_monto, 0) into v_anticipo
    from public.obra_contrato where obra_id = v_e.obra_id and deleted_at is null;
  select coalesce(sum(amortizacion), 0) into v_amortizado
    from public.estimaciones
   where obra_id = v_e.obra_id and id <> p_id
     and estado in ('ENVIADA', 'AUTORIZADA', 'COBRADA') and deleted_at is null;
  if v_e.amortizacion > greatest(0, coalesce(v_anticipo, 0) - v_amortizado) then
    return jsonb_build_object('ok', false,
      'error', 'La amortización pasa de lo que queda del anticipo: vuelve a calcular la estimación.');
  end if;

  v_snap := public._estimacion_snapshot(p_id);

  update public.estimaciones
     set estado        = 'ENVIADA',
         snapshot_json = v_snap,
         enviado_at    = v_now,
         enviado_por   = auth.uid(),
         updated_at    = v_now
   where id = p_id;

  return jsonb_build_object('ok', true, 'estado', 'ENVIADA', 'neto', v_e.neto);
end $$;

revoke all on function public.enviar_estimacion(uuid) from public, anon;
grant execute on function public.enviar_estimacion(uuid) to authenticated;

-- 7d. El cliente autoriza o rechaza (patrón de `responder_orden_cambio`).
-- Valida que sea el cliente LIGADO a la obra, que todo sea de la misma empresa,
-- que esté ENVIADA (una sola respuesta, FOR UPDATE) y que rechazar lleve motivo.
create or replace function public.responder_estimacion(
  p_id        uuid,
  p_autorizar boolean,
  p_motivo    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  v_e       public.estimaciones%rowtype;
  v_cliente public.clientes%rowtype;
  v_motivo  text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_nuevo   text;
  v_now     bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'No autenticado');
  end if;
  if p_autorizar is null then
    return jsonb_build_object('ok', false, 'error', 'Falta la respuesta.');
  end if;

  select * into v_e from public.estimaciones where id = p_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Estimación no encontrada');
  end if;

  select c.* into v_cliente
    from public.obras o
    join public.clientes c on c.id = o.cliente_id
   where o.id = v_e.obra_id
     and o.empresa_id = v_e.empresa_id
     and c.empresa_id = v_e.empresa_id
     and c.user_id = v_user
     and c.deleted_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'No autorizado');
  end if;

  if v_e.estado <> 'ENVIADA' then
    return jsonb_build_object('ok', false, 'error', 'Esta estimación ya no está pendiente de respuesta.');
  end if;
  if not p_autorizar and v_motivo is null then
    return jsonb_build_object('ok', false, 'error', 'Escribe por qué la rechazas.');
  end if;
  if v_motivo is not null and length(v_motivo) > 1000 then
    return jsonb_build_object('ok', false, 'error', 'El motivo no puede pasar de 1000 caracteres.');
  end if;

  v_nuevo := case when p_autorizar then 'AUTORIZADA' else 'RECHAZADA' end;
  update public.estimaciones
     set estado            = v_nuevo,
         respondido_at     = v_now,
         respondido_por    = v_user,
         respondido_nombre = v_cliente.nombre,
         respuesta_origen  = 'PORTAL',
         motivo_rechazo    = case when p_autorizar then null else v_motivo end,
         updated_at        = v_now
   where id = p_id;

  return jsonb_build_object('ok', true, 'estado', v_nuevo);
end $$;

revoke all on function public.responder_estimacion(uuid, boolean, text) from public, anon;
grant execute on function public.responder_estimacion(uuid, boolean, text) to authenticated;

-- 7e. La respuesta llegó POR FUERA (firmada en papel, por correo, WhatsApp):
-- el admin la registra diciendo QUIÉN autorizó. Queda marcada OFICINA para que
-- nadie la confunda con una autorización del cliente en su portal.
create or replace function public.registrar_respuesta_estimacion(
  p_id        uuid,
  p_autorizar boolean,
  p_quien     text,
  p_motivo    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_e      public.estimaciones%rowtype;
  v_quien  text := nullif(btrim(coalesce(p_quien, '')), '');
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_nuevo  text;
  v_now    bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'No autenticado');
  end if;
  if p_autorizar is null then
    return jsonb_build_object('ok', false, 'error', 'Falta la respuesta.');
  end if;

  select * into v_e from public.estimaciones where id = p_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Estimación no encontrada');
  end if;
  if not public.auth_tiene_rol(v_e.empresa_id, 'admin') then
    return jsonb_build_object('ok', false, 'error', 'Solo un administrador puede registrar la respuesta del cliente.');
  end if;
  if v_e.estado <> 'ENVIADA' then
    return jsonb_build_object('ok', false, 'error', 'Esta estimación ya no está pendiente de respuesta.');
  end if;
  if v_quien is null or length(v_quien) > 120 then
    return jsonb_build_object('ok', false, 'error', 'Escribe quién la autorizó o la rechazó (máximo 120 letras).');
  end if;
  if not p_autorizar and v_motivo is null then
    return jsonb_build_object('ok', false, 'error', 'Escribe por qué la rechazaron.');
  end if;
  if v_motivo is not null and length(v_motivo) > 1000 then
    return jsonb_build_object('ok', false, 'error', 'El motivo no puede pasar de 1000 caracteres.');
  end if;

  v_nuevo := case when p_autorizar then 'AUTORIZADA' else 'RECHAZADA' end;
  update public.estimaciones
     set estado            = v_nuevo,
         respondido_at     = v_now,
         respondido_por    = auth.uid(),
         respondido_nombre = v_quien,
         respuesta_origen  = 'OFICINA',
         motivo_rechazo    = case when p_autorizar then null else v_motivo end,
         updated_at        = v_now
   where id = p_id;

  return jsonb_build_object('ok', true, 'estado', v_nuevo);
end $$;

revoke all on function public.registrar_respuesta_estimacion(uuid, boolean, text, text) from public, anon;
grant execute on function public.registrar_respuesta_estimacion(uuid, boolean, text, text) to authenticated;

-- 7f. Cobrada (admin o contador). Sobre una AUTORIZADA la marca cobrada; sobre
-- una COBRADA sin entrada ligada, solo liga la entrada (se puede ligar
-- después). La entrada tiene que ser ENTRADA de la misma obra y no pagar ya
-- otra estimación (índice único).
create or replace function public.marcar_estimacion_cobrada(
  p_id            uuid,
  p_movimiento_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_e   public.estimaciones%rowtype;
  v_now bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'No autenticado');
  end if;

  select * into v_e from public.estimaciones where id = p_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Estimación no encontrada');
  end if;
  if not public.auth_tiene_rol(v_e.empresa_id, 'admin', 'contador') then
    return jsonb_build_object('ok', false, 'error', 'Solo el administrador o el contador pueden marcarla cobrada.');
  end if;

  if p_movimiento_id is not null then
    if not exists (
      select 1 from public.movimientos m
       where m.id = p_movimiento_id and m.empresa_id = v_e.empresa_id
         and m.obra_id = v_e.obra_id and m.tipo = 'ENTRADA' and m.deleted_at is null
    ) then
      return jsonb_build_object('ok', false, 'error', 'Esa entrada de caja no es de esta obra.');
    end if;
    if exists (
      select 1 from public.estimaciones x
       where x.movimiento_id = p_movimiento_id and x.id <> p_id
    ) then
      return jsonb_build_object('ok', false, 'error', 'Esa entrada de caja ya paga otra estimación.');
    end if;
  end if;

  if v_e.estado = 'AUTORIZADA' then
    update public.estimaciones
       set estado        = 'COBRADA',
           cobrado_at    = v_now,
           cobrado_por   = auth.uid(),
           movimiento_id = p_movimiento_id,
           updated_at    = v_now
     where id = p_id;
  elsif v_e.estado = 'COBRADA' and v_e.movimiento_id is null and p_movimiento_id is not null then
    update public.estimaciones
       set movimiento_id = p_movimiento_id,
           updated_at    = v_now
     where id = p_id;
  else
    return jsonb_build_object('ok', false,
      'error', 'Solo se marca cobrada una estimación autorizada por el cliente.');
  end if;

  return jsonb_build_object('ok', true, 'estado', 'COBRADA');
end $$;

revoke all on function public.marcar_estimacion_cobrada(uuid, uuid) from public, anon;
grant execute on function public.marcar_estimacion_cobrada(uuid, uuid) to authenticated;

-- 7g. Avance de la obra para el PORTAL (RF3.7). El cliente no lee
-- `avance_partida` (trae notas internas y quién capturó); esto le da, por
-- partida del contrato, lo contratado, el precio y lo ejecutado. El cálculo del
-- % lo hace la web con la misma función que usa la oficina.
create or replace function public.avance_obra_portal(p_obra_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_obra public.obras%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'No autenticado');
  end if;
  select * into v_obra from public.obras where id = p_obra_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Obra no encontrada');
  end if;
  if not (
    public.auth_tiene_rol(v_obra.empresa_id, 'admin', 'supervisor', 'contador')
    or exists (
      select 1 from public.clientes c
       where c.id = v_obra.cliente_id and c.empresa_id = v_obra.empresa_id
         and c.user_id = auth.uid() and c.deleted_at is null
    )
  ) then
    return jsonb_build_object('ok', false, 'error', 'No autorizado');
  end if;

  return jsonb_build_object('ok', true, 'partidas', coalesce((
    select jsonb_agg(x order by x.orden_grupo, x.orden)
      from (
        select 0 as orden_grupo, p.orden::bigint as orden, 'presupuesto' as origen, p.id,
               p.concepto, p.unidad, p.seccion,
               p.cantidad, p.precio_unitario,
               coalesce((select sum(a.cantidad) from public.avance_partida a
                          where a.presupuesto_id = p.id and a.deleted_at is null), 0) as ejecutado
          from public.obra_presupuesto p
         where p.obra_id = p_obra_id and p.deleted_at is null
        union all
        select 1, oc.folio::bigint * 1000000 + r.orden, 'extra', r.id,
               r.concepto, r.unidad, 'Extra ' || oc.folio,
               r.cantidad, r.precio_unitario,
               coalesce((select sum(a.cantidad) from public.avance_partida a
                          where a.orden_cambio_renglon_id = r.id and a.deleted_at is null), 0)
          from public.orden_cambio_renglon r
          join public.orden_cambio oc on oc.id = r.orden_cambio_id
         where oc.obra_id = p_obra_id and oc.estado = 'APROBADA'
           and oc.deleted_at is null and r.deleted_at is null
      ) x
  ), '[]'::jsonb));
end $$;

revoke all on function public.avance_obra_portal(uuid) from public, anon;
grant execute on function public.avance_obra_portal(uuid) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 8. Cobro fiscal: la estimación es un cobro para facturar (F1b, 0037)
-- ════════════════════════════════════════════════════════════════════════════
-- Mismo principio "exactamente uno": un cobro fiscal es de un pago de
-- cotización, de una entrada de caja O de una estimación. La factura de una
-- estimación se hace por su importe (con su anticipo relacionado, tipo 07); la
-- entrada de caja que la paga no se vuelve a facturar (la web la saca de la
-- lista de "por facturar" cuando está ligada a una estimación).
alter table public.cobro_fiscal
  add column if not exists estimacion_id uuid references public.estimaciones(id) on delete cascade;

alter table public.cobro_fiscal drop constraint if exists cobro_fiscal_origen;
alter table public.cobro_fiscal
  add constraint cobro_fiscal_origen check (num_nonnulls(pago_id, movimiento_id, estimacion_id) = 1);

create unique index if not exists uq_cobro_fiscal_estimacion on public.cobro_fiscal (estimacion_id)
  where estimacion_id is not null;

-- La policy de 0037 con la rama nueva: la estimación de la MISMA empresa, y ya
-- autorizada (una enviada todavía puede rechazarse: no es un cobro).
drop policy if exists cobro_fiscal_oficina on public.cobro_fiscal;
create policy cobro_fiscal_oficina on public.cobro_fiscal
  for all
  using (public.auth_tiene_rol(empresa_id, 'admin', 'contador'))
  with check (
    public.auth_tiene_rol(empresa_id, 'admin', 'contador')
    and (
      (pago_id is not null and exists (
        select 1 from public.pagos p
         where p.id = cobro_fiscal.pago_id and p.empresa_id = cobro_fiscal.empresa_id
      ))
      or
      (movimiento_id is not null and exists (
        select 1 from public.movimientos m
         where m.id = cobro_fiscal.movimiento_id
           and m.empresa_id = cobro_fiscal.empresa_id
           and m.tipo = 'ENTRADA'
      ))
      or
      (estimacion_id is not null and exists (
        select 1 from public.estimaciones e
         where e.id = cobro_fiscal.estimacion_id
           and e.empresa_id = cobro_fiscal.empresa_id
           and e.estado in ('AUTORIZADA', 'COBRADA')
      ))
    )
  );

-- ════════════════════════════════════════════════════════════════════════════
-- 9. Sincronización
-- ════════════════════════════════════════════════════════════════════════════
-- Juego completo de columnas de sync. El móvil no las jala todavía (D6: web
-- primero); con trigger e índice quedan listas para cuando la captura de avance
-- llegue al teléfono sin señal (RT1).
do $$
declare t text;
begin
  foreach t in array array['obra_contrato', 'obra_retencion', 'avance_partida',
                           'estimaciones', 'estimacion_renglon'] loop
    execute format('drop trigger if exists trg_srv_upd on public.%I;', t);
    execute format(
      'create trigger trg_srv_upd before insert or update on public.%I '
      'for each row execute function public.set_server_updated_at();', t);
    execute format(
      'create index if not exists idx_%1$s_pull on public.%1$s (empresa_id, server_updated_at);', t);
  end loop;
end $$;

-- Correr en el SQL Editor de Supabase DESPUÉS de 0036 y 0037. No se aplica a
-- producción sin el visto bueno de Mario (docs/PROGRESO_ALCANCE.md, regla de oro).
