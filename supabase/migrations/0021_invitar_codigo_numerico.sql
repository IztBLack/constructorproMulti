-- 0021_invitar_codigo_numerico.sql — Un solo tipo de código para invitar
-- Depende de: 0018 (invitar_usuario), 0020 (rate-limit)
--
-- `invitar_usuario` (0018) generaba códigos de 8 caracteres ALFANUMÉRICOS. Eso
-- tiene un problema que solo se ve mirando la app: el campo de canje del móvil es
-- `keyboardType: number`, `digitsOnly`, `maxLength: 6`. Es decir, el celular SOLO
-- acepta 6 dígitos numéricos. Un colaborador invitado con un código de 8 letras
-- NO lo puede escribir en su teléfono — la invitación servía únicamente para
-- quien entrara por la web.
--
-- Se cambia a 6 dígitos numéricos, igual que los códigos de dispositivo/cliente.
-- Así un ÚNICO código sirve para las dos vías (móvil y web) y se elimina la
-- distinción que confundía. El espacio más chico (900K) lo cubre el rate-limit
-- de la 0020 (8 intentos / 15 min).
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

  if p_rol is null or p_rol not in ('supervisor', 'colaborador') then
    return jsonb_build_object('ok', false, 'error', 'El rol debe ser supervisor o colaborador.');
  end if;

  if p_nombre is null or trim(p_nombre) = '' then
    return jsonb_build_object('ok', false, 'error', 'Escribe el nombre de la persona.');
  end if;

  v_expira := (extract(epoch from now()) * 1000)::bigint + (72 * 60 * 60 * 1000);

  -- Hasta 10 reintentos si el código de 6 dígitos ya existe (colisión de PK).
  -- Con pocos códigos vivos frente a 900K combinaciones, es rarísimo, pero un
  -- insert único sin reintento fallaría de vez en cuando sin explicación.
  for v_intento in 1..10 loop
    -- 6 dígitos, dígito por dígito con CSPRNG. El primero es 1-9 para que no
    -- empiece en 0 (se pierde al dictarlo). `gen_random_bytes` vive en el
    -- esquema `extensions`; se cualifica porque el search_path es solo `public`.
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
      -- Código repetido: el bucle prueba con otro.
    end;
  end loop;

  return jsonb_build_object('ok', false, 'error', 'No se pudo generar un código único. Intenta de nuevo.');
end $$;

revoke all on function public.invitar_usuario(text, text) from public, anon;
grant execute on function public.invitar_usuario(text, text) to authenticated;
