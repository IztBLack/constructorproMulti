-- 0025_invitar_socio_por_correo.sql — Invitar SOCIOS (admin) por correo
-- Depende de: 0004 (codigos_vinculacion), 0018/0020/0021/0022 (invitar/canjear/rol)
--
-- Hasta ahora invitar a alguien generaba un código de 6 dígitos que el dueño
-- dictaba, y el rol admin solo se alcanzaba ASCENDIENDO a un invitado. El dueño
-- pidió invitar SOCIOS (administradores) por correo, estilo Teams: mete el correo
-- del socio y a este le llega un enlace; al abrirlo, ya entra como administrador.
--
-- Se hace SIN la llave `service_role` (que el proyecto evita a propósito para no
-- ampliar el radio de daño): el correo lo dispara el magic link PÚBLICO de
-- Supabase Auth (`signInWithOtp`) desde el navegador. Aquí solo se (1) guarda la
-- invitación pendiente ligada al correo y (2) se concilia por correo cuando el
-- socio aterriza en `/auth/callback`.

-- ── 1. A quién va dirigida la invitación ─────────────────────────────────────
-- Nullable: los códigos dictados a mano (invitar_usuario) no llevan correo. La
-- columna es aditiva → el móvil la ignora (no viaja en su sincronización).
alter table public.codigos_vinculacion
  add column if not exists email_invitado text;

-- ── 2. Crear la invitación de socio (admin) ──────────────────────────────────
-- Solo un admin de la empresa. Reusa el generador de código numérico de
-- 0021/0022: el `code` cumple la PK y sirve de respaldo manual si el correo no
-- llega, pero el canal real es el correo — la conciliación de /auth/callback es
-- por email, no por código en la URL.
create or replace function public.invitar_socio(p_nombre text, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa uuid;
  v_email   text;
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
    return jsonb_build_object('ok', false, 'error', 'Solo un administrador puede invitar socios.');
  end if;

  if p_nombre is null or trim(p_nombre) = '' then
    return jsonb_build_object('ok', false, 'error', 'Escribe el nombre del socio.');
  end if;

  v_email := lower(trim(coalesce(p_email, '')));
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('ok', false, 'error', 'Escribe un correo válido.');
  end if;

  v_expira := (extract(epoch from now()) * 1000)::bigint + (72 * 60 * 60 * 1000);

  for v_intento in 1..10 loop
    v_code := (1 + get_byte(extensions.gen_random_bytes(1), 0) % 9)::text;
    for i in 1..5 loop
      v_code := v_code || (get_byte(extensions.gen_random_bytes(1), 0) % 10)::text;
    end loop;

    begin
      insert into public.codigos_vinculacion
        (code, empresa_id, created_by, expires_at, rol, nombre_invitado, email_invitado, tipo)
      values
        (v_code, v_empresa, auth.uid(), v_expira, 'admin', trim(p_nombre), v_email, 'personal');
      return jsonb_build_object('ok', true, 'code', v_code, 'expires_at', v_expira, 'email', v_email);
    exception when unique_violation then
      -- código repetido: reintenta con otro
    end;
  end loop;

  return jsonb_build_object('ok', false, 'error', 'No se pudo generar la invitación. Intenta de nuevo.');
end $$;

revoke all on function public.invitar_socio(text, text) from public, anon;
grant execute on function public.invitar_socio(text, text) to authenticated;

-- ── 3. Conciliar la invitación por correo al aterrizar ───────────────────────
-- La llama /auth/callback tras crear la sesión del magic link. Empareja por el
-- correo del usuario recién autenticado (NO por un código en la URL): el magic
-- link ya probó que controla ese buzón. Idempotente y sin superficie de fuerza
-- bruta (cada quien solo puede conciliar SU propio correo), por eso no usa el
-- límite de intentos de 0020.
create or replace function public.canjear_invitacion_por_correo()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_email   text;
  v_now_ms  bigint;
  v_record  public.codigos_vinculacion%rowtype;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'No autenticado');
  end if;

  select lower(u.email) into v_email from auth.users u where u.id = v_user_id;
  if v_email is null then
    return jsonb_build_object('ok', false, 'error', 'La cuenta no tiene correo.');
  end if;

  v_now_ms := (extract(epoch from now()) * 1000)::bigint;

  -- La más reciente pendiente y vigente para este correo.
  select * into v_record
    from public.codigos_vinculacion
   where lower(email_invitado) = v_email
     and used_at is null
     and expires_at >= v_now_ms
   order by expires_at desc
   limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'No hay invitación pendiente para este correo.');
  end if;

  insert into public.usuarios_empresa(user_id, empresa_id, rol)
  values (v_user_id, v_record.empresa_id, coalesce(v_record.rol, 'admin'))
  on conflict (user_id, empresa_id) do nothing;

  update public.codigos_vinculacion
     set used_at = v_now_ms, used_by = v_user_id
   where code = v_record.code;

  return jsonb_build_object(
    'ok', true,
    'empresa_id', v_record.empresa_id::text,
    'rol', coalesce(v_record.rol, 'admin')
  );
end $$;

revoke all on function public.canjear_invitacion_por_correo() from public, anon;
grant execute on function public.canjear_invitacion_por_correo() to authenticated;
