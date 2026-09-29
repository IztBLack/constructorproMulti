-- 0043_seguridad_postventa_herramienta.sql — F7: SEGURIDAD EN OBRA, GARANTÍAS
-- (POSTVENTA) y HERRAMIENTA
-- Depende de: 0001 (empresas, auth_tiene_rol), 0002 (obras, colaboradores,
--             set_server_updated_at), 0006 (clientes), 0019
--             (auth_cliente_empresa_ids, lección del padre), 0022 (contador),
--             0024 (patrón de bucket privado por carpeta de empresa),
--             0035 (empresa_config.modulos, solo para `postventa_disponible`).
-- NO depende de 0036–0042 (se escriben en paralelo). Aditivo e idempotente.
--
-- QUÉ ES (plan docs/PLAN_ALCANCE_AMPLIADO.md §3 F7, RF7.1–RF7.3)
-- ─────────────────────────────────────────────────────────────
-- · SEGURIDAD (RF7.1): revisión diaria por obra (puntos tomados de la
--   NOM-031-STPS-2011, la plantilla vive en la web: `lib/seguridad/plantilla.ts`),
--   entrega de equipo de protección personal (EPP) por colaborador (registro de
--   entrega que pide la NOM-017-STPS-2024, num. 5.12: tipo de equipo, fecha,
--   quién recibe y quién entrega) e incidentes (casi accidente, accidente,
--   condición insegura) con el control que pide la NOM-031 (num. 5.27).
--   La app NO avisa al IMSS ni a la STPS: el aviso del accidente de trabajo
--   (formato ST-7, trámite IMSS-03-008) se hace ante el IMSS. Aquí solo se
--   recuerda y se guarda la prueba (misma regla que F1b/F5).
-- · POSTVENTA (RF7.2): el cliente reporta un problema de garantía desde el
--   portal, con fotos; la oficina le da seguimiento con estados y respuesta.
--   Periodo de garantía por obra en tabla aparte (`obra_garantia`).
-- · HERRAMIENTA (RF7.3): inventario, a qué obra y a quién se prestó, cuándo
--   regresó y en qué estado. El historial no se reescribe.
--
-- DATOS DE SALUD (decisión D8, LFPDPPP)
-- ─────────────────────────────────────
-- Lo que diga de la LESIÓN (tipo, parte del cuerpo, atención recibida) va en
-- `incidente_salud`, que SOLO ve y escribe el ADMIN. Es mínima a propósito:
-- listas cerradas y una nota de 280 letras; nada de diagnósticos. El resto del
-- incidente (qué pasó, días de incapacidad, si ya se dio el aviso) lo ven admin,
-- supervisor y contador (la incapacidad pega en la raya). El comprobante del
-- aviso (un ST-7 trae el diagnóstico del médico) vive en la carpeta
-- `incidentes/` del bucket `seguridad`, que también es SOLO del admin.
-- RLS filtra filas, no columnas (lección de 0027/F1): por eso tabla aparte.
--
-- QUIÉN (RLS)
-- ───────────
--   admin       → todo.
--   supervisor  → revisión diaria, EPP, incidentes (sin `incidente_salud` ni el
--                 comprobante del aviso); herramienta y garantías: lee y gestiona.
--   contador    → lee incidentes (sin salud), herramienta (costos) y garantías.
--   colaborador → NADA. No hay puente usuario↔colaborador (ver PROGRESO F4-2):
--                 no se le puede limitar a "su" EPP o "su" herramienta.
--   cliente     → solo los reportes de garantía de SUS obras (los crea con la
--                 RPC `reportar_garantia`), sus fotos y el periodo de garantía.
--
-- REVERSA (manual, solo si nunca se usó en producción):
--   drop table if exists public.herramienta_asignacion, public.herramienta,
--     public.garantia_foto, public.garantia_reporte, public.obra_garantia,
--     public.incidente_salud, public.incidente, public.epp_entrega,
--     public.seguridad_checklist cascade;
--   drop function if exists public.reportar_garantia(uuid, uuid, text, text),
--     public.postventa_disponible(uuid), public.f7_ahora_ms(),
--     public.f7_nombre_usuario(), public.seguridad_puntos_validos(jsonb) cascade;
--   delete from storage.buckets where id in ('seguridad', 'postventa');  -- si están vacíos
--   (y las policies `seguridad_obj_*` / `postventa_obj_*` de storage.objects)
--
-- ENDURECIMIENTO (revisión de seguridad, docs/PROGRESO_ALCANCE.md, SEG-*)
-- ─────────────────────────────────────────────────────────────────────
-- · SEG-A1: incidentes, datos de salud, reportes de garantía, sus fotos y las
--   entregas de EPP no se borran FÍSICAMENTE (tampoco en la cascada de borrar
--   la obra o al colaborador). `incidente_salud` → `incidente` pasa a NO ACTION.
-- · SEG-B4: el admin SÍ puede borrar de verdad los datos de salud de un
--   incidente (derecho ARCO de cancelación). Queda rastro en el incidente
--   (`salud_borrada_at/_por`), sin guardar el dato.
-- · SEG-M1: la oficina no oculta (borrado lógico) las fotos que subió el
--   cliente, y ningún archivo ligado (foto de garantía, evidencia de EPP,
--   comprobante del aviso) se borra del bucket.
-- · SEG-M2: el candado del préstamo devuelto compara todo, también cuando en el
--   mismo UPDATE cambia `deleted_at`, y un préstamo cerrado no se "des-borra".
-- · SEG-B5: el cliente sube como máximo 8 archivos a la carpeta de su reporte.
-- · SEG-B9: las policies de Storage convierten la carpeta con `uuid_o_null`.

-- ════════════════════════════════════════════════════════════════════════════
-- 0. Utilidades
-- ════════════════════════════════════════════════════════════════════════════
-- Compartidas del endurecimiento: mismo cuerpo que en 0036/0037 (ver ahí el
-- porqué). Esta migración no depende de aquéllas, por eso se repiten.
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

create or replace function public.storage_objetos_en_carpeta(p_bucket text, p_prefijo text)
returns integer
language sql
stable
security definer
set search_path = public, storage
as $$
  select count(*)::integer
    from storage.objects o
   where o.bucket_id = p_bucket
     and left(o.name, length(p_prefijo)) = p_prefijo
$$;
revoke all on function public.storage_objetos_en_carpeta(text, text) from public, anon;
grant execute on function public.storage_objetos_en_carpeta(text, text) to authenticated;

create or replace function public.f7_ahora_ms()
returns bigint
language sql stable
as $$ select (extract(epoch from now()) * 1000)::bigint $$;

-- Nombre visible del usuario actual (nunca el correo). Solo la llaman los
-- triggers SECURITY DEFINER; así no sirve para sondear auth.users.
create or replace function public.f7_nombre_usuario()
returns text
language sql stable security definer set search_path = public
as $$
  select coalesce(nullif(trim(coalesce(u.raw_user_meta_data->>'nombre', '')), ''), '')
    from auth.users u where u.id = auth.uid()
$$;
revoke all on function public.f7_nombre_usuario() from public, anon, authenticated;

-- Puntos de la revisión diaria: arreglo de objetos
--   { "clave": "epp_casco", "texto": "…", "resultado": "CUMPLE"|"NO_CUMPLE"|"NO_APLICA"|null, "nota": "…" }
-- `texto` se guarda (foto fija): si mañana cambia la plantilla, la revisión de
-- hoy sigue diciendo lo mismo.
create or replace function public.seguridad_puntos_validos(p jsonb)
returns boolean
language sql immutable
as $$
  select jsonb_typeof(p) = 'array'
     and jsonb_array_length(p) <= 80
     and not exists (
       select 1 from jsonb_array_elements(p) e
        where jsonb_typeof(e) <> 'object'
           or char_length(coalesce(e->>'clave', '')) not between 1 and 60
           or char_length(coalesce(e->>'texto', '')) not between 1 and 300
           or (coalesce(e->'resultado', 'null'::jsonb) <> 'null'::jsonb
               and coalesce(e->>'resultado', '') not in ('CUMPLE', 'NO_CUMPLE', 'NO_APLICA'))
           or char_length(coalesce(e->>'nota', '')) > 500
     )
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. SEGURIDAD — revisión diaria
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.seguridad_checklist (
  id                 uuid primary key,
  empresa_id         uuid not null references public.empresas(id) on delete cascade,
  obra_id            uuid not null references public.obras(id)    on delete cascade,
  -- Día revisado: medianoche de México en epoch ms (igual que asistencias).
  fecha              bigint not null,
  puntos             jsonb not null default '[]'::jsonb
                       check (public.seguridad_puntos_validos(puntos)),
  observaciones      text not null default '' check (char_length(observaciones) <= 3000),
  -- Quien firma la revisión (nombre escrito). Si viene vacío, el del usuario.
  firmo_nombre       text not null default '' check (char_length(firmo_nombre) <= 120),
  -- Sellos del servidor.
  revisado_por       uuid,
  registrada_en      bigint not null default 0,
  created_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  server_updated_at  bigint not null default 0,
  deleted_at         bigint
);

-- Una revisión viva por obra y día.
create unique index if not exists uq_seguridad_checklist_obra_dia
  on public.seguridad_checklist (obra_id, fecha) where deleted_at is null;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. SEGURIDAD — entrega de EPP (NOM-017-STPS-2024, num. 5.12)
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.epp_entrega (
  id                 uuid primary key,
  empresa_id         uuid not null references public.empresas(id)      on delete cascade,
  colaborador_id     uuid not null references public.colaboradores(id) on delete cascade,
  obra_id            uuid references public.obras(id) on delete set null,
  articulo           text not null check (char_length(trim(articulo)) between 1 and 120),
  cantidad           integer not null default 1 check (cantidad between 1 and 1000),
  fecha              bigint not null,
  entrego_nombre     text not null default '' check (char_length(entrego_nombre) <= 120),
  notas              text not null default '' check (char_length(notas) <= 500),
  -- Evidencia opcional de que la persona lo recibió: su firma dibujada en la
  -- pantalla o la foto de la hoja firmada. Carpeta `<empresa>/epp/<id>/`.
  evidencia_path     text check (evidencia_path is null or char_length(evidencia_path) <= 400),
  evidencia_tipo     text check (evidencia_tipo is null or evidencia_tipo in ('FIRMA', 'FOTO')),
  registrado_por     uuid,
  created_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  server_updated_at  bigint not null default 0,
  deleted_at         bigint,
  constraint epp_evidencia_completa check ((evidencia_path is null) = (evidencia_tipo is null))
);

create index if not exists idx_epp_entrega_colaborador
  on public.epp_entrega (colaborador_id, fecha desc);

-- El registro de entrega de EPP es lo que pide la NOM-017 (5.12): tampoco se
-- borra físicamente (SEG-A1), ni en la cascada de borrar al colaborador.
drop trigger if exists trg_epp_entrega_evidencia on public.epp_entrega;
create trigger trg_epp_entrega_evidencia
  before delete on public.epp_entrega
  for each row execute function public._evidencia_no_se_borra();

-- ════════════════════════════════════════════════════════════════════════════
-- 3. SEGURIDAD — incidentes (NOM-031-STPS-2011, num. 5.27 y cap. 21)
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.incidente (
  id                 uuid primary key,
  empresa_id         uuid not null references public.empresas(id) on delete cascade,
  obra_id            uuid not null references public.obras(id)    on delete cascade,
  fecha              bigint not null,
  tipo               text not null
                       check (tipo in ('CASI_ACCIDENTE', 'ACCIDENTE', 'CONDICION_INSEGURA')),
  -- QUÉ PASÓ (no la lesión: eso va en `incidente_salud`).
  descripcion        text not null check (char_length(trim(descripcion)) between 1 and 2000),
  -- Qué se hizo para que no se repita.
  acciones           text not null default '' check (char_length(acciones) <= 2000),
  colaborador_id     uuid references public.colaboradores(id) on delete set null,
  dias_incapacidad   integer check (dias_incapacidad is null or dias_incapacidad between 0 and 3650),
  aviso_imss_hecho   boolean not null default false,
  aviso_imss_fecha   bigint,
  -- Carpeta `<empresa>/incidentes/<id>/`: SOLO el admin la ve (un ST-7 trae
  -- el diagnóstico). El trigger impide que otro rol cambie esta columna.
  comprobante_path   text check (comprobante_path is null or char_length(comprobante_path) <= 400),
  registrado_por     uuid,
  registrado_nombre  text not null default '',
  registrada_en      bigint not null default 0,
  -- Rastro del borrado ARCO de los datos de salud (SEG-B4): cuándo y quién,
  -- nunca qué decían. Los pone el trigger de `incidente_salud`.
  salud_borrada_at   bigint,
  salud_borrada_por  uuid,
  created_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  server_updated_at  bigint not null default 0,
  deleted_at         bigint,
  -- Incapacidad y aviso al IMSS solo tienen sentido si alguien se lastimó.
  constraint incidente_incapacidad_solo_accidente
    check (tipo = 'ACCIDENTE' or dias_incapacidad is null),
  constraint incidente_aviso_solo_accidente
    check (tipo = 'ACCIDENTE' or (not aviso_imss_hecho and comprobante_path is null))
);

create index if not exists idx_incidente_obra on public.incidente (obra_id, fecha desc);

-- Para una base que ya corrió la versión anterior de este archivo.
alter table public.incidente add column if not exists salud_borrada_at  bigint;
alter table public.incidente add column if not exists salud_borrada_por uuid;

create or replace function public.incidente_sellar()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.registrado_por    := auth.uid();
    new.registrado_nombre := coalesce(public.f7_nombre_usuario(), '');
    new.registrada_en     := public.f7_ahora_ms();
    if new.comprobante_path is not null
       and auth.uid() is not null
       and not public.auth_tiene_rol(new.empresa_id, 'admin') then
      raise exception 'INCIDENTE_SOLO_ADMIN: el comprobante del aviso lo sube el administrador.'
        using errcode = 'P0001';
    end if;
    return new;
  end if;

  new.registrado_por    := old.registrado_por;
  new.registrado_nombre := old.registrado_nombre;
  new.registrada_en     := old.registrada_en;
  new.empresa_id        := old.empresa_id;
  -- El rastro del borrado ARCO solo lo escribe el admin (lo pone el trigger de
  -- `incidente_salud`, que corre con su sesión). A otro rol se le conserva.
  if auth.uid() is not null and not public.auth_tiene_rol(old.empresa_id, 'admin') then
    new.salud_borrada_at  := old.salud_borrada_at;
    new.salud_borrada_por := old.salud_borrada_por;
  end if;
  -- `auth.uid() is null` = llave de servicio / mantenimiento: se le permite.
  if new.comprobante_path is distinct from old.comprobante_path
     and auth.uid() is not null
     and not public.auth_tiene_rol(old.empresa_id, 'admin') then
    raise exception 'INCIDENTE_SOLO_ADMIN: el comprobante del aviso lo cambia el administrador.'
      using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists trg_incidente_sellar on public.incidente;
create trigger trg_incidente_sellar
  before insert or update on public.incidente
  for each row execute function public.incidente_sellar();

-- ── Datos de salud: SOLO admin (D8) ─────────────────────────────────────────
create table if not exists public.incidente_salud (
  id                 uuid primary key,
  empresa_id         uuid not null references public.empresas(id)  on delete cascade,
  -- NO ACTION (SEG-A1): el dato de salud no se va "de paso" con el incidente.
  -- No RESTRICT: se revisa al instante y tumbaría la cascada de ELIMINAR LA
  -- EMPRESA completa, donde incidente y salud se van juntos.
  incidente_id       uuid not null unique references public.incidente(id) on delete no action,
  tipo_lesion        text not null default 'OTRA'
                       check (tipo_lesion in ('GOLPE', 'HERIDA', 'TORCEDURA', 'FRACTURA',
                                              'QUEMADURA', 'OJOS', 'ELECTRICA', 'INTOXICACION', 'OTRA')),
  parte_cuerpo       text not null default 'OTRA'
                       check (parte_cuerpo in ('CABEZA', 'OJOS_CARA', 'CUELLO', 'ESPALDA', 'TRONCO',
                                               'BRAZO_MANO', 'PIERNA_PIE', 'VARIAS', 'OTRA')),
  atencion           text not null default 'NINGUNA'
                       check (atencion in ('NINGUNA', 'PRIMEROS_AUXILIOS', 'IMSS', 'PARTICULAR', 'HOSPITAL')),
  -- Corta a propósito: no es un expediente médico.
  nota               text not null default '' check (char_length(nota) <= 280),
  created_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  server_updated_at  bigint not null default 0,
  deleted_at         bigint
);

-- Base de desarrollo que corrió la versión anterior (FK en cascada): se rehace.
do $$
declare v_fk text;
begin
  select c.conname into v_fk
    from pg_constraint c
   where c.conrelid = 'public.incidente_salud'::regclass
     and c.contype = 'f'
     and c.confrelid = 'public.incidente'::regclass
     and c.confdeltype <> 'a';
  if v_fk is not null then
    execute format('alter table public.incidente_salud drop constraint %I', v_fk);
    alter table public.incidente_salud
      add constraint incidente_salud_incidente_id_fkey
      foreign key (incidente_id) references public.incidente(id) on delete no action;
  end if;
end $$;

-- ── Evidencia: incidentes y datos de salud no se borran físicamente (SEG-A1) ─
drop trigger if exists trg_incidente_evidencia on public.incidente;
create trigger trg_incidente_evidencia
  before delete on public.incidente
  for each row execute function public._evidencia_no_se_borra();

-- Datos de salud: la ÚNICA salida es el borrado ARCO del admin (SEG-B4), que
-- deja el rastro en el incidente. Nadie más (ni la llave de servicio sin
-- sesión) los borra, salvo la cascada de eliminar la empresa completa.
create or replace function public._incidente_salud_borrado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.empresas e where e.id = old.empresa_id) then
    return old;  -- se está eliminando la empresa completa
  end if;
  if auth.uid() is null or not public.auth_tiene_rol(old.empresa_id, 'admin') then
    raise exception 'EVIDENCIA_INMUTABLE: los datos de salud solo los borra el administrador (derecho de cancelación).'
      using errcode = 'P0001';
  end if;
  update public.incidente
     set salud_borrada_at  = public.f7_ahora_ms(),
         salud_borrada_por = auth.uid(),
         updated_at        = public.f7_ahora_ms()
   where id = old.incidente_id;
  return old;
end $$;
revoke all on function public._incidente_salud_borrado() from public, anon, authenticated;

drop trigger if exists trg_incidente_salud_borrado on public.incidente_salud;
create trigger trg_incidente_salud_borrado
  before delete on public.incidente_salud
  for each row execute function public._incidente_salud_borrado();

comment on table public.incidente_salud is
  'SENSIBLE (LFPDPPP, datos de salud): solo el admin. Mínimo: listas cerradas y nota corta. Ver 0043 y PROGRESO D8/F7.';
comment on column public.incidente_salud.tipo_lesion is 'SENSIBLE: salud';
comment on column public.incidente_salud.parte_cuerpo is 'SENSIBLE: salud';
comment on column public.incidente_salud.atencion is 'SENSIBLE: salud';
comment on column public.incidente_salud.nota is 'SENSIBLE: salud (máx. 280, sin diagnósticos)';
comment on column public.incidente.comprobante_path is
  'SENSIBLE: el comprobante del aviso (ST-7) trae datos de salud; el objeto solo lo abre el admin.';

-- ════════════════════════════════════════════════════════════════════════════
-- 4. POSTVENTA — periodo de garantía por obra
-- ════════════════════════════════════════════════════════════════════════════
-- Tabla aparte y no columnas en `obras`: `obras` se sincroniza con el móvil y la
-- leen el colaborador y el cliente; aquí cada rol tiene su propia policy y el
-- móvil no se entera. El cliente SÍ ve su fila: es su garantía.
create table if not exists public.obra_garantia (
  id                 uuid primary key,
  empresa_id         uuid not null references public.empresas(id) on delete cascade,
  obra_id            uuid not null unique references public.obras(id) on delete cascade,
  -- Día en que se entregó la obra (medianoche de México). Sin ella no hay vencimiento.
  entrega_fecha      bigint,
  meses              integer not null default 12 check (meses between 0 and 120),
  notas              text not null default '' check (char_length(notas) <= 500),
  created_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  server_updated_at  bigint not null default 0,
  deleted_at         bigint
);

-- ════════════════════════════════════════════════════════════════════════════
-- 5. POSTVENTA — reportes de garantía y sus fotos
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.garantia_reporte (
  id                 uuid primary key,
  empresa_id         uuid not null references public.empresas(id) on delete cascade,
  obra_id            uuid not null references public.obras(id)    on delete cascade,
  -- Copia del cliente de la obra al momento del reporte (registro). Quién lo
  -- VE se decide por la obra, no por esta columna.
  cliente_id         uuid references public.clientes(id) on delete set null,
  origen             text not null default 'OFICINA' check (origen in ('CLIENTE', 'OFICINA')),
  descripcion        text not null check (char_length(trim(descripcion)) between 1 and 2000),
  -- "Dónde": baño de arriba, recámara 2, fachada…
  ubicacion          text not null default '' check (char_length(ubicacion) <= 200),
  estado             text not null default 'ABIERTO'
                       check (estado in ('ABIERTO', 'EN_REVISION', 'PROGRAMADO', 'RESUELTO', 'NO_PROCEDE')),
  -- Lo que se le contesta al cliente (lo ve él).
  respuesta          text not null default '' check (char_length(respuesta) <= 2000),
  programado_para    bigint,
  reportado_por      uuid,
  reportado_nombre   text not null default '',
  reportado_en       bigint not null default 0,
  cerrado_en         bigint,
  created_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  server_updated_at  bigint not null default 0,
  deleted_at         bigint,
  -- Un "no procede" sin explicación es un pleito seguro.
  constraint garantia_no_procede_con_respuesta
    check (estado <> 'NO_PROCEDE' or char_length(trim(respuesta)) > 0),
  constraint garantia_programado_con_fecha
    check (estado <> 'PROGRAMADO' or programado_para is not null)
);

create index if not exists idx_garantia_reporte_obra on public.garantia_reporte (obra_id, reportado_en desc);
create index if not exists idx_garantia_reporte_estado on public.garantia_reporte (empresa_id, estado);

create or replace function public.garantia_reporte_sellar()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.reportado_por    := auth.uid();
    new.reportado_nombre := coalesce(public.f7_nombre_usuario(), '');
    new.reportado_en     := public.f7_ahora_ms();
    new.cliente_id       := (select o.cliente_id from public.obras o where o.id = new.obra_id);
    new.cerrado_en       := case when new.estado in ('RESUELTO', 'NO_PROCEDE')
                                 then public.f7_ahora_ms() end;
    return new;
  end if;

  -- Lo que dijo quien reportó no se reescribe; tampoco a quién le pertenece.
  new.empresa_id       := old.empresa_id;
  new.obra_id          := old.obra_id;
  new.cliente_id       := old.cliente_id;
  new.origen           := old.origen;
  new.descripcion      := old.descripcion;
  new.ubicacion        := old.ubicacion;
  new.reportado_por    := old.reportado_por;
  new.reportado_nombre := old.reportado_nombre;
  new.reportado_en     := old.reportado_en;

  if new.estado in ('RESUELTO', 'NO_PROCEDE') then
    if old.estado not in ('RESUELTO', 'NO_PROCEDE') then
      new.cerrado_en := public.f7_ahora_ms();
    else
      new.cerrado_en := old.cerrado_en;
    end if;
  else
    new.cerrado_en := null;  -- se reabrió
  end if;
  return new;
end $$;

drop trigger if exists trg_garantia_reporte_sellar on public.garantia_reporte;
create trigger trg_garantia_reporte_sellar
  before insert or update on public.garantia_reporte
  for each row execute function public.garantia_reporte_sellar();

-- Un reclamo de garantía es evidencia (SEG-A1): no se borra físicamente.
drop trigger if exists trg_garantia_reporte_evidencia on public.garantia_reporte;
create trigger trg_garantia_reporte_evidencia
  before delete on public.garantia_reporte
  for each row execute function public._evidencia_no_se_borra();

-- Fotos: `path` = '<empresa_id>/<obra_id>/<reporte_id>/<archivo>' (bucket `postventa`).
create table if not exists public.garantia_foto (
  id                 uuid primary key,
  empresa_id         uuid not null references public.empresas(id)         on delete cascade,
  reporte_id         uuid not null references public.garantia_reporte(id) on delete cascade,
  path               text not null unique check (char_length(path) <= 400),
  mime               text not null default 'image/jpeg'
                       check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  bytes              integer check (bytes is null or bytes between 1 and 10485760),
  subida_por_cliente boolean not null default false,
  orden              integer not null default 0,
  created_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  server_updated_at  bigint not null default 0,
  deleted_at         bigint
);

create index if not exists idx_garantia_foto_reporte on public.garantia_foto (reporte_id, orden);

-- Máximo 8 fotos vivas por reporte; la ruta y el reporte no se cambian.
create or replace function public.garantia_foto_reglas()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare v_vivas integer;
begin
  if tg_op = 'UPDATE' then
    new.path               := old.path;
    new.reporte_id         := old.reporte_id;
    new.empresa_id         := old.empresa_id;
    new.subida_por_cliente := old.subida_por_cliente;
    return new;
  end if;
  if new.deleted_at is null then
    select count(*) into v_vivas from public.garantia_foto f
     where f.reporte_id = new.reporte_id and f.deleted_at is null;
    if v_vivas >= 8 then
      raise exception 'GARANTIA_MAX_FOTOS: un reporte lleva máximo 8 fotos.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_garantia_foto_reglas on public.garantia_foto;
create trigger trg_garantia_foto_reglas
  before insert or update on public.garantia_foto
  for each row execute function public.garantia_foto_reglas();

drop trigger if exists trg_garantia_foto_evidencia on public.garantia_foto;
create trigger trg_garantia_foto_evidencia
  before delete on public.garantia_foto
  for each row execute function public._evidencia_no_se_borra();

-- ════════════════════════════════════════════════════════════════════════════
-- 6. HERRAMIENTA — inventario y préstamos
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.herramienta (
  id                 uuid primary key,
  empresa_id         uuid not null references public.empresas(id) on delete cascade,
  nombre             text not null check (char_length(trim(nombre)) between 1 and 120),
  tipo               text not null default 'HERRAMIENTA'
                       check (tipo in ('HERRAMIENTA', 'ELECTRICA', 'MAQUINARIA', 'ANDAMIO_CIMBRA',
                                       'MEDICION', 'SEGURIDAD', 'VEHICULO', 'OTRO')),
  -- Número de inventario que se le pinta o pega ("H-014").
  clave              text not null default '' check (char_length(clave) <= 60),
  serie              text not null default '' check (char_length(serie) <= 80),
  estado             text not null default 'BUENO' check (estado in ('BUENO', 'REPARACION', 'BAJA')),
  costo              numeric(14, 2) check (costo is null or costo >= 0),
  notas              text not null default '' check (char_length(notas) <= 500),
  created_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  server_updated_at  bigint not null default 0,
  deleted_at         bigint
);

-- El número de inventario no se repite dentro de la empresa.
create unique index if not exists uq_herramienta_clave
  on public.herramienta (empresa_id, upper(clave)) where clave <> '' and deleted_at is null;

create table if not exists public.herramienta_asignacion (
  id                 uuid primary key,
  empresa_id         uuid not null references public.empresas(id)    on delete cascade,
  herramienta_id     uuid not null references public.herramienta(id) on delete cascade,
  obra_id            uuid references public.obras(id)         on delete set null,
  colaborador_id     uuid references public.colaboradores(id) on delete set null,
  desde              bigint not null,
  -- Fecha en que debería regresar (opcional): alimenta el semáforo.
  devolver_antes     bigint,
  hasta              bigint,
  entrego_nombre     text not null default '' check (char_length(entrego_nombre) <= 120),
  recibio_nombre     text not null default '' check (char_length(recibio_nombre) <= 120),
  estado_regreso     text check (estado_regreso is null or estado_regreso in ('BUENO', 'REPARACION', 'BAJA')),
  notas              text not null default '' check (char_length(notas) <= 500),
  created_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  server_updated_at  bigint not null default 0,
  deleted_at         bigint,
  -- "Una obra, un responsable o los dos" se exige AL CREARLA, en el trigger, y
  -- no como CHECK: si después se borra la obra o la persona, `on delete set
  -- null` deja los dos nulos y un CHECK tumbaría ese borrado. El historial se
  -- queda con el hueco.
  constraint herramienta_regreso_completo check ((hasta is null) = (estado_regreso is null)),
  constraint herramienta_fechas_ok check (hasta is null or hasta >= desde)
);

-- Una herramienta está en UN solo lugar a la vez.
create unique index if not exists uq_herramienta_asignacion_abierta
  on public.herramienta_asignacion (herramienta_id) where hasta is null and deleted_at is null;
create index if not exists idx_herramienta_asignacion_hist
  on public.herramienta_asignacion (herramienta_id, desde desc);

create or replace function public.herramienta_asignacion_reglas()
returns trigger
language plpgsql
set search_path = public
as $$
declare v_estado text;
begin
  if tg_op = 'INSERT' then
    if new.obra_id is null and new.colaborador_id is null then
      raise exception 'HERRAMIENTA_SIN_DESTINO: di a qué obra va o quién se la lleva.' using errcode = 'P0001';
    end if;
    select h.estado into v_estado from public.herramienta h
     where h.id = new.herramienta_id and h.deleted_at is null;
    if v_estado = 'BAJA' then
      raise exception 'HERRAMIENTA_BAJA: esta herramienta está dada de baja.' using errcode = 'P0001';
    end if;
    return new;
  end if;

  new.empresa_id     := old.empresa_id;
  new.herramienta_id := old.herramienta_id;
  -- Un préstamo ya cerrado es historial: no se reescribe (solo se puede ocultar).
  -- SEG-M2: antes, si en el MISMO UPDATE cambiaba `deleted_at`, el candado no
  -- se revisaba (reescribir + borrar, y luego des-borrar). Ahora:
  --   · el contenido se compara SIEMPRE, cambie o no `deleted_at`;
  --   · `deleted_at` solo puede pasar de vacío a una fecha (ocultarlo), nunca
  --     volver a vacío ni moverse a otra fecha.
  -- Única excepción: la FK `on delete set null` de obra o colaborador (borrado
  -- real de la obra o de la persona), que solo vacía esas columnas y llega
  -- desde el trigger de integridad referencial (pg_trigger_depth() > 1).
  if old.hasta is not null then
    if (new.obra_id, new.colaborador_id, new.desde, new.devolver_antes, new.hasta,
        new.entrego_nombre, new.recibio_nombre, new.estado_regreso, new.notas)
       is distinct from
       (old.obra_id, old.colaborador_id, old.desde, old.devolver_antes, old.hasta,
        old.entrego_nombre, old.recibio_nombre, old.estado_regreso, old.notas)
       and not (
         pg_trigger_depth() > 1
         and (new.obra_id is null or new.obra_id = old.obra_id)
         and (new.colaborador_id is null or new.colaborador_id = old.colaborador_id)
         and (new.desde, new.devolver_antes, new.hasta, new.entrego_nombre,
              new.recibio_nombre, new.estado_regreso, new.notas)
             is not distinct from
             (old.desde, old.devolver_antes, old.hasta, old.entrego_nombre,
              old.recibio_nombre, old.estado_regreso, old.notas)
       )
    then
      raise exception 'HERRAMIENTA_HISTORIAL: un préstamo ya devuelto no se cambia.' using errcode = 'P0001';
    end if;
    if old.deleted_at is not null and new.deleted_at is distinct from old.deleted_at then
      raise exception 'HERRAMIENTA_HISTORIAL: un préstamo ya devuelto y borrado no se restaura ni se cambia.'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_herramienta_asignacion_reglas on public.herramienta_asignacion;
create trigger trg_herramienta_asignacion_reglas
  before insert or update on public.herramienta_asignacion
  for each row execute function public.herramienta_asignacion_reglas();

-- Al devolverla, la herramienta queda en el estado en que regresó. Corre con
-- los permisos de quien devuelve (admin/supervisor, que pueden editar la
-- herramienta): no es SECURITY DEFINER a propósito.
create or replace function public.herramienta_asignacion_devuelta()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.hasta is not null and old.hasta is null and new.estado_regreso is not null then
    update public.herramienta
       set estado = new.estado_regreso,
           updated_at = public.f7_ahora_ms()
     where id = new.herramienta_id and estado is distinct from new.estado_regreso;
  end if;
  return null;
end $$;

drop trigger if exists trg_herramienta_asignacion_devuelta on public.herramienta_asignacion;
create trigger trg_herramienta_asignacion_devuelta
  after update on public.herramienta_asignacion
  for each row execute function public.herramienta_asignacion_devuelta();

-- ════════════════════════════════════════════════════════════════════════════
-- 7. RLS
-- ════════════════════════════════════════════════════════════════════════════
alter table public.seguridad_checklist    enable row level security;
alter table public.epp_entrega            enable row level security;
alter table public.incidente              enable row level security;
alter table public.incidente_salud        enable row level security;
alter table public.obra_garantia          enable row level security;
alter table public.garantia_reporte       enable row level security;
alter table public.garantia_foto          enable row level security;
alter table public.herramienta            enable row level security;
alter table public.herramienta_asignacion enable row level security;

-- ── seguridad_checklist: admin/supervisor ───────────────────────────────────
drop policy if exists seguridad_checklist_read on public.seguridad_checklist;
create policy seguridad_checklist_read on public.seguridad_checklist
  for select using (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor'));

drop policy if exists seguridad_checklist_insert on public.seguridad_checklist;
create policy seguridad_checklist_insert on public.seguridad_checklist
  for insert with check (
    public.auth_tiene_rol(empresa_id, 'admin', 'supervisor')
    and exists (select 1 from public.obras o
                 where o.id = obra_id and o.empresa_id = seguridad_checklist.empresa_id)
  );

drop policy if exists seguridad_checklist_update on public.seguridad_checklist;
create policy seguridad_checklist_update on public.seguridad_checklist
  for update
  using (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor'))
  with check (
    public.auth_tiene_rol(empresa_id, 'admin', 'supervisor')
    and exists (select 1 from public.obras o
                 where o.id = obra_id and o.empresa_id = seguridad_checklist.empresa_id)
  );

create or replace function public.seguridad_checklist_sellar()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.revisado_por  := auth.uid();
    new.registrada_en := public.f7_ahora_ms();
    if btrim(new.firmo_nombre) = '' then
      new.firmo_nombre := coalesce(public.f7_nombre_usuario(), '');
    end if;
    return new;
  end if;
  new.revisado_por  := old.revisado_por;
  new.registrada_en := old.registrada_en;
  new.empresa_id    := old.empresa_id;
  new.obra_id       := old.obra_id;
  return new;
end $$;

drop trigger if exists trg_seguridad_checklist_sellar on public.seguridad_checklist;
create trigger trg_seguridad_checklist_sellar
  before insert or update on public.seguridad_checklist
  for each row execute function public.seguridad_checklist_sellar();

-- ── epp_entrega: admin/supervisor ───────────────────────────────────────────
drop policy if exists epp_entrega_read on public.epp_entrega;
create policy epp_entrega_read on public.epp_entrega
  for select using (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor'));

drop policy if exists epp_entrega_insert on public.epp_entrega;
create policy epp_entrega_insert on public.epp_entrega
  for insert with check (
    public.auth_tiene_rol(empresa_id, 'admin', 'supervisor')
    and exists (select 1 from public.colaboradores c
                 where c.id = colaborador_id and c.empresa_id = epp_entrega.empresa_id)
    and (obra_id is null or exists (select 1 from public.obras o
                 where o.id = obra_id and o.empresa_id = epp_entrega.empresa_id))
    and (evidencia_path is null
         or evidencia_path like empresa_id::text || '/epp/' || id::text || '/%')
  );

drop policy if exists epp_entrega_update on public.epp_entrega;
create policy epp_entrega_update on public.epp_entrega
  for update
  using (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor'))
  with check (
    public.auth_tiene_rol(empresa_id, 'admin', 'supervisor')
    and exists (select 1 from public.colaboradores c
                 where c.id = colaborador_id and c.empresa_id = epp_entrega.empresa_id)
    and (obra_id is null or exists (select 1 from public.obras o
                 where o.id = obra_id and o.empresa_id = epp_entrega.empresa_id))
    and (evidencia_path is null
         or evidencia_path like empresa_id::text || '/epp/' || id::text || '/%')
  );

create or replace function public.epp_entrega_sellar()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.registrado_por := auth.uid();
    if btrim(new.entrego_nombre) = '' then
      new.entrego_nombre := coalesce(public.f7_nombre_usuario(), '');
    end if;
    return new;
  end if;
  new.registrado_por := old.registrado_por;
  new.empresa_id     := old.empresa_id;
  return new;
end $$;

drop trigger if exists trg_epp_entrega_sellar on public.epp_entrega;
create trigger trg_epp_entrega_sellar
  before insert or update on public.epp_entrega
  for each row execute function public.epp_entrega_sellar();

-- ── incidente: leen admin/supervisor/contador; escriben admin/supervisor ────
drop policy if exists incidente_read on public.incidente;
create policy incidente_read on public.incidente
  for select using (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor', 'contador'));

drop policy if exists incidente_insert on public.incidente;
create policy incidente_insert on public.incidente
  for insert with check (
    public.auth_tiene_rol(empresa_id, 'admin', 'supervisor')
    and exists (select 1 from public.obras o
                 where o.id = obra_id and o.empresa_id = incidente.empresa_id)
    and (colaborador_id is null or exists (select 1 from public.colaboradores c
                 where c.id = colaborador_id and c.empresa_id = incidente.empresa_id))
    and (comprobante_path is null
         or comprobante_path like empresa_id::text || '/incidentes/' || id::text || '/%')
  );

drop policy if exists incidente_update on public.incidente;
create policy incidente_update on public.incidente
  for update
  using (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor'))
  with check (
    public.auth_tiene_rol(empresa_id, 'admin', 'supervisor')
    and exists (select 1 from public.obras o
                 where o.id = obra_id and o.empresa_id = incidente.empresa_id)
    and (colaborador_id is null or exists (select 1 from public.colaboradores c
                 where c.id = colaborador_id and c.empresa_id = incidente.empresa_id))
    and (comprobante_path is null
         or comprobante_path like empresa_id::text || '/incidentes/' || id::text || '/%')
  );

-- ── incidente_salud: SOLO admin (D8) ────────────────────────────────────────
drop policy if exists incidente_salud_read on public.incidente_salud;
create policy incidente_salud_read on public.incidente_salud
  for select using (public.auth_tiene_rol(empresa_id, 'admin'));

drop policy if exists incidente_salud_insert on public.incidente_salud;
create policy incidente_salud_insert on public.incidente_salud
  for insert with check (
    public.auth_tiene_rol(empresa_id, 'admin')
    and exists (select 1 from public.incidente i
                 where i.id = incidente_id and i.empresa_id = incidente_salud.empresa_id)
  );

drop policy if exists incidente_salud_update on public.incidente_salud;
create policy incidente_salud_update on public.incidente_salud
  for update
  using (public.auth_tiene_rol(empresa_id, 'admin'))
  with check (
    public.auth_tiene_rol(empresa_id, 'admin')
    and exists (select 1 from public.incidente i
                 where i.id = incidente_id and i.empresa_id = incidente_salud.empresa_id)
  );

-- Derecho de cancelación (ARCO, SEG-B4): el admin borra de verdad el dato de
-- salud. El trigger `_incidente_salud_borrado` deja el rastro en el incidente.
drop policy if exists incidente_salud_delete on public.incidente_salud;
create policy incidente_salud_delete on public.incidente_salud
  for delete using (public.auth_tiene_rol(empresa_id, 'admin'));

-- ── obra_garantia: oficina lee; admin escribe; el cliente ve la de sus obras ─
drop policy if exists obra_garantia_read on public.obra_garantia;
create policy obra_garantia_read on public.obra_garantia
  for select using (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor', 'contador'));

drop policy if exists obra_garantia_cliente_read on public.obra_garantia;
create policy obra_garantia_cliente_read on public.obra_garantia
  for select using (
    deleted_at is null
    and empresa_id in (select public.auth_cliente_empresa_ids())
    and obra_id in (
      select o.id from public.obras o
       where o.cliente_id in (select id from public.clientes where user_id = auth.uid())
    )
  );

drop policy if exists obra_garantia_insert on public.obra_garantia;
create policy obra_garantia_insert on public.obra_garantia
  for insert with check (
    public.auth_tiene_rol(empresa_id, 'admin')
    and exists (select 1 from public.obras o
                 where o.id = obra_id and o.empresa_id = obra_garantia.empresa_id)
  );

drop policy if exists obra_garantia_update on public.obra_garantia;
create policy obra_garantia_update on public.obra_garantia
  for update
  using (public.auth_tiene_rol(empresa_id, 'admin'))
  with check (
    public.auth_tiene_rol(empresa_id, 'admin')
    and exists (select 1 from public.obras o
                 where o.id = obra_id and o.empresa_id = obra_garantia.empresa_id)
  );

-- ── garantia_reporte ────────────────────────────────────────────────────────
drop policy if exists garantia_reporte_read on public.garantia_reporte;
create policy garantia_reporte_read on public.garantia_reporte
  for select using (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor', 'contador'));

-- Cliente: solo los reportes de SUS obras y de SU empresa (lección de 0019).
drop policy if exists garantia_reporte_cliente_read on public.garantia_reporte;
create policy garantia_reporte_cliente_read on public.garantia_reporte
  for select using (
    deleted_at is null
    and empresa_id in (select public.auth_cliente_empresa_ids())
    and obra_id in (
      select o.id from public.obras o
       where o.cliente_id in (select id from public.clientes where user_id = auth.uid())
    )
  );

-- La oficina levanta reportes (p. ej. el cliente llamó por teléfono). El
-- cliente NO tiene policy de INSERT: usa `reportar_garantia`.
drop policy if exists garantia_reporte_insert on public.garantia_reporte;
create policy garantia_reporte_insert on public.garantia_reporte
  for insert with check (
    public.auth_tiene_rol(empresa_id, 'admin', 'supervisor')
    and origen = 'OFICINA'
    and exists (select 1 from public.obras o
                 where o.id = obra_id and o.empresa_id = garantia_reporte.empresa_id)
  );

drop policy if exists garantia_reporte_update on public.garantia_reporte;
create policy garantia_reporte_update on public.garantia_reporte
  for update
  using (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor'))
  with check (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor'));

-- ── garantia_foto ───────────────────────────────────────────────────────────
drop policy if exists garantia_foto_read on public.garantia_foto;
create policy garantia_foto_read on public.garantia_foto
  for select using (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor', 'contador'));

drop policy if exists garantia_foto_cliente_read on public.garantia_foto;
create policy garantia_foto_cliente_read on public.garantia_foto
  for select using (
    deleted_at is null
    and empresa_id in (select public.auth_cliente_empresa_ids())
    and reporte_id in (select r.id from public.garantia_reporte r)  -- ya filtrada por su RLS
  );

drop policy if exists garantia_foto_insert on public.garantia_foto;
create policy garantia_foto_insert on public.garantia_foto
  for insert with check (
    public.auth_tiene_rol(empresa_id, 'admin', 'supervisor')
    and not subida_por_cliente
    and exists (
      select 1 from public.garantia_reporte r
       where r.id = reporte_id
         and r.empresa_id = garantia_foto.empresa_id
         and r.deleted_at is null
         and garantia_foto.path like
             r.empresa_id::text || '/' || r.obra_id::text || '/' || r.id::text || '/%'
    )
  );

-- El cliente agrega fotos a SU reporte mientras la oficina no lo cierre.
drop policy if exists garantia_foto_cliente_insert on public.garantia_foto;
create policy garantia_foto_cliente_insert on public.garantia_foto
  for insert with check (
    subida_por_cliente
    and empresa_id in (select public.auth_cliente_empresa_ids())
    and exists (
      select 1 from public.garantia_reporte r
       where r.id = reporte_id
         and r.empresa_id = garantia_foto.empresa_id
         and r.deleted_at is null
         and r.estado in ('ABIERTO', 'EN_REVISION')
         and r.obra_id in (
           select o.id from public.obras o
            where o.empresa_id = r.empresa_id
              and o.cliente_id in (select id from public.clientes where user_id = auth.uid())
         )
         and garantia_foto.path like
             r.empresa_id::text || '/' || r.obra_id::text || '/' || r.id::text || '/%'
    )
  );

-- La oficina edita (orden, borrado lógico) solo las fotos que ELLA subió: lo
-- que mandó el cliente es su evidencia del reclamo (SEG-M1). `subida_por_cliente`
-- no se puede voltear (trigger de reglas).
drop policy if exists garantia_foto_update on public.garantia_foto;
create policy garantia_foto_update on public.garantia_foto
  for update
  using (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor') and not subida_por_cliente)
  with check (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor') and not subida_por_cliente);

-- ── herramienta ─────────────────────────────────────────────────────────────
drop policy if exists herramienta_read on public.herramienta;
create policy herramienta_read on public.herramienta
  for select using (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor', 'contador'));

drop policy if exists herramienta_insert on public.herramienta;
create policy herramienta_insert on public.herramienta
  for insert with check (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor'));

drop policy if exists herramienta_update on public.herramienta;
create policy herramienta_update on public.herramienta
  for update
  using (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor'))
  with check (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor'));

drop policy if exists herramienta_asignacion_read on public.herramienta_asignacion;
create policy herramienta_asignacion_read on public.herramienta_asignacion
  for select using (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor', 'contador'));

drop policy if exists herramienta_asignacion_insert on public.herramienta_asignacion;
create policy herramienta_asignacion_insert on public.herramienta_asignacion
  for insert with check (
    public.auth_tiene_rol(empresa_id, 'admin', 'supervisor')
    and exists (select 1 from public.herramienta h
                 where h.id = herramienta_id and h.empresa_id = herramienta_asignacion.empresa_id)
    and (obra_id is null or exists (select 1 from public.obras o
                 where o.id = obra_id and o.empresa_id = herramienta_asignacion.empresa_id))
    and (colaborador_id is null or exists (select 1 from public.colaboradores c
                 where c.id = colaborador_id and c.empresa_id = herramienta_asignacion.empresa_id))
  );

drop policy if exists herramienta_asignacion_update on public.herramienta_asignacion;
create policy herramienta_asignacion_update on public.herramienta_asignacion
  for update
  using (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor'))
  with check (
    public.auth_tiene_rol(empresa_id, 'admin', 'supervisor')
    and (obra_id is null or exists (select 1 from public.obras o
                 where o.id = obra_id and o.empresa_id = herramienta_asignacion.empresa_id))
    and (colaborador_id is null or exists (select 1 from public.colaboradores c
                 where c.id = colaborador_id and c.empresa_id = herramienta_asignacion.empresa_id))
  );
-- Ninguna otra tabla de 0043 tiene policy de DELETE: se borra con `deleted_at`.

-- ════════════════════════════════════════════════════════════════════════════
-- 8. RPC del portal del cliente
-- ════════════════════════════════════════════════════════════════════════════
-- `reportar_garantia`: única escritura del cliente sobre `garantia_reporte`.
-- Valida que el usuario sea el cliente LIGADO a esa obra y que cliente y obra
-- sean de la misma empresa (0019). El `id` lo manda el navegador: reintentar
-- el mismo envío no duplica el reporte. Tope de 20 reportes abiertos por obra
-- para que un error del navegador no llene la bandeja de la oficina.
create or replace function public.reportar_garantia(
  p_id          uuid,
  p_obra_id     uuid,
  p_descripcion text,
  p_ubicacion   text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user     uuid := auth.uid();
  v_obra     public.obras%rowtype;
  v_desc     text := btrim(coalesce(p_descripcion, ''));
  v_ubic     text := btrim(coalesce(p_ubicacion, ''));
  v_abiertos integer;
  v_existe   public.garantia_reporte%rowtype;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'No autenticado');
  end if;
  if p_id is null or p_obra_id is null then
    return jsonb_build_object('ok', false, 'error', 'Faltan datos.');
  end if;

  select o.* into v_obra
    from public.obras o
    join public.clientes c on c.id = o.cliente_id
   where o.id = p_obra_id
     and o.deleted_at is null
     and c.empresa_id = o.empresa_id
     and c.user_id = v_user
     and c.deleted_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'No autorizado');
  end if;

  select * into v_existe from public.garantia_reporte where id = p_id;
  if found then
    if v_existe.obra_id = p_obra_id and v_existe.reportado_por = v_user then
      return jsonb_build_object('ok', true, 'id', p_id);  -- reintento del mismo envío
    end if;
    return jsonb_build_object('ok', false, 'error', 'No autorizado');
  end if;

  if char_length(v_desc) < 5 then
    return jsonb_build_object('ok', false, 'error', 'Cuéntanos qué pasa (al menos unas palabras).');
  end if;
  if char_length(v_desc) > 2000 then
    return jsonb_build_object('ok', false, 'error', 'La descripción no puede pasar de 2000 letras.');
  end if;
  if char_length(v_ubic) > 200 then
    return jsonb_build_object('ok', false, 'error', 'El lugar no puede pasar de 200 letras.');
  end if;

  select count(*) into v_abiertos from public.garantia_reporte r
   where r.obra_id = p_obra_id and r.deleted_at is null
     and r.estado in ('ABIERTO', 'EN_REVISION');
  if v_abiertos >= 20 then
    return jsonb_build_object('ok', false,
      'error', 'Ya tienes muchos reportes abiertos en esta obra. Espera a que te respondan.');
  end if;

  insert into public.garantia_reporte (id, empresa_id, obra_id, origen, descripcion, ubicacion,
                                       created_at, updated_at)
  values (p_id, v_obra.empresa_id, p_obra_id, 'CLIENTE', v_desc, v_ubic,
          public.f7_ahora_ms(), public.f7_ahora_ms());

  return jsonb_build_object('ok', true, 'id', p_id);
end $$;

revoke all on function public.reportar_garantia(uuid, uuid, text, text) from public, anon;
grant execute on function public.reportar_garantia(uuid, uuid, text, text) to authenticated;

-- `postventa_disponible`: ¿el contratista de ESTA obra usa garantías? El rol
-- cliente no puede leer `empresa_config` (0017/0022); sin esto el botón
-- "Reportar un problema" saldría aunque la empresa no atienda por aquí.
-- Solo responde a quien es el cliente de la obra (a otro le dice false).
create or replace function public.postventa_disponible(p_obra_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select 'postventa' = any(ec.modulos)
      from public.obras o
      join public.clientes c on c.id = o.cliente_id
      join public.empresa_config ec on ec.empresa_id = o.empresa_id
     where o.id = p_obra_id
       and o.deleted_at is null
       and c.empresa_id = o.empresa_id
       and c.user_id = auth.uid()
       and c.deleted_at is null
     limit 1
  ), false)
$$;

revoke all on function public.postventa_disponible(uuid) from public, anon;
grant execute on function public.postventa_disponible(uuid) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 9. Buckets privados
-- ════════════════════════════════════════════════════════════════════════════
-- `seguridad`: <empresa>/epp/<entrega_id>/<archivo>       (admin, supervisor)
--              <empresa>/incidentes/<incidente_id>/<archivo> (SOLO admin)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'seguridad', 'seguridad', false,
  10485760,  -- 10 MB
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  public             = false;

-- ¿El objeto está ligado a una fila (evidencia de entrega de EPP o comprobante
-- del aviso de un incidente)? Entonces no se borra del bucket (SEG-M1). Lo que
-- se subió y nunca se ligó, o lo que ya se desligó, sí se limpia. SECURITY
-- DEFINER: la respuesta no depende de la RLS de quien borra. Sin policy de
-- UPDATE en el bucket, nada se sobreescribe con el mismo nombre.
create or replace function public._seguridad_obj_protegido(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.epp_entrega e where e.evidencia_path = p_name)
      or exists (select 1 from public.incidente i where i.comprobante_path = p_name)
$$;
revoke all on function public._seguridad_obj_protegido(text) from public, anon;
grant execute on function public._seguridad_obj_protegido(text) to authenticated;

-- ¿El objeto es una foto de garantía registrada (de la oficina o del cliente)?
-- Entonces no se borra del bucket (SEG-M1): es la evidencia del reclamo.
create or replace function public._postventa_obj_protegido(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.garantia_foto f where f.path = p_name)
$$;
revoke all on function public._postventa_obj_protegido(text) from public, anon;
grant execute on function public._postventa_obj_protegido(text) to authenticated;

drop policy if exists seguridad_obj_select on storage.objects;
create policy seguridad_obj_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'seguridad'
    and (
      ((storage.foldername(name))[2] = 'epp'
        and public.auth_tiene_rol(public.uuid_o_null((storage.foldername(name))[1]), 'admin', 'supervisor'))
      or ((storage.foldername(name))[2] = 'incidentes'
        and public.auth_tiene_rol(public.uuid_o_null((storage.foldername(name))[1]), 'admin'))
    )
  );

drop policy if exists seguridad_obj_insert on storage.objects;
create policy seguridad_obj_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'seguridad'
    and (
      ((storage.foldername(name))[2] = 'epp'
        and public.auth_tiene_rol(public.uuid_o_null((storage.foldername(name))[1]), 'admin', 'supervisor')
        and exists (select 1 from public.epp_entrega e
                     where e.id::text = (storage.foldername(name))[3]
                       and e.empresa_id::text = (storage.foldername(name))[1]
                       and e.deleted_at is null))
      or ((storage.foldername(name))[2] = 'incidentes'
        and public.auth_tiene_rol(public.uuid_o_null((storage.foldername(name))[1]), 'admin')
        and exists (select 1 from public.incidente i
                     where i.id::text = (storage.foldername(name))[3]
                       and i.empresa_id::text = (storage.foldername(name))[1]
                       and i.deleted_at is null))
    )
  );

drop policy if exists seguridad_obj_delete on storage.objects;
create policy seguridad_obj_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'seguridad'
    and (
      ((storage.foldername(name))[2] = 'epp'
        and public.auth_tiene_rol(public.uuid_o_null((storage.foldername(name))[1]), 'admin', 'supervisor'))
      or ((storage.foldername(name))[2] = 'incidentes'
        and public.auth_tiene_rol(public.uuid_o_null((storage.foldername(name))[1]), 'admin'))
    )
    and not public._seguridad_obj_protegido(name)
  );

-- `postventa`: <empresa>/<obra>/<reporte>/<archivo>
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'postventa', 'postventa', false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  public             = false;

-- VER: la oficina de la empresa dueña de la carpeta, o quien pueda ver la FILA
-- de `garantia_foto` (el cliente, por su RLS: solo sus reportes).
drop policy if exists postventa_obj_select on storage.objects;
create policy postventa_obj_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'postventa'
    and (
      public.auth_tiene_rol(public.uuid_o_null((storage.foldername(name))[1]), 'admin', 'supervisor', 'contador')
      or exists (select 1 from public.garantia_foto f
                  where f.path = storage.objects.name and f.deleted_at is null)
    )
  );

-- SUBIR: la oficina en la carpeta de un reporte de su empresa; el cliente en la
-- carpeta de SU reporte mientras siga abierto o en revisión.
drop policy if exists postventa_obj_insert on storage.objects;
create policy postventa_obj_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'postventa'
    and exists (
      select 1 from public.garantia_reporte r
       where r.id::text         = (storage.foldername(name))[3]
         and r.obra_id::text    = (storage.foldername(name))[2]
         and r.empresa_id::text = (storage.foldername(name))[1]
         and r.deleted_at is null
         and (
           public.auth_tiene_rol(r.empresa_id, 'admin', 'supervisor')
           or (
             r.empresa_id in (select public.auth_cliente_empresa_ids())
             and r.estado in ('ABIERTO', 'EN_REVISION')
             and r.obra_id in (
               select o.id from public.obras o
                where o.cliente_id in (select id from public.clientes where user_id = auth.uid())
             )
             -- Tope de 8 archivos por reporte para lo que sube el cliente
             -- (SEG-B5), el mismo de `garantia_foto`. Cuenta todo lo que hay en
             -- la carpeta, también lo subido y nunca ligado.
             and public.storage_objetos_en_carpeta(
                   'postventa', r.empresa_id::text || '/' || r.obra_id::text || '/' || r.id::text || '/') < 8
           )
         )
    )
  );

-- BORRAR: solo la oficina, y solo lo que NO es una foto registrada de un
-- reporte (SEG-M1: ni la del cliente ni la propia; lo registrado es la
-- evidencia del reclamo). El cliente no borra nada.
drop policy if exists postventa_obj_delete on storage.objects;
create policy postventa_obj_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'postventa'
    and public.auth_tiene_rol(public.uuid_o_null((storage.foldername(name))[1]), 'admin', 'supervisor')
    and not public._postventa_obj_protegido(name)
  );

-- ════════════════════════════════════════════════════════════════════════════
-- 10. Sincronización (listas para el móvil cuando le toque, D6)
-- ════════════════════════════════════════════════════════════════════════════
do $$
declare t text;
begin
  foreach t in array array['seguridad_checklist', 'epp_entrega', 'incidente', 'incidente_salud',
                           'obra_garantia', 'garantia_reporte', 'garantia_foto',
                           'herramienta', 'herramienta_asignacion'] loop
    execute format('drop trigger if exists trg_srv_upd on public.%I;', t);
    execute format(
      'create trigger trg_srv_upd before insert or update on public.%I '
      'for each row execute function public.set_server_updated_at();', t);
    execute format(
      'create index if not exists idx_%1$s_pull on public.%1$s (empresa_id, server_updated_at);', t);
  end loop;
end $$;
