-- 0004_vinculacion.sql — Códigos de vinculación QR/manual para incorporar colaboradores
-- Depende de: 0001_tenancy.sql (empresas, usuarios_empresa, auth_tiene_rol)
-- Correr DESPUÉS de 0001/0002/0003.

-- ── Tabla codigos_vinculacion ─────────────────────────────────────────────────
create table if not exists public.codigos_vinculacion (
  code        text primary key,           -- 6 dígitos como string, ej. "482931"
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  created_by  uuid not null references auth.users(id),
  expires_at  bigint not null,            -- epoch ms (Date.now() + 10 min)
  used_at     bigint,                     -- null = todavía no usado
  used_by     uuid references auth.users(id)
);

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table public.codigos_vinculacion enable row level security;

-- SELECT: solo el creador puede ver sus propios códigos
create policy codigos_vinculacion_select on public.codigos_vinculacion
  for select
  using (created_by = auth.uid());

-- INSERT: cualquier usuario autenticado puede insertar (la web lo hace desde browser)
create policy codigos_vinculacion_insert on public.codigos_vinculacion
  for insert
  with check (auth.uid() is not null);

-- UPDATE y DELETE: no se exponen políticas públicas.
-- El UPDATE lo ejecuta la RPC canjear_codigo_vinculacion con SECURITY DEFINER.

-- ── RPC canjear_codigo_vinculacion ────────────────────────────────────────────
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
begin
  -- 1. Obtener usuario autenticado
  v_user_id := auth.uid();
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'No autenticado');
  end if;

  -- 2. Buscar el código
  select * into v_record
  from public.codigos_vinculacion
  where code = p_code;

  -- 3. Código no existe
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Código no válido');
  end if;

  -- 4. Verificar expiración
  v_now_ms := (extract(epoch from now()) * 1000)::bigint;
  if v_record.expires_at < v_now_ms then
    return jsonb_build_object('ok', false, 'error', 'Código expirado');
  end if;

  -- 5. Verificar que no haya sido usado
  if v_record.used_at is not null then
    return jsonb_build_object('ok', false, 'error', 'Código ya utilizado');
  end if;

  -- 6. Vincular usuario a la empresa como colaborador
  insert into public.usuarios_empresa(user_id, empresa_id, rol)
  values (v_user_id, v_record.empresa_id, 'colaborador')
  on conflict (user_id, empresa_id) do nothing;

  -- 7. Marcar código como usado
  update public.codigos_vinculacion
  set used_at = v_now_ms,
      used_by = v_user_id
  where code = p_code;

  -- 8. Retornar éxito con empresa_id
  return jsonb_build_object('ok', true, 'empresa_id', v_record.empresa_id::text);
end;
$$;

-- INSTRUCCIONES: pega este archivo en el SQL Editor de Supabase dashboard
-- (proyecto vmkkkrlctakzzqebtyci). El SQL Editor tiene permisos de superuser.
