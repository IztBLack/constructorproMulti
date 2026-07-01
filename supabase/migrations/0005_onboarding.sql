-- 0005_onboarding.sql — RPC crear_empresa + hardening de policies
-- Depende de: 0001_tenancy.sql, 0002_schema.sql, 0004_vinculacion.sql

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. RPC crear_empresa
--    Crea empresa + rol admin + catálogo base en una sola transacción atómica.
--    SECURITY DEFINER para poder escribir en empresas y usuarios_empresa
--    sin que el usuario tenga policies INSERT activas aún en esas tablas.
-- ══════════════════════════════════════════════════════════════════════════════
create or replace function public.crear_empresa(p_nombre text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id   uuid;
  v_empresa_id uuid;
  v_now       bigint;
begin
  -- 1. Usuario autenticado
  v_user_id := auth.uid();
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'No autenticado');
  end if;

  -- 2. Nombre obligatorio
  if p_nombre is null or trim(p_nombre) = '' then
    return jsonb_build_object('ok', false, 'error', 'El nombre de la empresa es obligatorio');
  end if;

  -- 3. El usuario no debe tener empresa preexistente
  if exists (
    select 1 from public.usuarios_empresa where user_id = v_user_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'Ya tienes una empresa asignada');
  end if;

  -- 4. Marca de tiempo única para todo el insert
  v_now        := (extract(epoch from now()) * 1000)::bigint;
  v_empresa_id := gen_random_uuid();

  -- 5. Crear empresa
  insert into public.empresas (id, nombre, plan, created_at)
  values (v_empresa_id, trim(p_nombre), 'free', v_now);

  -- 6. Vincular usuario como admin
  insert into public.usuarios_empresa (user_id, empresa_id, rol, created_at)
  values (v_user_id, v_empresa_id, 'admin', v_now);

  -- 7. Sembrar catálogo base canónico (10 conceptos de construcción)
  --    Columnas reales de catalogo_conceptos:
  --      id, clave, descripcion, unidad, precio_unitario_default,
  --      categoria, es_personalizado, empresa_id,
  --      created_at, updated_at, server_updated_at, deleted_at
  --    server_updated_at lo sella el trigger trg_srv_upd (0002_schema.sql).
  --    es_personalizado = false  → indica que viene del catálogo base.
  insert into public.catalogo_conceptos
    (id, clave, descripcion, unidad, precio_unitario_default,
     categoria, es_personalizado, empresa_id, created_at, updated_at)
  values
    (gen_random_uuid(), 'MAT-001', 'Cemento gris (saco 50 kg)',
     'SACO',    145.00, 'Materiales', false, v_empresa_id, v_now, v_now),

    (gen_random_uuid(), 'MAT-002', 'Varilla corrugada 3/8" (12 m)',
     'PIEZA',   110.00, 'Materiales', false, v_empresa_id, v_now, v_now),

    (gen_random_uuid(), 'MAT-003', 'Arena (m³)',
     'M3',      280.00, 'Materiales', false, v_empresa_id, v_now, v_now),

    (gen_random_uuid(), 'MAT-004', 'Grava 3/4" (m³)',
     'M3',      320.00, 'Materiales', false, v_empresa_id, v_now, v_now),

    (gen_random_uuid(), 'MAT-005', 'Block 15x20x40 cm',
     'PIEZA',     8.50, 'Materiales', false, v_empresa_id, v_now, v_now),

    (gen_random_uuid(), 'MO-001', 'Mano de obra albañil (jornal)',
     'JORNAL',  450.00, 'Mano de obra', false, v_empresa_id, v_now, v_now),

    (gen_random_uuid(), 'MO-002', 'Mano de obra ayudante (jornal)',
     'JORNAL',  300.00, 'Mano de obra', false, v_empresa_id, v_now, v_now),

    (gen_random_uuid(), 'SER-001', 'Excavación a mano (m³)',
     'M3',      250.00, 'Servicios',  false, v_empresa_id, v_now, v_now),

    (gen_random_uuid(), 'SER-002', 'Cimbra de madera (m²)',
     'M2',      180.00, 'Servicios',  false, v_empresa_id, v_now, v_now),

    (gen_random_uuid(), 'SER-003', 'Acarreo de escombro (viaje)',
     'VIAJE',   600.00, 'Servicios',  false, v_empresa_id, v_now, v_now);

  -- 8. Retornar éxito
  return jsonb_build_object('ok', true, 'empresa_id', v_empresa_id::text);
end;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. Endurecer policy INSERT de codigos_vinculacion
--    Solo admin/supervisor de esa empresa puede generar códigos.
--    Reemplaza la policy abierta de 0004 (auth.uid() is not null).
-- ══════════════════════════════════════════════════════════════════════════════
drop policy if exists codigos_vinculacion_insert on public.codigos_vinculacion;

create policy codigos_vinculacion_insert on public.codigos_vinculacion
  for insert
  to authenticated
  with check (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor'));

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. Defensa en profundidad — policies INSERT self-service
--    Cubren flujos que no pasen por la RPC (ej. migraciones manuales, tests).
--    Nota: "create policy if not exists" no existe en Postgres; usamos
--    drop + create para idempotencia segura.
-- ══════════════════════════════════════════════════════════════════════════════

-- empresas: cualquier usuario autenticado puede crear su propia empresa
drop policy if exists empresas_insert_auth on public.empresas;
create policy empresas_insert_auth on public.empresas
  for insert
  to authenticated
  with check (auth.uid() is not null);

-- usuarios_empresa: solo puede insertar su propia fila (user_id = yo mismo)
drop policy if exists usuarios_empresa_insert_self on public.usuarios_empresa;
create policy usuarios_empresa_insert_self on public.usuarios_empresa
  for insert
  to authenticated
  with check (user_id = auth.uid());

-- Correr en SQL Editor de Supabase (proyecto vmkkkrlctakzzqebtyci) DESPUÉS de 0001-0004.
