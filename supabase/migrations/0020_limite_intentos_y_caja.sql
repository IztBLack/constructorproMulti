-- 0020_limite_intentos_y_caja.sql — Rate-limit del canje + proteger la caja
-- Depende de: 0006/0019 (canjear_codigo_vinculacion), 0003/0014 (movimientos_staff)
--
-- Dos arreglos que salieron de la auditoría y de la revisión de roles:
--   A) Limitar los intentos de canje de código, para que no se pueda sondear el
--      espacio de códigos por fuerza bruta.
--   B) Impedir que un colaborador BORRE físicamente movimientos de la caja.

-- ══════════════════════════════════════════════════════════════════════════════
-- A. Límite de intentos al canjear un código
-- ══════════════════════════════════════════════════════════════════════════════
-- `canjear_codigo_vinculacion` la puede llamar cualquier usuario autenticado, y
-- registrarse es libre. Con códigos de 6 dígitos (900K) y sin ningún tope, un
-- bot podía probar códigos en bucle durante la ventana de vida de un código y
-- acertar uno vivo de cualquier empresa.
--
-- Se cuenta por usuario (auth.uid()): tras 8 fallos en 15 minutos, se bloquea al
-- usuario 15 minutos. En cada acierto se borra su registro (contador a cero).
-- No frena a un atacante que fabrique miles de cuentas, pero eso choca contra el
-- rate-limit de registro de Supabase Auth; esta es la mitad que faltaba del lado
-- de la aplicación.

create table if not exists public.intentos_canje (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  intentos_fallidos int    not null default 0,
  ventana_inicio    bigint not null,   -- epoch ms del primer fallo de la tanda
  bloqueado_hasta   bigint             -- epoch ms; null si no está bloqueado
);

-- RLS activa y SIN policies: nadie la lee ni escribe directamente. Solo la tocan
-- las funciones SECURITY DEFINER de abajo, que se saltan RLS.
alter table public.intentos_canje enable row level security;

-- Constantes de política (en ms). 8 intentos, ventana y bloqueo de 15 min.
create or replace function public._registrar_canje_fallido(p_user uuid, p_now bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max      constant int    := 8;
  v_ventana  constant bigint := 15 * 60 * 1000;
  v_bloqueo  constant bigint := 15 * 60 * 1000;
  v_nuevos   int;
  v_inicio   bigint;
begin
  insert into public.intentos_canje (user_id, intentos_fallidos, ventana_inicio)
  values (p_user, 1, p_now)
  on conflict (user_id) do update
    -- Si la ventana anterior ya venció, esta es una tanda nueva: cuenta 1.
    set intentos_fallidos = case
          when public.intentos_canje.ventana_inicio < p_now - v_ventana then 1
          else public.intentos_canje.intentos_fallidos + 1 end,
        ventana_inicio = case
          when public.intentos_canje.ventana_inicio < p_now - v_ventana then p_now
          else public.intentos_canje.ventana_inicio end
  returning intentos_fallidos, ventana_inicio into v_nuevos, v_inicio;

  -- Al llegar al tope, se fija el bloqueo.
  if v_nuevos >= v_max then
    update public.intentos_canje
       set bloqueado_hasta = p_now + v_bloqueo
     where user_id = p_user;
  end if;
end $$;

-- Se reescribe el canje para consultar y alimentar el contador. La FIRMA y las
-- claves que devuelve NO cambian, así que la app móvil y la web siguen igual.
create or replace function public.canjear_codigo_vinculacion(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_user_id  uuid;
  v_record   public.codigos_vinculacion%rowtype;
  v_now_ms   bigint;
  v_rol      text;
  v_filas    int;
  v_rl       public.intentos_canje%rowtype;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'No autenticado');
  end if;

  v_now_ms := (extract(epoch from now()) * 1000)::bigint;

  -- ¿Bloqueado por intentos previos?
  select * into v_rl from public.intentos_canje where user_id = v_user_id;
  if v_rl.bloqueado_hasta is not null and v_rl.bloqueado_hasta > v_now_ms then
    return jsonb_build_object('ok', false,
      'error', 'Demasiados intentos fallidos. Espera unos minutos e intenta de nuevo.');
  end if;

  select * into v_record from public.codigos_vinculacion where code = p_code;
  if not found then
    perform public._registrar_canje_fallido(v_user_id, v_now_ms);
    return jsonb_build_object('ok', false, 'error', 'Código no válido');
  end if;

  if v_record.expires_at < v_now_ms then
    perform public._registrar_canje_fallido(v_user_id, v_now_ms);
    return jsonb_build_object('ok', false, 'error', 'Código expirado');
  end if;
  if v_record.used_at is not null then
    perform public._registrar_canje_fallido(v_user_id, v_now_ms);
    return jsonb_build_object('ok', false, 'error', 'Código ya utilizado');
  end if;

  v_rol := coalesce(v_record.rol, 'colaborador');

  insert into public.usuarios_empresa(user_id, empresa_id, rol)
  values (v_user_id, v_record.empresa_id, v_rol)
  on conflict (user_id, empresa_id) do nothing;

  -- Cliente concreto: se exige que sea de la MISMA empresa del código (0019).
  if v_record.cliente_id is not null then
    update public.clientes
       set user_id = v_user_id, updated_at = v_now_ms
     where id = v_record.cliente_id
       and empresa_id = v_record.empresa_id;

    get diagnostics v_filas = row_count;
    if v_filas = 0 then
      perform public._registrar_canje_fallido(v_user_id, v_now_ms);
      return jsonb_build_object('ok', false, 'error', 'El código no corresponde a un cliente de esta empresa.');
    end if;
  end if;

  update public.codigos_vinculacion
     set used_at = v_now_ms, used_by = v_user_id
   where code = p_code;

  -- Éxito: se limpia el contador de intentos de este usuario.
  delete from public.intentos_canje where user_id = v_user_id;

  return jsonb_build_object(
    'ok', true,
    'empresa_id', v_record.empresa_id::text,
    'rol', v_rol,
    'nombre_invitado', v_record.nombre_invitado
  );
end;
$function$;

revoke all on function public._registrar_canje_fallido(uuid, bigint) from public, anon, authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- B. El colaborador ya no puede BORRAR movimientos de la caja
-- ══════════════════════════════════════════════════════════════════════════════
-- 0014 dejó `movimientos` con la policy `for all` para los 3 roles de staff, así
-- que un colaborador podía INSERT, UPDATE y DELETE la caja. El DELETE ahí es
-- FÍSICO e irreversible.
--
-- QUÉ SE TOCA Y QUÉ NO, y por qué:
--   · La app móvil es CIEGA AL ROL: no comprueba permisos, confía en RLS. Y borra
--     con SOFT-DELETE (update deleted_at), nunca físico. La sincronización sube
--     los cambios con UPSERT (= UPDATE en conflicto).
--   · Por eso se le quita al colaborador SOLO el DELETE físico: la app nunca lo
--     usa, así que no se rompe nada del campo, y se cierra el único borrado
--     irreversible de dinero. Un movimiento "borrado" por soft-delete queda
--     recuperable por un admin; uno borrado físico, no.
--   · Se le CONSERVAN INSERT y UPDATE: son los que necesita para capturar en
--     obra y para que el soft-delete y el upsert de sincronización funcionen. Si
--     se le quitara el UPDATE, la captura de los peones dejaría de sincronizar.
--
-- (Cerrar además la edición/soft-delete de movimientos AJENOS por un colaborador
--  requiere una columna `created_by` y coordinar el cambio con la app móvil; se
--  deja para cuando se trabaje la paridad, no se hace a ciegas contra producción.)
drop policy if exists movimientos_staff on public.movimientos;

create policy movimientos_staff_read on public.movimientos
  for select using (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor', 'colaborador'));

create policy movimientos_staff_insert on public.movimientos
  for insert with check (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor', 'colaborador'));

create policy movimientos_staff_update on public.movimientos
  for update
  using      (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor', 'colaborador'))
  with check (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor', 'colaborador'));

-- El único cambio de fondo: el borrado FÍSICO queda para admin y supervisor.
create policy movimientos_staff_delete on public.movimientos
  for delete using (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor'));
