-- 0041_bitacora_y_programa.sql — BITÁCORA DE OBRA con fotos + PROGRAMA DE OBRA
-- Depende de: 0001 (empresas, auth_tiene_rol), 0002 (obras, set_server_updated_at),
--             0006 (clientes), 0008/0012 (obra_presupuesto + sección),
--             0019 (auth_cliente_empresa_ids, lección del padre), 0022 (contador),
--             0024 (patrón de bucket privado por carpeta de empresa)
-- NO depende de 0036–0040 (se escriben en paralelo). Aditivo e idempotente.
--
-- QUÉ ES (plan docs/PLAN_ALCANCE_AMPLIADO.md §3 F4, RF4.1–RF4.8, RD4.1)
-- ─────────────────────────────────────────────────────────────────────
-- · BITÁCORA: lo que pasó cada día en la obra (avance, incidencia, instrucción,
--   visita…), con fotos, clima y quién estuvo. En obra privada nadie la lleva, y
--   cuando hay un pleito con el cliente no existe evidencia. Para que SIRVA como
--   evidencia, una entrada se CIERRA 24 h después de llegar al servidor: ya no
--   se le cambia el texto ni se borra; solo se le agregan ACLARACIONES.
-- · PROGRAMA: fecha de inicio y fin por partida o sección del presupuesto (o un
--   concepto libre), con una marca manual de "terminada". Sin dependencias ni
--   ruta crítica (RF4.8). "Real vs programado" se conectará con `avance_partida`
--   de F3 (0039) cuando exista; por eso `presupuesto_id` apunta a la partida.
--
-- EL CIERRE DE 24 H LO DECIDE LA BASE, NO LA PANTALLA
-- ───────────────────────────────────────────────────
-- `registrada_en` la sella un trigger con el reloj del SERVIDOR al insertar y
-- nadie la puede cambiar después. `created_at` NO sirve para esto: lo manda el
-- cliente (convención de sync) y bastaría con mandarlo en el futuro para
-- alargar la ventana. Una entrada capturada sin señal se cierra 24 h después
-- de SUBIRSE: es la hora en que el servidor pudo darla por buena.
--
-- Pasadas las 24 h, un trigger rechaza cualquier UPDATE que toque el contenido
-- (texto, tipo, fecha, clima, personal, obra) o el borrado lógico. Lo único
-- que se puede seguir cambiando es `visible_cliente`: publicar o retirar del
-- portal no altera lo que dice la entrada. Las fotos siguen la misma regla
-- (no se agregan ni se quitan a una entrada cerrada) y en Storage el objeto de
-- una entrada cerrada no se puede borrar.
--
-- QUIÉN (RLS)
-- ───────────
--   admin       → lee todo; escribe entradas, fotos, aclaraciones y programa;
--                 edita cualquier entrada abierta.
--   supervisor  → igual, pero solo edita las entradas que ÉL registró.
--   contador    → solo lee (bitácora y programa).
--   colaborador → NADA por ahora. Se quería "puede escribir en la obra donde
--                 trabaja hoy" vía `obra_colaborador`, pero esa tabla liga
--                 obras con COLABORADORES (fichas de la raya), no con usuarios:
--                 no existe el puente usuario↔colaborador. Inventarlo aquí
--                 sería adelantar F6 (0042, `usuario_obra`). Ver PROGRESO F4-2.
--   cliente     → lee SOLO las entradas `visible_cliente` de SUS obras, con sus
--                 fotos y aclaraciones. El programa no se le muestra (aún).
--
-- ENDURECIMIENTO (revisión de seguridad, docs/PROGRESO_ALCANCE.md, SEG-*)
-- ─────────────────────────────────────────────────────────────────────
-- · SEG-A1: el candado de 24 h cubría el UPDATE, pero un DELETE físico de la
--   OBRA se llevaba en cascada entradas cerradas y aclaraciones. Ahora una
--   entrada cerrada y cualquier aclaración no se borran físicamente (trigger
--   BEFORE DELETE, que también se dispara dentro de la cascada).
-- · SEG-B9: las policies de Storage convierten la carpeta con `uuid_o_null`.

-- ════════════════════════════════════════════════════════════════════════════
-- 0. Utilidades
-- ════════════════════════════════════════════════════════════════════════════
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

-- Reloj del servidor en epoch ms (la convención de todas las fechas).
create or replace function public.bitacora_ahora_ms()
returns bigint
language sql stable
as $$ select (extract(epoch from now()) * 1000)::bigint $$;

-- ¿Una entrada registrada en `p_registrada` sigue abierta? 24 h exactas.
create or replace function public.bitacora_abierta(p_registrada bigint)
returns boolean
language sql stable
as $$ select p_registrada >= public.bitacora_ahora_ms() - 86400000 $$;

-- Nombre visible del usuario actual (el que ya usa 0018). Solo el nombre, nunca
-- el correo: este dato se enseña al cliente en el portal.
create or replace function public.bitacora_nombre_autor()
returns text
language sql stable security definer set search_path = public
as $$
  select coalesce(nullif(trim(coalesce(u.raw_user_meta_data->>'nombre', '')), ''), '')
    from auth.users u where u.id = auth.uid()
$$;
-- Solo la llaman los triggers (SECURITY DEFINER, corren como el dueño): nadie
-- más necesita ejecutarla, y así no sirve para sondear auth.users.
revoke all on function public.bitacora_nombre_autor() from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Entrada de bitácora
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.bitacora_entrada (
  id                 uuid primary key,
  empresa_id         uuid not null references public.empresas(id) on delete cascade,
  obra_id            uuid not null references public.obras(id)    on delete cascade,

  -- Día de la entrada: medianoche de México en epoch ms (igual que asistencias).
  fecha              bigint not null,
  tipo               text not null default 'AVANCE'
                       check (tipo in ('AVANCE', 'INCIDENCIA', 'INSTRUCCION', 'VISITA', 'CLIMA', 'OTRO')),
  texto              text not null default ''
                       check (char_length(texto) <= 5000),
  -- '' = no se anotó.
  clima              text not null default ''
                       check (clima in ('', 'SOLEADO', 'NUBLADO', 'LLUVIA', 'TORMENTA', 'CALOR', 'FRIO', 'VIENTO')),

  -- Personal presente: el conteo y una FOTO FIJA de los nombres (sale del pase
  -- de lista del día). Es snapshot a propósito: si mañana se corrige la
  -- asistencia o se renombra a alguien, la evidencia no debe cambiar sola.
  personal_presente  integer check (personal_presente is null or personal_presente between 0 and 10000),
  personal_nombres   text[] not null default '{}'
                       check (coalesce(array_length(personal_nombres, 1), 0) <= 500),

  visible_cliente    boolean not null default false,

  -- Los sella el trigger: el cliente no los puede falsear.
  autor_id           uuid,
  autor_nombre       text not null default '',
  registrada_en      bigint not null default 0,

  created_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  server_updated_at  bigint not null default 0,
  deleted_at         bigint
);

create index if not exists idx_bitacora_entrada_obra
  on public.bitacora_entrada (obra_id, fecha desc);

-- ── Sellos y cierre a las 24 h ─────────────────────────────────────────────
create or replace function public.bitacora_entrada_sellar()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.registrada_en := public.bitacora_ahora_ms();
    new.autor_id      := auth.uid();
    new.autor_nombre  := coalesce(public.bitacora_nombre_autor(), '');
    return new;
  end if;

  -- UPDATE: los sellos no se mueven nunca.
  new.registrada_en := old.registrada_en;
  new.autor_id      := old.autor_id;
  new.autor_nombre  := old.autor_nombre;
  new.empresa_id    := old.empresa_id;

  if not public.bitacora_abierta(old.registrada_en)
     and (new.obra_id, new.fecha, new.tipo, new.texto, new.clima,
          new.personal_presente, new.personal_nombres, new.deleted_at)
         is distinct from
         (old.obra_id, old.fecha, old.tipo, old.texto, old.clima,
          old.personal_presente, old.personal_nombres, old.deleted_at)
  then
    raise exception 'BITACORA_CERRADA: la entrada ya no se puede cambiar (pasaron 24 horas). Agrega una aclaración.'
      using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists trg_bitacora_entrada_sellar on public.bitacora_entrada;
create trigger trg_bitacora_entrada_sellar
  before insert or update on public.bitacora_entrada
  for each row execute function public.bitacora_entrada_sellar();

-- Cerrada = evidencia: tampoco se borra FÍSICAMENTE (SEG-A1).
drop trigger if exists trg_bitacora_entrada_evidencia on public.bitacora_entrada;
create trigger trg_bitacora_entrada_evidencia
  before delete on public.bitacora_entrada
  for each row when (not public.bitacora_abierta(old.registrada_en))
  execute function public._evidencia_no_se_borra();

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Aclaraciones (lo único que se agrega a una entrada cerrada)
-- ════════════════════════════════════════════════════════════════════════════
-- Inmutables: no hay policy de UPDATE ni de DELETE. Una aclaración equivocada
-- se corrige con otra aclaración, igual que en una bitácora de papel.
create table if not exists public.bitacora_aclaracion (
  id                 uuid primary key,
  empresa_id         uuid not null references public.empresas(id)         on delete cascade,
  entrada_id         uuid not null references public.bitacora_entrada(id) on delete cascade,
  texto              text not null check (char_length(trim(texto)) between 1 and 5000),
  autor_id           uuid,
  autor_nombre       text not null default '',
  registrada_en      bigint not null default 0,
  created_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  server_updated_at  bigint not null default 0,
  deleted_at         bigint
);

create index if not exists idx_bitacora_aclaracion_entrada
  on public.bitacora_aclaracion (entrada_id, registrada_en);

create or replace function public.bitacora_aclaracion_sellar()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  new.registrada_en := public.bitacora_ahora_ms();
  new.autor_id      := auth.uid();
  new.autor_nombre  := coalesce(public.bitacora_nombre_autor(), '');
  return new;
end $$;

drop trigger if exists trg_bitacora_aclaracion_sellar on public.bitacora_aclaracion;
create trigger trg_bitacora_aclaracion_sellar
  before insert on public.bitacora_aclaracion
  for each row execute function public.bitacora_aclaracion_sellar();

-- Una aclaración es inmutable desde que existe: tampoco se borra FÍSICAMENTE
-- (SEG-A1), ni en la cascada de su entrada o de la obra.
drop trigger if exists trg_bitacora_aclaracion_evidencia on public.bitacora_aclaracion;
create trigger trg_bitacora_aclaracion_evidencia
  before delete on public.bitacora_aclaracion
  for each row execute function public._evidencia_no_se_borra();

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Fotos de la entrada (el archivo vive en el bucket privado `bitacora`)
-- ════════════════════════════════════════════════════════════════════════════
-- `path` = '<empresa_id>/<obra_id>/<entrada_id>/<archivo>'. La policy exige
-- que la ruta caiga en la carpeta de ESA entrada, así nadie enlaza un objeto
-- de otra empresa, de otra obra ni de otra entrada.
create table if not exists public.bitacora_foto (
  id                 uuid primary key,
  empresa_id         uuid not null references public.empresas(id)         on delete cascade,
  entrada_id         uuid not null references public.bitacora_entrada(id) on delete cascade,
  path               text not null unique check (char_length(path) <= 400),
  mime               text not null default 'image/jpeg'
                       check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  bytes              integer check (bytes is null or bytes between 1 and 10485760),
  orden              integer not null default 0,
  created_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  server_updated_at  bigint not null default 0,
  deleted_at         bigint
);

create index if not exists idx_bitacora_foto_entrada on public.bitacora_foto (entrada_id, orden);

-- Máximo de fotos vivas por entrada (RF4.1 "hasta N"). La web usa el mismo 10.
create or replace function public.bitacora_foto_reglas()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_registrada bigint;
  v_vivas      integer;
begin
  select e.registrada_en into v_registrada
    from public.bitacora_entrada e where e.id = new.entrada_id;

  if tg_op = 'UPDATE' then
    new.path       := old.path;        -- el archivo de una foto no se cambia
    new.entrada_id := old.entrada_id;
    new.empresa_id := old.empresa_id;
  end if;

  if v_registrada is not null and not public.bitacora_abierta(v_registrada) then
    raise exception 'BITACORA_CERRADA: la entrada ya no acepta cambios en sus fotos (pasaron 24 horas).'
      using errcode = 'P0001';
  end if;

  if tg_op = 'INSERT' and new.deleted_at is null then
    select count(*) into v_vivas
      from public.bitacora_foto f
     where f.entrada_id = new.entrada_id and f.deleted_at is null;
    if v_vivas >= 10 then
      raise exception 'BITACORA_MAX_FOTOS: una entrada lleva máximo 10 fotos.'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_bitacora_foto_reglas on public.bitacora_foto;
create trigger trg_bitacora_foto_reglas
  before insert or update on public.bitacora_foto
  for each row execute function public.bitacora_foto_reglas();

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Programa de obra
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.programa_partida (
  id                 uuid primary key,
  empresa_id         uuid not null references public.empresas(id) on delete cascade,
  obra_id            uuid not null references public.obras(id)    on delete cascade,

  -- A qué se refiere, en orden de preferencia:
  --   presupuesto_id → una partida del presupuesto de la obra (0008);
  --   seccion        → una sección de ese presupuesto, por nombre (0012 la
  --                    guarda como texto, no hay tabla de secciones);
  --   ninguno        → concepto libre.
  -- `concepto` siempre lleva el texto que se muestra (copia al crearla), así
  -- el programa se lee igual aunque luego se renombre o borre la partida.
  presupuesto_id     uuid references public.obra_presupuesto(id) on delete set null,
  seccion            text,
  concepto           text not null check (char_length(trim(concepto)) between 1 and 300),

  fecha_inicio       bigint not null,
  fecha_fin          bigint not null,
  -- Manual por ahora. TODO(F3): con `avance_partida` (0039) se calcula el
  -- avance real y esto queda como "la di por terminada".
  terminada          boolean not null default false,
  orden              integer not null default 0,

  created_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  server_updated_at  bigint not null default 0,
  deleted_at         bigint,

  constraint programa_fechas_ok check (fecha_fin >= fecha_inicio)
);

create index if not exists idx_programa_partida_obra on public.programa_partida (obra_id, orden);

-- ════════════════════════════════════════════════════════════════════════════
-- 5. RLS
-- ════════════════════════════════════════════════════════════════════════════
alter table public.bitacora_entrada    enable row level security;
alter table public.bitacora_aclaracion enable row level security;
alter table public.bitacora_foto       enable row level security;
alter table public.programa_partida    enable row level security;

-- ── bitacora_entrada ────────────────────────────────────────────────────────
drop policy if exists bitacora_entrada_read on public.bitacora_entrada;
create policy bitacora_entrada_read on public.bitacora_entrada
  for select using (
    public.auth_tiene_rol(empresa_id, 'admin', 'supervisor', 'contador')
  );

-- Cliente: solo lo publicado, de SUS obras y de SU empresa (lección de 0019).
drop policy if exists bitacora_entrada_cliente_read on public.bitacora_entrada;
create policy bitacora_entrada_cliente_read on public.bitacora_entrada
  for select using (
    visible_cliente
    and deleted_at is null
    and empresa_id in (select public.auth_cliente_empresa_ids())
    and obra_id in (
      select o.id from public.obras o
       where o.cliente_id in (select id from public.clientes where user_id = auth.uid())
    )
  );

drop policy if exists bitacora_entrada_insert on public.bitacora_entrada;
create policy bitacora_entrada_insert on public.bitacora_entrada
  for insert with check (
    public.auth_tiene_rol(empresa_id, 'admin', 'supervisor')
    and exists (
      select 1 from public.obras o
       where o.id = obra_id and o.empresa_id = bitacora_entrada.empresa_id
    )
  );

-- Editar (incluye el borrado lógico): el admin cualquiera; el supervisor solo
-- las suyas. El cierre de 24 h lo pone el trigger, encima de esto.
drop policy if exists bitacora_entrada_update on public.bitacora_entrada;
create policy bitacora_entrada_update on public.bitacora_entrada
  for update
  using (
    public.auth_tiene_rol(empresa_id, 'admin')
    or (public.auth_tiene_rol(empresa_id, 'supervisor') and autor_id = auth.uid())
  )
  with check (
    (
      public.auth_tiene_rol(empresa_id, 'admin')
      or (public.auth_tiene_rol(empresa_id, 'supervisor') and autor_id = auth.uid())
    )
    and exists (
      select 1 from public.obras o
       where o.id = obra_id and o.empresa_id = bitacora_entrada.empresa_id
    )
  );
-- Sin policy de DELETE: el borrado físico no existe para nadie de la app.

-- ── bitacora_aclaracion ─────────────────────────────────────────────────────
drop policy if exists bitacora_aclaracion_read on public.bitacora_aclaracion;
create policy bitacora_aclaracion_read on public.bitacora_aclaracion
  for select using (
    public.auth_tiene_rol(empresa_id, 'admin', 'supervisor', 'contador')
  );

-- El cliente ve las aclaraciones de lo que ve: una entrada publicada sin su
-- corrección contaría una versión que la propia empresa ya enmendó.
drop policy if exists bitacora_aclaracion_cliente_read on public.bitacora_aclaracion;
create policy bitacora_aclaracion_cliente_read on public.bitacora_aclaracion
  for select using (
    deleted_at is null
    and empresa_id in (select public.auth_cliente_empresa_ids())
    and entrada_id in (select e.id from public.bitacora_entrada e)  -- ya filtrada por su RLS
  );

drop policy if exists bitacora_aclaracion_insert on public.bitacora_aclaracion;
create policy bitacora_aclaracion_insert on public.bitacora_aclaracion
  for insert with check (
    public.auth_tiene_rol(empresa_id, 'admin', 'supervisor')
    and exists (
      select 1 from public.bitacora_entrada e
       where e.id = entrada_id
         and e.empresa_id = bitacora_aclaracion.empresa_id
         and e.deleted_at is null
    )
  );

-- ── bitacora_foto ───────────────────────────────────────────────────────────
drop policy if exists bitacora_foto_read on public.bitacora_foto;
create policy bitacora_foto_read on public.bitacora_foto
  for select using (
    public.auth_tiene_rol(empresa_id, 'admin', 'supervisor', 'contador')
  );

drop policy if exists bitacora_foto_cliente_read on public.bitacora_foto;
create policy bitacora_foto_cliente_read on public.bitacora_foto
  for select using (
    deleted_at is null
    and empresa_id in (select public.auth_cliente_empresa_ids())
    and entrada_id in (select e.id from public.bitacora_entrada e)  -- ya filtrada por su RLS
  );

drop policy if exists bitacora_foto_insert on public.bitacora_foto;
create policy bitacora_foto_insert on public.bitacora_foto
  for insert with check (
    public.auth_tiene_rol(empresa_id, 'admin', 'supervisor')
    and exists (
      select 1 from public.bitacora_entrada e
       where e.id = entrada_id
         and e.empresa_id = bitacora_foto.empresa_id
         and e.deleted_at is null
         and bitacora_foto.path like
             e.empresa_id::text || '/' || e.obra_id::text || '/' || e.id::text || '/%'
    )
  );

drop policy if exists bitacora_foto_update on public.bitacora_foto;
create policy bitacora_foto_update on public.bitacora_foto
  for update
  using (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor'))
  with check (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor'));

-- ── programa_partida ────────────────────────────────────────────────────────
drop policy if exists programa_partida_read on public.programa_partida;
create policy programa_partida_read on public.programa_partida
  for select using (
    public.auth_tiene_rol(empresa_id, 'admin', 'supervisor', 'contador')
  );

drop policy if exists programa_partida_insert on public.programa_partida;
create policy programa_partida_insert on public.programa_partida
  for insert with check (
    public.auth_tiene_rol(empresa_id, 'admin', 'supervisor')
    and exists (
      select 1 from public.obras o
       where o.id = obra_id and o.empresa_id = programa_partida.empresa_id
    )
    and (
      presupuesto_id is null
      or exists (
        select 1 from public.obra_presupuesto p
         where p.id = presupuesto_id
           and p.empresa_id = programa_partida.empresa_id
           and p.obra_id = programa_partida.obra_id
      )
    )
  );

drop policy if exists programa_partida_update on public.programa_partida;
create policy programa_partida_update on public.programa_partida
  for update
  using (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor'))
  with check (
    public.auth_tiene_rol(empresa_id, 'admin', 'supervisor')
    and exists (
      select 1 from public.obras o
       where o.id = obra_id and o.empresa_id = programa_partida.empresa_id
    )
    and (
      presupuesto_id is null
      or exists (
        select 1 from public.obra_presupuesto p
         where p.id = presupuesto_id
           and p.empresa_id = programa_partida.empresa_id
           and p.obra_id = programa_partida.obra_id
      )
    )
  );

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Bucket privado `bitacora`
-- ════════════════════════════════════════════════════════════════════════════
-- Mismos límites que `comprobantes` (0024) sin PDF: son fotos. La web las
-- comprime en el navegador antes de subirlas (≈0.3–1 MB); el límite de 10 MB
-- es para la foto sin comprimir cuando el navegador no puede reducirla.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'bitacora', 'bitacora', false,
  10485760,  -- 10 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  public             = false;

-- Ruta: '<empresa_id>/<obra_id>/<entrada_id>/<archivo>'.
--   foldername[1] = empresa, [2] = obra, [3] = entrada.

-- VER: oficina de la empresa dueña de la carpeta, o quien pueda ver la FILA de
-- `bitacora_foto` que apunta a ese objeto. Esa segunda mitad es la del cliente
-- y reusa su RLS: solo ve la foto si ve la fila (entrada publicada, obra suya).
drop policy if exists bitacora_obj_select on storage.objects;
create policy bitacora_obj_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'bitacora'
    and (
      public.auth_tiene_rol(public.uuid_o_null((storage.foldername(name))[1]), 'admin', 'supervisor', 'contador')
      or exists (
        select 1 from public.bitacora_foto f
         where f.path = storage.objects.name and f.deleted_at is null
      )
    )
  );

-- SUBIR: admin/supervisor, y solo dentro de la carpeta de una entrada ABIERTA
-- de esa misma empresa y obra. Así no se acumulan fotos sueltas en carpetas
-- inventadas ni se "completa" a escondidas una entrada ya cerrada.
drop policy if exists bitacora_obj_insert on storage.objects;
create policy bitacora_obj_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'bitacora'
    and public.auth_tiene_rol(public.uuid_o_null((storage.foldername(name))[1]), 'admin', 'supervisor')
    and exists (
      select 1 from public.bitacora_entrada e
       where e.id::text         = (storage.foldername(name))[3]
         and e.obra_id::text    = (storage.foldername(name))[2]
         and e.empresa_id::text = (storage.foldername(name))[1]
         and e.deleted_at is null
         and public.bitacora_abierta(e.registrada_en)
    )
  );

-- BORRAR: admin/supervisor, y NUNCA el archivo de una entrada cerrada (es la
-- evidencia). Sin policy de UPDATE: un objeto subido no se sobreescribe.
drop policy if exists bitacora_obj_delete on storage.objects;
create policy bitacora_obj_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'bitacora'
    and public.auth_tiene_rol(public.uuid_o_null((storage.foldername(name))[1]), 'admin', 'supervisor')
    and not exists (
      select 1 from public.bitacora_entrada e
       where e.id::text = (storage.foldername(name))[3]
         and not public.bitacora_abierta(e.registrada_en)
    )
  );

-- ════════════════════════════════════════════════════════════════════════════
-- 7. Sincronización (listas para el móvil cuando le toque, D6)
-- ════════════════════════════════════════════════════════════════════════════
do $$
declare t text;
begin
  foreach t in array array['bitacora_entrada', 'bitacora_aclaracion', 'bitacora_foto', 'programa_partida'] loop
    execute format('drop trigger if exists trg_srv_upd on public.%I;', t);
    execute format(
      'create trigger trg_srv_upd before insert or update on public.%I '
      'for each row execute function public.set_server_updated_at();', t);
    execute format(
      'create index if not exists idx_%1$s_pull on public.%1$s (empresa_id, server_updated_at);', t);
  end loop;
end $$;
