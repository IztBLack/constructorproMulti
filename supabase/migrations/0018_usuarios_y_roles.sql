-- 0018_usuarios_y_roles.sql — Módulo de Usuarios y roles + endurecimiento de accesos
-- Depende de: 0001 (usuarios_empresa, auth_tiene_rol), 0004/0006/0013 (codigos_vinculacion),
--             0017 (empresa_config)
--
-- Esta migración hace DOS cosas que conviene no confundir:
--   A) Cierra agujeros de seguridad que ya estaban abiertos en producción.
--   B) Agrega lo necesario para dar de alta personal desde la web.
--
-- La parte (A) va primero a propósito: no tiene sentido construir una puerta
-- nueva mientras la pared sigue teniendo un hueco.
--
-- DECISIONES DEL DUEÑO (2026-07-20), que explican por qué todo es admin-only:
--   · Solo el admin administra usuarios. El supervisor no ve esa pantalla.
--   · Solo el admin cambia el IVA y la personalización del PDF: el IVA afecta el
--     dinero de todas las cotizaciones nuevas y el PDF es la marca frente al
--     cliente. Son decisiones de dueño, no de operación diaria.

-- ══════════════════════════════════════════════════════════════════════════════
-- PARTE A — SEGURIDAD
-- ══════════════════════════════════════════════════════════════════════════════

-- ── A.1 Escalada de privilegios en usuarios_empresa (CRÍTICA) ────────────────
-- 0005 creó:
--     create policy usuarios_empresa_insert_self ... with check (user_id = auth.uid());
-- El `with check` obliga a que la fila sea tuya, pero NO valida `empresa_id` ni
-- `rol`. Es decir: cualquier usuario autenticado —incluido un cliente del
-- portal— podía ejecutar
--     insert into usuarios_empresa values (auth.uid(), '<uuid-empresa>', 'admin')
-- y volverse administrador de una empresa ajena. El uuid de la empresa no es
-- secreto: cada usuario lo lee en su propia fila.
--
-- Se ELIMINA en vez de repararse. No hace falta ninguna policy de INSERT: las
-- dos únicas altas legítimas (`crear_empresa` de 0005 y
-- `canjear_codigo_vinculacion` de 0006) son SECURITY DEFINER y se saltan RLS.
-- Verificado antes de aplicar: no existe ni un solo `.insert` sobre
-- `usuarios_empresa` en la web ni en la app Flutter.
-- (Ya aplicado en producción el 2026-07-20; aquí queda para que el esquema sea
-- reproducible desde cero.)
drop policy if exists usuarios_empresa_insert_self on public.usuarios_empresa;

-- ── A.2 Un cliente podía listar a todo el personal ───────────────────────────
-- `usuarios_empresa_self` (0001) permite leer cualquier fila cuya empresa esté
-- en `auth_empresa_ids()`. Un cliente del portal TIENE membresía (rol
-- 'cliente'), así que podía enumerar los user_id y roles de toda la plantilla:
-- justamente el dato que hacía explotable A.1.
-- Ahora: cada quien ve SIEMPRE su propia fila; ver las de los demás queda
-- reservado al personal de oficina.
drop policy if exists usuarios_empresa_self on public.usuarios_empresa;
create policy usuarios_empresa_self on public.usuarios_empresa
  for select using (
    user_id = auth.uid()
    or public.auth_tiene_rol(empresa_id, 'admin', 'supervisor', 'colaborador')
  );

-- ── A.3 Un supervisor podía fabricarse un admin ──────────────────────────────
-- `codigos_vinculacion.rol` no tenía CHECK y la policy de 0013 solo validaba la
-- empresa, no el rol emitido. Un supervisor podía emitir un código con
-- rol='admin' y canjearlo con una segunda cuenta.
alter table public.codigos_vinculacion
  drop constraint if exists codigos_vinculacion_rol_valido;
alter table public.codigos_vinculacion
  add constraint codigos_vinculacion_rol_valido
  check (rol in ('admin', 'supervisor', 'colaborador', 'cliente'));

-- Quién puede emitir qué. Un supervisor sigue pudiendo invitar clientes y
-- colaboradores (lo necesita para operar), pero no puede crear pares ni jefes.
-- OJO: hay que BORRAR la policy anterior, no solo añadir la nueva. Postgres
-- combina las policies de un mismo comando con OR, así que una policy vieja más
-- permisiva conviviendo con la nueva anularía por completo la restricción.
-- El nombre real (`codigos_vinculacion_insert`) se verificó contra la base
-- antes de escribir esto; no se dedujo del historial de migraciones.
drop policy if exists codigos_vinculacion_insert on public.codigos_vinculacion;
drop policy if exists codigos_vinculacion_insert_gestion on public.codigos_vinculacion;
create policy codigos_vinculacion_insert_gestion on public.codigos_vinculacion
  for insert
  with check (
    public.auth_tiene_rol(empresa_id, 'admin')
    or (
      public.auth_tiene_rol(empresa_id, 'supervisor')
      and rol in ('colaborador', 'cliente')
    )
  );

-- ── A.4 Configuración de empresa: solo admin ─────────────────────────────────
-- 0017 dejó la escritura de `empresa_config` a admin Y supervisor. Por decisión
-- del dueño se restringe a admin: ahí viven el IVA (dinero) y la marca del PDF.
drop policy if exists empresa_config_insert_gestion on public.empresa_config;
drop policy if exists empresa_config_update_gestion on public.empresa_config;

create policy empresa_config_insert_admin on public.empresa_config
  for insert with check (public.auth_tiene_rol(empresa_id, 'admin'));

create policy empresa_config_update_admin on public.empresa_config
  for update
  using      (public.auth_tiene_rol(empresa_id, 'admin'))
  with check (public.auth_tiene_rol(empresa_id, 'admin'));

-- ══════════════════════════════════════════════════════════════════════════════
-- PARTE B — ALTA DE PERSONAL
-- ══════════════════════════════════════════════════════════════════════════════

-- ── B.1 Datos extra en la invitación ─────────────────────────────────────────
-- `nombre_invitado`: para mostrar "Invitación pendiente para Juan" en la lista.
-- `tipo`: distingue la invitación de personal (72 h, código largo) del código
-- de dispositivo/cliente que ya existía (10 min, 6 dígitos). Ambas con default
-- o anulables → no rompen las filas existentes ni el canje desde el móvil.
alter table public.codigos_vinculacion
  add column if not exists nombre_invitado text,
  add column if not exists tipo text not null default 'dispositivo';

-- ── B.2 La empresa nunca se queda sin administrador ──────────────────────────
-- Esta invariante NO se puede expresar en una policy: exige contar las otras
-- filas de la misma tabla, y una policy no puede tomar el candado que hace ese
-- conteo confiable. Dos admins degradándose a la vez pasarían ambos la
-- comprobación y la empresa quedaría con cero administradores — irrecuperable
-- sin entrar al editor SQL.
-- Por eso va como trigger: protege también contra SQL manual, no solo contra
-- el formulario de la web.
create or replace function public.exigir_admin_en_empresa()
returns trigger
language plpgsql
as $$
declare
  v_empresa   uuid;
  v_miembros  int;
  v_admins    int;
begin
  v_empresa := coalesce(old.empresa_id, new.empresa_id);

  select count(*), count(*) filter (where rol = 'admin')
    into v_miembros, v_admins
    from public.usuarios_empresa
   where empresa_id = v_empresa;

  -- Una empresa sin NINGÚN miembro es válida (se acaba de borrar la última
  -- membresía, o es una empresa recién creada). Lo que no puede existir es una
  -- empresa CON gente y SIN nadie que la administre.
  if v_miembros > 0 and v_admins = 0 then
    raise exception 'La empresa quedaría sin ningún administrador. Nombra a otro admin antes de hacer este cambio.';
  end if;

  return null;
end $$;

drop trigger if exists trg_exigir_admin on public.usuarios_empresa;
create constraint trigger trg_exigir_admin
  after update or delete on public.usuarios_empresa
  deferrable initially immediate
  for each row execute function public.exigir_admin_en_empresa();

-- ── B.3 Listar quién tiene acceso ────────────────────────────────────────────
-- `usuarios_empresa` solo guarda `user_id`: sin esto la pantalla mostraría
-- UUIDs. El correo y el nombre viven en `auth.users`, que NO es legible con la
-- llave anónima — de ahí que haga falta SECURITY DEFINER.
--
-- Es la única lectura de `auth.users` de todo el sistema, así que es la que hay
-- que mirar con lupa: NO recibe ningún parámetro (no hay nada que inyectar) y
-- deriva la empresa de `auth.uid()`, nunca del cliente.
create or replace function public.listar_usuarios_empresa()
returns table (
  user_id    uuid,
  email      text,
  nombre     text,
  rol        text,
  created_at bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare v_empresa uuid;
begin
  select ue.empresa_id into v_empresa
    from public.usuarios_empresa ue
   where ue.user_id = auth.uid() and ue.rol = 'admin'
   limit 1;

  if v_empresa is null then
    raise exception 'Solo un administrador puede ver la lista de usuarios.';
  end if;

  return query
    select ue.user_id,
           u.email::text,
           nullif(trim(coalesce(u.raw_user_meta_data->>'nombre', '')), ''),
           ue.rol,
           ue.created_at
      from public.usuarios_empresa ue
      join auth.users u on u.id = ue.user_id
     where ue.empresa_id = v_empresa
     order by ue.created_at;
end $$;

-- ── B.4 Invitar a alguien ────────────────────────────────────────────────────
-- Devuelve el código para que el admin se lo dicte por teléfono o WhatsApp.
--
-- No se puede invitar directamente como 'admin': se invita como supervisor o
-- colaborador y se asciende después. Así ascender a admin es siempre un acto
-- deliberado sobre una persona que ya está dentro y que ya se identificó, y no
-- algo que viaja en un código por WhatsApp.
--
-- El código es de 8 caracteres sobre un alfabeto de 32 sin símbolos ambiguos
-- (sin O/0/I/1/L, que se confunden al dictarlos). Son ~10^12 combinaciones:
-- necesario porque esta invitación dura 72 h —no puedes coordinar una llamada
-- de 10 minutos con alguien que está en obra— y `canjear_codigo_vinculacion`
-- todavía no limita intentos. Con 6 dígitos y 72 h sería sondeable.
create or replace function public.invitar_usuario(p_nombre text, p_rol text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa   uuid;
  v_code      text;
  v_alfabeto  text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_expira    bigint;
  i           int;
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

  v_code := '';
  for i in 1..8 loop
    -- `gen_random_bytes` es criptográficamente seguro; `random()` no lo es y no
    -- debe usarse para nada que autorice un acceso.
    v_code := v_code || substr(v_alfabeto, 1 + (get_byte(gen_random_bytes(1), 0) % length(v_alfabeto)), 1);
  end loop;

  v_expira := (extract(epoch from now()) * 1000)::bigint + (72 * 60 * 60 * 1000);

  insert into public.codigos_vinculacion
    (code, empresa_id, created_by, expires_at, rol, nombre_invitado, tipo)
  values
    (v_code, v_empresa, auth.uid(), v_expira, p_rol, trim(p_nombre), 'personal');

  return jsonb_build_object('ok', true, 'code', v_code, 'expires_at', v_expira);
end $$;

-- ── B.5 Cambiar el rol de alguien ────────────────────────────────────────────
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

  -- Cambiarse el rol a uno mismo queda prohibido, sin excepciones. El único
  -- caso legítimo —entregar la empresa a otra persona— se resuelve igual de
  -- bien en dos pasos: asciendo al otro a admin, y el otro me degrada a mí.
  -- Permitirlo "solo si queda otro admin" añade una carrera más que auditar por
  -- un caso que ocurre una vez en la vida de la empresa.
  if p_user_id = auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'No puedes cambiar tu propio rol. Pídeselo a otro administrador.');
  end if;

  if p_rol not in ('admin', 'supervisor', 'colaborador') then
    return jsonb_build_object('ok', false, 'error', 'Rol no válido.');
  end if;

  -- `for update` serializa a dos admins que actúen a la vez sobre la misma
  -- empresa: sin esto, ambos podrían leer "hay 2 admins" y degradarse en
  -- paralelo.
  select ue.rol into v_rol_actual
    from public.usuarios_empresa ue
   where ue.user_id = p_user_id and ue.empresa_id = v_empresa
   for update;

  if v_rol_actual is null then
    return jsonb_build_object('ok', false, 'error', 'Esa persona no pertenece a tu empresa.');
  end if;

  -- Un cliente del portal tiene su ficha en `clientes` ligada por `user_id`.
  -- Convertirlo en personal de oficina lo dejaría con acceso interno y un
  -- registro de cliente huérfano apuntándole. Los clientes se administran en
  -- /admin/clientes, no aquí.
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

-- ── B.6 Quitar el acceso ─────────────────────────────────────────────────────
-- Se BORRA la membresía; no se marca "inactivo" ni se toca la cuenta de Auth.
--   · Un flag `activo` sería la opción que parece prudente y es la insegura:
--     las decenas de policies del esquema pasan por `auth_tiene_rol`, que no
--     mira ningún flag. Habría que reescribir ese helper y reauditar 17
--     migraciones; cualquier rincón olvidado deja escribiendo a un usuario
--     "desactivado". El DELETE falla cerrado por construcción.
--   · Lo que esa persona capturó (asistencias, destajos, movimientos) NO se
--     pierde ni cambia: esas tablas se atribuyen por colaborador/obra/empresa,
--     ninguna tiene `created_by`.
--   · Salvedad honesta: su JWT sigue siendo válido hasta expirar, así que puede
--     seguir viendo unos minutos una pantalla ya cargada. RLS le niega todo
--     dato nuevo de inmediato y en la siguiente navegación el middleware lo saca.
create or replace function public.revocar_acceso_usuario(p_user_id uuid)
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
    return jsonb_build_object('ok', false, 'error', 'Solo un administrador puede quitar accesos.');
  end if;

  if p_user_id = auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'No puedes quitarte el acceso a ti mismo.');
  end if;

  select ue.rol into v_rol_actual
    from public.usuarios_empresa ue
   where ue.user_id = p_user_id and ue.empresa_id = v_empresa
   for update;

  if v_rol_actual is null then
    return jsonb_build_object('ok', false, 'error', 'Esa persona no pertenece a tu empresa.');
  end if;

  if v_rol_actual = 'admin' then
    select count(*) into v_admins
      from public.usuarios_empresa
     where empresa_id = v_empresa and rol = 'admin';

    if v_admins <= 1 then
      return jsonb_build_object('ok', false, 'error', 'Es el único administrador de la empresa.');
    end if;
  end if;

  delete from public.usuarios_empresa
   where user_id = p_user_id and empresa_id = v_empresa;

  return jsonb_build_object('ok', true);
end $$;

-- ── B.7 Permisos de ejecución ────────────────────────────────────────────────
-- Las funciones SECURITY DEFINER se ejecutan con los privilegios del dueño, así
-- que el control de quién puede llamarlas es parte del diseño. Todas validan el
-- rol por dentro; se conceden a `authenticated` y se niegan a `anon`.
revoke all on function public.listar_usuarios_empresa()            from public, anon;
revoke all on function public.invitar_usuario(text, text)          from public, anon;
revoke all on function public.cambiar_rol_usuario(uuid, text)      from public, anon;
revoke all on function public.revocar_acceso_usuario(uuid)         from public, anon;

grant execute on function public.listar_usuarios_empresa()         to authenticated;
grant execute on function public.invitar_usuario(text, text)       to authenticated;
grant execute on function public.cambiar_rol_usuario(uuid, text)   to authenticated;
grant execute on function public.revocar_acceso_usuario(uuid)      to authenticated;
