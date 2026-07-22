-- 0022_rol_contador.sql — Rol "contador" (tesorería)
-- Depende de: 0001 (usuarios_empresa), 0018/0021 (invitar/cambiar rol), 0020 (movimientos)
--
-- Nace del flujo real que describió el dueño: la contadora maneja las cuentas
-- donde entra el dinero del cliente, ejecuta los pagos que le indican, guarda los
-- comprobantes y concilia cuánto entró y cómo se repartió. NO es una auditora que
-- solo mira: es la TESORERA que captura el dinero.
--
-- Alcance decidido por el dueño:
--   · CAJA (movimientos + pagos): control total, incluido borrar. Es su Excel.
--   · Todo lo demás (obras, cotizaciones, presupuesto, catálogo, NÓMINA…): solo
--     lectura. Ve los montos a pagar pero no edita obras ni cotiza.
--   · Usuarios y configuración de empresa: nada.
--
-- Todo se hace con policies ADITIVAS (RLS combina con OR): se agregan permisos de
-- `contador` sin tocar las policies de los otros roles, así que no puede romper a
-- admin/supervisor/colaborador/cliente.

-- ── 1. Habilitar el rol en las restricciones ─────────────────────────────────
alter table public.usuarios_empresa drop constraint if exists usuarios_empresa_rol_check;
alter table public.usuarios_empresa add constraint usuarios_empresa_rol_check
  check (rol in ('admin', 'supervisor', 'colaborador', 'cliente', 'contador'));

alter table public.codigos_vinculacion drop constraint if exists codigos_vinculacion_rol_valido;
alter table public.codigos_vinculacion add constraint codigos_vinculacion_rol_valido
  check (rol in ('admin', 'supervisor', 'colaborador', 'cliente', 'contador'));

-- ── 2. Lectura: la contadora ve todo lo operativo de SU empresa ──────────────
-- Necesita ver cotizaciones y obras (a dónde va el dinero), colaboradores/puestos
-- y asistencias/destajos (la nómina, para saber cuánto pagar), y los clientes
-- (quién pagó). Se le da SELECT; el aislamiento por empresa lo sigue dando
-- `auth_tiene_rol(empresa_id, ...)`, igual que a los demás.
do $$
declare t text;
begin
  foreach t in array array[
    'obras','cotizaciones','secciones','partidas','pagos','obra_presupuesto',
    'catalogo_conceptos','puestos','colaboradores','clientes','archivos_cotizacion',
    'asistencias','destajos','obra_colaborador','movimientos',
    'cuadrillas','cuadrilla_miembro','asignacion_cuadrilla_obra','empresa_config'
  ] loop
    execute format('drop policy if exists %I on public.%I;', t || '_contador_read', t);
    execute format(
      'create policy %I on public.%I for select '
      'using (public.auth_tiene_rol(empresa_id, ''contador''));',
      t || '_contador_read', t);
  end loop;
end $$;

-- ── 3. Escritura de la CAJA: movimientos y pagos, control total ──────────────
-- Insert / update / delete. El delete físico aquí SÍ se le permite (a diferencia
-- del colaborador): es su herramienta de trabajo y el dueño confía en ella para
-- llevar las cuentas.
do $$
declare t text;
begin
  foreach t in array array['movimientos','pagos'] loop
    execute format('drop policy if exists %I on public.%I;', t || '_contador_insert', t);
    execute format(
      'create policy %I on public.%I for insert '
      'with check (public.auth_tiene_rol(empresa_id, ''contador''));',
      t || '_contador_insert', t);

    execute format('drop policy if exists %I on public.%I;', t || '_contador_update', t);
    execute format(
      'create policy %I on public.%I for update '
      'using (public.auth_tiene_rol(empresa_id, ''contador'')) '
      'with check (public.auth_tiene_rol(empresa_id, ''contador''));',
      t || '_contador_update', t);

    execute format('drop policy if exists %I on public.%I;', t || '_contador_delete', t);
    execute format(
      'create policy %I on public.%I for delete '
      'using (public.auth_tiene_rol(empresa_id, ''contador''));',
      t || '_contador_delete', t);
  end loop;
end $$;

-- ── 4. Permitir invitar/nombrar contadoras ───────────────────────────────────
-- `invitar_usuario` (reescrita aquí para aceptar 'contador' además de los otros).
-- Mantiene todo lo de 0021: 6 dígitos numéricos, reintento por colisión, 72 h.
create or replace function public.invitar_usuario(p_nombre text, p_rol text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa uuid;
  v_code    text;
  v_expira  bigint;
  v_intento int;
  i         int;
begin
  select ue.empresa_id into v_empresa
    from public.usuarios_empresa ue
   where ue.user_id = auth.uid() and ue.rol = 'admin'
   limit 1;

  if v_empresa is null then
    return jsonb_build_object('ok', false, 'error', 'Solo un administrador puede invitar usuarios.');
  end if;

  if p_rol is null or p_rol not in ('supervisor', 'colaborador', 'contador') then
    return jsonb_build_object('ok', false, 'error', 'El rol debe ser supervisor, colaborador o contador.');
  end if;

  if p_nombre is null or trim(p_nombre) = '' then
    return jsonb_build_object('ok', false, 'error', 'Escribe el nombre de la persona.');
  end if;

  v_expira := (extract(epoch from now()) * 1000)::bigint + (72 * 60 * 60 * 1000);

  for v_intento in 1..10 loop
    v_code := (1 + get_byte(extensions.gen_random_bytes(1), 0) % 9)::text;
    for i in 1..5 loop
      v_code := v_code || (get_byte(extensions.gen_random_bytes(1), 0) % 10)::text;
    end loop;

    begin
      insert into public.codigos_vinculacion
        (code, empresa_id, created_by, expires_at, rol, nombre_invitado, tipo)
      values
        (v_code, v_empresa, auth.uid(), v_expira, p_rol, trim(p_nombre), 'personal');
      return jsonb_build_object('ok', true, 'code', v_code, 'expires_at', v_expira);
    exception when unique_violation then
      -- reintenta
    end;
  end loop;

  return jsonb_build_object('ok', false, 'error', 'No se pudo generar un código único. Intenta de nuevo.');
end $$;

revoke all on function public.invitar_usuario(text, text) from public, anon;
grant execute on function public.invitar_usuario(text, text) to authenticated;

-- `cambiar_rol_usuario`: aceptar 'contador' como destino. Se conservan las
-- salvaguardas de 0018 (no tu propio rol, no dejar sin admin, no tocar clientes).
create or replace function public.cambiar_rol_usuario(p_user_id uuid, p_rol text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa    uuid;
  v_rol_actual text;
  v_admins     int;
begin
  select ue.empresa_id into v_empresa
    from public.usuarios_empresa ue
   where ue.user_id = auth.uid() and ue.rol = 'admin'
   limit 1;

  if v_empresa is null then
    return jsonb_build_object('ok', false, 'error', 'Solo un administrador puede cambiar roles.');
  end if;

  if p_user_id = auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'No puedes cambiar tu propio rol. Pídeselo a otro administrador.');
  end if;

  if p_rol not in ('admin', 'supervisor', 'colaborador', 'contador') then
    return jsonb_build_object('ok', false, 'error', 'Rol no válido.');
  end if;

  select ue.rol into v_rol_actual
    from public.usuarios_empresa ue
   where ue.user_id = p_user_id and ue.empresa_id = v_empresa
   for update;

  if v_rol_actual is null then
    return jsonb_build_object('ok', false, 'error', 'Esa persona no pertenece a tu empresa.');
  end if;

  if v_rol_actual = 'cliente' or p_rol = 'cliente' then
    return jsonb_build_object('ok', false, 'error', 'Los clientes del portal se administran desde Clientes.');
  end if;

  if v_rol_actual = 'admin' and p_rol <> 'admin' then
    select count(*) into v_admins
      from public.usuarios_empresa
     where empresa_id = v_empresa and rol = 'admin';
    if v_admins <= 1 then
      return jsonb_build_object('ok', false, 'error', 'Es el único administrador de la empresa. Nombra a otro antes de cambiarle el rol.');
    end if;
  end if;

  update public.usuarios_empresa
     set rol = p_rol
   where user_id = p_user_id and empresa_id = v_empresa;

  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.cambiar_rol_usuario(uuid, text) from public, anon;
grant execute on function public.cambiar_rol_usuario(uuid, text) to authenticated;
