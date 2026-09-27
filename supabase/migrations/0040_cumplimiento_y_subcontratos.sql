-- 0040_cumplimiento_y_subcontratos.sql — CUMPLIMIENTO (IMSS/SIROC/REPSE) + SUBCONTRATOS
-- Depende de: 0001 (empresas, auth_tiene_rol), 0002 (obras, colaboradores,
--             movimientos, set_server_updated_at), 0019 (lección del padre),
--             0022 (rol contador), 0024 (patrón de bucket privado por carpeta),
--             0031 (nota_obra), 0032 (texto_final por documento)
-- NO depende de 0036–0039 (se escriben en paralelo). Aditivo e idempotente.
--
-- QUÉ ES (plan docs/PLAN_ALCANCE_AMPLIADO.md §3 F5, RF5.0–RF5.9)
-- ──────────────────────────────────────────────────────────────
-- · CUMPLIMIENTO: "la libreta y la alarma". Guarda el número de registro SIROC
--   de cada obra, el folio y la vigencia del REPSE propio, las entregas
--   cuatrimestrales (ICSOE ante el IMSS, SISUB ante el Infonavit), el expediente
--   de cada subcontratista (REPSE, constancia de situación fiscal, opiniones de
--   cumplimiento) y los datos IMSS de los colaboradores (NSS, CURP, RFC).
-- · SUBCONTRATOS: el contrato que nace de un trato de palabra (nota de obra,
--   0031): alcance, monto, fondo de garantía (retención %), forma de pago,
--   cláusulas editables y los pagos con su retención.
--
-- LO QUE ESTA MIGRACIÓN NO HACE, A PROPÓSITO (decisión de Mario, plan §6)
-- ───────────────────────────────────────────────────────────────────────
-- · No hay ninguna conexión al IMSS, la STPS, el Infonavit ni el SAT: no existe
--   API abierta y SIROC, IDSE, REPSE y el buzón IMSS funcionan con la e.firma
--   del patrón. El trámite lo hace el usuario o su contador en el portal oficial.
-- · No se calcula ninguna cuota (IMSS, ISR, Infonavit). Solo se registra,
--   se recuerda y se guarda la prueba.
-- · NUNCA se guarda e.firma, CSD, contraseña ni llave privada. No hay columna
--   para ello y el bucket solo acepta PDF e imágenes (no .key/.cer/.pfx).
--
-- POR QUÉ LOS DATOS IMSS DEL COLABORADOR VAN EN UNA TABLA APARTE
-- ──────────────────────────────────────────────────────────────
-- Misma razón que el sueldo en 0027: la RLS filtra FILAS, no columnas. Si NSS,
-- CURP y RFC fueran columnas de `colaboradores`, el supervisor y el colaborador
-- de campo (que leen esa tabla, y el móvil la sincroniza completa) los verían.
-- `colaborador_datos_imss` es 1:1 y solo la leen admin y contador. Son datos
-- personales (LFPDPPP); van en el aviso de privacidad (lib/legal/datos.ts).
--
-- QUIÉN (RLS)
-- ───────────
--   admin, contador → leen y escriben TODO lo de aquí (el contador es quien
--                     suele hacer el trámite ante el IMSS/STPS).
--   supervisor      → LEE los subcontratos, sus renglones y sus pagos (necesita
--                     saber qué le toca hacer a cada subcontratista en la obra).
--                     NO ve SIROC, REPSE, obligaciones, datos IMSS, el padrón de
--                     subcontratistas (RFC) ni su expediente fiscal. Por eso el
--                     subcontrato guarda una COPIA del nombre del subcontratista
--                     (`subcontratista_nombre`): así el supervisor no necesita
--                     leer la tabla que trae el RFC.
--   colaborador     → NADA.
--   cliente         → NADA (sin policy = sin filas; lo mismo que 0031).
-- El borrado es lógico (`deleted_at`, por UPDATE): no hay policy de DELETE,
-- salvo en los datos IMSS (derecho de cancelación ARCO: se borran de verdad).
--
-- ENDURECIMIENTO (revisión de seguridad, docs/PROGRESO_ALCANCE.md, SEG-*)
-- ─────────────────────────────────────────────────────────────────────
-- · SEG-A1c: los datos IMSS ya NO se van en cascada si alguien borra de verdad
--   al colaborador (FK `on delete no action`): el borrado de esos datos es
--   explícito, por su propia policy DELETE (ARCO), y deja de poder pasar "sin
--   querer" por quien ni siquiera los puede leer.
-- · SEG-B9: las policies de Storage convierten la carpeta con `uuid_o_null`.

-- Texto → uuid sin reventar. Mismo cuerpo que en 0036 (ver ahí el porqué).
create or replace function public.uuid_o_null(p text)
returns uuid
language sql
immutable
as $$
  select case
    when p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p::uuid
    else null
  end
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. SIROC por obra
-- ════════════════════════════════════════════════════════════════════════════
-- Registro de la obra ante el IMSS: dentro de los 5 días hábiles siguientes al
-- inicio (Reglamento del Seguro Social Obligatorio para los Trabajadores de la
-- Construcción por Obra o Tiempo Determinado, art. 12). Las incidencias y el
-- aviso de terminación también van por SIROC. La cuenta de días hábiles la hace
-- la web (`lib/cumplimiento/dias-habiles.ts`), no la base: son avisos, no reglas.
create table if not exists public.obra_siroc (
  id                  uuid primary key,
  empresa_id          uuid not null references public.empresas(id) on delete cascade,
  obra_id             uuid not null references public.obras(id)    on delete cascade,

  -- Día en que empezaron los trabajos (medianoche de México, epoch ms). Se
  -- propone la `fecha_inicio` de la obra, pero puede diferir (la obra se dio de
  -- alta antes de arrancar).
  fecha_inicio_obra   bigint not null,
  numero_registro     text not null default '' check (char_length(numero_registro) <= 60),
  fecha_registro      bigint,
  estado              text not null default 'PENDIENTE'
                        check (estado in ('PENDIENTE', 'REGISTRADA', 'SUSPENDIDA', 'TERMINADA', 'NO_APLICA')),
  -- Fin real de los trabajos y cuándo se presentó el aviso de terminación.
  fecha_terminacion   bigint,
  aviso_terminacion_at bigint,
  notas               text not null default '' check (char_length(notas) <= 2000),
  comprobante_path    text check (comprobante_path is null or char_length(comprobante_path) <= 400),

  created_at          bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at          bigint not null default (extract(epoch from now()) * 1000)::bigint,
  server_updated_at   bigint not null default 0,
  deleted_at          bigint
);

-- Un registro vivo por obra.
create unique index if not exists uq_obra_siroc_obra
  on public.obra_siroc (obra_id) where deleted_at is null;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. REPSE propio (una fila viva por empresa; renovar = actualizarla)
-- ════════════════════════════════════════════════════════════════════════════
-- Registro ante la STPS de quien presta servicios u obras especializadas.
-- Vigencia de 3 años; la renovación se pide en los 3 meses previos al
-- vencimiento. Guardamos folio y fechas; la consulta la hace la persona en el
-- padrón público (repse.stps.gob.mx).
create table if not exists public.empresa_repse (
  id                  uuid primary key,
  empresa_id          uuid not null references public.empresas(id) on delete cascade,
  folio               text not null default '' check (char_length(folio) <= 60),
  fecha_registro      bigint,
  vigencia_hasta      bigint,
  notas               text not null default '' check (char_length(notas) <= 2000),
  comprobante_path    text check (comprobante_path is null or char_length(comprobante_path) <= 400),

  created_at          bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at          bigint not null default (extract(epoch from now()) * 1000)::bigint,
  server_updated_at   bigint not null default 0,
  deleted_at          bigint
);

create unique index if not exists uq_empresa_repse_empresa
  on public.empresa_repse (empresa_id) where deleted_at is null;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Obligaciones periódicas (ICSOE, SISUB, otras)
-- ════════════════════════════════════════════════════════════════════════════
-- El CALENDARIO (qué periodo toca y su fecha límite) lo calcula la web; aquí
-- solo se guarda lo que ya se hizo: fecha de entrega y comprobante. La fila se
-- crea al marcar "entregado" (o al anotar algo), no por adelantado.
-- `periodo` = '2026-C2' (cuatrimestre) para ICSOE/SISUB; libre para OTRA.
create table if not exists public.obligacion_periodica (
  id                  uuid primary key,
  empresa_id          uuid not null references public.empresas(id) on delete cascade,
  tipo                text not null check (tipo in ('ICSOE', 'SISUB', 'OTRA')),
  periodo             text not null check (char_length(trim(periodo)) between 1 and 40),
  descripcion         text not null default '' check (char_length(descripcion) <= 300),
  fecha_limite        bigint not null,
  entregado_at        bigint,
  notas               text not null default '' check (char_length(notas) <= 2000),
  comprobante_path    text check (comprobante_path is null or char_length(comprobante_path) <= 400),

  created_at          bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at          bigint not null default (extract(epoch from now()) * 1000)::bigint,
  server_updated_at   bigint not null default 0,
  deleted_at          bigint
);

-- Una fila viva por (empresa, tipo, periodo) para las cuatrimestrales: marcar
-- dos veces "entregado" no duplica.
create unique index if not exists uq_obligacion_periodo
  on public.obligacion_periodica (empresa_id, tipo, periodo)
  where deleted_at is null and tipo <> 'OTRA';

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Subcontratistas y su expediente
-- ════════════════════════════════════════════════════════════════════════════
-- El padrón de subcontratistas con quienes hay contrato. Casi nunca son
-- usuarios del sistema. `colaborador_id` es el puente opcional (como en
-- nota_obra) para cuando la persona también está en la raya.
create table if not exists public.subcontratista (
  id                  uuid primary key,
  empresa_id          uuid not null references public.empresas(id) on delete cascade,
  nombre              text not null check (char_length(trim(nombre)) between 1 and 200),
  -- Opcional: el informal no tiene. Formato de RFC (12 morales, 13 físicas),
  -- sin consultar al SAT.
  rfc                 text check (rfc is null or rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'),
  contacto            text not null default '' check (char_length(contacto) <= 200),
  telefono            text not null default '' check (char_length(telefono) <= 40),
  correo              text not null default '' check (char_length(correo) <= 200),
  especialidad        text not null default '' check (char_length(especialidad) <= 200),
  colaborador_id      uuid references public.colaboradores(id) on delete set null,
  notas               text not null default '' check (char_length(notas) <= 2000),

  created_at          bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at          bigint not null default (extract(epoch from now()) * 1000)::bigint,
  server_updated_at   bigint not null default 0,
  deleted_at          bigint
);

create index if not exists idx_subcontratista_nombre on public.subcontratista (empresa_id, nombre);

-- Cada documento del expediente con su vencimiento. Varias versiones del
-- mismo tipo conviven (la opinión de cumplimiento se renueva seguido): la web
-- toma la más reciente de cada tipo.
create table if not exists public.subcontratista_documento (
  id                  uuid primary key,
  empresa_id          uuid not null references public.empresas(id)       on delete cascade,
  subcontratista_id   uuid not null references public.subcontratista(id) on delete cascade,
  tipo                text not null
                        check (tipo in ('REPSE', 'CONSTANCIA_FISCAL', 'OPINION_32D', 'IMSS_OPINION', 'OTRO')),
  descripcion         text not null default '' check (char_length(descripcion) <= 200),
  folio               text not null default '' check (char_length(folio) <= 80),
  fecha_emision       bigint,
  vigencia_hasta      bigint,
  path                text check (path is null or char_length(path) <= 400),

  created_at          bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at          bigint not null default (extract(epoch from now()) * 1000)::bigint,
  server_updated_at   bigint not null default 0,
  deleted_at          bigint
);

create index if not exists idx_subcontratista_doc on public.subcontratista_documento (subcontratista_id, tipo);

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Datos IMSS del colaborador (1:1, solo admin y contador)
-- ════════════════════════════════════════════════════════════════════════════
-- `0002`, `0009` y `0027` no traen NSS, CURP ni RFC: no hay nada que mover.
create table if not exists public.colaborador_datos_imss (
  -- NO ACTION y no CASCADE (SEG-A1c). NO ACTION y no RESTRICT: RESTRICT se
  -- revisa al instante y tumbaría la cascada de ELIMINAR LA EMPRESA completa
  -- (donde colaborador y datos se van juntos); NO ACTION se revisa al final de
  -- la sentencia, así que solo impide borrar al colaborador y dejar sus datos.
  colaborador_id      uuid primary key references public.colaboradores(id) on delete no action,
  empresa_id          uuid not null references public.empresas(id) on delete cascade,
  -- Solo formato, sin consultar a nadie: NSS 11 dígitos, CURP 18, RFC 13.
  nss                 text check (nss is null or nss ~ '^[0-9]{11}$'),
  curp                text check (curp is null or curp ~ '^[A-Z][AEIOUX][A-Z]{2}[0-9]{6}[HMX][A-Z]{5}[A-Z0-9][0-9]$'),
  rfc                 text check (rfc is null or rfc ~ '^[A-ZÑ&]{4}[0-9]{6}[A-Z0-9]{3}$'),
  -- Documento opcional (p. ej. el acuse de alta). Bucket `cumplimiento`.
  documento_path      text check (documento_path is null or char_length(documento_path) <= 400),

  created_at          bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at          bigint not null default (extract(epoch from now()) * 1000)::bigint,
  server_updated_at   bigint not null default 0,
  deleted_at          bigint
);

-- Si la tabla ya existía con la FK en cascada (una base de desarrollo que corrió
-- la versión anterior de este archivo), se rehace. Idempotente.
do $$
declare v_fk text;
begin
  select c.conname into v_fk
    from pg_constraint c
   where c.conrelid = 'public.colaborador_datos_imss'::regclass
     and c.contype = 'f'
     and c.confrelid = 'public.colaboradores'::regclass;
  if v_fk is not null and exists (
    select 1 from pg_constraint where conname = v_fk and conrelid = 'public.colaborador_datos_imss'::regclass
       and confdeltype <> 'a'
  ) then
    execute format('alter table public.colaborador_datos_imss drop constraint %I', v_fk);
    alter table public.colaborador_datos_imss
      add constraint colaborador_datos_imss_colaborador_id_fkey
      foreign key (colaborador_id) references public.colaboradores(id) on delete no action;
  end if;
end $$;

comment on column public.colaborador_datos_imss.nss  is 'PII: número de seguridad social. Solo admin/contador (RLS).';
comment on column public.colaborador_datos_imss.curp is 'PII: identificador nacional. Solo admin/contador (RLS).';
comment on column public.colaborador_datos_imss.rfc  is 'PII: RFC de persona física. Solo admin/contador (RLS).';
comment on column public.subcontratista.rfc          is 'PII si es persona física. Solo admin/contador (RLS).';

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Subcontratos
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.subcontrato (
  id                    uuid primary key,
  empresa_id            uuid not null references public.empresas(id)       on delete cascade,
  obra_id               uuid not null references public.obras(id)          on delete cascade,
  subcontratista_id     uuid not null references public.subcontratista(id) on delete restrict,
  -- Copia del nombre al guardar: la lee el supervisor, que no ve el padrón.
  subcontratista_nombre text not null default '' check (char_length(subcontratista_nombre) <= 200),
  -- La nota de la que nació (RF5.7). Si se borra la nota, el contrato sigue.
  nota_obra_id          uuid references public.nota_obra(id) on delete set null,

  alcance               text not null default '' check (char_length(alcance) <= 4000),
  -- NULL = la suma de los renglones. Un número = el monto pactado a mano.
  monto                 double precision check (monto is null or monto >= 0),
  -- Fondo de garantía: % que se retiene de cada pago y se devuelve al final.
  retencion_pct         double precision not null default 0 check (retencion_pct between 0 and 100),
  forma_pago            text not null default '' check (char_length(forma_pago) <= 1000),
  fecha_inicio          bigint,
  fecha_fin             bigint,
  fecha_firma           bigint,
  estado                text not null default 'BORRADOR'
                          check (estado in ('BORRADOR', 'FIRMADO', 'TERMINADO', 'CANCELADO')),
  -- Cláusulas del contrato. NULL = las cláusulas base de la app (genéricas).
  clausulas             text check (clausulas is null or char_length(clausulas) <= 20000),
  -- Párrafo final del PDF solo para este contrato (patrón 0032).
  texto_final           text,
  notas                 text not null default '' check (char_length(notas) <= 2000),

  created_at            bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at            bigint not null default (extract(epoch from now()) * 1000)::bigint,
  server_updated_at     bigint not null default 0,
  deleted_at            bigint
);

create index if not exists idx_subcontrato_obra on public.subcontrato (obra_id);
create index if not exists idx_subcontrato_sub  on public.subcontrato (subcontratista_id);
create index if not exists idx_subcontrato_nota on public.subcontrato (nota_obra_id);

create table if not exists public.subcontrato_renglon (
  id                  uuid primary key,
  empresa_id          uuid not null references public.empresas(id)    on delete cascade,
  subcontrato_id      uuid not null references public.subcontrato(id) on delete cascade,
  concepto            text not null check (char_length(trim(concepto)) between 1 and 500),
  unidad              text not null default '' check (char_length(unidad) <= 40),
  cantidad            double precision,
  precio_unitario     double precision,
  importe             double precision not null default 0,
  orden               bigint not null default 0,

  created_at          bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at          bigint not null default (extract(epoch from now()) * 1000)::bigint,
  server_updated_at   bigint not null default 0,
  deleted_at          bigint
);

create index if not exists idx_subcontrato_renglon on public.subcontrato_renglon (subcontrato_id, orden);

-- Un pago al subcontratista: `monto` es el BRUTO que se abona al contrato;
-- `retencion` lo que se queda en el fondo de garantía; lo que sale de caja es
-- monto − retencion. `movimiento_id` liga con la SALIDA de caja cuando se creó.
create table if not exists public.subcontrato_pago (
  id                  uuid primary key,
  empresa_id          uuid not null references public.empresas(id)    on delete cascade,
  subcontrato_id      uuid not null references public.subcontrato(id) on delete cascade,
  fecha               bigint not null,
  monto               double precision not null check (monto > 0),
  retencion           double precision not null default 0 check (retencion >= 0),
  metodo_pago         text not null default '' check (char_length(metodo_pago) <= 40),
  referencia          text not null default '' check (char_length(referencia) <= 200),
  notas               text not null default '' check (char_length(notas) <= 1000),
  movimiento_id       uuid references public.movimientos(id) on delete set null,

  created_at          bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at          bigint not null default (extract(epoch from now()) * 1000)::bigint,
  server_updated_at   bigint not null default 0,
  deleted_at          bigint,

  constraint subcontrato_pago_retencion_ok check (retencion <= monto)
);

create index if not exists idx_subcontrato_pago on public.subcontrato_pago (subcontrato_id, fecha);

-- ════════════════════════════════════════════════════════════════════════════
-- 7. RLS
-- ════════════════════════════════════════════════════════════════════════════
alter table public.obra_siroc               enable row level security;
alter table public.empresa_repse            enable row level security;
alter table public.obligacion_periodica     enable row level security;
alter table public.subcontratista           enable row level security;
alter table public.subcontratista_documento enable row level security;
alter table public.colaborador_datos_imss   enable row level security;
alter table public.subcontrato              enable row level security;
alter table public.subcontrato_renglon      enable row level security;
alter table public.subcontrato_pago         enable row level security;

-- Una ruta de archivo, si la hay, tiene que caer en la carpeta de la empresa.
-- (La policy del bucket es la barrera del archivo; esto evita que una fila
-- apunte a la carpeta de otra.)
create or replace function public.cumplimiento_ruta_ok(p_path text, p_empresa uuid)
returns boolean
language sql immutable
as $$ select p_path is null or p_path like p_empresa::text || '/%' $$;

-- ── Tablas sin padre (o con padre = la empresa) ─────────────────────────────
-- empresa_repse y obligacion_periodica: admin + contador, todo.
do $$
declare t text;
begin
  foreach t in array array['empresa_repse', 'obligacion_periodica'] loop
    execute format('drop policy if exists %1$s_read on public.%1$s;', t);
    execute format(
      'create policy %1$s_read on public.%1$s for select using ('
      '  public.auth_tiene_rol(empresa_id, ''admin'', ''contador''));', t);

    execute format('drop policy if exists %1$s_insert on public.%1$s;', t);
    execute format(
      'create policy %1$s_insert on public.%1$s for insert with check ('
      '  public.auth_tiene_rol(empresa_id, ''admin'', ''contador'')'
      '  and public.cumplimiento_ruta_ok(comprobante_path, empresa_id));', t);

    execute format('drop policy if exists %1$s_update on public.%1$s;', t);
    execute format(
      'create policy %1$s_update on public.%1$s for update'
      '  using (public.auth_tiene_rol(empresa_id, ''admin'', ''contador''))'
      '  with check (public.auth_tiene_rol(empresa_id, ''admin'', ''contador'')'
      '  and public.cumplimiento_ruta_ok(comprobante_path, empresa_id));', t);
  end loop;
end $$;

-- ── obra_siroc: la obra tiene que ser de la misma empresa ───────────────────
drop policy if exists obra_siroc_read on public.obra_siroc;
create policy obra_siroc_read on public.obra_siroc
  for select using (public.auth_tiene_rol(empresa_id, 'admin', 'contador'));

drop policy if exists obra_siroc_insert on public.obra_siroc;
create policy obra_siroc_insert on public.obra_siroc
  for insert with check (
    public.auth_tiene_rol(empresa_id, 'admin', 'contador')
    and public.cumplimiento_ruta_ok(comprobante_path, empresa_id)
    and exists (
      select 1 from public.obras o
       where o.id = obra_id and o.empresa_id = obra_siroc.empresa_id
    )
  );

drop policy if exists obra_siroc_update on public.obra_siroc;
create policy obra_siroc_update on public.obra_siroc
  for update
  using (public.auth_tiene_rol(empresa_id, 'admin', 'contador'))
  with check (
    public.auth_tiene_rol(empresa_id, 'admin', 'contador')
    and public.cumplimiento_ruta_ok(comprobante_path, empresa_id)
    and exists (
      select 1 from public.obras o
       where o.id = obra_id and o.empresa_id = obra_siroc.empresa_id
    )
  );

-- ── subcontratista ──────────────────────────────────────────────────────────
drop policy if exists subcontratista_read on public.subcontratista;
create policy subcontratista_read on public.subcontratista
  for select using (public.auth_tiene_rol(empresa_id, 'admin', 'contador'));

drop policy if exists subcontratista_insert on public.subcontratista;
create policy subcontratista_insert on public.subcontratista
  for insert with check (
    public.auth_tiene_rol(empresa_id, 'admin', 'contador')
    and (
      colaborador_id is null
      or exists (
        select 1 from public.colaboradores c
         where c.id = colaborador_id and c.empresa_id = subcontratista.empresa_id
      )
    )
  );

drop policy if exists subcontratista_update on public.subcontratista;
create policy subcontratista_update on public.subcontratista
  for update
  using (public.auth_tiene_rol(empresa_id, 'admin', 'contador'))
  with check (
    public.auth_tiene_rol(empresa_id, 'admin', 'contador')
    and (
      colaborador_id is null
      or exists (
        select 1 from public.colaboradores c
         where c.id = colaborador_id and c.empresa_id = subcontratista.empresa_id
      )
    )
  );

-- ── subcontratista_documento (expediente fiscal: sin supervisor) ────────────
drop policy if exists subcontratista_documento_read on public.subcontratista_documento;
create policy subcontratista_documento_read on public.subcontratista_documento
  for select using (public.auth_tiene_rol(empresa_id, 'admin', 'contador'));

drop policy if exists subcontratista_documento_insert on public.subcontratista_documento;
create policy subcontratista_documento_insert on public.subcontratista_documento
  for insert with check (
    public.auth_tiene_rol(empresa_id, 'admin', 'contador')
    and public.cumplimiento_ruta_ok(path, empresa_id)
    and exists (
      select 1 from public.subcontratista s
       where s.id = subcontratista_id and s.empresa_id = subcontratista_documento.empresa_id
    )
  );

drop policy if exists subcontratista_documento_update on public.subcontratista_documento;
create policy subcontratista_documento_update on public.subcontratista_documento
  for update
  using (public.auth_tiene_rol(empresa_id, 'admin', 'contador'))
  with check (
    public.auth_tiene_rol(empresa_id, 'admin', 'contador')
    and public.cumplimiento_ruta_ok(path, empresa_id)
    and exists (
      select 1 from public.subcontratista s
       where s.id = subcontratista_id and s.empresa_id = subcontratista_documento.empresa_id
    )
  );

-- ── colaborador_datos_imss ──────────────────────────────────────────────────
drop policy if exists colaborador_datos_imss_read on public.colaborador_datos_imss;
create policy colaborador_datos_imss_read on public.colaborador_datos_imss
  for select using (public.auth_tiene_rol(empresa_id, 'admin', 'contador'));

drop policy if exists colaborador_datos_imss_insert on public.colaborador_datos_imss;
create policy colaborador_datos_imss_insert on public.colaborador_datos_imss
  for insert with check (
    public.auth_tiene_rol(empresa_id, 'admin', 'contador')
    and public.cumplimiento_ruta_ok(documento_path, empresa_id)
    and exists (
      select 1 from public.colaboradores c
       where c.id = colaborador_id and c.empresa_id = colaborador_datos_imss.empresa_id
    )
  );

drop policy if exists colaborador_datos_imss_update on public.colaborador_datos_imss;
create policy colaborador_datos_imss_update on public.colaborador_datos_imss
  for update
  using (public.auth_tiene_rol(empresa_id, 'admin', 'contador'))
  with check (
    public.auth_tiene_rol(empresa_id, 'admin', 'contador')
    and public.cumplimiento_ruta_ok(documento_path, empresa_id)
    and exists (
      select 1 from public.colaboradores c
       where c.id = colaborador_id and c.empresa_id = colaborador_datos_imss.empresa_id
    )
  );

-- Derecho de cancelación (ARCO): el dato personal se borra de verdad, no solo
-- se marca. Es la única tabla de esta migración con DELETE.
drop policy if exists colaborador_datos_imss_delete on public.colaborador_datos_imss;
create policy colaborador_datos_imss_delete on public.colaborador_datos_imss
  for delete using (public.auth_tiene_rol(empresa_id, 'admin', 'contador'));

-- ── subcontrato (el supervisor lee) ─────────────────────────────────────────
drop policy if exists subcontrato_read on public.subcontrato;
create policy subcontrato_read on public.subcontrato
  for select using (public.auth_tiene_rol(empresa_id, 'admin', 'contador', 'supervisor'));

drop policy if exists subcontrato_insert on public.subcontrato;
create policy subcontrato_insert on public.subcontrato
  for insert with check (
    public.auth_tiene_rol(empresa_id, 'admin', 'contador')
    and exists (
      select 1 from public.obras o
       where o.id = obra_id and o.empresa_id = subcontrato.empresa_id
    )
    and exists (
      select 1 from public.subcontratista s
       where s.id = subcontratista_id and s.empresa_id = subcontrato.empresa_id
    )
    and (
      nota_obra_id is null
      or exists (
        select 1 from public.nota_obra n
         where n.id = nota_obra_id
           and n.empresa_id = subcontrato.empresa_id
           and n.obra_id = subcontrato.obra_id
      )
    )
  );

drop policy if exists subcontrato_update on public.subcontrato;
create policy subcontrato_update on public.subcontrato
  for update
  using (public.auth_tiene_rol(empresa_id, 'admin', 'contador'))
  with check (
    public.auth_tiene_rol(empresa_id, 'admin', 'contador')
    and exists (
      select 1 from public.obras o
       where o.id = obra_id and o.empresa_id = subcontrato.empresa_id
    )
    and exists (
      select 1 from public.subcontratista s
       where s.id = subcontratista_id and s.empresa_id = subcontrato.empresa_id
    )
    and (
      nota_obra_id is null
      or exists (
        select 1 from public.nota_obra n
         where n.id = nota_obra_id
           and n.empresa_id = subcontrato.empresa_id
           and n.obra_id = subcontrato.obra_id
      )
    )
  );

-- ── subcontrato_renglon ─────────────────────────────────────────────────────
drop policy if exists subcontrato_renglon_read on public.subcontrato_renglon;
create policy subcontrato_renglon_read on public.subcontrato_renglon
  for select using (public.auth_tiene_rol(empresa_id, 'admin', 'contador', 'supervisor'));

drop policy if exists subcontrato_renglon_insert on public.subcontrato_renglon;
create policy subcontrato_renglon_insert on public.subcontrato_renglon
  for insert with check (
    public.auth_tiene_rol(empresa_id, 'admin', 'contador')
    and exists (
      select 1 from public.subcontrato s
       where s.id = subcontrato_id and s.empresa_id = subcontrato_renglon.empresa_id
    )
  );

drop policy if exists subcontrato_renglon_update on public.subcontrato_renglon;
create policy subcontrato_renglon_update on public.subcontrato_renglon
  for update
  using (public.auth_tiene_rol(empresa_id, 'admin', 'contador'))
  with check (
    public.auth_tiene_rol(empresa_id, 'admin', 'contador')
    and exists (
      select 1 from public.subcontrato s
       where s.id = subcontrato_id and s.empresa_id = subcontrato_renglon.empresa_id
    )
  );

-- ── subcontrato_pago ────────────────────────────────────────────────────────
drop policy if exists subcontrato_pago_read on public.subcontrato_pago;
create policy subcontrato_pago_read on public.subcontrato_pago
  for select using (public.auth_tiene_rol(empresa_id, 'admin', 'contador', 'supervisor'));

drop policy if exists subcontrato_pago_insert on public.subcontrato_pago;
create policy subcontrato_pago_insert on public.subcontrato_pago
  for insert with check (
    public.auth_tiene_rol(empresa_id, 'admin', 'contador')
    and exists (
      select 1 from public.subcontrato s
       where s.id = subcontrato_id and s.empresa_id = subcontrato_pago.empresa_id
    )
    and (
      movimiento_id is null
      or exists (
        select 1 from public.movimientos m
         join public.subcontrato s on s.id = subcontrato_pago.subcontrato_id
         where m.id = movimiento_id
           and m.empresa_id = subcontrato_pago.empresa_id
           and m.obra_id = s.obra_id
      )
    )
  );

drop policy if exists subcontrato_pago_update on public.subcontrato_pago;
create policy subcontrato_pago_update on public.subcontrato_pago
  for update
  using (public.auth_tiene_rol(empresa_id, 'admin', 'contador'))
  with check (
    public.auth_tiene_rol(empresa_id, 'admin', 'contador')
    and exists (
      select 1 from public.subcontrato s
       where s.id = subcontrato_id and s.empresa_id = subcontrato_pago.empresa_id
    )
    and (
      movimiento_id is null
      or exists (
        select 1 from public.movimientos m
         join public.subcontrato s on s.id = subcontrato_pago.subcontrato_id
         where m.id = movimiento_id
           and m.empresa_id = subcontrato_pago.empresa_id
           and m.obra_id = s.obra_id
      )
    )
  );

-- ════════════════════════════════════════════════════════════════════════════
-- 8. Bucket privado `cumplimiento`
-- ════════════════════════════════════════════════════════════════════════════
-- Acuses, comprobantes y el expediente de subcontratistas. PDF o foto, 10 MB,
-- igual que `comprobantes` (0024). Ruta:
--   '<empresa_id>/<ambito>/<id del registro>/<archivo>'
--   ambito ∈ siroc | repse | obligacion | subcontratista | colaborador
-- Solo admin y contador: son documentos fiscales y datos personales. El
-- supervisor NO entra (el PDF del subcontrato se genera al vuelo, no se guarda).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cumplimiento', 'cumplimiento', false,
  10485760,  -- 10 MB
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  public             = false;

drop policy if exists cumplimiento_obj_select on storage.objects;
create policy cumplimiento_obj_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'cumplimiento'
    and public.auth_tiene_rol(public.uuid_o_null((storage.foldername(name))[1]), 'admin', 'contador')
  );

drop policy if exists cumplimiento_obj_insert on storage.objects;
create policy cumplimiento_obj_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'cumplimiento'
    and public.auth_tiene_rol(public.uuid_o_null((storage.foldername(name))[1]), 'admin', 'contador')
    and (storage.foldername(name))[2] in ('siroc', 'repse', 'obligacion', 'subcontratista', 'colaborador')
  );

drop policy if exists cumplimiento_obj_delete on storage.objects;
create policy cumplimiento_obj_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'cumplimiento'
    and public.auth_tiene_rol(public.uuid_o_null((storage.foldername(name))[1]), 'admin', 'contador')
  );

-- ════════════════════════════════════════════════════════════════════════════
-- 9. Sincronización (listas para el móvil cuando le toque, D6)
-- ════════════════════════════════════════════════════════════════════════════
do $$
declare t text;
begin
  foreach t in array array[
    'obra_siroc', 'empresa_repse', 'obligacion_periodica', 'subcontratista',
    'subcontratista_documento', 'colaborador_datos_imss', 'subcontrato',
    'subcontrato_renglon', 'subcontrato_pago'
  ] loop
    execute format('drop trigger if exists trg_srv_upd on public.%I;', t);
    execute format(
      'create trigger trg_srv_upd before insert or update on public.%I '
      'for each row execute function public.set_server_updated_at();', t);
    execute format(
      'create index if not exists idx_%1$s_pull on public.%1$s (empresa_id, server_updated_at);', t);
  end loop;
end $$;
