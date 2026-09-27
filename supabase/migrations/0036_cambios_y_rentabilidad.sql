-- 0036_cambios_y_rentabilidad.sql — EXTRAS (órdenes de cambio) y UTILIDAD POR OBRA
-- Fase F1 del alcance ampliado (docs/PLAN_ALCANCE_AMPLIADO.md §3, RF1.1–RF1.8).
-- Depende de: 0001 (auth_tiene_rol), 0002 (obras, movimientos), 0006 (clientes),
--             0007/0011 (patrón "el cliente responde por RPC" y snapshot),
--             0017 (empresa_config), 0019 (aislamiento, auth_cliente_empresa_ids),
--             0022 (contador), 0024/0028 (patrón de bucket privado con límites)
-- Aditivo e idempotente. No toca filas existentes ni policies existentes.
--
-- QUÉ ES
-- ──────
-- 1. EXTRAS: el cliente pide "de paso ponme una barda" y se acuerda de palabra.
--    Al final nadie se acuerda del precio y el extra "no se cobró". Aquí el extra
--    nace como BORRADOR en la obra, el admin lo ENVÍA al cliente, y el cliente lo
--    APRUEBA o RECHAZA desde su portal. Lo aprobado suma al estado de cuenta como
--    línea aparte.
-- 2. UTILIDAD: categoría de costo en cada salida de caja y un margen objetivo
--    (por empresa y, si se quiere, por obra) para el semáforo. El cálculo vive en
--    la web (`web/src/lib/rentabilidad/`); la base solo guarda los datos.
--
-- LO QUE SE APROBÓ NO CAMBIA (el patrón de 0011, más estricto)
-- ────────────────────────────────────────────────────────────
-- En 0011 la foto se toma al ACEPTAR y la cotización se puede seguir editando
-- (el portal enseña el diff y pide re-aprobar). Aquí la foto se toma al ENVIAR y
-- a partir de ese momento el extra queda congelado: sus renglones, su foto y su
-- total. El dinero del estado de cuenta sale de `total_enviado` (la foto), nunca
-- de sumar renglones otra vez.
--
-- Por qué más estricto que 0011: un extra es chico y se manda por WhatsApp. Si
-- hay que corregirlo, se CANCELA y se hace otro (la web lo duplica de un clic).
-- Así cada folio que el cliente vio sigue diciendo exactamente lo mismo — que es
-- la evidencia que se necesita cuando hay pleito. Los estados solo avanzan:
--
--    BORRADOR ──enviar (admin)──► ENVIADA ──cliente──► APROBADA | RECHAZADA
--        │                           │
--        └──cancelar (admin)──► CANCELADA ◄──cancelar (admin)
--
-- Lo hacen cumplir TRIGGERS, no solo RLS: las policies deciden quién escribe,
-- pero un trigger se aplica también a la llave de servicio y a las RPC.
--
-- POR QUÉ EL MARGEN DE LA OBRA NO VA EN `obras`
-- ─────────────────────────────────────────────
-- RLS filtra filas, no columnas (la misma lección de 0027 con los sueldos). El
-- cliente del portal y el colaborador de campo LEEN su fila de `obras`: una
-- columna `obras.margen_objetivo` les enseñaría cuánto quiere ganarle el dueño a
-- esa obra. Va en una tabla aparte, `obra_margen_objetivo`, que solo leen el
-- admin y el contador (decisión D1: la utilidad es información del dueño).
-- El default de la empresa sí va en `empresa_config` (el cliente no la lee).

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Categoría de costo en los movimientos de caja (RD1.2)
-- ════════════════════════════════════════════════════════════════════════════
-- `movimientos.categoria` YA EXISTE (0002) y es texto libre que usan la app
-- móvil y la web ("NOMINA", "Anticipo", lo que escriba el usuario). No se puede
-- reciclar para una lista cerrada sin romper esos datos, así que la clasificación
-- de costo es una columna nueva. Nullable: lo que no se ha clasificado sale en la
-- utilidad como "Sin clasificar". Segura para el móvil: el push hace upsert por
-- columnas nombradas y no la conoce, así que no la pisa.
alter table public.movimientos
  add column if not exists categoria_costo text;

alter table public.movimientos
  drop constraint if exists movimientos_categoria_costo_valida;
alter table public.movimientos
  add constraint movimientos_categoria_costo_valida check (
    categoria_costo is null
    or categoria_costo in ('MANO_OBRA', 'MATERIAL', 'SUBCONTRATO', 'INDIRECTO', 'OTRO')
  );

comment on column public.movimientos.categoria_costo is
  'Clasificación de costo para la utilidad por obra (0036). NULL = sin clasificar. Distinta de `categoria`, que es texto libre.';

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Margen objetivo
-- ════════════════════════════════════════════════════════════════════════════
-- 2a. Default de la empresa. 15% es el ejemplo del plan (RF1.7).
alter table public.empresa_config
  add column if not exists margen_objetivo double precision not null default 15;

alter table public.empresa_config
  drop constraint if exists empresa_config_margen_valido;
alter table public.empresa_config
  add constraint empresa_config_margen_valido
  check (margen_objetivo >= 0 and margen_objetivo < 100);

comment on column public.empresa_config.margen_objetivo is
  'Margen de utilidad objetivo (%) para el semáforo de rentabilidad. Una obra puede pisarlo en obra_margen_objetivo.';

-- 2b. Por obra, opcional. Sin fila = usa el de la empresa.
create table if not exists public.obra_margen_objetivo (
  obra_id            uuid primary key references public.obras(id) on delete cascade,
  empresa_id         uuid not null references public.empresas(id) on delete cascade,
  margen_objetivo    double precision not null,
  created_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  server_updated_at  bigint not null default 0,
  deleted_at         bigint,
  constraint obra_margen_objetivo_valido check (margen_objetivo >= 0 and margen_objetivo < 100)
);

alter table public.obra_margen_objetivo enable row level security;

drop policy if exists obra_margen_read on public.obra_margen_objetivo;
create policy obra_margen_read on public.obra_margen_objetivo
  for select using (public.auth_tiene_rol(empresa_id, 'admin', 'contador'));

drop policy if exists obra_margen_insert on public.obra_margen_objetivo;
create policy obra_margen_insert on public.obra_margen_objetivo
  for insert with check (
    public.auth_tiene_rol(empresa_id, 'admin')
    and exists (
      select 1 from public.obras o
       where o.id = obra_id and o.empresa_id = obra_margen_objetivo.empresa_id
    )
  );

drop policy if exists obra_margen_update on public.obra_margen_objetivo;
create policy obra_margen_update on public.obra_margen_objetivo
  for update
  using (public.auth_tiene_rol(empresa_id, 'admin'))
  with check (
    public.auth_tiene_rol(empresa_id, 'admin')
    and exists (
      select 1 from public.obras o
       where o.id = obra_id and o.empresa_id = obra_margen_objetivo.empresa_id
    )
  );

-- ════════════════════════════════════════════════════════════════════════════
-- 3. El extra (orden de cambio)
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.orden_cambio (
  id                 uuid primary key,
  empresa_id         uuid not null references public.empresas(id) on delete cascade,
  obra_id            uuid not null references public.obras(id)    on delete cascade,

  -- Consecutivo POR OBRA ("Extra 3 de la obra X"): así lo nombra la gente. Lo
  -- asigna el trigger de alta; lo que mande el cliente se ignora.
  folio              integer not null default 0,

  titulo             text not null default '',
  motivo             text not null default '',   -- por qué se hace (lo pidió el cliente, cambio de plano…)
  fecha              bigint not null default (extract(epoch from now()) * 1000)::bigint,
  estado             text not null default 'BORRADOR'
                       check (estado in ('BORRADOR', 'ENVIADA', 'APROBADA', 'RECHAZADA', 'CANCELADA')),

  -- Ruta en el bucket `extras`: `<empresa_id>/<obra_id>/<archivo>`.
  foto_uri           text,
  -- Párrafo final del PDF solo para este extra (mismo patrón que 0032).
  texto_final        text,

  -- La FOTO de lo que se envió (renglones + total). Nula en BORRADOR, fija desde
  -- que se envía. `total_enviado` es la copia numérica que suma al estado de
  -- cuenta, para no tener que leer JSON en cada consulta.
  snapshot_json      jsonb,
  total_enviado      double precision,
  enviado_at         bigint,
  enviado_por        uuid,

  -- La respuesta del cliente. `respondido_nombre` se copia del registro del
  -- cliente al responder: si mañana se borra la cuenta, la evidencia de quién
  -- aprobó sigue ahí (por eso tampoco hay FK a auth.users).
  respondido_at      bigint,
  respondido_por     uuid,
  respondido_nombre  text,
  motivo_rechazo     text,

  cancelado_at       bigint,
  cancelado_por      uuid,

  created_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  server_updated_at  bigint not null default 0,
  deleted_at         bigint,

  constraint orden_cambio_folio_unico unique (obra_id, folio),

  -- Cada estado trae lo suyo. Un APROBADA sin foto o sin fecha de respuesta no
  -- es un dato raro: es un extra sin evidencia, y se rechaza en la base.
  constraint orden_cambio_estado_coherente check (
    (estado = 'BORRADOR' and snapshot_json is null and total_enviado is null
       and enviado_at is null and respondido_at is null)
    or (estado = 'ENVIADA' and snapshot_json is not null and total_enviado is not null
       and enviado_at is not null and respondido_at is null)
    or (estado = 'APROBADA' and snapshot_json is not null and total_enviado is not null
       and enviado_at is not null and respondido_at is not null)
    or (estado = 'RECHAZADA' and snapshot_json is not null and total_enviado is not null
       and enviado_at is not null and respondido_at is not null
       and coalesce(btrim(motivo_rechazo), '') <> '')
    or (estado = 'CANCELADA' and cancelado_at is not null and respondido_at is null)
  )
);

create index if not exists idx_orden_cambio_obra on public.orden_cambio (obra_id, folio);

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Los renglones del extra
-- ════════════════════════════════════════════════════════════════════════════
-- Sin IVA, igual que el presupuesto de la obra (`obra_presupuesto`, 0008): el
-- extra se suma a ese "costo total", y mezclar importes con y sin IVA haría que
-- el estado de cuenta dejara de cuadrar. Lo fiscal es de F1b.
create table if not exists public.orden_cambio_renglon (
  id                 uuid primary key,
  empresa_id         uuid not null references public.empresas(id)     on delete cascade,
  orden_cambio_id    uuid not null references public.orden_cambio(id) on delete cascade,
  concepto           text not null default '',
  unidad             text not null default '',
  cantidad           double precision not null default 1 check (cantidad >= 0),
  precio_unitario    double precision not null default 0,
  orden              bigint not null default 0,
  created_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  server_updated_at  bigint not null default 0,
  deleted_at         bigint
);

create index if not exists idx_oc_renglon_orden on public.orden_cambio_renglon (orden_cambio_id, orden);

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Triggers: folio, candados de inmutabilidad
-- ════════════════════════════════════════════════════════════════════════════
-- 5a. Folio consecutivo por obra. SECURITY DEFINER para ver TODOS los extras de
-- la obra (también los borrados) sin depender de la RLS de quien inserta. El
-- candado por obra evita que dos altas simultáneas saquen el mismo número; si
-- aun así chocaran, la llave única lo detiene.
create or replace function public._orden_cambio_folio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('orden_cambio_folio:' || new.obra_id::text));
  select coalesce(max(folio), 0) + 1 into new.folio
    from public.orden_cambio
   where obra_id = new.obra_id;
  return new;
end $$;

drop trigger if exists trg_orden_cambio_folio on public.orden_cambio;
create trigger trg_orden_cambio_folio
  before insert on public.orden_cambio
  for each row execute function public._orden_cambio_folio();

-- 5b. El extra enviado no se toca. Aplica a TODO el que escriba (policies, RPC,
-- llave de servicio): es la garantía de "lo aprobado no cambia".
create or replace function public._orden_cambio_guarda()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Identidad: nunca cambia.
  if new.id <> old.id or new.empresa_id <> old.empresa_id
     or new.obra_id <> old.obra_id or new.folio <> old.folio then
    raise exception 'No se puede cambiar la obra, la empresa ni el folio de un extra.';
  end if;

  -- Transiciones permitidas (los estados solo avanzan).
  if new.estado <> old.estado and not (
       (old.estado = 'BORRADOR' and new.estado in ('ENVIADA', 'CANCELADA'))
    or (old.estado = 'ENVIADA'  and new.estado in ('APROBADA', 'RECHAZADA', 'CANCELADA'))
  ) then
    raise exception 'Un extra % no puede pasar a %.', lower(old.estado), lower(new.estado);
  end if;

  if old.estado <> 'BORRADOR' then
    -- Lo que se envió al cliente queda congelado.
    if new.titulo           is distinct from old.titulo
       or new.motivo        is distinct from old.motivo
       or new.fecha         is distinct from old.fecha
       or new.foto_uri      is distinct from old.foto_uri
       or new.texto_final   is distinct from old.texto_final
       or new.snapshot_json is distinct from old.snapshot_json
       or new.total_enviado is distinct from old.total_enviado
       or new.enviado_at    is distinct from old.enviado_at
       or new.enviado_por   is distinct from old.enviado_por then
      raise exception 'El extra ya se envió al cliente: lo enviado no se puede cambiar. Cancélalo y haz otro.';
    end if;

    -- Y la respuesta del cliente, una vez dada, tampoco.
    if old.respondido_at is not null and (
         new.respondido_at     is distinct from old.respondido_at
      or new.respondido_por    is distinct from old.respondido_por
      or new.respondido_nombre is distinct from old.respondido_nombre
      or new.motivo_rechazo    is distinct from old.motivo_rechazo
    ) then
      raise exception 'La respuesta del cliente no se puede cambiar.';
    end if;

    -- Un extra que el cliente vio no desaparece (se cancela, no se borra).
    if new.deleted_at is distinct from old.deleted_at
       and old.estado in ('ENVIADA', 'APROBADA', 'RECHAZADA') then
      raise exception 'Un extra enviado no se borra: cancélalo.';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists trg_orden_cambio_guarda on public.orden_cambio;
create trigger trg_orden_cambio_guarda
  before update on public.orden_cambio
  for each row execute function public._orden_cambio_guarda();

-- 5c. Los renglones solo se tocan mientras el extra es BORRADOR. SECURITY
-- DEFINER para leer el estado del padre sin depender de la RLS.
create or replace function public._orden_cambio_renglon_guarda()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
  v_padre  uuid;
begin
  if tg_op = 'UPDATE' and new.orden_cambio_id <> old.orden_cambio_id then
    raise exception 'Un renglón no se puede mover a otro extra.';
  end if;

  v_padre := case when tg_op = 'DELETE' then old.orden_cambio_id else new.orden_cambio_id end;
  select estado into v_estado from public.orden_cambio where id = v_padre;

  if v_estado is not null and v_estado <> 'BORRADOR' then
    raise exception 'El extra ya se envió al cliente: sus renglones no se pueden cambiar.';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end $$;

drop trigger if exists trg_orden_cambio_renglon_guarda on public.orden_cambio_renglon;
create trigger trg_orden_cambio_renglon_guarda
  before insert or update or delete on public.orden_cambio_renglon
  for each row execute function public._orden_cambio_renglon_guarda();

-- ════════════════════════════════════════════════════════════════════════════
-- 6. RLS
-- ════════════════════════════════════════════════════════════════════════════
--   admin, supervisor → leen; crean y editan BORRADORES
--   admin             → además envía y cancela (RPC de la sección 7)
--   contador          → lee (necesita saber qué se le va a cobrar al cliente)
--   colaborador       → NADA (sin policy = sin filas)
--   cliente           → lee SUS extras ENVIADOS/APROBADOS/RECHAZADOS, y solo la
--                       fila con su foto (`snapshot_json`): los renglones vivos
--                       no se le abren. Responde por RPC (`responder_orden_cambio`).
alter table public.orden_cambio         enable row level security;
alter table public.orden_cambio_renglon enable row level security;

drop policy if exists orden_cambio_read_oficina on public.orden_cambio;
create policy orden_cambio_read_oficina on public.orden_cambio
  for select using (
    public.auth_tiene_rol(empresa_id, 'admin', 'supervisor', 'contador')
  );

-- Mismo molde que las lecturas del cliente de 0019: su empresa Y su obra.
drop policy if exists orden_cambio_read_cliente on public.orden_cambio;
create policy orden_cambio_read_cliente on public.orden_cambio
  for select using (
    estado in ('ENVIADA', 'APROBADA', 'RECHAZADA')
    and deleted_at is null
    and empresa_id in (select public.auth_cliente_empresa_ids())
    and obra_id in (
      select o.id from public.obras o
       where o.empresa_id = orden_cambio.empresa_id
         and o.cliente_id in (
           select c.id from public.clientes c
            where c.user_id = auth.uid() and c.deleted_at is null
         )
    )
  );

-- Alta: solo BORRADOR y sin nada de lo que ponen las RPC. El padre (obra) tiene
-- que ser de la misma empresa (lección de 0019).
drop policy if exists orden_cambio_insert on public.orden_cambio;
create policy orden_cambio_insert on public.orden_cambio
  for insert with check (
    public.auth_tiene_rol(empresa_id, 'admin', 'supervisor')
    and estado = 'BORRADOR'
    and snapshot_json is null
    and respondido_at is null
    and exists (
      select 1 from public.obras o
       where o.id = obra_id and o.empresa_id = orden_cambio.empresa_id
    )
  );

-- Edición (incluido el borrado lógico): solo de borradores, y el resultado
-- sigue siendo borrador. Enviar o cancelar va por RPC.
drop policy if exists orden_cambio_update on public.orden_cambio;
create policy orden_cambio_update on public.orden_cambio
  for update
  using (
    public.auth_tiene_rol(empresa_id, 'admin', 'supervisor')
    and estado = 'BORRADOR'
  )
  with check (
    public.auth_tiene_rol(empresa_id, 'admin', 'supervisor')
    and estado = 'BORRADOR'
    and snapshot_json is null
    and exists (
      select 1 from public.obras o
       where o.id = obra_id and o.empresa_id = orden_cambio.empresa_id
    )
  );

drop policy if exists orden_cambio_renglon_read on public.orden_cambio_renglon;
create policy orden_cambio_renglon_read on public.orden_cambio_renglon
  for select using (
    public.auth_tiene_rol(empresa_id, 'admin', 'supervisor', 'contador')
  );

drop policy if exists orden_cambio_renglon_insert on public.orden_cambio_renglon;
create policy orden_cambio_renglon_insert on public.orden_cambio_renglon
  for insert with check (
    public.auth_tiene_rol(empresa_id, 'admin', 'supervisor')
    and exists (
      select 1 from public.orden_cambio oc
       where oc.id = orden_cambio_id
         and oc.empresa_id = orden_cambio_renglon.empresa_id
         and oc.estado = 'BORRADOR'
    )
  );

drop policy if exists orden_cambio_renglon_update on public.orden_cambio_renglon;
create policy orden_cambio_renglon_update on public.orden_cambio_renglon
  for update
  using (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor'))
  with check (
    public.auth_tiene_rol(empresa_id, 'admin', 'supervisor')
    and exists (
      select 1 from public.orden_cambio oc
       where oc.id = orden_cambio_id
         and oc.empresa_id = orden_cambio_renglon.empresa_id
         and oc.estado = 'BORRADOR'
    )
  );

-- ════════════════════════════════════════════════════════════════════════════
-- 7. RPC
-- ════════════════════════════════════════════════════════════════════════════
-- Todas devuelven jsonb {ok, error?, ...} como el resto de RPC de la app.

-- 7a. La foto de lo que se envía. Solo la llaman las RPC de abajo, que validan
-- antes el permiso; no se ofrece a nadie más.
create or replace function public._orden_cambio_snapshot(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'folio', oc.folio,
    'titulo', oc.titulo,
    'motivo', oc.motivo,
    'fecha', oc.fecha,
    'foto_uri', oc.foto_uri,
    'renglones', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'concepto', r.concepto,
          'unidad', r.unidad,
          'cantidad', r.cantidad,
          'precio_unitario', r.precio_unitario,
          'importe', round((r.cantidad * r.precio_unitario)::numeric, 2)
        ) order by r.orden, r.created_at
      )
      from public.orden_cambio_renglon r
      where r.orden_cambio_id = oc.id and r.deleted_at is null
    ), '[]'::jsonb),
    'total', coalesce((
      select round(sum(r.cantidad * r.precio_unitario)::numeric, 2)
      from public.orden_cambio_renglon r
      where r.orden_cambio_id = oc.id and r.deleted_at is null
    ), 0)
  )
  from public.orden_cambio oc
  where oc.id = p_id;
$$;

revoke all on function public._orden_cambio_snapshot(uuid) from public, anon, authenticated;

-- 7b. Enviar al cliente (solo admin). Toma la foto y congela el extra.
create or replace function public.enviar_orden_cambio(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_oc    public.orden_cambio%rowtype;
  v_snap  jsonb;
  v_now   bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'No autenticado');
  end if;

  select * into v_oc from public.orden_cambio
   where id = p_id and deleted_at is null
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Extra no encontrado');
  end if;

  if not public.auth_tiene_rol(v_oc.empresa_id, 'admin') then
    return jsonb_build_object('ok', false, 'error', 'Solo un administrador puede enviar extras al cliente.');
  end if;

  if v_oc.estado <> 'BORRADOR' then
    return jsonb_build_object('ok', false, 'error', 'Este extra ya se había enviado.');
  end if;

  if not exists (
    select 1 from public.orden_cambio_renglon
     where orden_cambio_id = p_id and deleted_at is null and btrim(concepto) <> ''
  ) then
    return jsonb_build_object('ok', false, 'error', 'Agrega al menos un concepto antes de enviarlo.');
  end if;

  v_snap := public._orden_cambio_snapshot(p_id);

  update public.orden_cambio
     set estado        = 'ENVIADA',
         snapshot_json = v_snap,
         total_enviado = (v_snap ->> 'total')::double precision,
         enviado_at    = v_now,
         enviado_por   = auth.uid(),
         updated_at    = v_now
   where id = p_id;

  return jsonb_build_object('ok', true, 'estado', 'ENVIADA', 'total', v_snap -> 'total');
end $$;

revoke all on function public.enviar_orden_cambio(uuid) from public, anon;
grant execute on function public.enviar_orden_cambio(uuid) to authenticated;

-- 7c. Cancelar (solo admin): un borrador que ya no va o un extra enviado que el
-- cliente todavía no contesta. Lo aprobado o rechazado ya es historia.
create or replace function public.cancelar_orden_cambio(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_oc  public.orden_cambio%rowtype;
  v_now bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'No autenticado');
  end if;

  select * into v_oc from public.orden_cambio
   where id = p_id and deleted_at is null
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Extra no encontrado');
  end if;

  if not public.auth_tiene_rol(v_oc.empresa_id, 'admin') then
    return jsonb_build_object('ok', false, 'error', 'Solo un administrador puede cancelar extras.');
  end if;

  if v_oc.estado not in ('BORRADOR', 'ENVIADA') then
    return jsonb_build_object('ok', false,
      'error', 'Un extra que el cliente ya contestó no se cancela.');
  end if;

  update public.orden_cambio
     set estado        = 'CANCELADA',
         cancelado_at  = v_now,
         cancelado_por = auth.uid(),
         updated_at    = v_now
   where id = p_id;

  return jsonb_build_object('ok', true, 'estado', 'CANCELADA');
end $$;

revoke all on function public.cancelar_orden_cambio(uuid) from public, anon;
grant execute on function public.cancelar_orden_cambio(uuid) to authenticated;

-- 7d. El cliente aprueba o rechaza. Mismo esquema que
-- `cliente_responder_cotizacion` (0007/0011): el cliente es solo-lectura por
-- RLS y esta función es la única escritura que puede hacer. Valida que:
--   · el usuario es el cliente LIGADO a la obra del extra (no basta con ser
--     cliente de la empresa: el cliente de otra obra no aprueba),
--   · el cliente, la obra y el extra son de la misma empresa (0019),
--   · el extra está ENVIADO (una sola respuesta; el FOR UPDATE evita dos
--     respuestas simultáneas),
--   · rechazar lleva motivo.
create or replace function public.responder_orden_cambio(
  p_id      uuid,
  p_aprobar boolean,
  p_motivo  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  v_oc      public.orden_cambio%rowtype;
  v_cliente public.clientes%rowtype;
  v_motivo  text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_nuevo   text;
  v_now     bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'No autenticado');
  end if;

  if p_aprobar is null then
    return jsonb_build_object('ok', false, 'error', 'Falta la respuesta.');
  end if;

  select * into v_oc from public.orden_cambio
   where id = p_id and deleted_at is null
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Extra no encontrado');
  end if;

  select c.* into v_cliente
    from public.obras o
    join public.clientes c on c.id = o.cliente_id
   where o.id = v_oc.obra_id
     and o.empresa_id = v_oc.empresa_id
     and c.empresa_id = v_oc.empresa_id
     and c.user_id = v_user
     and c.deleted_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'No autorizado');
  end if;

  if v_oc.estado <> 'ENVIADA' then
    return jsonb_build_object('ok', false, 'error', 'Este extra ya no está pendiente de respuesta.');
  end if;

  if not p_aprobar and v_motivo is null then
    return jsonb_build_object('ok', false, 'error', 'Escribe por qué lo rechazas.');
  end if;

  if v_motivo is not null and length(v_motivo) > 1000 then
    return jsonb_build_object('ok', false, 'error', 'El motivo no puede pasar de 1000 caracteres.');
  end if;

  v_nuevo := case when p_aprobar then 'APROBADA' else 'RECHAZADA' end;

  update public.orden_cambio
     set estado            = v_nuevo,
         respondido_at     = v_now,
         respondido_por    = v_user,
         respondido_nombre = v_cliente.nombre,
         motivo_rechazo    = case when p_aprobar then null else v_motivo end,
         updated_at        = v_now
   where id = p_id;

  return jsonb_build_object('ok', true, 'estado', v_nuevo);
end $$;

revoke all on function public.responder_orden_cambio(uuid, boolean, text) from public, anon;
grant execute on function public.responder_orden_cambio(uuid, boolean, text) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 8. Foto del extra: bucket privado (patrón 0024/0028)
-- ════════════════════════════════════════════════════════════════════════════
-- Ruta: `<empresa_id>/<obra_id>/<archivo>`. La primera carpeta aísla por empresa.
-- Solo imágenes: es la foto de "cómo está / qué se pidió", no un documento.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'extras', 'extras', false,
  10485760,  -- 10 MB, como `comprobantes`
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do update set
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists extras_oficina_select on storage.objects;
create policy extras_oficina_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'extras'
    and public.auth_tiene_rol((storage.foldername(name))[1]::uuid, 'admin', 'supervisor', 'contador')
  );

drop policy if exists extras_gestion_insert on storage.objects;
create policy extras_gestion_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'extras'
    and public.auth_tiene_rol((storage.foldername(name))[1]::uuid, 'admin', 'supervisor')
  );

drop policy if exists extras_gestion_delete on storage.objects;
create policy extras_gestion_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'extras'
    and public.auth_tiene_rol((storage.foldername(name))[1]::uuid, 'admin', 'supervisor')
  );

-- El cliente ve la foto del extra que le mandaron para decidir. Solo esa: la
-- que está en `foto_uri` de un extra que SU policy le deja leer (sección 6).
drop policy if exists extras_cliente_select on storage.objects;
create policy extras_cliente_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'extras'
    and (storage.foldername(name))[1]::uuid in (select public.auth_cliente_empresa_ids())
    and exists (
      select 1 from public.orden_cambio oc
       where oc.foto_uri = storage.objects.name
         and oc.estado in ('ENVIADA', 'APROBADA', 'RECHAZADA')
         and oc.deleted_at is null
         and oc.obra_id in (
           select o.id from public.obras o
            where o.cliente_id in (
              select c.id from public.clientes c where c.user_id = auth.uid()
            )
         )
    )
  );

-- ════════════════════════════════════════════════════════════════════════════
-- 9. Sincronización
-- ════════════════════════════════════════════════════════════════════════════
-- Las tablas nuevas traen el juego completo de columnas de sync. El móvil no las
-- jala todavía (decisión D6: web primero); con trigger e índice quedan listas.
do $$
declare t text;
begin
  foreach t in array array['orden_cambio', 'orden_cambio_renglon', 'obra_margen_objetivo'] loop
    execute format('drop trigger if exists trg_srv_upd on public.%I;', t);
    execute format(
      'create trigger trg_srv_upd before insert or update on public.%I '
      'for each row execute function public.set_server_updated_at();', t);
    execute format(
      'create index if not exists idx_%1$s_pull on public.%1$s (empresa_id, server_updated_at);', t);
  end loop;
end $$;

-- Correr en el SQL Editor de Supabase DESPUÉS de 0035. No se aplica a producción
-- sin el visto bueno de Mario (docs/PROGRESO_ALCANCE.md, regla de oro).
