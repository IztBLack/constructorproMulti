-- 0019_aislamiento_entre_empresas.sql — Cierra los cruces entre empresas
-- Depende de: 0006 (clientes, canjear_codigo_vinculacion), 0010 (portal cliente), 0018
--
-- Sale de una auditoría de seguridad posterior a 0018. Todos los hallazgos son de
-- la MISMA FAMILIA y conviene enunciarla de una vez, porque es el error que se
-- repite y el que hay que evitar al escribir policies nuevas:
--
--   Las policies de ESCRITURA validan `empresa_id` de la fila que se escribe,
--   pero nunca comprueban que la fila PADRE referenciada (cliente_id, obra_id,
--   cotizacion_id, seccion_id) sea de la misma empresa.
--   Las policies de LECTURA del rol `cliente` filtran solo por el PADRE, y nunca
--   por empresa.
--
-- Cruzando ambas cosas se pasa de una empresa a otra. Ninguna de las dos mitades
-- es explotable sola; juntas sí.

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. Helper: las empresas donde el usuario actual es CLIENTE
-- ══════════════════════════════════════════════════════════════════════════════
-- Hermana de `auth_empresa_ids()` (0001) pero por la vía de `clientes`, no de
-- `usuarios_empresa`. Igual que aquella, es SECURITY DEFINER para poder
-- consultarse DENTRO de las policies sin provocar recursión de RLS.
create or replace function public.auth_cliente_empresa_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select empresa_id from public.clientes
   where user_id = auth.uid() and deleted_at is null;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. El portal del cliente exige, además del padre, que la fila sea de SU empresa
-- ══════════════════════════════════════════════════════════════════════════════
-- ATAQUE QUE ESTO CIERRA: un supervisor de la empresa A que conozca el `obra_id`
-- de una obra de la empresa B podía insertar un movimiento con
-- `empresa_id = A` (que pasa su propio `with check`) y `obra_id = <obra de B>`
-- (que nadie comprobaba). El personal de B no veía esa fila —su RLS filtra por
-- empresa— pero el CLIENTE de B sí, porque su policy solo miraba la obra. O sea:
-- un tercero podía sembrar un pago falso en el estado de cuenta del cliente de
-- otra constructora, y el dueño de esa constructora ni siquiera podía verlo para
-- borrarlo.
--
-- Añadir la condición de empresa a la LECTURA del cliente corta el ataque por
-- donde tiene efecto, y de paso protege contra cualquier variante futura de la
-- misma idea sobre otra tabla.

drop policy if exists obras_cliente_read on public.obras;
create policy obras_cliente_read on public.obras
  for select using (
    empresa_id in (select public.auth_cliente_empresa_ids())
    and cliente_id in (select id from public.clientes where user_id = auth.uid())
  );

-- Además del aislamiento: se excluyen los BORRADOR. Que no salieran al portal lo
-- garantizaba SOLO un `.neq('estado','BORRADOR')` en TypeScript, así que un
-- cliente que consultara la API directamente con su propio token veía
-- cotizaciones que su contratista todavía no le manda — precios en negociación y
-- versiones descartadas. La regla del proyecto es que decide la base, no el filtro.
drop policy if exists cotizaciones_cliente_read on public.cotizaciones;
create policy cotizaciones_cliente_read on public.cotizaciones
  for select using (
    empresa_id in (select public.auth_cliente_empresa_ids())
    and cliente_id in (select id from public.clientes where user_id = auth.uid())
    and estado <> 'BORRADOR'
  );

drop policy if exists secciones_cliente_read on public.secciones;
create policy secciones_cliente_read on public.secciones
  for select using (
    empresa_id in (select public.auth_cliente_empresa_ids())
    and cotizacion_id in (
      select c.id from public.cotizaciones c
       where c.cliente_id in (select id from public.clientes where user_id = auth.uid())
         and c.estado <> 'BORRADOR'
    )
  );

drop policy if exists partidas_cliente_read on public.partidas;
create policy partidas_cliente_read on public.partidas
  for select using (
    empresa_id in (select public.auth_cliente_empresa_ids())
    and seccion_id in (
      select s.id from public.secciones s
       join public.cotizaciones c on c.id = s.cotizacion_id
       where c.cliente_id in (select id from public.clientes where user_id = auth.uid())
         and c.estado <> 'BORRADOR'
    )
  );

drop policy if exists pagos_cliente_read on public.pagos;
create policy pagos_cliente_read on public.pagos
  for select using (
    empresa_id in (select public.auth_cliente_empresa_ids())
    and cotizacion_id in (
      select c.id from public.cotizaciones c
       where c.cliente_id in (select id from public.clientes where user_id = auth.uid())
    )
  );

drop policy if exists obra_presupuesto_cliente_read on public.obra_presupuesto;
create policy obra_presupuesto_cliente_read on public.obra_presupuesto
  for select using (
    empresa_id in (select public.auth_cliente_empresa_ids())
    and obra_id in (
      select o.id from public.obras o
       where o.cliente_id in (select id from public.clientes where user_id = auth.uid())
    )
  );

-- El `tipo = 'ENTRADA'` se conserva TAL CUAL: es la regla de negocio de que el
-- cliente jamás ve las SALIDAS (lo que la constructora gasta). Solo se le suma
-- el aislamiento por empresa.
drop policy if exists movimientos_cliente_read on public.movimientos;
create policy movimientos_cliente_read on public.movimientos
  for select using (
    tipo = 'ENTRADA'
    and empresa_id in (select public.auth_cliente_empresa_ids())
    and obra_id in (
      select o.id from public.obras o
       where o.cliente_id in (select id from public.clientes where user_id = auth.uid())
    )
  );

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. Secuestro del portal de un cliente ajeno vía `cliente_id` (el más grave)
-- ══════════════════════════════════════════════════════════════════════════════
-- La policy de INSERT de 0018 valida `empresa_id` y `rol` pero NO `cliente_id`.
-- Y la RPC de canje, que es SECURITY DEFINER y se salta RLS, hacía
--     update clientes set user_id = ... where id = v_record.cliente_id;
-- sin comprobar que ese cliente fuera de la empresa del código.
--
-- ATAQUE: el admin de la constructora A emite un código de su propia empresa
-- pero con el `cliente_id` de un cliente de la constructora B, lo canjea con una
-- segunda cuenta, y se queda con el acceso al portal de ese cliente: sus obras,
-- cotizaciones con precios, presupuesto y pagos. De paso, el cliente legítimo
-- pierde su acceso, porque le pisan el `user_id`.
--
-- Se arregla en las DOS capas. La web ya validaba esto en TypeScript
-- (`lib/data/clientes.ts`), pero el atacante no tiene por qué pasar por la web.

drop policy if exists codigos_vinculacion_insert_gestion on public.codigos_vinculacion;
create policy codigos_vinculacion_insert_gestion on public.codigos_vinculacion
  for insert
  with check (
    (
      public.auth_tiene_rol(empresa_id, 'admin')
      or (
        public.auth_tiene_rol(empresa_id, 'supervisor')
        and rol in ('colaborador', 'cliente')
      )
    )
    -- El cliente al que se liga el código tiene que ser de ESTA empresa.
    and (
      cliente_id is null
      or exists (
        select 1 from public.clientes c
         where c.id = cliente_id and c.empresa_id = codigos_vinculacion.empresa_id
      )
    )
    -- Sin tope, un supervisor podía emitir un código con vencimiento en el año
    -- 3000: una puerta trasera permanente que le sobrevive a su propia baja.
    -- 7 días cubre de sobra la invitación de personal (72 h) y la de dispositivo.
    and expires_at <= (extract(epoch from now()) * 1000)::bigint + (7 * 24 * 60 * 60 * 1000)
    -- Y tiene que emitirlo a su nombre: `codigos_vinculacion_select` filtra por
    -- `created_by`, así que poniendo el de otro el código quedaba invisible para
    -- quien lo creó y atribuido a un compañero.
    and created_by = auth.uid()
  );

-- Misma comprobación dentro de la RPC. Además, si el código traía un cliente que
-- no es de esa empresa, ahora FALLA en vez de decir "ok" sin haber hecho nada:
-- un éxito falso es peor que un error, porque nadie lo investiga.
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

  -- Si el código es para un cliente concreto, ligar su cuenta al registro.
  -- El `and empresa_id = v_record.empresa_id` es la mitad crítica del arreglo:
  -- sin él, un código de la empresa A podía apropiarse de un cliente de la B.
  if v_record.cliente_id is not null then
    update public.clientes
       set user_id = v_user_id, updated_at = v_now_ms
     where id = v_record.cliente_id
       and empresa_id = v_record.empresa_id;

    get diagnostics v_filas = row_count;
    if v_filas = 0 then
      return jsonb_build_object('ok', false, 'error', 'El código no corresponde a un cliente de esta empresa.');
    end if;
  end if;

  update public.codigos_vinculacion
     set used_at = v_now_ms, used_by = v_user_id
   where code = p_code;

  return jsonb_build_object(
    'ok', true,
    'empresa_id', v_record.empresa_id::text,
    'rol', v_rol,
    'nombre_invitado', v_record.nombre_invitado
  );
end;
$function$;

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. "Invalidar códigos anteriores" no invalidaba nada
-- ══════════════════════════════════════════════════════════════════════════════
-- `web/src/app/admin/vincular/actions.ts` marca como usados los códigos vivos al
-- generar uno nuevo. Pero `codigos_vinculacion` NUNCA tuvo policy de UPDATE, así
-- que RLS lo denegaba en silencio. Y como un UPDATE que no afecta filas NO
-- devuelve error, la pantalla reportaba éxito. El admin llevaba tiempo confiando
-- en un mecanismo inexistente: los códigos viejos seguían vivos hasta expirar.
--
-- Se acota a marcar como usado (no a reescribir el código ni su rol): el
-- `with check` exige que la fila siga siendo de la misma empresa y que el rol no
-- cambie, así que esta policy no sirve para escalar privilegios.
drop policy if exists codigos_vinculacion_update_gestion on public.codigos_vinculacion;
create policy codigos_vinculacion_update_gestion on public.codigos_vinculacion
  for update
  using      (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor'))
  with check (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor'));
