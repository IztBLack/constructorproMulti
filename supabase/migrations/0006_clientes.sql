-- 0006_clientes.sql — Portal de clientes: tabla clientes, vínculo con obras/
-- cotizaciones, acceso por código con rol, y RLS de solo-lectura para rol cliente.
-- Depende de: 0001_tenancy.sql, 0002_schema.sql, 0003_rls.sql, 0004_vinculacion.sql
-- Correr en el SQL Editor de Supabase (proyecto vmkkkrlctakzzqebtyci) DESPUÉS de 0001-0005.

-- ══ 1. Tabla clientes (gestionada desde la web; el móvil no la sincroniza) ═══
create table if not exists public.clientes (
  id                 uuid primary key,
  empresa_id         uuid not null references public.empresas(id) on delete cascade,
  nombre             text not null default '',
  email              text not null default '',
  telefono           text not null default '',
  user_id            uuid references auth.users(id),  -- cuenta auth del cliente (null hasta vincular)
  created_at         bigint not null default 0,
  updated_at         bigint not null default 0,
  server_updated_at  bigint not null default 0,
  deleted_at         bigint
);
create index if not exists idx_clientes_empresa on public.clientes (empresa_id);
create index if not exists idx_clientes_user on public.clientes (user_id);

-- ══ 2. Vínculo cliente_id en obras y cotizaciones + avance de obra ═══════════
alter table public.obras
  add column if not exists cliente_id uuid references public.clientes(id) on delete set null;
alter table public.obras
  add column if not exists avance smallint not null default 0
    check (avance >= 0 and avance <= 100);
alter table public.cotizaciones
  add column if not exists cliente_id uuid references public.clientes(id) on delete set null;

-- ══ 3. Extender codigos_vinculacion: rol + cliente_id ════════════════════════
alter table public.codigos_vinculacion
  add column if not exists rol text not null default 'colaborador';
alter table public.codigos_vinculacion
  add column if not exists cliente_id uuid references public.clientes(id) on delete cascade;

-- ══ 4. canjear_codigo_vinculacion: honra rol y vincula al cliente ════════════
create or replace function public.canjear_codigo_vinculacion(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id  uuid;
  v_record   public.codigos_vinculacion%rowtype;
  v_now_ms   bigint;
  v_rol      text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'No autenticado');
  end if;

  select * into v_record from public.codigos_vinculacion where code = p_code;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Código no válido');
  end if;

  v_now_ms := (extract(epoch from now()) * 1000)::bigint;
  if v_record.expires_at < v_now_ms then
    return jsonb_build_object('ok', false, 'error', 'Código expirado');
  end if;
  if v_record.used_at is not null then
    return jsonb_build_object('ok', false, 'error', 'Código ya utilizado');
  end if;

  v_rol := coalesce(v_record.rol, 'colaborador');

  -- Vincular usuario a la empresa con el rol del código.
  insert into public.usuarios_empresa(user_id, empresa_id, rol)
  values (v_user_id, v_record.empresa_id, v_rol)
  on conflict (user_id, empresa_id) do nothing;

  -- Si el código es para un cliente concreto, ligar su cuenta auth al registro.
  if v_record.cliente_id is not null then
    update public.clientes
      set user_id = v_user_id, updated_at = v_now_ms
      where id = v_record.cliente_id;
  end if;

  update public.codigos_vinculacion
    set used_at = v_now_ms, used_by = v_user_id
    where code = p_code;

  return jsonb_build_object('ok', true, 'empresa_id', v_record.empresa_id::text, 'rol', v_rol);
end;
$$;

-- ══ 5. RLS ═══════════════════════════════════════════════════════════════════
alter table public.clientes enable row level security;

-- Staff (admin/supervisor) administra los clientes de su empresa.
drop policy if exists clientes_staff on public.clientes;
create policy clientes_staff on public.clientes
  for all
  using (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor'))
  with check (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor'));

-- El cliente puede leer su propio registro.
drop policy if exists clientes_self on public.clientes;
create policy clientes_self on public.clientes
  for select
  using (user_id = auth.uid());

-- Lecturas de solo-lectura para el rol cliente (además de las políticas _staff
-- existentes; RLS es permisivo = se combinan con OR). El cliente solo ve lo que
-- le pertenece: sus obras, cotizaciones, y el desglose/pagos de esas cotizaciones.
-- NO se le da acceso a colaboradores, asistencias, destajos, movimientos (caja),
-- nómina, catálogo ni puestos (las _staff de esas tablas excluyen a 'cliente').

drop policy if exists obras_cliente_read on public.obras;
create policy obras_cliente_read on public.obras
  for select
  using (cliente_id in (select id from public.clientes where user_id = auth.uid()));

drop policy if exists cotizaciones_cliente_read on public.cotizaciones;
create policy cotizaciones_cliente_read on public.cotizaciones
  for select
  using (cliente_id in (select id from public.clientes where user_id = auth.uid()));

drop policy if exists secciones_cliente_read on public.secciones;
create policy secciones_cliente_read on public.secciones
  for select
  using (cotizacion_id in (
    select id from public.cotizaciones
    where cliente_id in (select id from public.clientes where user_id = auth.uid())
  ));

drop policy if exists partidas_cliente_read on public.partidas;
create policy partidas_cliente_read on public.partidas
  for select
  using (seccion_id in (
    select s.id from public.secciones s
    join public.cotizaciones c on c.id = s.cotizacion_id
    where c.cliente_id in (select id from public.clientes where user_id = auth.uid())
  ));

drop policy if exists pagos_cliente_read on public.pagos;
create policy pagos_cliente_read on public.pagos
  for select
  using (cotizacion_id in (
    select id from public.cotizaciones
    where cliente_id in (select id from public.clientes where user_id = auth.uid())
  ));

-- Trigger de server_updated_at en clientes (consistencia; no se sincroniza al móvil).
drop trigger if exists trg_srv_upd on public.clientes;
create trigger trg_srv_upd before insert or update on public.clientes
  for each row execute function public.set_server_updated_at();
