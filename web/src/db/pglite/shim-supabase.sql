-- shim-supabase.sql — Lo mínimo de Supabase para que las migraciones corran en PGlite
--
-- Supabase trae, antes de la primera migración nuestra, roles, esquemas y
-- funciones que las migraciones dan por hechos (`auth.uid()`, `storage.objects`,
-- `extensions.gen_random_bytes`…). PGlite es un Postgres pelón: no los tiene.
-- Este archivo los recrea CON LA MISMA FORMA que en Supabase, para que lo que se
-- pruebe aquí (sobre todo RLS) signifique lo mismo que en producción.
--
-- Qué se sacó de revisar las migraciones
-- (`grep -ohE "(auth|storage|extensions)\.[a-z_]+" supabase/migrations/*.sql`):
--   auth.uid, auth.users, storage.buckets, storage.objects, storage.foldername,
--   extensions.gen_random_bytes.
-- Se agregan también auth.jwt/auth.role/auth.email porque son las funciones de
-- Supabase que una migración nueva usaría con más probabilidad.
--
-- Lo que NO se imita (a propósito, no hace falta para probar SQL/RLS):
--   · GoTrue, PostgREST, Realtime, el servidor de Storage (subir archivos).
--   · Las columnas de `auth.users` que ninguna migración lee.
--   · pg_cron, pg_net, vault: ninguna migración los usa hoy. Si una nueva los
--     necesita, agrega aquí un stub y documéntalo.

-- ── 1. Roles de Supabase ────────────────────────────────────────────────────
-- `authenticated` es el rol con el que PostgREST ejecuta las consultas de un
-- usuario con sesión; `anon` sin sesión; `service_role` es la llave de servicio,
-- que en Supabase se salta RLS (BYPASSRLS).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

-- Permisos por defecto de Supabase sobre `public`: los tres roles tienen GRANT
-- sobre todo lo que se cree ahí; quien realmente decide qué filas ven es RLS.
-- Sin esto, un test de RLS fallaría por "permission denied" antes de llegar a
-- las policies, y no estaríamos probando lo que corre en producción.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

-- ── 2. Extensiones ──────────────────────────────────────────────────────────
-- En Supabase las extensiones viven en el esquema `extensions`. pgcrypto viene
-- como contrib de PGlite y se carga desde `crear-db.ts`; aquí solo se crea en el
-- mismo esquema que en producción, para que `extensions.gen_random_bytes(...)`
-- (0021, 0022, 0025) resuelva igual.
-- `gen_random_uuid()` es nativa desde PG13, no necesita pgcrypto.
create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated, service_role;
create extension if not exists pgcrypto with schema extensions;

-- ── 3. Esquema auth ─────────────────────────────────────────────────────────
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

-- Solo las columnas que las migraciones leen (0001 FK a id; 0018 email y
-- raw_user_meta_data; 0025 email). Igual que en Supabase, `authenticated` NO
-- tiene SELECT sobre esta tabla: solo se lee desde funciones SECURITY DEFINER.
create table if not exists auth.users (
  id                  uuid primary key,
  email               varchar(255),
  raw_user_meta_data  jsonb,
  created_at          timestamptz not null default now()
);

-- Las funciones leen los claims del JWT que PostgREST deja en variables de
-- sesión. Se aceptan las dos formas que Supabase ha usado: la vieja
-- (`request.jwt.claim.sub`) y la actual (`request.jwt.claims`, JSON completo).
-- `crear-db.ts → comoUsuario()` pone las dos.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

create or replace function auth.email() returns text
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$$;

create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

grant execute on all functions in schema auth to anon, authenticated, service_role;

-- ── 4. Esquema storage ──────────────────────────────────────────────────────
-- Tablas con las columnas de Supabase que las migraciones tocan (0007, 0024,
-- 0028) más las que usaría una policy nueva (owner, metadata). Subir archivos
-- de verdad no se puede probar aquí (eso es el servidor de Storage), pero una
-- policy de `storage.objects` sí: basta con insertar la fila como el usuario.
create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;

create table if not exists storage.buckets (
  id                  text primary key,
  name                text not null,
  owner               uuid,
  public              boolean default false,
  file_size_limit     bigint,
  allowed_mime_types  text[],
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

create table if not exists storage.objects (
  id                uuid primary key default gen_random_uuid(),
  bucket_id         text references storage.buckets (id),
  name              text,
  owner             uuid,
  metadata          jsonb,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  last_accessed_at  timestamptz default now(),
  unique (bucket_id, name)
);

-- En Supabase ambas tablas tienen RLS prendido y GRANT completo para los roles:
-- sin una policy, nadie ve nada.
alter table storage.buckets enable row level security;
alter table storage.objects enable row level security;
grant all on storage.buckets to anon, authenticated, service_role;
grant all on storage.objects to anon, authenticated, service_role;

-- Misma implementación que Supabase: las carpetas de la ruta, sin el archivo.
-- 'emp/cot/foto.jpg' → {emp,cot}. Las policies usan `[1]` = empresa_id.
create or replace function storage.foldername(name text) returns text[]
language plpgsql immutable as $$
declare
  _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1 : array_length(_parts, 1) - 1];
end
$$;

create or replace function storage.filename(name text) returns text
language plpgsql immutable as $$
declare
  _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[array_length(_parts, 1)];
end
$$;

create or replace function storage.extension(name text) returns text
language plpgsql immutable as $$
declare
  _parts text[];
  _filename text;
begin
  select string_to_array(name, '/') into _parts;
  select _parts[array_length(_parts, 1)] into _filename;
  return reverse(split_part(reverse(_filename), '.', 1));
end
$$;

grant execute on all functions in schema storage to anon, authenticated, service_role;
