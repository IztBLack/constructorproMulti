-- 0050_listas_material.sql — LISTAS DE MATERIAL (fase 1: piezas con checklist)
-- Plan: docs/PLAN_LISTAS_MATERIAL.md (§3 modelo, §9 fase 1).
-- Depende de: 0001 (empresas, auth_tiene_rol), 0002 (obras), 0019 (lección
--             del padre), 0035 (catálogo de módulos), 0042 (residente,
--             auth_residente_obra; roles compras y almacén).
-- Aditivo e idempotente. No toca tablas ni policies existentes. Antes que esta
-- va la 0049 (proyección guardada, rama pendiente): se deja libre el número.
--
-- QUÉ ES
-- ──────
-- En obra la cuenta de material vive en notas de WhatsApp:
--
--   Trabes
--   4 10:45
--   2 12:25
--   Pasillo
--   2 3:55 estribo 25
--
-- Una LISTA es eso, por obra: renglones agrupados por sección («Trabes»,
-- «Pasillo») con cantidad y largo, y una casilla para palomear en obra lo que ya
-- llegó o ya se armó. Sale en PDF con la misma cara que los demás documentos.
--
-- POR QUÉ NO ES UNA REQUISICIÓN (0038)
-- ────────────────────────────────────
-- La requisición es un PEDIDO con flujo de aprobación y compra; la lista es la
-- CUENTA de lo que lleva la obra según el plano, y se palomea en campo. Una
-- lista puede acabar convertida en requisición (fase 4), pero no al revés, y
-- muchas listas nunca se compran por la app.
--
-- POR QUÉ NO SE GUARDAN LOS RESULTADOS
-- ────────────────────────────────────
-- Metros lineales, estribos y, en fases siguientes, varillas o bultos se
-- RECALCULAN de lo capturado con el mismo módulo puro en el móvil
-- (`lib/domain/listas/`) y en la web (`web/src/lib/listas/`). Guardarlos dejaría
-- números viejos pegados cuando alguien corrige una medida desde el otro lado.
--
-- LO QUE SE CAPTURA ES LO QUE MARCA EL PLANO (decisión del dueño): la app no
-- decide ingeniería. Por eso aquí no hay defaults de medidas: lo que no viene,
-- queda null.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. La clave del módulo
-- ════════════════════════════════════════════════════════════════════════════
-- Agregar una clave al catálogo solo vuelve más permisivo el CHECK de
-- `empresa_config.modulos` (0035): ninguna fila existente se invalida. Las
-- dependencias no cambian: «listas» no depende de compras (quien no compra por
-- la app igual quiere su lista).
create or replace function public.modulos_catalogo()
returns text[]
language sql
immutable
parallel safe
as $$
  select array[
    -- Existentes
    'obras', 'cotizaciones', 'equipo', 'cuadrillas', 'caja',
    'proyeccion', 'notas', 'portal',
    -- Futuros (fases F1–F7)
    'cambios', 'rentabilidad', 'fiscal', 'compras', 'estimaciones',
    'bitacora', 'programa', 'cumplimiento', 'subcontratos',
    'seguridad', 'postventa', 'herramienta',
    -- Listas de material (0050)
    'listas'
  ]::text[]
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. La lista: varias por obra
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.lista_material (
  id                 uuid primary key,   -- lo genera el cliente: un reintento no duplica
  empresa_id         uuid not null references public.empresas(id) on delete cascade,
  obra_id            uuid not null references public.obras(id)    on delete cascade,

  titulo             text not null default '',
  -- Clave u hoja del plano de donde sale la lista («E-03»): con eso el que
  -- palomea sabe contra qué papel revisar.
  plano              text not null default '',
  fecha              bigint not null default (extract(epoch from now()) * 1000)::bigint,
  estado             text not null default 'ABIERTA',
  notas              text not null default '',
  orden              bigint not null default 0,

  created_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  server_updated_at  bigint not null default 0,
  deleted_at         bigint,

  constraint lista_material_estado check (estado in ('ABIERTA', 'CERRADA')),
  constraint lista_material_textos check (
    char_length(titulo) <= 200 and char_length(plano) <= 60
    and char_length(notas) <= 2000
  )
);

create index if not exists idx_lista_material_obra  on public.lista_material (obra_id);
create index if not exists idx_lista_material_orden on public.lista_material (empresa_id, orden);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Los renglones
-- ════════════════════════════════════════════════════════════════════════════
-- `tipo` en la fase 1:
--   PIEZA  cantidad × largo (m) → metros lineales; con `separacion_cm`, los
--          estribos por pieza (regla en `calculo` de cada plataforma).
--   LIBRE  cantidad + unidad, tal cual («30 bultos de cemento»).
-- El CHECK ya admite los tipos de las fases siguientes (VARILLA, MURO_BLOCK,
-- CONCRETO) para que un renglón que llegue de una versión más nueva no rebote;
-- sus columnas propias llegan con su migración.
create table if not exists public.lista_material_renglon (
  id                 uuid primary key,
  empresa_id         uuid not null references public.empresas(id)       on delete cascade,
  lista_id           uuid not null references public.lista_material(id) on delete cascade,

  -- Texto libre y no tabla aparte: la sección es lo que dice la nota
  -- («Trabes», «Pasillo»), y se ordena por el `orden` de sus renglones.
  seccion            text not null default '',
  tipo               text not null default 'PIEZA',
  descripcion        text not null default '',
  cantidad           double precision not null default 0,
  largo              double precision,          -- metros; solo PIEZA
  unidad             text not null default '',  -- solo LIBRE
  separacion_cm      double precision,          -- estribos: «estribo 25»
  nota               text not null default '',  -- «chica»

  -- La casilla. Quién y cuándo, para saber quién dio por bueno el renglón.
  marcado            boolean not null default false,
  marcado_por        uuid,
  marcado_por_nombre text not null default '',
  marcado_at         bigint,

  orden              bigint not null default 0,

  created_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  server_updated_at  bigint not null default 0,
  deleted_at         bigint,

  constraint lista_material_renglon_tipo check (
    tipo in ('PIEZA', 'LIBRE', 'VARILLA', 'MURO_BLOCK', 'CONCRETO')
  ),
  constraint lista_material_renglon_numeros check (
    cantidad >= 0 and cantidad < 1e9
    and (largo is null or (largo > 0 and largo < 1000))
    and (separacion_cm is null or (separacion_cm > 0 and separacion_cm < 1000))
  ),
  constraint lista_material_renglon_textos check (
    char_length(seccion) <= 120 and char_length(descripcion) <= 300
    and char_length(unidad) <= 20 and char_length(nota) <= 500
    and char_length(marcado_por_nombre) <= 200
  )
);

create index if not exists idx_lista_renglon_lista on public.lista_material_renglon (lista_id, orden);
create index if not exists idx_lista_renglon_orden on public.lista_material_renglon (empresa_id, orden);

-- ════════════════════════════════════════════════════════════════════════════
-- 4. RLS
-- ════════════════════════════════════════════════════════════════════════════
-- Es la cuenta de la obra, sin dinero:
--   admin, supervisor    → leen y escriben (el supervisor CREA listas: así el
--                          que está en obra lleva el orden — decisión del dueño)
--   residente            → lo mismo, solo en SUS obras (0042)
--   contador, compras,
--   almacén              → leen (compras y almacén surten lo que dice la lista)
--   colaborador, cliente → nada (sin policy no hay filas)
-- Las de escritura comprueban que el PADRE sea de la misma empresa (0019).
-- El borrado es lógico (`deleted_at`): pasa por las policies de update.
alter table public.lista_material         enable row level security;
alter table public.lista_material_renglon enable row level security;

drop policy if exists lista_material_read on public.lista_material;
create policy lista_material_read on public.lista_material
  for select using (
    public.auth_tiene_rol(empresa_id, 'admin', 'supervisor', 'contador', 'compras', 'almacen')
  );

drop policy if exists lista_material_insert on public.lista_material;
create policy lista_material_insert on public.lista_material
  for insert with check (
    public.auth_tiene_rol(empresa_id, 'admin', 'supervisor')
    and exists (
      select 1 from public.obras o
       where o.id = obra_id and o.empresa_id = lista_material.empresa_id
    )
  );

drop policy if exists lista_material_update on public.lista_material;
create policy lista_material_update on public.lista_material
  for update
  using (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor'))
  with check (
    public.auth_tiene_rol(empresa_id, 'admin', 'supervisor')
    and exists (
      select 1 from public.obras o
       where o.id = obra_id and o.empresa_id = lista_material.empresa_id
    )
  );

drop policy if exists lista_material_residente_read on public.lista_material;
create policy lista_material_residente_read on public.lista_material
  for select using (public.auth_residente_obra(empresa_id, obra_id));

drop policy if exists lista_material_residente_insert on public.lista_material;
create policy lista_material_residente_insert on public.lista_material
  for insert with check (public.auth_residente_obra(empresa_id, obra_id));

drop policy if exists lista_material_residente_update on public.lista_material;
create policy lista_material_residente_update on public.lista_material
  for update
  using (public.auth_residente_obra(empresa_id, obra_id))
  with check (public.auth_residente_obra(empresa_id, obra_id));

drop policy if exists lista_material_renglon_read on public.lista_material_renglon;
create policy lista_material_renglon_read on public.lista_material_renglon
  for select using (
    public.auth_tiene_rol(empresa_id, 'admin', 'supervisor', 'contador', 'compras', 'almacen')
  );

drop policy if exists lista_material_renglon_insert on public.lista_material_renglon;
create policy lista_material_renglon_insert on public.lista_material_renglon
  for insert with check (
    public.auth_tiene_rol(empresa_id, 'admin', 'supervisor')
    and exists (
      select 1 from public.lista_material l
       where l.id = lista_id and l.empresa_id = lista_material_renglon.empresa_id
    )
  );

drop policy if exists lista_material_renglon_update on public.lista_material_renglon;
create policy lista_material_renglon_update on public.lista_material_renglon
  for update
  using (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor'))
  with check (
    public.auth_tiene_rol(empresa_id, 'admin', 'supervisor')
    and exists (
      select 1 from public.lista_material l
       where l.id = lista_id and l.empresa_id = lista_material_renglon.empresa_id
    )
  );

drop policy if exists lista_material_renglon_residente_read on public.lista_material_renglon;
create policy lista_material_renglon_residente_read on public.lista_material_renglon
  for select using (exists (
    select 1 from public.lista_material l
     where l.id = lista_material_renglon.lista_id
       and l.empresa_id = lista_material_renglon.empresa_id
       and public.auth_residente_obra(l.empresa_id, l.obra_id)));

drop policy if exists lista_material_renglon_residente_insert on public.lista_material_renglon;
create policy lista_material_renglon_residente_insert on public.lista_material_renglon
  for insert with check (exists (
    select 1 from public.lista_material l
     where l.id = lista_material_renglon.lista_id
       and l.empresa_id = lista_material_renglon.empresa_id
       and public.auth_residente_obra(l.empresa_id, l.obra_id)));

drop policy if exists lista_material_renglon_residente_update on public.lista_material_renglon;
create policy lista_material_renglon_residente_update on public.lista_material_renglon
  for update
  using (exists (
    select 1 from public.lista_material l
     where l.id = lista_material_renglon.lista_id
       and l.empresa_id = lista_material_renglon.empresa_id
       and public.auth_residente_obra(l.empresa_id, l.obra_id)))
  with check (exists (
    select 1 from public.lista_material l
     where l.id = lista_material_renglon.lista_id
       and l.empresa_id = lista_material_renglon.empresa_id
       and public.auth_residente_obra(l.empresa_id, l.obra_id)));

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Sincronización con el móvil
-- ════════════════════════════════════════════════════════════════════════════
-- El móvil captura en obra sin señal: las dos tablas entran al sync genérico
-- (push de fila completa + pull por `server_updated_at`).
do $$
declare t text;
begin
  foreach t in array array['lista_material', 'lista_material_renglon'] loop
    execute format('drop trigger if exists trg_srv_upd on public.%I;', t);
    execute format(
      'create trigger trg_srv_upd before insert or update on public.%I '
      'for each row execute function public.set_server_updated_at();', t);
    execute format(
      'create index if not exists idx_%1$s_pull on public.%1$s (empresa_id, server_updated_at);', t);
  end loop;
end $$;
