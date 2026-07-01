-- 0001_tenancy.sql — Multitenant + roles + helpers de auth
-- Correr ANTES de 0002/0003. Requiere el esquema `auth` de Supabase (ya existe).

-- ── Empresas (el tenant) ──────────────────────────────────────────────────
create table if not exists public.empresas (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  plan        text not null default 'free',
  created_at  bigint not null default (extract(epoch from now()) * 1000)::bigint
);

-- ── Pertenencia usuario ↔ empresa, con rol ────────────────────────────────
-- rol: admin | supervisor | colaborador | cliente
create table if not exists public.usuarios_empresa (
  user_id     uuid not null references auth.users (id) on delete cascade,
  empresa_id  uuid not null references public.empresas (id) on delete cascade,
  rol         text not null default 'colaborador'
                check (rol in ('admin', 'supervisor', 'colaborador', 'cliente')),
  created_at  bigint not null default (extract(epoch from now()) * 1000)::bigint,
  primary key (user_id, empresa_id)
);

create index if not exists idx_usuarios_empresa_user on public.usuarios_empresa (user_id);

-- ── Helpers de auth para RLS ──────────────────────────────────────────────
-- Empresas a las que pertenece el usuario actual.
create or replace function public.auth_empresa_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select empresa_id from public.usuarios_empresa where user_id = auth.uid();
$$;

-- ¿El usuario actual tiene alguno de estos roles en esa empresa?
create or replace function public.auth_tiene_rol(p_empresa uuid, variadic p_roles text[])
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.usuarios_empresa
    where user_id = auth.uid()
      and empresa_id = p_empresa
      and rol = any(p_roles)
  );
$$;

-- RLS de las tablas de tenancy: el usuario solo se ve a sí mismo / sus empresas.
alter table public.empresas enable row level security;
alter table public.usuarios_empresa enable row level security;

create policy empresas_select on public.empresas
  for select using (id in (select public.auth_empresa_ids()));

create policy usuarios_empresa_self on public.usuarios_empresa
  for select using (user_id = auth.uid()
                    or empresa_id in (select public.auth_empresa_ids()));

-- ── Bootstrap (correr UNA vez, ajustando) ─────────────────────────────────
-- 1) Crea tu empresa:
--    insert into public.empresas (nombre) values ('Mi Constructora') returning id;
-- 2) Vincúlate como admin (usa tu user_id de Auth → Users, y el id de arriba):
--    insert into public.usuarios_empresa (user_id, empresa_id, rol)
--      values ('<tu-user-uuid>', '<empresa-uuid>', 'admin');
