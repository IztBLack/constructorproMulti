-- 0037_datos_fiscales.sql — DATOS PARA FACTURAR (Fase F1b del alcance ampliado)
-- Depende de: 0001 (empresas, auth_tiene_rol), 0002 (pagos, movimientos,
--             partidas, catalogo_conceptos), 0006 (clientes), 0008
--             (obra_presupuesto), 0019 (auth_cliente_empresa_ids), 0022 (rol
--             contador), 0024 (patrón de bucket privado), 0035 (módulos)
-- Aditivo e idempotente. No cambia ninguna policy existente ni borra datos.
--
-- QUÉ ES
-- ──────
-- ConstructorPro NO factura ni se conecta al SAT. Esto solo junta los datos que
-- ya existen (clientes, pagos, conceptos) para que quien facture —el dueño en el
-- portal del SAT, su sistema de facturación o su contador— COPIE en vez de
-- buscar. Ver docs/PLAN_ALCANCE_AMPLIADO.md §3 "F1b".
--
-- NUNCA se guarda aquí la e.firma, el CSD ni ninguna contraseña del SAT (RR1b.2).
-- No hay columna para eso y no la habrá: si algún día se timbra, el CSD vive en
-- el PAC, no con nosotros (plan §6).
--
-- POR QUÉ TABLAS APARTE Y NO COLUMNAS EN empresa_config / clientes
-- ────────────────────────────────────────────────────────────────
-- La regla de privacidad (RR1b.1) es: los datos fiscales los ven y editan SOLO
-- el admin y el contador; el cliente, solo los suyos; supervisor y colaborador,
-- nada. Con columnas en las tablas de siempre eso es imposible:
--   · `empresa_config` la leen admin, supervisor y colaborador (0017).
--   · `clientes` la leen y escriben admin y supervisor (0006).
-- RLS filtra FILAS, no columnas, y los permisos por columna de Postgres
-- (GRANT … (col)) valen para el rol de base de datos `authenticated`, que es el
-- MISMO para todos los roles de la app. No hay forma de decir "esta columna sí
-- para el contador y no para el supervisor". Por eso los datos fiscales viven en
-- `empresa_fiscal` y `cliente_fiscal` (1 a 1 con su dueño), con sus policies.
-- Lo mismo con el estado fiscal de cada cobro: `pagos` y `movimientos` los leen
-- el supervisor y el colaborador (y el cliente sus entradas), así que el folio y
-- el XML van en `cobro_fiscal`, no en columnas de esas tablas. Además `pagos` y
-- `movimientos` se sincronizan con el móvil; una tabla aparte no le cambia nada.
--
-- Las claves SAT de los CONCEPTOS sí van como columnas (catálogo, partidas y
-- presupuesto de la obra): no son datos personales, las necesita quien cotiza, y
-- así "se capturan una vez y se reusan" (RD1b.3).
--
-- QUÉ TRAE
-- ────────
--   1. Catálogos mínimos como funciones inmutables (régimen, uso del CFDI) para
--      los CHECK. Espejo en web/src/lib/fiscal/catalogos.ts (test de paridad).
--   2. `empresa_fiscal`  — el EMISOR (RFC, razón social, régimen, CP).
--   3. `cliente_fiscal`  — el RECEPTOR (+ uso del CFDI, correo, constancia y
--      cuándo los confirmó el propio cliente).
--   4. `clave_sat` / `unidad_sat` en catalogo_conceptos, partidas y obra_presupuesto.
--   5. `cobro_fiscal`    — estado fiscal de cada cobro (un pago de cotización o
--      una entrada de caja): por_facturar | facturado | no_requiere, folio fiscal,
--      XML/PDF, método y forma de pago, complemento de pago.
--   6. Bucket privado `fiscal` (constancias, XML y PDF de facturas).
--   7. RPC del portal: `mis_datos_fiscales()` y `confirmar_mis_datos_fiscales(...)`.
--   8. RPC `guardar_claves_sat(...)`: el contador captura claves sin poder
--      editar precios ni descripciones.

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. Catálogos (para los CHECK)
-- ══════════════════════════════════════════════════════════════════════════════
-- c_RegimenFiscal del Anexo 20 (CFDI 4.0). Se guarda la clave, no el texto.
create or replace function public.fiscal_regimenes()
returns text[]
language sql
immutable
parallel safe
as $$
  select array[
    '601', '603', '605', '606', '607', '608', '610', '611', '612', '614',
    '615', '616', '620', '621', '622', '623', '624', '625', '626'
  ]::text[]
$$;

-- c_UsoCFDI que tiene sentido pedirle a un cliente de obra (el catálogo completo
-- trae deducciones personales y nómina, que aquí solo confundirían).
create or replace function public.fiscal_usos_cfdi()
returns text[]
language sql
immutable
parallel safe
as $$
  select array['G01', 'G03', 'I01', 'I08', 'S01']::text[]
$$;

-- Formato del RFC (sin consultar al SAT): 3 letras (moral) o 4 (física), fecha
-- AAMMDD y homoclave de 3. Incluye los genéricos XAXX010101000 / XEXX010101000.
-- La validación fina (fecha real, genérico no permitido como emisor) va en
-- TypeScript, que da mejor mensaje; esto es la red por si alguien escribe a mano.
create or replace function public.fiscal_rfc_valido(p text)
returns boolean
language sql
immutable
parallel safe
as $$
  select p ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. Emisor: datos fiscales de la empresa
-- ══════════════════════════════════════════════════════════════════════════════
create table if not exists public.empresa_fiscal (
  empresa_id         uuid primary key references public.empresas(id) on delete cascade,
  -- Todo nullable: el módulo es opcional y se llena poco a poco.
  rfc                text,
  -- Tal cual aparece en la constancia de situación fiscal (CFDI 4.0 exige que
  -- coincida exactamente, sin "S.A. de C.V." si la constancia no lo trae).
  razon_social       text,
  regimen            text,
  cp_fiscal          text,
  created_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  server_updated_at  bigint not null default 0,
  deleted_at         bigint,
  constraint empresa_fiscal_rfc check (rfc is null or public.fiscal_rfc_valido(rfc)),
  constraint empresa_fiscal_cp check (cp_fiscal is null or cp_fiscal ~ '^[0-9]{5}$'),
  constraint empresa_fiscal_regimen check (regimen is null or regimen = any (public.fiscal_regimenes())),
  constraint empresa_fiscal_razon check (razon_social is null or length(razon_social) <= 300)
);

alter table public.empresa_fiscal enable row level security;

drop policy if exists empresa_fiscal_oficina on public.empresa_fiscal;
create policy empresa_fiscal_oficina on public.empresa_fiscal
  for all
  using      (public.auth_tiene_rol(empresa_id, 'admin', 'contador'))
  with check (public.auth_tiene_rol(empresa_id, 'admin', 'contador'));

drop trigger if exists trg_srv_upd on public.empresa_fiscal;
create trigger trg_srv_upd before insert or update on public.empresa_fiscal
  for each row execute function public.set_server_updated_at();

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. Receptor: datos fiscales del cliente
-- ══════════════════════════════════════════════════════════════════════════════
create table if not exists public.cliente_fiscal (
  cliente_id                uuid primary key references public.clientes(id) on delete cascade,
  empresa_id                uuid not null references public.empresas(id) on delete cascade,
  rfc                       text,
  razon_social              text,
  regimen                   text,
  cp_fiscal                 text,
  uso_cfdi                  text,
  correo_factura            text,
  -- Ruta en el bucket `fiscal`: <empresa_id>/constancias/<cliente_id>/<archivo>.
  constancia_path           text,
  -- Cuándo y quién (el propio cliente, desde el portal) los confirmó. Si el admin
  -- los vuelve a editar, se borra: ya no son "los que confirmó el cliente".
  fiscales_confirmados_at   bigint,
  fiscales_confirmados_por  uuid,
  created_at                bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at                bigint not null default (extract(epoch from now()) * 1000)::bigint,
  server_updated_at         bigint not null default 0,
  deleted_at                bigint,
  constraint cliente_fiscal_rfc check (rfc is null or public.fiscal_rfc_valido(rfc)),
  constraint cliente_fiscal_cp check (cp_fiscal is null or cp_fiscal ~ '^[0-9]{5}$'),
  constraint cliente_fiscal_regimen check (regimen is null or regimen = any (public.fiscal_regimenes())),
  constraint cliente_fiscal_uso check (uso_cfdi is null or uso_cfdi = any (public.fiscal_usos_cfdi())),
  constraint cliente_fiscal_razon check (razon_social is null or length(razon_social) <= 300),
  constraint cliente_fiscal_correo check (
    correo_factura is null or (length(correo_factura) <= 254 and correo_factura ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
  ),
  -- La constancia solo puede apuntar a la carpeta de ESTE cliente.
  constraint cliente_fiscal_constancia check (
    constancia_path is null
    or constancia_path like empresa_id::text || '/constancias/' || cliente_id::text || '/%'
  )
);
create index if not exists idx_cliente_fiscal_empresa on public.cliente_fiscal (empresa_id);

alter table public.cliente_fiscal enable row level security;

-- Oficina (admin + contador). El cliente referenciado tiene que ser de la MISMA
-- empresa que la fila (la lección de 0019: validar el padre, no solo empresa_id).
-- El cliente del portal NO tiene policy aquí: lee y escribe lo suyo solo por las
-- RPC de la sección 7, que validan campo por campo.
drop policy if exists cliente_fiscal_oficina on public.cliente_fiscal;
create policy cliente_fiscal_oficina on public.cliente_fiscal
  for all
  using (public.auth_tiene_rol(empresa_id, 'admin', 'contador'))
  with check (
    public.auth_tiene_rol(empresa_id, 'admin', 'contador')
    and exists (
      select 1 from public.clientes c
       where c.id = cliente_fiscal.cliente_id
         and c.empresa_id = cliente_fiscal.empresa_id
    )
  );

drop trigger if exists trg_srv_upd on public.cliente_fiscal;
create trigger trg_srv_upd before insert or update on public.cliente_fiscal
  for each row execute function public.set_server_updated_at();

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. Claves SAT de los conceptos
-- ══════════════════════════════════════════════════════════════════════════════
-- Nullable y sin default: el móvil no las conoce; al ser nuevas, su pull las
-- ignora (filtra por columnas conocidas) y su push no las manda, así que el
-- upsert de sincronización las conserva (mismo razonamiento que 0024).
alter table public.catalogo_conceptos
  add column if not exists clave_sat  text,
  add column if not exists unidad_sat text;
alter table public.partidas
  add column if not exists clave_sat  text,
  add column if not exists unidad_sat text;
alter table public.obra_presupuesto
  add column if not exists clave_sat  text,
  add column if not exists unidad_sat text;

do $$
declare t text;
begin
  foreach t in array array['catalogo_conceptos', 'partidas', 'obra_presupuesto'] loop
    execute format('alter table public.%I drop constraint if exists %I;', t, t || '_clave_sat_formato');
    execute format(
      'alter table public.%I add constraint %I check (clave_sat is null or clave_sat ~ ''^[0-9]{8}$'');',
      t, t || '_clave_sat_formato');
    execute format('alter table public.%I drop constraint if exists %I;', t, t || '_unidad_sat_formato');
    execute format(
      'alter table public.%I add constraint %I check (unidad_sat is null or unidad_sat ~ ''^[A-Z0-9]{1,3}$'');',
      t, t || '_unidad_sat_formato');
  end loop;
end $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- 5. Estado fiscal de cada cobro
-- ══════════════════════════════════════════════════════════════════════════════
-- Un "cobro" es dinero que el cliente ya dio y que vive en UNO de dos lugares:
--   · `pagos`       — pagos y abonos registrados en una cotización.
--   · `movimientos` — entradas de caja de una obra (el estado de cuenta del
--                     cliente, 0010).
-- Exactamente una de las dos referencias va llena. No hay fila = "por
-- facturar" (la app la crea la primera vez que se toca el cobro).
--
-- Facturas en parcialidades (PPD): el cobro que se facturó con PPD guarda el
-- folio de ESA factura en `uuid` con `metodo_pago = 'PPD'`; cada abono posterior
-- a esa misma factura repite el folio y su `parcialidad`. Cada uno necesita su
-- complemento de pago (`complemento_uuid`): los que no lo tienen son los
-- "complementos pendientes" del paquete del contador.
create table if not exists public.cobro_fiscal (
  id                    uuid primary key,
  empresa_id            uuid not null references public.empresas(id) on delete cascade,
  pago_id               uuid,
  movimiento_id         uuid,
  estado                text not null default 'por_facturar',
  -- Cómo se facturó (o se va a facturar). Null = usar la sugerencia de la app.
  metodo_pago           text,
  forma_pago            text,
  uso_cfdi              text,
  -- 'incluido': el monto cobrado ya trae IVA. 'aparte': el IVA se suma encima.
  -- 'sin_iva': la operación no lleva IVA. Null = lo que diga la cotización.
  iva_modo              text,
  ret_isr_pct           double precision,
  ret_iva_pct           double precision,
  -- La factura (CFDI) que cubre este cobro.
  uuid                  text,
  fecha_factura         bigint,
  total_factura         double precision,
  xml_path              text,
  pdf_path              text,
  parcialidad           integer,
  -- Complemento de pago (solo si la factura es PPD).
  complemento_uuid      text,
  complemento_fecha     bigint,
  complemento_xml_path  text,
  notas                 text not null default '',
  created_at            bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at            bigint not null default (extract(epoch from now()) * 1000)::bigint,
  server_updated_at     bigint not null default 0,
  deleted_at            bigint,
  constraint cobro_fiscal_origen check (num_nonnulls(pago_id, movimiento_id) = 1),
  constraint cobro_fiscal_estado check (estado in ('por_facturar', 'facturado', 'no_requiere')),
  constraint cobro_fiscal_metodo check (metodo_pago is null or metodo_pago in ('PUE', 'PPD')),
  constraint cobro_fiscal_forma check (forma_pago is null or forma_pago ~ '^[0-9]{2}$'),
  constraint cobro_fiscal_uso check (uso_cfdi is null or uso_cfdi = any (public.fiscal_usos_cfdi())),
  constraint cobro_fiscal_iva check (iva_modo is null or iva_modo in ('incluido', 'aparte', 'sin_iva')),
  constraint cobro_fiscal_ret_isr check (ret_isr_pct is null or (ret_isr_pct >= 0 and ret_isr_pct <= 35)),
  constraint cobro_fiscal_ret_iva check (ret_iva_pct is null or (ret_iva_pct >= 0 and ret_iva_pct <= 16)),
  constraint cobro_fiscal_uuid check (
    uuid is null or uuid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  constraint cobro_fiscal_complemento check (
    complemento_uuid is null
    or complemento_uuid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  -- "Facturado" sin folio no sirve para nada: el folio es lo que liga el cobro
  -- con su factura (y con sus complementos).
  constraint cobro_fiscal_facturado_con_folio check (estado <> 'facturado' or uuid is not null),
  constraint cobro_fiscal_parcialidad check (parcialidad is null or parcialidad between 1 and 999),
  constraint cobro_fiscal_notas check (length(notas) <= 2000),
  -- Los archivos solo pueden vivir en la carpeta de la empresa dueña.
  constraint cobro_fiscal_rutas check (
    (xml_path is null or xml_path like empresa_id::text || '/cfdi/%')
    and (pdf_path is null or pdf_path like empresa_id::text || '/cfdi/%')
    and (complemento_xml_path is null or complemento_xml_path like empresa_id::text || '/cfdi/%')
  )
);

-- Un cobro tiene UNA fila fiscal (viva o borrada: se revive, no se duplica).
create unique index if not exists uq_cobro_fiscal_pago on public.cobro_fiscal (pago_id)
  where pago_id is not null;
create unique index if not exists uq_cobro_fiscal_mov on public.cobro_fiscal (movimiento_id)
  where movimiento_id is not null;
-- Dedup por folio: una factura de una sola exhibición (PUE) ampara UN cobro. Si
-- el mismo XML se sube dos veces a cobros distintos, la base lo rechaza. Las PPD
-- sí se repiten (un folio, varios abonos), por eso el filtro.
create unique index if not exists uq_cobro_fiscal_uuid_pue on public.cobro_fiscal (empresa_id, upper(uuid))
  where uuid is not null and metodo_pago = 'PUE' and deleted_at is null;
create index if not exists idx_cobro_fiscal_empresa on public.cobro_fiscal (empresa_id, estado);

alter table public.cobro_fiscal enable row level security;

-- Solo oficina. El cobro referenciado tiene que ser de la MISMA empresa, y si es
-- un movimiento, una ENTRADA (una salida es un gasto, no un cobro al cliente).
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
    )
  );

drop trigger if exists trg_srv_upd on public.cobro_fiscal;
create trigger trg_srv_upd before insert or update on public.cobro_fiscal
  for each row execute function public.set_server_updated_at();

-- ══════════════════════════════════════════════════════════════════════════════
-- 6. Bucket privado `fiscal`
-- ══════════════════════════════════════════════════════════════════════════════
-- Rutas:
--   <empresa_id>/constancias/<cliente_id>/<archivo>   constancia de situación fiscal
--   <empresa_id>/cfdi/<cobro_fiscal_id>/<archivo>      XML y PDF de facturas
-- 5 MB: una constancia o un CFDI pesan decenas de KB; una foto de la constancia,
-- un par de MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fiscal', 'fiscal', false,
  5242880,
  array['application/pdf', 'application/xml', 'text/xml', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Oficina: todo lo de su empresa.
drop policy if exists fiscal_oficina_select on storage.objects;
create policy fiscal_oficina_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'fiscal'
    and public.auth_tiene_rol((storage.foldername(name))[1]::uuid, 'admin', 'contador')
  );

drop policy if exists fiscal_oficina_insert on storage.objects;
create policy fiscal_oficina_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'fiscal'
    and public.auth_tiene_rol((storage.foldername(name))[1]::uuid, 'admin', 'contador')
  );

drop policy if exists fiscal_oficina_delete on storage.objects;
create policy fiscal_oficina_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'fiscal'
    and public.auth_tiene_rol((storage.foldername(name))[1]::uuid, 'admin', 'contador')
  );

-- Cliente del portal: solo SU carpeta de constancias (ver y subir; no borrar,
-- para que la oficina conserve lo que el cliente mandó). Se compara como TEXTO
-- para que una ruta basura no reviente un cast a uuid.
drop policy if exists fiscal_cliente_select on storage.objects;
create policy fiscal_cliente_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'fiscal'
    and (storage.foldername(name))[2] = 'constancias'
    and exists (
      select 1 from public.clientes c
       where c.user_id = auth.uid()
         and c.deleted_at is null
         and c.empresa_id::text = (storage.foldername(name))[1]
         and c.id::text = (storage.foldername(name))[3]
    )
  );

drop policy if exists fiscal_cliente_insert on storage.objects;
create policy fiscal_cliente_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'fiscal'
    and (storage.foldername(name))[2] = 'constancias'
    and exists (
      select 1 from public.clientes c
       where c.user_id = auth.uid()
         and c.deleted_at is null
         and c.empresa_id::text = (storage.foldername(name))[1]
         and c.id::text = (storage.foldername(name))[3]
    )
  );

-- ══════════════════════════════════════════════════════════════════════════════
-- 7. Portal del cliente: leer y confirmar SUS datos
-- ══════════════════════════════════════════════════════════════════════════════
-- Por RPC y no por policy: así el cliente no puede escribir `empresa_id`,
-- `fiscales_confirmados_por` ni una constancia en carpeta ajena, y cada campo se
-- valida aquí con un mensaje en español.

-- Sus datos, uno por cada contratista (fila de `clientes`) con el que trabaja.
-- `modulo_activo` le dice al portal si ese contratista usa el módulo `fiscal`:
-- el cliente no puede leer empresa_config (0017/0022), y a quien no factura no
-- se le pide nada.
create or replace function public.mis_datos_fiscales()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'cliente_id',     c.id,
    'empresa_id',     c.empresa_id,
    'empresa_nombre', e.nombre,
    'modulo_activo',  coalesce('fiscal' = any (ec.modulos), false),
    'rfc',            f.rfc,
    'razon_social',   f.razon_social,
    'regimen',        f.regimen,
    'cp_fiscal',      f.cp_fiscal,
    'uso_cfdi',       f.uso_cfdi,
    'correo_factura', f.correo_factura,
    'constancia_path', f.constancia_path,
    'confirmados_at', f.fiscales_confirmados_at
  ) order by c.created_at), '[]'::jsonb)
  from public.clientes c
  join public.empresas e on e.id = c.empresa_id
  left join public.empresa_config ec on ec.empresa_id = c.empresa_id
  left join public.cliente_fiscal f on f.cliente_id = c.id and f.deleted_at is null
  where c.user_id = auth.uid() and c.deleted_at is null
$$;

revoke all on function public.mis_datos_fiscales() from public, anon;
grant execute on function public.mis_datos_fiscales() to authenticated;

-- Guarda y confirma. `p_constancia_path` null = conservar la que ya había.
create or replace function public.confirmar_mis_datos_fiscales(
  p_cliente_id      uuid,
  p_rfc             text,
  p_razon_social    text,
  p_regimen         text,
  p_cp_fiscal       text,
  p_uso_cfdi        text,
  p_correo_factura  text,
  p_constancia_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa uuid;
  v_activo  boolean;
  v_rfc     text := upper(trim(coalesce(p_rfc, '')));
  v_razon   text := trim(coalesce(p_razon_social, ''));
  v_regimen text := trim(coalesce(p_regimen, ''));
  v_cp      text := trim(coalesce(p_cp_fiscal, ''));
  v_uso     text := upper(trim(coalesce(p_uso_cfdi, '')));
  v_correo  text := lower(trim(coalesce(p_correo_factura, '')));
  v_ahora   bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'Tu sesión terminó. Vuelve a entrar.');
  end if;

  select c.empresa_id, coalesce('fiscal' = any (ec.modulos), false)
    into v_empresa, v_activo
    from public.clientes c
    left join public.empresa_config ec on ec.empresa_id = c.empresa_id
   where c.id = p_cliente_id and c.user_id = auth.uid() and c.deleted_at is null;

  if v_empresa is null then
    return jsonb_build_object('ok', false, 'error', 'No encontramos tu registro de cliente.');
  end if;
  if not v_activo then
    return jsonb_build_object('ok', false, 'error', 'Tu contratista no está pidiendo datos para factura.');
  end if;

  if not public.fiscal_rfc_valido(v_rfc) then
    return jsonb_build_object('ok', false, 'error', 'El RFC no tiene el formato correcto: 12 caracteres si es empresa, 13 si es persona.');
  end if;
  if v_razon = '' or length(v_razon) > 300 then
    return jsonb_build_object('ok', false, 'error', 'Escribe tu nombre o razón social tal como aparece en tu constancia.');
  end if;
  if not (v_regimen = any (public.fiscal_regimenes())) then
    return jsonb_build_object('ok', false, 'error', 'Elige tu régimen fiscal.');
  end if;
  if v_cp !~ '^[0-9]{5}$' then
    return jsonb_build_object('ok', false, 'error', 'El código postal son 5 números.');
  end if;
  if not (v_uso = any (public.fiscal_usos_cfdi())) then
    return jsonb_build_object('ok', false, 'error', 'Elige para qué vas a usar la factura.');
  end if;
  if v_correo <> '' and (length(v_correo) > 254 or v_correo !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    return jsonb_build_object('ok', false, 'error', 'El correo no parece válido.');
  end if;
  if p_constancia_path is not null
     and p_constancia_path not like v_empresa::text || '/constancias/' || p_cliente_id::text || '/%' then
    return jsonb_build_object('ok', false, 'error', 'La constancia no se subió en tu carpeta.');
  end if;

  insert into public.cliente_fiscal as f (
    cliente_id, empresa_id, rfc, razon_social, regimen, cp_fiscal, uso_cfdi,
    correo_factura, constancia_path, fiscales_confirmados_at, fiscales_confirmados_por,
    created_at, updated_at, deleted_at
  ) values (
    p_cliente_id, v_empresa, v_rfc, v_razon, v_regimen, v_cp, v_uso,
    nullif(v_correo, ''), p_constancia_path, v_ahora, auth.uid(),
    v_ahora, v_ahora, null
  )
  on conflict (cliente_id) do update set
    rfc                      = excluded.rfc,
    razon_social             = excluded.razon_social,
    regimen                  = excluded.regimen,
    cp_fiscal                = excluded.cp_fiscal,
    uso_cfdi                 = excluded.uso_cfdi,
    correo_factura           = excluded.correo_factura,
    constancia_path          = coalesce(excluded.constancia_path, f.constancia_path),
    fiscales_confirmados_at  = excluded.fiscales_confirmados_at,
    fiscales_confirmados_por = excluded.fiscales_confirmados_por,
    updated_at               = excluded.updated_at,
    deleted_at               = null;

  return jsonb_build_object('ok', true, 'confirmados_at', v_ahora);
end $$;

revoke all on function public.confirmar_mis_datos_fiscales(uuid, text, text, text, text, text, text, text)
  from public, anon;
grant execute on function public.confirmar_mis_datos_fiscales(uuid, text, text, text, text, text, text, text)
  to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- 8. Claves SAT de un concepto (admin o contador)
-- ══════════════════════════════════════════════════════════════════════════════
-- El contador solo LEE partidas, catálogo y presupuesto (0022). Esta RPC le deja
-- tocar ÚNICAMENTE las dos columnas de claves, sin darle permiso de cambiar
-- precios, cantidades ni descripciones. No mueve `updated_at` a propósito: las
-- partidas y el catálogo se sincronizan con el móvil y un `updated_at` nuevo
-- podría ganarle a una edición pendiente del teléfono (las claves no viajan al
-- móvil, así que no hay nada que avisarle).
create or replace function public.guardar_claves_sat(
  p_tabla  text,
  p_id     uuid,
  p_clave  text,
  p_unidad text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa uuid;
  v_clave   text := nullif(trim(coalesce(p_clave, '')), '');
  v_unidad  text := nullif(upper(trim(coalesce(p_unidad, ''))), '');
begin
  if p_tabla not in ('catalogo_conceptos', 'partidas', 'obra_presupuesto') then
    return jsonb_build_object('ok', false, 'error', 'Tabla no válida.');
  end if;
  if v_clave is not null and v_clave !~ '^[0-9]{8}$' then
    return jsonb_build_object('ok', false, 'error', 'La clave de producto o servicio son 8 números.');
  end if;
  if v_unidad is not null and v_unidad !~ '^[A-Z0-9]{1,3}$' then
    return jsonb_build_object('ok', false, 'error', 'La clave de unidad son 1 a 3 letras o números (por ejemplo E48).');
  end if;

  execute format('select empresa_id from public.%I where id = $1 and deleted_at is null', p_tabla)
    into v_empresa using p_id;

  if v_empresa is null or not public.auth_tiene_rol(v_empresa, 'admin', 'contador') then
    return jsonb_build_object('ok', false, 'error', 'No encontramos ese concepto en tu empresa.');
  end if;

  execute format('update public.%I set clave_sat = $1, unidad_sat = $2 where id = $3', p_tabla)
    using v_clave, v_unidad, p_id;

  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.guardar_claves_sat(text, uuid, text, text) from public, anon;
grant execute on function public.guardar_claves_sat(text, uuid, text, text) to authenticated;
