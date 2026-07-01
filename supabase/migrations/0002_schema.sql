-- 0002_schema.sql — Espejo de las 13 tablas Drift con columnas de sync.
-- Convenciones: id uuid; fechas/timestamps = bigint (epoch ms, igual que Drift);
-- FKs DEFERRABLE INITIALLY DEFERRED (el push en lote no truena por orden).
-- `server_updated_at` lo sella un trigger; el cliente nunca lo escribe.
-- Las referencias cruzadas opcionales (cotizacion_origen_id, movimientos.*_id…)
-- se dejan como uuid sin FK a propósito (evitan ciclos y dolor de orden en sync).

-- ── Trigger: sella server_updated_at en cada insert/update ────────────────
create or replace function public.set_server_updated_at()
returns trigger language plpgsql as $$
begin
  new.server_updated_at := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  return new;
end;
$$;

-- ── puestos ───────────────────────────────────────────────────────────────
create table if not exists public.puestos (
  id                  uuid primary key,
  nombre              text not null,
  salario_dia_default double precision not null default 0,
  empresa_id          uuid not null references public.empresas(id) on delete cascade,
  created_at          bigint not null default 0,
  updated_at          bigint not null default 0,
  server_updated_at   bigint not null default 0,
  deleted_at          bigint
);

-- ── colaboradores ───────────────────────────────────────────────────────--
create table if not exists public.colaboradores (
  id                   uuid primary key,
  nombre               text not null,
  puesto_id            uuid not null,
  tipo_pago            text not null,            -- 'DIA' | 'DESTAJO'
  telefono             text not null default '',
  contacto_nombre      text not null default '',
  contacto_telefono    text not null default '',
  contacto_parentesco  text not null default '',
  activo               boolean not null default true,
  salario_personalizado double precision,
  empresa_id           uuid not null references public.empresas(id) on delete cascade,
  created_at           bigint not null default 0,
  updated_at           bigint not null default 0,
  server_updated_at    bigint not null default 0,
  deleted_at           bigint,
  constraint fk_colab_puesto foreign key (puesto_id)
    references public.puestos(id) deferrable initially deferred
);

-- ── obras ───────────────────────────────────────────────────────────────--
create table if not exists public.obras (
  id                    uuid primary key,
  nombre                text not null,
  cliente               text not null default '',
  ubicacion             text not null default '',
  fecha_inicio          bigint not null,
  activa                boolean not null default true,
  cotizacion_origen_id  uuid,                    -- sin FK (cruce opcional)
  pdf_config_json       text,
  empresa_id            uuid not null references public.empresas(id) on delete cascade,
  created_at            bigint not null default 0,
  updated_at            bigint not null default 0,
  server_updated_at     bigint not null default 0,
  deleted_at            bigint
);

-- ── cotizaciones ────────────────────────────────────────────────────────--
create table if not exists public.cotizaciones (
  id                 uuid primary key,
  cliente            text not null,
  nombre_proyecto    text not null,
  ubicacion          text not null default '',
  fecha              bigint not null,
  estado             text not null default 'BORRADOR',
  iva_enabled        boolean not null default true,
  descuento          double precision not null default 0,
  notas              text not null default '',
  obra_id            uuid,                        -- sin FK (cruce opcional)
  pdf_config_json    text,
  empresa_id         uuid not null references public.empresas(id) on delete cascade,
  created_at         bigint not null default 0,
  updated_at         bigint not null default 0,
  server_updated_at  bigint not null default 0,
  deleted_at         bigint
);

-- ── secciones ───────────────────────────────────────────────────────────--
create table if not exists public.secciones (
  id                 uuid primary key,
  cotizacion_id      uuid not null,
  nombre             text not null,
  orden              integer not null default 0,
  empresa_id         uuid not null references public.empresas(id) on delete cascade,
  created_at         bigint not null default 0,
  updated_at         bigint not null default 0,
  server_updated_at  bigint not null default 0,
  deleted_at         bigint,
  constraint fk_sec_cot foreign key (cotizacion_id)
    references public.cotizaciones(id) deferrable initially deferred
);

-- ── partidas ────────────────────────────────────────────────────────────--
create table if not exists public.partidas (
  id                 uuid primary key,
  seccion_id         uuid not null,
  clave              text not null default '',
  descripcion        text not null,
  unidad             text not null default '',
  cantidad           double precision not null,
  precio_unitario    double precision not null,
  orden              integer not null default 0,
  empresa_id         uuid not null references public.empresas(id) on delete cascade,
  created_at         bigint not null default 0,
  updated_at         bigint not null default 0,
  server_updated_at  bigint not null default 0,
  deleted_at         bigint,
  constraint fk_part_sec foreign key (seccion_id)
    references public.secciones(id) deferrable initially deferred
);

-- ── pagos ───────────────────────────────────────────────────────────────--
create table if not exists public.pagos (
  id                 uuid primary key,
  cotizacion_id      uuid not null,
  fecha              bigint not null,
  monto              double precision not null,
  metodo             text not null,
  concepto           text not null,
  referencia         text,
  empresa_id         uuid not null references public.empresas(id) on delete cascade,
  created_at         bigint not null default 0,
  updated_at         bigint not null default 0,
  server_updated_at  bigint not null default 0,
  deleted_at         bigint,
  constraint fk_pago_cot foreign key (cotizacion_id)
    references public.cotizaciones(id) deferrable initially deferred
);

-- ── obra_colaborador (PK compuesta) ──────────────────────────────────────--
create table if not exists public.obra_colaborador (
  obra_id              uuid not null,
  colaborador_id       uuid not null,
  fecha_ingreso        bigint not null,
  fecha_salida         bigint,
  salario_dia_override double precision,
  empresa_id           uuid not null references public.empresas(id) on delete cascade,
  created_at           bigint not null default 0,
  updated_at           bigint not null default 0,
  server_updated_at    bigint not null default 0,
  deleted_at           bigint,
  primary key (obra_id, colaborador_id),
  constraint fk_oc_obra foreign key (obra_id)
    references public.obras(id) deferrable initially deferred,
  constraint fk_oc_colab foreign key (colaborador_id)
    references public.colaboradores(id) deferrable initially deferred
);

-- ── asistencias ─────────────────────────────────────────────────────────--
create table if not exists public.asistencias (
  id                 uuid primary key,
  colaborador_id     uuid not null,
  obra_id            uuid not null,
  fecha              bigint not null,
  fraccion           double precision not null,
  empresa_id         uuid not null references public.empresas(id) on delete cascade,
  created_at         bigint not null default 0,
  updated_at         bigint not null default 0,
  server_updated_at  bigint not null default 0,
  deleted_at         bigint,
  constraint uq_asist unique (colaborador_id, obra_id, fecha),
  constraint fk_asist_obra foreign key (obra_id)
    references public.obras(id) deferrable initially deferred,
  constraint fk_asist_colab foreign key (colaborador_id)
    references public.colaboradores(id) deferrable initially deferred
);

-- ── destajos ────────────────────────────────────────────────────────────--
create table if not exists public.destajos (
  id                 uuid primary key,
  colaborador_id     uuid not null,
  obra_id            uuid not null,
  fecha              bigint not null,
  concepto           text not null,
  monto              double precision not null,
  empresa_id         uuid not null references public.empresas(id) on delete cascade,
  created_at         bigint not null default 0,
  updated_at         bigint not null default 0,
  server_updated_at  bigint not null default 0,
  deleted_at         bigint,
  constraint fk_dest_obra foreign key (obra_id)
    references public.obras(id) deferrable initially deferred,
  constraint fk_dest_colab foreign key (colaborador_id)
    references public.colaboradores(id) deferrable initially deferred
);

-- ── movimientos ─────────────────────────────────────────────────────────--
create table if not exists public.movimientos (
  id                 uuid primary key,
  obra_id            uuid not null,
  fecha              bigint not null,
  tipo               text not null,              -- 'ENTRADA' | 'SALIDA'
  categoria          text not null,
  concepto           text not null,
  monto              double precision not null,
  metodo_pago        text not null,
  referencia         text not null default '',
  nomina_id          uuid,                        -- cruces opcionales sin FK
  cotizacion_id      uuid,
  seccion_id         uuid,
  partida_id         uuid,
  empresa_id         uuid not null references public.empresas(id) on delete cascade,
  created_at         bigint not null default 0,
  updated_at         bigint not null default 0,
  server_updated_at  bigint not null default 0,
  deleted_at         bigint,
  constraint fk_mov_obra foreign key (obra_id)
    references public.obras(id) deferrable initially deferred
);

-- ── catalogo_conceptos ──────────────────────────────────────────────────--
create table if not exists public.catalogo_conceptos (
  id                       uuid primary key,
  clave                    text not null,
  descripcion              text not null,
  unidad                   text not null,
  precio_unitario_default  double precision not null default 0,
  categoria                text not null,
  es_personalizado         boolean not null default false,
  empresa_id               uuid not null references public.empresas(id) on delete cascade,
  created_at               bigint not null default 0,
  updated_at               bigint not null default 0,
  server_updated_at        bigint not null default 0,
  deleted_at               bigint
);

-- ── archivos_cotizacion ─────────────────────────────────────────────────--
create table if not exists public.archivos_cotizacion (
  id                 uuid primary key,
  cotizacion_id      uuid not null,
  tipo               text not null,
  nombre             text not null,
  uri                text not null,
  fecha_agregado     bigint not null,
  empresa_id         uuid not null references public.empresas(id) on delete cascade,
  created_at         bigint not null default 0,
  updated_at         bigint not null default 0,
  server_updated_at  bigint not null default 0,
  deleted_at         bigint,
  constraint fk_arch_cot foreign key (cotizacion_id)
    references public.cotizaciones(id) deferrable initially deferred
);

-- ── Triggers de server_updated_at + índices de cursor de pull ─────────────
do $$
declare t text;
begin
  foreach t in array array[
    'puestos','colaboradores','obras','cotizaciones','secciones','partidas',
    'pagos','obra_colaborador','asistencias','destajos','movimientos',
    'catalogo_conceptos','archivos_cotizacion'
  ] loop
    execute format(
      'drop trigger if exists trg_srv_upd on public.%I;', t);
    execute format(
      'create trigger trg_srv_upd before insert or update on public.%I '
      'for each row execute function public.set_server_updated_at();', t);
    -- Cursor de pull = (empresa_id, server_updated_at).
    execute format(
      'create index if not exists idx_%1$s_pull on public.%1$s (empresa_id, server_updated_at);', t);
  end loop;
end $$;
