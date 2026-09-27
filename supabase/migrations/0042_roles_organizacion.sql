-- 0042_roles_organizacion.sql — ORGANIZACIÓN GRANDE (fase F6)
-- Plan: docs/PLAN_ALCANCE_AMPLIADO.md §3 F6 (RR6.1, RF6.2, RF6.3, RF6.4).
-- Decisiones con su porqué: docs/PROGRESO_ALCANCE.md (D4 y F6-*).
-- Depende de: 0001 (usuarios_empresa, auth_tiene_rol), 0018/0021/0022/0025
--             (invitar/cambiar rol), 0019 (aislamiento, auth_cliente_empresa_ids),
--             0024 (bucket comprobantes), 0036 (extras + bucket extras),
--             0038 (compras), 0039 (avance/estimaciones), 0040 (subcontratos),
--             0041 (bitácora/programa). Lo que toca tablas de 0043 (seguridad,
--             garantías, herramienta) va en 0044, que corre DESPUÉS de 0043.
-- Aditivo e idempotente. NO toca ninguna policy de los roles que ya existen:
-- todo lo nuevo son policies ADITIVAS (RLS combina con OR), igual que el
-- contador en 0022. Las únicas funciones que se reescriben son las RPC de
-- personal (para aceptar los roles nuevos) y dos RPC de envío (extras y
-- órdenes de compra) para el visto bueno configurable; su comportamiento para
-- los roles de siempre queda IGUAL.
--
-- QUÉ ES
-- ──────
-- Una constructora con varias obras reparte el trabajo:
--   · RESIDENTE  (D4) = un supervisor limitado a SUS obras. Captura lo mismo
--                que el supervisor (asistencia, bitácora, avance, extras en
--                borrador, notas, seguridad, requisiciones, recepciones…), pero
--                solo ve y escribe en las obras que el admin le asignó en
--                `usuario_obra`. NO ve la utilidad (D1), ni datos fiscales, ni
--                datos IMSS, ni el expediente de subcontratistas, ni usuarios,
--                ni cotizaciones/clientes/pagos de cotización.
--   · COMPRAS    = el departamento de compras: proveedores, materiales,
--                requisiciones (las aprueba), órdenes de compra (las arma y las
--                emite con el visto bueno configurable) y recepciones. No paga
--                (eso sigue siendo admin/contador, F2-4/F2-7).
--   · ALMACÉN    = recibe material y lleva existencias y traspasos. Lee el
--                resto de compras. No ve pagos a proveedores. Precios: ver F6-9.
--   · COLABORADOR con obra asignada: puede ESCRIBIR y LEER la bitácora de sus
--                obras (lo que F4-2 dejó pendiente). Nada más cambia para él.
--
-- PIEZAS
-- ──────
--   1. Roles nuevos en los CHECK y en las RPC de personal.
--   2. `usuario_obra` + helpers `auth_tiene_obra` / `auth_obra_asignada`.
--   3. Policies aditivas del residente (tabla por tabla) y de Storage.
--   4. Bitácora para el colaborador con obra.
--   5. Policies de compras / almacén / residente sobre las tablas de 0038.
--   6. Visto bueno configurable (`regla_aprobacion`, `aprobacion`) con
--      enforcement en extras y órdenes de compra.
--   7. Registro de actividad (`actividad`), inmutable, por triggers.
--
-- ENDURECIMIENTO (revisión de seguridad, docs/PROGRESO_ALCANCE.md, SEG-*): lo
-- aditivo del residente no reabre lo que se cerró en 0036–0045:
--   · SEG-A1: el residente NO borra físicamente partidas del presupuesto (la
--     policy `obra_presupuesto_residente_delete` ya no se crea); tampoco borra
--     obras (nunca tuvo esa policy).
--   · SEG-M1: sus policies de borrado en Storage (extras, remisiones) respetan
--     el mismo candado de evidencia ligada que las de la oficina.
--   · SEG-M3: sus policies de movimientos de caja las ajusta 0045.
--
-- REVERSA (si hiciera falta): borrar las policies con sufijo `_residente`,
-- `_colab_obra`, `_compras`, `_almacen`, `_org_read`; los triggers
-- `trg_actividad` y `trg_usuario_obra_*`; las tablas `actividad`, `aprobacion`,
-- `regla_aprobacion`, `usuario_obra`; y volver a correr las versiones de
-- 0022/0036/0038 de las RPC reescritas aquí. Antes, degradar a `supervisor`
-- a los residentes y a `colaborador` a compras/almacén, o el CHECK de 0022 no
-- se podrá restaurar.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Roles nuevos
-- ════════════════════════════════════════════════════════════════════════════
alter table public.usuarios_empresa drop constraint if exists usuarios_empresa_rol_check;
alter table public.usuarios_empresa add constraint usuarios_empresa_rol_check
  check (rol in ('admin', 'supervisor', 'colaborador', 'cliente', 'contador',
                 'residente', 'compras', 'almacen'));

alter table public.codigos_vinculacion drop constraint if exists codigos_vinculacion_rol_valido;
alter table public.codigos_vinculacion add constraint codigos_vinculacion_rol_valido
  check (rol in ('admin', 'supervisor', 'colaborador', 'cliente', 'contador',
                 'residente', 'compras', 'almacen'));

-- 1a. Invitar (reescrita desde 0022: mismos 6 dígitos, reintentos y 72 h).
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

  if p_rol is null or p_rol not in ('supervisor', 'colaborador', 'contador',
                                    'residente', 'compras', 'almacen') then
    return jsonb_build_object('ok', false, 'error', 'Elige un rol válido para la persona.');
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

-- 1b. Cambiar rol (reescrita desde 0022; mismas salvaguardas de 0018).
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

  if p_rol is null or p_rol not in ('admin', 'supervisor', 'colaborador', 'contador',
                                    'residente', 'compras', 'almacen') then
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

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Obras asignadas a un usuario
-- ════════════════════════════════════════════════════════════════════════════
-- Una fila = "esta persona trabaja en esta obra". La usan el residente (D4) y
-- el colaborador con cuenta (bitácora). Quitar la asignación = borrado lógico
-- (`deleted_at`) o `hasta` en el pasado; así el registro de actividad conserva
-- quién tuvo qué obra y cuándo.
create table if not exists public.usuario_obra (
  id                 uuid primary key default gen_random_uuid(),
  empresa_id         uuid not null references public.empresas(id) on delete cascade,
  user_id            uuid not null,
  obra_id            uuid not null references public.obras(id)    on delete cascade,
  asignado_por       uuid,
  desde              bigint not null default (extract(epoch from now()) * 1000)::bigint,
  hasta              bigint,
  created_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  server_updated_at  bigint not null default 0,
  deleted_at         bigint,
  constraint usuario_obra_fechas check (hasta is null or hasta >= desde)
);

-- Una asignación viva por persona y obra.
create unique index if not exists uq_usuario_obra_viva
  on public.usuario_obra (user_id, obra_id) where deleted_at is null;
-- Lo que consulta el helper en cada fila que filtra la RLS.
create index if not exists idx_usuario_obra_user
  on public.usuario_obra (user_id, empresa_id, obra_id) where deleted_at is null;
create index if not exists idx_usuario_obra_obra on public.usuario_obra (obra_id);
create index if not exists idx_usuario_obra_srv on public.usuario_obra (empresa_id, server_updated_at);

drop trigger if exists trg_srv_upd on public.usuario_obra;
create trigger trg_srv_upd
  before insert or update on public.usuario_obra
  for each row execute function public.set_server_updated_at();

-- Sellos y reglas: quién asignó lo pone la base; la persona tiene que ser
-- residente o colaborador DE ESA empresa y la obra también de esa empresa. Un
-- trigger (no solo la policy) para que valga también por la llave de servicio.
create or replace function public.usuario_obra_reglas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if (new.id, new.empresa_id, new.user_id, new.obra_id, new.asignado_por)
       is distinct from (old.id, old.empresa_id, old.user_id, old.obra_id, old.asignado_por) then
      raise exception 'Una asignación no se mueve de persona ni de obra: quítala y haz otra.';
    end if;
    return new;
  end if;

  new.asignado_por := coalesce(auth.uid(), new.asignado_por);

  if not exists (
    select 1 from public.obras o where o.id = new.obra_id and o.empresa_id = new.empresa_id
  ) then
    raise exception 'Esa obra no es de tu empresa.';
  end if;

  if not exists (
    select 1 from public.usuarios_empresa ue
     where ue.user_id = new.user_id and ue.empresa_id = new.empresa_id
       and ue.rol in ('residente', 'colaborador')
  ) then
    raise exception 'Solo se asignan obras a residentes y colaboradores de tu empresa.';
  end if;
  return new;
end $$;

drop trigger if exists trg_usuario_obra_reglas on public.usuario_obra;
create trigger trg_usuario_obra_reglas
  before insert or update on public.usuario_obra
  for each row execute function public.usuario_obra_reglas();

alter table public.usuario_obra enable row level security;

drop policy if exists usuario_obra_read on public.usuario_obra;
create policy usuario_obra_read on public.usuario_obra
  for select using (
    public.auth_tiene_rol(empresa_id, 'admin') or user_id = auth.uid()
  );

drop policy if exists usuario_obra_insert on public.usuario_obra;
create policy usuario_obra_insert on public.usuario_obra
  for insert with check (
    public.auth_tiene_rol(empresa_id, 'admin')
    and exists (select 1 from public.obras o where o.id = obra_id and o.empresa_id = usuario_obra.empresa_id)
  );

drop policy if exists usuario_obra_update on public.usuario_obra;
create policy usuario_obra_update on public.usuario_obra
  for update
  using (public.auth_tiene_rol(empresa_id, 'admin'))
  with check (public.auth_tiene_rol(empresa_id, 'admin'));

drop policy if exists usuario_obra_delete on public.usuario_obra;
create policy usuario_obra_delete on public.usuario_obra
  for delete using (public.auth_tiene_rol(empresa_id, 'admin'));

-- Al quitarle el acceso a alguien (0018 borra la membresía) se cierran sus
-- asignaciones: si un día lo vuelven a invitar, no recupera obras viejas sin
-- que el admin se las vuelva a dar.
create or replace function public.usuario_obra_cerrar_al_salir()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.usuario_obra
     set deleted_at = (extract(epoch from now()) * 1000)::bigint,
         updated_at = (extract(epoch from now()) * 1000)::bigint
   where user_id = old.user_id and empresa_id = old.empresa_id and deleted_at is null;
  return null;
end $$;

drop trigger if exists trg_usuario_obra_cerrar on public.usuarios_empresa;
create trigger trg_usuario_obra_cerrar
  after delete on public.usuarios_empresa
  for each row execute function public.usuario_obra_cerrar_al_salir();

-- 2a. Helpers para RLS. SECURITY DEFINER + STABLE, como `auth_tiene_rol`.
-- Exigen además que la membresía siga viva y que la asignación esté vigente.

-- ¿El usuario actual tiene esa obra asignada (en cualquier rol)?
create or replace function public.auth_tiene_obra(p_obra uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.usuario_obra uo
      join public.usuarios_empresa ue
        on ue.user_id = uo.user_id and ue.empresa_id = uo.empresa_id
     where uo.user_id = auth.uid()
       and uo.obra_id = p_obra
       and uo.deleted_at is null
       and (uo.hasta is null or uo.hasta > (extract(epoch from now()) * 1000)::bigint)
  );
$$;

-- La versión que usan las policies: rol concreto EN ESA empresa + obra
-- asignada en ESA empresa. Pedir la empresa evita que alguien que es residente
-- en dos empresas cuelgue una fila de A bajo una obra de B (lección de 0019).
create or replace function public.auth_obra_asignada(p_empresa uuid, p_obra uuid, p_rol text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.usuario_obra uo
      join public.usuarios_empresa ue
        on ue.user_id = uo.user_id and ue.empresa_id = uo.empresa_id
     where uo.user_id = auth.uid()
       and uo.empresa_id = p_empresa
       and uo.obra_id = p_obra
       and ue.rol = p_rol
       and uo.deleted_at is null
       and (uo.hasta is null or uo.hasta > (extract(epoch from now()) * 1000)::bigint)
  );
$$;

-- Atajo del residente (se usa en casi todas las policies de abajo).
create or replace function public.auth_residente_obra(p_empresa uuid, p_obra uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.auth_obra_asignada(p_empresa, p_obra, 'residente');
$$;

-- Se conceden también a `anon`, igual que `auth_tiene_rol`: las policies no
-- llevan `to authenticated`, así que Postgres las evalúa también sin sesión; sin
-- el permiso, una consulta anónima reventaría con "permission denied" en vez de
-- devolver cero filas. Sin sesión `auth.uid()` es null y responden false.
revoke all on function public.auth_tiene_obra(uuid)                 from public;
revoke all on function public.auth_obra_asignada(uuid, uuid, text)  from public;
revoke all on function public.auth_residente_obra(uuid, uuid)       from public;
grant execute on function public.auth_tiene_obra(uuid)                to anon, authenticated;
grant execute on function public.auth_obra_asignada(uuid, uuid, text) to anon, authenticated;
grant execute on function public.auth_residente_obra(uuid, uuid)      to anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. RESIDENTE (D4): las policies del supervisor + filtro por obra
-- ════════════════════════════════════════════════════════════════════════════
-- Convención: `R(empresa_id, obra_id)` = `public.auth_residente_obra(...)`.
-- Como la obra asignada ya se validó de la misma empresa, R implica "la obra
-- es de esta empresa"; los demás padres (colaborador, presupuesto, cuadrilla…)
-- se siguen validando como en las policies del supervisor.

-- 3a. Lo de toda la empresa que el residente necesita para operar su obra, en
-- SOLO LECTURA (F6-3): la plantilla (para el pase de lista), puestos,
-- cuadrillas, el catálogo de conceptos (para capturar extras) y la
-- configuración (módulos, IVA y marca del PDF). No lee cotizaciones, clientes,
-- pagos de cotización, ni nada fiscal/IMSS/subcontratistas.
do $$
declare t text;
begin
  foreach t in array array[
    'colaboradores', 'puestos', 'cuadrillas', 'cuadrilla_miembro',
    'catalogo_conceptos', 'empresa_config'
  ] loop
    execute format('drop policy if exists %I on public.%I;', t || '_residente_read', t);
    execute format(
      'create policy %I on public.%I for select '
      'using (public.auth_tiene_rol(empresa_id, ''residente''));',
      t || '_residente_read', t);
  end loop;
end $$;

-- Sueldos: solo de la gente que trabaja en SUS obras (asignada o con
-- asistencia/destajo ahí). Con eso calcula la raya de su obra y nada más.
drop policy if exists colaborador_sueldo_residente_read on public.colaborador_sueldo;
create policy colaborador_sueldo_residente_read on public.colaborador_sueldo
  for select using (
    public.auth_tiene_rol(empresa_id, 'residente')
    and (
      exists (select 1 from public.obra_colaborador oc
               where oc.colaborador_id = colaborador_sueldo.colaborador_id
                 and oc.empresa_id = colaborador_sueldo.empresa_id
                 and oc.deleted_at is null
                 and public.auth_residente_obra(oc.empresa_id, oc.obra_id))
      or exists (select 1 from public.asistencias a
                  where a.colaborador_id = colaborador_sueldo.colaborador_id
                    and a.empresa_id = colaborador_sueldo.empresa_id
                    and a.deleted_at is null
                    and public.auth_residente_obra(a.empresa_id, a.obra_id))
      or exists (select 1 from public.destajos d
                  where d.colaborador_id = colaborador_sueldo.colaborador_id
                    and d.empresa_id = colaborador_sueldo.empresa_id
                    and d.deleted_at is null
                    and public.auth_residente_obra(d.empresa_id, d.obra_id))
    )
  );

-- 3b. La obra: la ve y la edita (avance, datos), no la crea ni la borra.
drop policy if exists obras_residente_read on public.obras;
create policy obras_residente_read on public.obras
  for select using (public.auth_residente_obra(empresa_id, id));

drop policy if exists obras_residente_update on public.obras;
create policy obras_residente_update on public.obras
  for update
  using (public.auth_residente_obra(empresa_id, id))
  with check (public.auth_residente_obra(empresa_id, id));

-- 3c. Tablas "planas" con obra_id: lectura y escritura en SU obra, como el
-- supervisor (movimientos, presupuesto de la obra, nota de caja).
-- Borrado FÍSICO: solo en movimientos (como el supervisor en 0020; 0045 lo
-- limita a los que no están ligados a pagos/cobros). El presupuesto de la obra
-- NO (SEG-A1): borrar de verdad una partida se llevaba en cascada el avance
-- capturado (evidencia de las estimaciones); en 0045 ni el supervisor lo hace.
-- La app borra con `deleted_at` (UPDATE), así que nada de la web ni del móvil
-- usaba ese DELETE.
do $$
declare t text;
begin
  foreach t in array array['movimientos', 'obra_presupuesto'] loop
    execute format('drop policy if exists %I on public.%I;', t || '_residente_read', t);
    execute format('create policy %I on public.%I for select using (public.auth_residente_obra(empresa_id, obra_id));',
      t || '_residente_read', t);
    execute format('drop policy if exists %I on public.%I;', t || '_residente_insert', t);
    execute format('create policy %I on public.%I for insert with check (public.auth_residente_obra(empresa_id, obra_id));',
      t || '_residente_insert', t);
    execute format('drop policy if exists %I on public.%I;', t || '_residente_update', t);
    execute format('create policy %I on public.%I for update using (public.auth_residente_obra(empresa_id, obra_id)) '
      'with check (public.auth_residente_obra(empresa_id, obra_id));', t || '_residente_update', t);
    execute format('drop policy if exists %I on public.%I;', t || '_residente_delete', t);
  end loop;
end $$;

create policy movimientos_residente_delete on public.movimientos
  for delete using (public.auth_residente_obra(empresa_id, obra_id));

drop policy if exists obra_caja_nota_residente_read on public.obra_caja_nota;
create policy obra_caja_nota_residente_read on public.obra_caja_nota
  for select using (public.auth_residente_obra(empresa_id, obra_id));
drop policy if exists obra_caja_nota_residente_insert on public.obra_caja_nota;
create policy obra_caja_nota_residente_insert on public.obra_caja_nota
  for insert with check (public.auth_residente_obra(empresa_id, obra_id));
drop policy if exists obra_caja_nota_residente_update on public.obra_caja_nota;
create policy obra_caja_nota_residente_update on public.obra_caja_nota
  for update using (public.auth_residente_obra(empresa_id, obra_id))
  with check (public.auth_residente_obra(empresa_id, obra_id));

-- 3d. Gente en la obra: asistencia, destajos, quién está en la obra y qué
-- cuadrilla trabaja ahí. El colaborador tiene que ser de la misma empresa.
do $$
declare t text;
begin
  foreach t in array array['asistencias', 'destajos', 'obra_colaborador'] loop
    execute format('drop policy if exists %I on public.%I;', t || '_residente', t);
    execute format(
      'create policy %I on public.%I for all '
      'using (public.auth_residente_obra(empresa_id, obra_id)) '
      'with check (public.auth_residente_obra(empresa_id, obra_id) '
      '  and exists (select 1 from public.colaboradores c '
      '               where c.id = %I.colaborador_id and c.empresa_id = %I.empresa_id));',
      t || '_residente', t, t, t);
  end loop;
end $$;

drop policy if exists asignacion_cuadrilla_obra_residente on public.asignacion_cuadrilla_obra;
create policy asignacion_cuadrilla_obra_residente on public.asignacion_cuadrilla_obra
  for all
  using (public.auth_residente_obra(empresa_id, obra_id))
  with check (
    public.auth_residente_obra(empresa_id, obra_id)
    and exists (select 1 from public.cuadrillas c
                 where c.id = asignacion_cuadrilla_obra.cuadrilla_id
                   and c.empresa_id = asignacion_cuadrilla_obra.empresa_id)
  );

-- 3e. Notas de obra con socios (0031) y sus renglones (por la nota padre).
drop policy if exists nota_obra_residente_read on public.nota_obra;
create policy nota_obra_residente_read on public.nota_obra
  for select using (public.auth_residente_obra(empresa_id, obra_id));

drop policy if exists nota_obra_residente_insert on public.nota_obra;
create policy nota_obra_residente_insert on public.nota_obra
  for insert with check (
    public.auth_residente_obra(empresa_id, obra_id)
    and (colaborador_id is null or exists (
      select 1 from public.colaboradores c
       where c.id = nota_obra.colaborador_id and c.empresa_id = nota_obra.empresa_id))
  );

drop policy if exists nota_obra_residente_update on public.nota_obra;
create policy nota_obra_residente_update on public.nota_obra
  for update
  using (public.auth_residente_obra(empresa_id, obra_id))
  with check (
    public.auth_residente_obra(empresa_id, obra_id)
    and (colaborador_id is null or exists (
      select 1 from public.colaboradores c
       where c.id = nota_obra.colaborador_id and c.empresa_id = nota_obra.empresa_id))
  );

drop policy if exists nota_obra_renglon_residente_read on public.nota_obra_renglon;
create policy nota_obra_renglon_residente_read on public.nota_obra_renglon
  for select using (exists (
    select 1 from public.nota_obra n
     where n.id = nota_obra_renglon.nota_id and n.empresa_id = nota_obra_renglon.empresa_id
       and public.auth_residente_obra(n.empresa_id, n.obra_id)));

drop policy if exists nota_obra_renglon_residente_insert on public.nota_obra_renglon;
create policy nota_obra_renglon_residente_insert on public.nota_obra_renglon
  for insert with check (exists (
    select 1 from public.nota_obra n
     where n.id = nota_obra_renglon.nota_id and n.empresa_id = nota_obra_renglon.empresa_id
       and public.auth_residente_obra(n.empresa_id, n.obra_id)));

drop policy if exists nota_obra_renglon_residente_update on public.nota_obra_renglon;
create policy nota_obra_renglon_residente_update on public.nota_obra_renglon
  for update
  using (exists (
    select 1 from public.nota_obra n
     where n.id = nota_obra_renglon.nota_id and n.empresa_id = nota_obra_renglon.empresa_id
       and public.auth_residente_obra(n.empresa_id, n.obra_id)))
  with check (exists (
    select 1 from public.nota_obra n
     where n.id = nota_obra_renglon.nota_id and n.empresa_id = nota_obra_renglon.empresa_id
       and public.auth_residente_obra(n.empresa_id, n.obra_id)));

-- 3f. Extras (0036). Mismas reglas que el supervisor: crea y edita borradores;
-- enviarlos depende del visto bueno configurable (sección 6).
drop policy if exists orden_cambio_residente_read on public.orden_cambio;
create policy orden_cambio_residente_read on public.orden_cambio
  for select using (public.auth_residente_obra(empresa_id, obra_id));

drop policy if exists orden_cambio_residente_insert on public.orden_cambio;
create policy orden_cambio_residente_insert on public.orden_cambio
  for insert with check (
    public.auth_residente_obra(empresa_id, obra_id)
    and estado = 'BORRADOR' and snapshot_json is null and respondido_at is null
  );

drop policy if exists orden_cambio_residente_update on public.orden_cambio;
create policy orden_cambio_residente_update on public.orden_cambio
  for update
  using (public.auth_residente_obra(empresa_id, obra_id) and estado = 'BORRADOR')
  with check (
    public.auth_residente_obra(empresa_id, obra_id)
    and estado = 'BORRADOR' and snapshot_json is null
  );

drop policy if exists orden_cambio_renglon_residente_read on public.orden_cambio_renglon;
create policy orden_cambio_renglon_residente_read on public.orden_cambio_renglon
  for select using (exists (
    select 1 from public.orden_cambio oc
     where oc.id = orden_cambio_renglon.orden_cambio_id
       and oc.empresa_id = orden_cambio_renglon.empresa_id
       and public.auth_residente_obra(oc.empresa_id, oc.obra_id)));

drop policy if exists orden_cambio_renglon_residente_insert on public.orden_cambio_renglon;
create policy orden_cambio_renglon_residente_insert on public.orden_cambio_renglon
  for insert with check (exists (
    select 1 from public.orden_cambio oc
     where oc.id = orden_cambio_renglon.orden_cambio_id
       and oc.empresa_id = orden_cambio_renglon.empresa_id
       and oc.estado = 'BORRADOR'
       and public.auth_residente_obra(oc.empresa_id, oc.obra_id)));

drop policy if exists orden_cambio_renglon_residente_update on public.orden_cambio_renglon;
create policy orden_cambio_renglon_residente_update on public.orden_cambio_renglon
  for update
  using (exists (
    select 1 from public.orden_cambio oc
     where oc.id = orden_cambio_renglon.orden_cambio_id
       and oc.empresa_id = orden_cambio_renglon.empresa_id
       and public.auth_residente_obra(oc.empresa_id, oc.obra_id)))
  with check (exists (
    select 1 from public.orden_cambio oc
     where oc.id = orden_cambio_renglon.orden_cambio_id
       and oc.empresa_id = orden_cambio_renglon.empresa_id
       and oc.estado = 'BORRADOR'
       and public.auth_residente_obra(oc.empresa_id, oc.obra_id)));

-- 3g. Bitácora (0041): registra en su obra, edita SOLO lo suyo (F4-4), agrega
-- aclaraciones y fotos. El cierre de 24 h lo sigue cuidando el trigger.
drop policy if exists bitacora_entrada_residente_read on public.bitacora_entrada;
create policy bitacora_entrada_residente_read on public.bitacora_entrada
  for select using (public.auth_residente_obra(empresa_id, obra_id));

drop policy if exists bitacora_entrada_residente_insert on public.bitacora_entrada;
create policy bitacora_entrada_residente_insert on public.bitacora_entrada
  for insert with check (public.auth_residente_obra(empresa_id, obra_id));

drop policy if exists bitacora_entrada_residente_update on public.bitacora_entrada;
create policy bitacora_entrada_residente_update on public.bitacora_entrada
  for update
  using (public.auth_residente_obra(empresa_id, obra_id) and autor_id = auth.uid())
  with check (public.auth_residente_obra(empresa_id, obra_id) and autor_id = auth.uid());

drop policy if exists bitacora_aclaracion_residente_read on public.bitacora_aclaracion;
create policy bitacora_aclaracion_residente_read on public.bitacora_aclaracion
  for select using (exists (
    select 1 from public.bitacora_entrada e
     where e.id = bitacora_aclaracion.entrada_id and e.empresa_id = bitacora_aclaracion.empresa_id
       and public.auth_residente_obra(e.empresa_id, e.obra_id)));

drop policy if exists bitacora_aclaracion_residente_insert on public.bitacora_aclaracion;
create policy bitacora_aclaracion_residente_insert on public.bitacora_aclaracion
  for insert with check (exists (
    select 1 from public.bitacora_entrada e
     where e.id = bitacora_aclaracion.entrada_id and e.empresa_id = bitacora_aclaracion.empresa_id
       and e.deleted_at is null
       and public.auth_residente_obra(e.empresa_id, e.obra_id)));

drop policy if exists bitacora_foto_residente_read on public.bitacora_foto;
create policy bitacora_foto_residente_read on public.bitacora_foto
  for select using (exists (
    select 1 from public.bitacora_entrada e
     where e.id = bitacora_foto.entrada_id and e.empresa_id = bitacora_foto.empresa_id
       and public.auth_residente_obra(e.empresa_id, e.obra_id)));

drop policy if exists bitacora_foto_residente_insert on public.bitacora_foto;
create policy bitacora_foto_residente_insert on public.bitacora_foto
  for insert with check (exists (
    select 1 from public.bitacora_entrada e
     where e.id = bitacora_foto.entrada_id and e.empresa_id = bitacora_foto.empresa_id
       and e.deleted_at is null
       and bitacora_foto.path like e.empresa_id::text || '/' || e.obra_id::text || '/' || e.id::text || '/%'
       and public.auth_residente_obra(e.empresa_id, e.obra_id)));

drop policy if exists bitacora_foto_residente_update on public.bitacora_foto;
create policy bitacora_foto_residente_update on public.bitacora_foto
  for update
  using (exists (
    select 1 from public.bitacora_entrada e
     where e.id = bitacora_foto.entrada_id and e.empresa_id = bitacora_foto.empresa_id
       and public.auth_residente_obra(e.empresa_id, e.obra_id)))
  with check (exists (
    select 1 from public.bitacora_entrada e
     where e.id = bitacora_foto.entrada_id and e.empresa_id = bitacora_foto.empresa_id
       and public.auth_residente_obra(e.empresa_id, e.obra_id)));

-- 3h. Programa (0041).
drop policy if exists programa_partida_residente_read on public.programa_partida;
create policy programa_partida_residente_read on public.programa_partida
  for select using (public.auth_residente_obra(empresa_id, obra_id));

drop policy if exists programa_partida_residente_insert on public.programa_partida;
create policy programa_partida_residente_insert on public.programa_partida
  for insert with check (
    public.auth_residente_obra(empresa_id, obra_id)
    and (presupuesto_id is null or exists (
      select 1 from public.obra_presupuesto p
       where p.id = programa_partida.presupuesto_id and p.empresa_id = programa_partida.empresa_id
         and p.obra_id = programa_partida.obra_id))
  );

drop policy if exists programa_partida_residente_update on public.programa_partida;
create policy programa_partida_residente_update on public.programa_partida
  for update
  using (public.auth_residente_obra(empresa_id, obra_id))
  with check (
    public.auth_residente_obra(empresa_id, obra_id)
    and (presupuesto_id is null or exists (
      select 1 from public.obra_presupuesto p
       where p.id = programa_partida.presupuesto_id and p.empresa_id = programa_partida.empresa_id
         and p.obra_id = programa_partida.obra_id))
  );

-- 3i. Avance (0039): captura en su obra; corrige solo lo que él capturó.
drop policy if exists avance_partida_residente_read on public.avance_partida;
create policy avance_partida_residente_read on public.avance_partida
  for select using (public.auth_residente_obra(empresa_id, obra_id));

drop policy if exists avance_partida_residente_insert on public.avance_partida;
create policy avance_partida_residente_insert on public.avance_partida
  for insert with check (
    public.auth_residente_obra(empresa_id, obra_id)
    and (
      (presupuesto_id is not null and exists (
        select 1 from public.obra_presupuesto p
         where p.id = avance_partida.presupuesto_id and p.obra_id = avance_partida.obra_id
           and p.empresa_id = avance_partida.empresa_id and p.deleted_at is null))
      or
      (orden_cambio_renglon_id is not null and exists (
        select 1 from public.orden_cambio_renglon r
          join public.orden_cambio oc on oc.id = r.orden_cambio_id
         where r.id = avance_partida.orden_cambio_renglon_id and r.deleted_at is null
           and oc.obra_id = avance_partida.obra_id and oc.empresa_id = avance_partida.empresa_id
           and oc.estado = 'APROBADA' and oc.deleted_at is null))
    )
  );

drop policy if exists avance_partida_residente_update on public.avance_partida;
create policy avance_partida_residente_update on public.avance_partida
  for update
  using (public.auth_residente_obra(empresa_id, obra_id) and capturo_id = auth.uid())
  with check (public.auth_residente_obra(empresa_id, obra_id) and capturo_id = auth.uid());

-- 3j. Solo lectura de lo que el supervisor lee en su obra: estimaciones y sus
-- renglones (sin utilidad: D1), contrato, retenciones, garantía y subcontratos
-- (el contrato y sus pagos; NO el padrón ni el expediente del subcontratista).
do $$
declare t text;
begin
  foreach t in array array[
    'estimaciones', 'obra_contrato', 'obra_retencion', 'subcontrato'
  ] loop
    execute format('drop policy if exists %I on public.%I;', t || '_residente_read', t);
    execute format('create policy %I on public.%I for select using (public.auth_residente_obra(empresa_id, obra_id));',
      t || '_residente_read', t);
  end loop;
end $$;

drop policy if exists estimacion_renglon_residente_read on public.estimacion_renglon;
create policy estimacion_renglon_residente_read on public.estimacion_renglon
  for select using (exists (
    select 1 from public.estimaciones e
     where e.id = estimacion_renglon.estimacion_id and e.empresa_id = estimacion_renglon.empresa_id
       and public.auth_residente_obra(e.empresa_id, e.obra_id)));

drop policy if exists subcontrato_renglon_residente_read on public.subcontrato_renglon;
create policy subcontrato_renglon_residente_read on public.subcontrato_renglon
  for select using (exists (
    select 1 from public.subcontrato s
     where s.id = subcontrato_renglon.subcontrato_id and s.empresa_id = subcontrato_renglon.empresa_id
       and public.auth_residente_obra(s.empresa_id, s.obra_id)));

drop policy if exists subcontrato_pago_residente_read on public.subcontrato_pago;
create policy subcontrato_pago_residente_read on public.subcontrato_pago
  for select using (exists (
    select 1 from public.subcontrato s
     where s.id = subcontrato_pago.subcontrato_id and s.empresa_id = subcontrato_pago.empresa_id
       and public.auth_residente_obra(s.empresa_id, s.obra_id)));

-- ════════════════════════════════════════════════════════════════════════════
-- 3n. Storage del residente: solo carpetas de SUS obras
-- ════════════════════════════════════════════════════════════════════════════
-- `compras_uuid` (0038) convierte la carpeta sin reventar con rutas basura.

-- Comprobantes de caja (0024): <empresa>/<obra>/<movimiento>-...
drop policy if exists comprobante_residente_select on storage.objects;
create policy comprobante_residente_select on storage.objects
  for select to authenticated
  using (bucket_id = 'comprobantes'
    and public.auth_residente_obra(public.compras_uuid((storage.foldername(name))[1]),
                                   public.compras_uuid((storage.foldername(name))[2])));

drop policy if exists comprobante_residente_insert on storage.objects;
create policy comprobante_residente_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'comprobantes'
    and public.auth_residente_obra(public.compras_uuid((storage.foldername(name))[1]),
                                   public.compras_uuid((storage.foldername(name))[2])));

drop policy if exists comprobante_residente_delete on storage.objects;
create policy comprobante_residente_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'comprobantes'
    and public.auth_residente_obra(public.compras_uuid((storage.foldername(name))[1]),
                                   public.compras_uuid((storage.foldername(name))[2])));

-- Fotos de extras (0036): <empresa>/<obra>/<archivo>
drop policy if exists extras_residente_select on storage.objects;
create policy extras_residente_select on storage.objects
  for select to authenticated
  using (bucket_id = 'extras'
    and public.auth_residente_obra(public.compras_uuid((storage.foldername(name))[1]),
                                   public.compras_uuid((storage.foldername(name))[2])));

drop policy if exists extras_residente_insert on storage.objects;
create policy extras_residente_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'extras'
    and public.auth_residente_obra(public.compras_uuid((storage.foldername(name))[1]),
                                   public.compras_uuid((storage.foldername(name))[2])));

-- Mismo candado de evidencia que la oficina (SEG-M1, 0036): la foto de un
-- extra enviado no se borra.
drop policy if exists extras_residente_delete on storage.objects;
create policy extras_residente_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'extras'
    and public.auth_residente_obra(public.compras_uuid((storage.foldername(name))[1]),
                                   public.compras_uuid((storage.foldername(name))[2]))
    and not public._extras_obj_protegido(name));

-- Bitácora (0041): <empresa>/<obra>/<entrada>/<archivo>, mismas reglas de
-- entrada abierta que el supervisor.
drop policy if exists bitacora_obj_residente_select on storage.objects;
create policy bitacora_obj_residente_select on storage.objects
  for select to authenticated
  using (bucket_id = 'bitacora'
    and public.auth_residente_obra(public.compras_uuid((storage.foldername(name))[1]),
                                   public.compras_uuid((storage.foldername(name))[2])));

drop policy if exists bitacora_obj_residente_insert on storage.objects;
create policy bitacora_obj_residente_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'bitacora'
    and exists (
      select 1 from public.bitacora_entrada e
       where e.id::text         = (storage.foldername(name))[3]
         and e.obra_id::text    = (storage.foldername(name))[2]
         and e.empresa_id::text = (storage.foldername(name))[1]
         and e.deleted_at is null
         and public.bitacora_abierta(e.registrada_en)
         and public.auth_residente_obra(e.empresa_id, e.obra_id))
  );

drop policy if exists bitacora_obj_residente_delete on storage.objects;
create policy bitacora_obj_residente_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'bitacora'
    and exists (
      select 1 from public.bitacora_entrada e
       where e.id::text         = (storage.foldername(name))[3]
         and e.obra_id::text    = (storage.foldername(name))[2]
         and e.empresa_id::text = (storage.foldername(name))[1]
         and public.bitacora_abierta(e.registrada_en)
         and public.auth_residente_obra(e.empresa_id, e.obra_id))
  );

-- ════════════════════════════════════════════════════════════════════════════
-- 4. COLABORADOR con obra asignada: bitácora de SUS obras (abre F4-2)
-- ════════════════════════════════════════════════════════════════════════════
-- Crea entradas y las lee (con sus aclaraciones y fotos). Puede ponerle fotos
-- a SUS entradas mientras estén abiertas: una entrada de bitácora sin su foto
-- no sirve de evidencia. No edita, no aclara, no ve otras obras (F6-7).
drop policy if exists bitacora_entrada_colab_obra_read on public.bitacora_entrada;
create policy bitacora_entrada_colab_obra_read on public.bitacora_entrada
  for select using (public.auth_obra_asignada(empresa_id, obra_id, 'colaborador'));

drop policy if exists bitacora_entrada_colab_obra_insert on public.bitacora_entrada;
create policy bitacora_entrada_colab_obra_insert on public.bitacora_entrada
  for insert with check (public.auth_obra_asignada(empresa_id, obra_id, 'colaborador'));

drop policy if exists bitacora_aclaracion_colab_obra_read on public.bitacora_aclaracion;
create policy bitacora_aclaracion_colab_obra_read on public.bitacora_aclaracion
  for select using (exists (
    select 1 from public.bitacora_entrada e
     where e.id = bitacora_aclaracion.entrada_id and e.empresa_id = bitacora_aclaracion.empresa_id
       and public.auth_obra_asignada(e.empresa_id, e.obra_id, 'colaborador')));

drop policy if exists bitacora_foto_colab_obra_read on public.bitacora_foto;
create policy bitacora_foto_colab_obra_read on public.bitacora_foto
  for select using (exists (
    select 1 from public.bitacora_entrada e
     where e.id = bitacora_foto.entrada_id and e.empresa_id = bitacora_foto.empresa_id
       and public.auth_obra_asignada(e.empresa_id, e.obra_id, 'colaborador')));

drop policy if exists bitacora_foto_colab_obra_insert on public.bitacora_foto;
create policy bitacora_foto_colab_obra_insert on public.bitacora_foto
  for insert with check (exists (
    select 1 from public.bitacora_entrada e
     where e.id = bitacora_foto.entrada_id and e.empresa_id = bitacora_foto.empresa_id
       and e.deleted_at is null and e.autor_id = auth.uid()
       and bitacora_foto.path like e.empresa_id::text || '/' || e.obra_id::text || '/' || e.id::text || '/%'
       and public.auth_obra_asignada(e.empresa_id, e.obra_id, 'colaborador')));

drop policy if exists bitacora_obj_colab_obra_select on storage.objects;
create policy bitacora_obj_colab_obra_select on storage.objects
  for select to authenticated
  using (bucket_id = 'bitacora'
    and public.auth_obra_asignada(public.compras_uuid((storage.foldername(name))[1]),
                                  public.compras_uuid((storage.foldername(name))[2]), 'colaborador'));

drop policy if exists bitacora_obj_colab_obra_insert on storage.objects;
create policy bitacora_obj_colab_obra_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'bitacora'
    and exists (
      select 1 from public.bitacora_entrada e
       where e.id::text         = (storage.foldername(name))[3]
         and e.obra_id::text    = (storage.foldername(name))[2]
         and e.empresa_id::text = (storage.foldername(name))[1]
         and e.deleted_at is null and e.autor_id = auth.uid()
         and public.bitacora_abierta(e.registrada_en)
         and public.auth_obra_asignada(e.empresa_id, e.obra_id, 'colaborador'))
  );

-- ════════════════════════════════════════════════════════════════════════════
-- 5. COMPRAS, ALMACÉN y RESIDENTE en compras y material (0038)
-- ════════════════════════════════════════════════════════════════════════════
-- Pagos a proveedores (`pagos_proveedor`) siguen siendo SOLO admin y contador
-- (F2-4, F2-7): ninguno de los tres roles nuevos los ve ni los crea.

-- 5a. Obras: compras y almacén ven TODAS las obras de la empresa (compran y
-- reparten material para cualquiera). Solo lectura.
drop policy if exists obras_org_read on public.obras;
create policy obras_org_read on public.obras
  for select using (public.auth_tiene_rol(empresa_id, 'compras', 'almacen'));

drop policy if exists empresa_config_org_read on public.empresa_config;
create policy empresa_config_org_read on public.empresa_config
  for select using (public.auth_tiene_rol(empresa_id, 'compras', 'almacen'));

-- 5b. Lectura de compras: compras y almacén todo (menos pagos).
do $$
declare t text;
begin
  foreach t in array array[
    'proveedores', 'materiales', 'requisiciones', 'requisicion_renglon', 'ordenes_compra',
    'orden_compra_renglon', 'recepciones', 'recepcion_renglon', 'material_movimiento'
  ] loop
    execute format('drop policy if exists %I on public.%I;', t || '_org_read', t);
    execute format(
      'create policy %I on public.%I for select '
      'using (public.auth_tiene_rol(empresa_id, ''compras'', ''almacen''));',
      t || '_org_read', t);
  end loop;
end $$;

-- 5c. COMPRAS: proveedores y materiales.
drop policy if exists proveedores_compras_insert on public.proveedores;
create policy proveedores_compras_insert on public.proveedores
  for insert with check (public.auth_tiene_rol(empresa_id, 'compras'));
drop policy if exists proveedores_compras_update on public.proveedores;
create policy proveedores_compras_update on public.proveedores
  for update
  using (public.auth_tiene_rol(empresa_id, 'compras'))
  with check (public.auth_tiene_rol(empresa_id, 'compras'));

drop policy if exists materiales_compras_insert on public.materiales;
create policy materiales_compras_insert on public.materiales
  for insert with check (
    public.auth_tiene_rol(empresa_id, 'compras')
    and (proveedor_id is null or exists (
      select 1 from public.proveedores p
       where p.id = materiales.proveedor_id and p.empresa_id = materiales.empresa_id))
  );
drop policy if exists materiales_compras_update on public.materiales;
create policy materiales_compras_update on public.materiales
  for update
  using (public.auth_tiene_rol(empresa_id, 'compras'))
  with check (
    public.auth_tiene_rol(empresa_id, 'compras')
    and (proveedor_id is null or exists (
      select 1 from public.proveedores p
       where p.id = materiales.proveedor_id and p.empresa_id = materiales.empresa_id))
  );

-- 5d. COMPRAS: requisiciones. Las pide y las decide (aprobar/rechazar), como
-- el admin en 0038. El trigger de 0038 sigue cuidando los estados.
drop policy if exists requisiciones_compras_insert on public.requisiciones;
create policy requisiciones_compras_insert on public.requisiciones
  for insert with check (
    public.auth_tiene_rol(empresa_id, 'compras')
    and estado = 'PENDIENTE'
    and exists (select 1 from public.obras o where o.id = requisiciones.obra_id and o.empresa_id = requisiciones.empresa_id)
  );
drop policy if exists requisiciones_compras_update on public.requisiciones;
create policy requisiciones_compras_update on public.requisiciones
  for update
  using (public.auth_tiene_rol(empresa_id, 'compras'))
  with check (
    public.auth_tiene_rol(empresa_id, 'compras')
    and exists (select 1 from public.obras o where o.id = requisiciones.obra_id and o.empresa_id = requisiciones.empresa_id)
  );

drop policy if exists requisicion_renglon_compras_insert on public.requisicion_renglon;
create policy requisicion_renglon_compras_insert on public.requisicion_renglon
  for insert with check (
    exists (select 1 from public.requisiciones r
             where r.id = requisicion_renglon.requisicion_id
               and r.empresa_id = requisicion_renglon.empresa_id
               and public.auth_tiene_rol(r.empresa_id, 'compras'))
    and (material_id is null or exists (
      select 1 from public.materiales m
       where m.id = requisicion_renglon.material_id and m.empresa_id = requisicion_renglon.empresa_id))
  );
drop policy if exists requisicion_renglon_compras_update on public.requisicion_renglon;
create policy requisicion_renglon_compras_update on public.requisicion_renglon
  for update
  using (exists (select 1 from public.requisiciones r
                  where r.id = requisicion_renglon.requisicion_id
                    and public.auth_tiene_rol(r.empresa_id, 'compras')))
  with check (
    exists (select 1 from public.requisiciones r
             where r.id = requisicion_renglon.requisicion_id
               and r.empresa_id = requisicion_renglon.empresa_id
               and public.auth_tiene_rol(r.empresa_id, 'compras'))
    and (material_id is null or exists (
      select 1 from public.materiales m
       where m.id = requisicion_renglon.material_id and m.empresa_id = requisicion_renglon.empresa_id))
  );

-- 5e. COMPRAS: órdenes de compra en BORRADOR (emitir y cancelar van por RPC,
-- sección 6). El validador de renglones de 0038 se amplía a `compras`: sigue
-- revisando el rol PRIMERO, así no sirve para sondear otra empresa, y la
-- policy del admin sigue exigiendo `admin` por su cuenta.
create or replace function public._oc_renglon_padres_validos(
  p_empresa uuid, p_oc uuid, p_req_renglon uuid, p_material uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.auth_tiene_rol(p_empresa, 'admin', 'compras')
    and exists (
      select 1 from public.ordenes_compra oc
       where oc.id = p_oc and oc.empresa_id = p_empresa and oc.estado = 'BORRADOR'
    )
    and (p_material is null or exists (
      select 1 from public.materiales m where m.id = p_material and m.empresa_id = p_empresa
    ))
    and (p_req_renglon is null or exists (
      select 1
        from public.requisicion_renglon rr
        join public.requisiciones r on r.id = rr.requisicion_id
        join public.ordenes_compra oc on oc.id = p_oc
       where rr.id = p_req_renglon
         and rr.deleted_at is null
         and r.empresa_id = p_empresa
         and r.deleted_at is null
         and r.obra_id = oc.obra_id
         and r.estado in ('APROBADA', 'PARCIAL', 'COMPRADA')
    ))
$$;
revoke all on function public._oc_renglon_padres_validos(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public._oc_renglon_padres_validos(uuid, uuid, uuid, uuid) to authenticated;

drop policy if exists ordenes_compra_compras_insert on public.ordenes_compra;
create policy ordenes_compra_compras_insert on public.ordenes_compra
  for insert with check (
    public.auth_tiene_rol(empresa_id, 'compras')
    and estado = 'BORRADOR'
    and factura_uuid is null
    and exists (select 1 from public.obras o where o.id = ordenes_compra.obra_id and o.empresa_id = ordenes_compra.empresa_id)
    and exists (select 1 from public.proveedores p where p.id = ordenes_compra.proveedor_id and p.empresa_id = ordenes_compra.empresa_id)
  );

drop policy if exists ordenes_compra_compras_update on public.ordenes_compra;
create policy ordenes_compra_compras_update on public.ordenes_compra
  for update
  using (public.auth_tiene_rol(empresa_id, 'compras') and estado = 'BORRADOR')
  with check (
    public.auth_tiene_rol(empresa_id, 'compras')
    and estado = 'BORRADOR'
    and exists (select 1 from public.obras o where o.id = ordenes_compra.obra_id and o.empresa_id = ordenes_compra.empresa_id)
    and exists (select 1 from public.proveedores p where p.id = ordenes_compra.proveedor_id and p.empresa_id = ordenes_compra.empresa_id)
  );

drop policy if exists orden_compra_renglon_compras_insert on public.orden_compra_renglon;
create policy orden_compra_renglon_compras_insert on public.orden_compra_renglon
  for insert with check (
    public.auth_tiene_rol(empresa_id, 'compras')
    and public._oc_renglon_padres_validos(empresa_id, orden_compra_id, requisicion_renglon_id, material_id)
  );

drop policy if exists orden_compra_renglon_compras_update on public.orden_compra_renglon;
create policy orden_compra_renglon_compras_update on public.orden_compra_renglon
  for update
  using (public.auth_tiene_rol(empresa_id, 'compras'))
  with check (
    public.auth_tiene_rol(empresa_id, 'compras')
    and public._oc_renglon_padres_validos(empresa_id, orden_compra_id, requisicion_renglon_id, material_id)
  );

-- 5f. COMPRAS y ALMACÉN reciben material (como el supervisor en 0038). El
-- borrado lógico de una recepción sigue siendo del admin.
drop policy if exists recepciones_org_insert on public.recepciones;
create policy recepciones_org_insert on public.recepciones
  for insert with check (
    public.auth_tiene_rol(empresa_id, 'compras', 'almacen')
    and exists (select 1 from public.ordenes_compra oc
                 where oc.id = recepciones.orden_compra_id and oc.empresa_id = recepciones.empresa_id)
  );

drop policy if exists recepciones_org_update on public.recepciones;
create policy recepciones_org_update on public.recepciones
  for update
  using (public.auth_tiene_rol(empresa_id, 'compras', 'almacen') and deleted_at is null)
  with check (public.auth_tiene_rol(empresa_id, 'compras', 'almacen') and deleted_at is null);

drop policy if exists recepcion_renglon_org_insert on public.recepcion_renglon;
create policy recepcion_renglon_org_insert on public.recepcion_renglon
  for insert with check (
    public.auth_tiene_rol(empresa_id, 'compras', 'almacen')
    and exists (select 1 from public.recepciones r
                 where r.id = recepcion_renglon.recepcion_id and r.empresa_id = recepcion_renglon.empresa_id
                   and r.deleted_at is null)
  );

-- 5g. ALMACÉN: existencias (consumos, traspasos, ajustes). Compras solo lee.
drop policy if exists material_movimiento_almacen_insert on public.material_movimiento;
create policy material_movimiento_almacen_insert on public.material_movimiento
  for insert with check (
    public.auth_tiene_rol(empresa_id, 'almacen')
    and exists (select 1 from public.obras o where o.id = material_movimiento.obra_id and o.empresa_id = material_movimiento.empresa_id)
    and exists (select 1 from public.materiales m where m.id = material_movimiento.material_id and m.empresa_id = material_movimiento.empresa_id)
    and (obra_destino_id is null or exists (
      select 1 from public.obras o where o.id = material_movimiento.obra_destino_id and o.empresa_id = material_movimiento.empresa_id))
  );

drop policy if exists material_movimiento_almacen_update on public.material_movimiento;
create policy material_movimiento_almacen_update on public.material_movimiento
  for update
  using (public.auth_tiene_rol(empresa_id, 'almacen'))
  with check (
    public.auth_tiene_rol(empresa_id, 'almacen')
    and exists (select 1 from public.obras o where o.id = material_movimiento.obra_id and o.empresa_id = material_movimiento.empresa_id)
    and exists (select 1 from public.materiales m where m.id = material_movimiento.material_id and m.empresa_id = material_movimiento.empresa_id)
    and (obra_destino_id is null or exists (
      select 1 from public.obras o where o.id = material_movimiento.obra_destino_id and o.empresa_id = material_movimiento.empresa_id))
  );

-- 5h. RESIDENTE en compras: lo del supervisor, en SUS obras. Pide material,
-- ve las órdenes de su obra (para recibir), recibe y registra consumos y
-- traspasos. Ve proveedores y el catálogo de materiales (para pedir).
drop policy if exists proveedores_residente_read on public.proveedores;
create policy proveedores_residente_read on public.proveedores
  for select using (public.auth_tiene_rol(empresa_id, 'residente'));
drop policy if exists materiales_residente_read on public.materiales;
create policy materiales_residente_read on public.materiales
  for select using (public.auth_tiene_rol(empresa_id, 'residente'));

drop policy if exists requisiciones_residente_read on public.requisiciones;
create policy requisiciones_residente_read on public.requisiciones
  for select using (public.auth_residente_obra(empresa_id, obra_id));

drop policy if exists requisiciones_residente_insert on public.requisiciones;
create policy requisiciones_residente_insert on public.requisiciones
  for insert with check (public.auth_residente_obra(empresa_id, obra_id) and estado = 'PENDIENTE');

drop policy if exists requisiciones_residente_update on public.requisiciones;
create policy requisiciones_residente_update on public.requisiciones
  for update
  using (public.auth_residente_obra(empresa_id, obra_id) and pedido_por = auth.uid() and estado = 'PENDIENTE')
  with check (public.auth_residente_obra(empresa_id, obra_id) and pedido_por = auth.uid() and estado = 'PENDIENTE');

drop policy if exists requisicion_renglon_residente_read on public.requisicion_renglon;
create policy requisicion_renglon_residente_read on public.requisicion_renglon
  for select using (exists (
    select 1 from public.requisiciones r
     where r.id = requisicion_renglon.requisicion_id and r.empresa_id = requisicion_renglon.empresa_id
       and public.auth_residente_obra(r.empresa_id, r.obra_id)));

drop policy if exists requisicion_renglon_residente_insert on public.requisicion_renglon;
create policy requisicion_renglon_residente_insert on public.requisicion_renglon
  for insert with check (
    exists (select 1 from public.requisiciones r
             where r.id = requisicion_renglon.requisicion_id and r.empresa_id = requisicion_renglon.empresa_id
               and r.pedido_por = auth.uid()
               and public.auth_residente_obra(r.empresa_id, r.obra_id))
    and (material_id is null or exists (
      select 1 from public.materiales m
       where m.id = requisicion_renglon.material_id and m.empresa_id = requisicion_renglon.empresa_id))
  );

drop policy if exists requisicion_renglon_residente_update on public.requisicion_renglon;
create policy requisicion_renglon_residente_update on public.requisicion_renglon
  for update
  using (exists (select 1 from public.requisiciones r
                  where r.id = requisicion_renglon.requisicion_id and r.pedido_por = auth.uid()
                    and public.auth_residente_obra(r.empresa_id, r.obra_id)))
  with check (
    exists (select 1 from public.requisiciones r
             where r.id = requisicion_renglon.requisicion_id and r.empresa_id = requisicion_renglon.empresa_id
               and r.pedido_por = auth.uid()
               and public.auth_residente_obra(r.empresa_id, r.obra_id))
    and (material_id is null or exists (
      select 1 from public.materiales m
       where m.id = requisicion_renglon.material_id and m.empresa_id = requisicion_renglon.empresa_id))
  );

drop policy if exists ordenes_compra_residente_read on public.ordenes_compra;
create policy ordenes_compra_residente_read on public.ordenes_compra
  for select using (public.auth_residente_obra(empresa_id, obra_id));

drop policy if exists orden_compra_renglon_residente_read on public.orden_compra_renglon;
create policy orden_compra_renglon_residente_read on public.orden_compra_renglon
  for select using (exists (
    select 1 from public.ordenes_compra oc
     where oc.id = orden_compra_renglon.orden_compra_id and oc.empresa_id = orden_compra_renglon.empresa_id
       and public.auth_residente_obra(oc.empresa_id, oc.obra_id)));

-- La recepción toma la obra de la ORDEN (trigger de 0038), así que se valida
-- contra la orden y no contra `recepciones.obra_id`.
drop policy if exists recepciones_residente_read on public.recepciones;
create policy recepciones_residente_read on public.recepciones
  for select using (public.auth_residente_obra(empresa_id, obra_id));

drop policy if exists recepciones_residente_insert on public.recepciones;
create policy recepciones_residente_insert on public.recepciones
  for insert with check (exists (
    select 1 from public.ordenes_compra oc
     where oc.id = recepciones.orden_compra_id and oc.empresa_id = recepciones.empresa_id
       and public.auth_residente_obra(oc.empresa_id, oc.obra_id)));

drop policy if exists recepciones_residente_update on public.recepciones;
create policy recepciones_residente_update on public.recepciones
  for update
  using (public.auth_residente_obra(empresa_id, obra_id) and deleted_at is null)
  with check (public.auth_residente_obra(empresa_id, obra_id) and deleted_at is null);

drop policy if exists recepcion_renglon_residente_read on public.recepcion_renglon;
create policy recepcion_renglon_residente_read on public.recepcion_renglon
  for select using (exists (
    select 1 from public.recepciones r
     where r.id = recepcion_renglon.recepcion_id and r.empresa_id = recepcion_renglon.empresa_id
       and public.auth_residente_obra(r.empresa_id, r.obra_id)));

drop policy if exists recepcion_renglon_residente_insert on public.recepcion_renglon;
create policy recepcion_renglon_residente_insert on public.recepcion_renglon
  for insert with check (exists (
    select 1 from public.recepciones r
     where r.id = recepcion_renglon.recepcion_id and r.empresa_id = recepcion_renglon.empresa_id
       and r.deleted_at is null
       and public.auth_residente_obra(r.empresa_id, r.obra_id)));

-- Existencias: ve lo que sale de su obra y lo que llega a ella; registra desde
-- su obra (consumo, traspaso a otra obra de la empresa, ajuste).
drop policy if exists material_movimiento_residente_read on public.material_movimiento;
create policy material_movimiento_residente_read on public.material_movimiento
  for select using (
    public.auth_residente_obra(empresa_id, obra_id)
    or (obra_destino_id is not null and public.auth_residente_obra(empresa_id, obra_destino_id))
  );

drop policy if exists material_movimiento_residente_insert on public.material_movimiento;
create policy material_movimiento_residente_insert on public.material_movimiento
  for insert with check (
    public.auth_residente_obra(empresa_id, obra_id)
    and exists (select 1 from public.materiales m where m.id = material_movimiento.material_id and m.empresa_id = material_movimiento.empresa_id)
    and (obra_destino_id is null or exists (
      select 1 from public.obras o where o.id = material_movimiento.obra_destino_id and o.empresa_id = material_movimiento.empresa_id))
  );

drop policy if exists material_movimiento_residente_update on public.material_movimiento;
create policy material_movimiento_residente_update on public.material_movimiento
  for update
  using (public.auth_residente_obra(empresa_id, obra_id) and registrado_por = auth.uid())
  with check (
    public.auth_residente_obra(empresa_id, obra_id) and registrado_por = auth.uid()
    and exists (select 1 from public.materiales m where m.id = material_movimiento.material_id and m.empresa_id = material_movimiento.empresa_id)
    and (obra_destino_id is null or exists (
      select 1 from public.obras o where o.id = material_movimiento.obra_destino_id and o.empresa_id = material_movimiento.empresa_id))
  );

-- 5i. Bucket `compras` (0038): <empresa>/remisiones/<recepción>/… y
-- <empresa>/facturas/<orden>/…
--   · compras: ve todo, sube y quita fotos de remisión (las facturas las liga
--     el admin o el contador por RPC, F2-9).
--   · almacén: solo remisiones (la factura trae precios y datos fiscales).
--   · residente: remisiones de recepciones de SUS obras.
drop policy if exists compras_obj_org_select on storage.objects;
create policy compras_obj_org_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'compras'
    and (
      public.auth_tiene_rol(public.compras_uuid((storage.foldername(name))[1]), 'compras')
      or ((storage.foldername(name))[2] = 'remisiones'
          and public.auth_tiene_rol(public.compras_uuid((storage.foldername(name))[1]), 'almacen'))
    )
  );

drop policy if exists compras_obj_org_insert on storage.objects;
create policy compras_obj_org_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'compras'
    and (storage.foldername(name))[2] = 'remisiones'
    and public.auth_tiene_rol(public.compras_uuid((storage.foldername(name))[1]), 'compras', 'almacen')
    and exists (
      select 1 from public.recepciones r
       where r.id::text = (storage.foldername(name))[3]
         and r.empresa_id::text = (storage.foldername(name))[1]
         and r.deleted_at is null)
  );

-- Mismo candado de evidencia que la oficina (SEG-M1, 0038): la remisión ligada
-- a una recepción no se borra.
drop policy if exists compras_obj_org_delete on storage.objects;
create policy compras_obj_org_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'compras'
    and (storage.foldername(name))[2] = 'remisiones'
    and public.auth_tiene_rol(public.compras_uuid((storage.foldername(name))[1]), 'compras', 'almacen')
    and not public._compras_obj_protegido(name)
  );

drop policy if exists compras_obj_residente_select on storage.objects;
create policy compras_obj_residente_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'compras' and (storage.foldername(name))[2] = 'remisiones'
    and exists (
      select 1 from public.recepciones r
       where r.id::text = (storage.foldername(name))[3]
         and r.empresa_id::text = (storage.foldername(name))[1]
         and public.auth_residente_obra(r.empresa_id, r.obra_id))
  );

drop policy if exists compras_obj_residente_insert on storage.objects;
create policy compras_obj_residente_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'compras' and (storage.foldername(name))[2] = 'remisiones'
    and exists (
      select 1 from public.recepciones r
       where r.id::text = (storage.foldername(name))[3]
         and r.empresa_id::text = (storage.foldername(name))[1]
         and r.deleted_at is null
         and public.auth_residente_obra(r.empresa_id, r.obra_id))
  );

drop policy if exists compras_obj_residente_delete on storage.objects;
create policy compras_obj_residente_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'compras' and (storage.foldername(name))[2] = 'remisiones'
    and exists (
      select 1 from public.recepciones r
       where r.id::text = (storage.foldername(name))[3]
         and r.empresa_id::text = (storage.foldername(name))[1]
         and public.auth_residente_obra(r.empresa_id, r.obra_id))
    and not public._compras_obj_protegido(name)
  );

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Visto bueno configurable (RF6.3)
-- ════════════════════════════════════════════════════════════════════════════
-- Idea: las reglas DELEGAN hacia abajo. Sin regla, todo sigue como hoy (solo el
-- admin envía extras y emite órdenes de compra). Con una regla "EXTRA desde
-- $20,000 → admin", el supervisor/residente puede mandar al cliente los extras
-- de MENOS de $20,000 sin esperar al admin; los de $20,000 o más necesitan un
-- visto bueno APROBADO (o que los mande el admin). Igual con "COMPRA" para el
-- rol compras. Falla cerrado: sin regla, nadie más que el admin (F6-10).
--
-- Tipos: COMPRA y EXTRA se aplican aquí. ESTIMACION y PAGO_SUBCONTRATO quedan
-- en el catálogo del CHECK pero la web no los ofrece todavía: enviar
-- estimaciones y pagar subcontratos ya es solo de admin/contador (0039/0040),
-- así que una regla no delegaría nada (F6-11).
create table if not exists public.regla_aprobacion (
  id                 uuid primary key default gen_random_uuid(),
  empresa_id         uuid not null references public.empresas(id) on delete cascade,
  tipo               text not null
                       check (tipo in ('COMPRA', 'ESTIMACION', 'EXTRA', 'PAGO_SUBCONTRATO')),
  monto_minimo       double precision not null check (monto_minimo >= 0 and monto_minimo < 1e12),
  rol_aprobador      text not null default 'admin' check (rol_aprobador in ('admin', 'contador')),
  activa             boolean not null default true,
  notas              text not null default '' check (char_length(notas) <= 500),
  created_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  server_updated_at  bigint not null default 0,
  deleted_at         bigint
);

-- Una regla viva por tipo: "¿desde cuánto?" tiene una sola respuesta.
create unique index if not exists uq_regla_aprobacion_tipo
  on public.regla_aprobacion (empresa_id, tipo) where deleted_at is null;
create index if not exists idx_regla_aprobacion_srv on public.regla_aprobacion (empresa_id, server_updated_at);

create table if not exists public.aprobacion (
  id                 uuid primary key default gen_random_uuid(),
  empresa_id         uuid not null references public.empresas(id) on delete cascade,
  tipo               text not null
                       check (tipo in ('COMPRA', 'ESTIMACION', 'EXTRA', 'PAGO_SUBCONTRATO')),
  objeto_id          uuid not null,
  obra_id            uuid references public.obras(id) on delete cascade,
  monto              double precision not null check (monto >= 0),
  rol_aprobador      text not null check (rol_aprobador in ('admin', 'contador')),
  estado             text not null default 'PENDIENTE'
                       check (estado in ('PENDIENTE', 'APROBADA', 'RECHAZADA')),
  solicitado_por     uuid,
  solicitado_nombre  text not null default '',
  solicitado_en      bigint not null default (extract(epoch from now()) * 1000)::bigint,
  decidido_por       uuid,
  decidido_nombre    text,
  decidido_en        bigint,
  motivo             text check (motivo is null or char_length(motivo) <= 1000),
  created_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  server_updated_at  bigint not null default 0,
  deleted_at         bigint,
  constraint aprobacion_rechazo_con_motivo check (
    estado <> 'RECHAZADA' or coalesce(btrim(motivo), '') <> ''
  )
);

-- Una solicitud pendiente por objeto.
create unique index if not exists uq_aprobacion_pendiente
  on public.aprobacion (tipo, objeto_id) where estado = 'PENDIENTE' and deleted_at is null;
create index if not exists idx_aprobacion_empresa on public.aprobacion (empresa_id, estado, solicitado_en desc);
create index if not exists idx_aprobacion_objeto on public.aprobacion (objeto_id);
create index if not exists idx_aprobacion_srv on public.aprobacion (empresa_id, server_updated_at);

do $$
declare t text;
begin
  foreach t in array array['regla_aprobacion', 'aprobacion'] loop
    execute format('drop trigger if exists trg_srv_upd on public.%I;', t);
    execute format(
      'create trigger trg_srv_upd before insert or update on public.%I '
      'for each row execute function public.set_server_updated_at();', t);
  end loop;
end $$;

alter table public.regla_aprobacion enable row level security;
alter table public.aprobacion       enable row level security;

-- Reglas: las escribe el admin; las lee quien opera algo que puede necesitar
-- visto bueno, para avisarle ANTES ("este extra necesita el visto bueno").
drop policy if exists regla_aprobacion_read on public.regla_aprobacion;
create policy regla_aprobacion_read on public.regla_aprobacion
  for select using (
    public.auth_tiene_rol(empresa_id, 'admin', 'supervisor', 'residente', 'compras', 'contador')
  );
drop policy if exists regla_aprobacion_insert on public.regla_aprobacion;
create policy regla_aprobacion_insert on public.regla_aprobacion
  for insert with check (public.auth_tiene_rol(empresa_id, 'admin'));
drop policy if exists regla_aprobacion_update on public.regla_aprobacion;
create policy regla_aprobacion_update on public.regla_aprobacion
  for update
  using (public.auth_tiene_rol(empresa_id, 'admin'))
  with check (public.auth_tiene_rol(empresa_id, 'admin'));

-- Solicitudes: SIN policies de escritura (solo por las RPC de abajo). Las lee
-- el admin, quien debe decidir (el rol aprobador) y quien la pidió.
drop policy if exists aprobacion_read on public.aprobacion;
create policy aprobacion_read on public.aprobacion
  for select using (
    public.auth_tiene_rol(empresa_id, 'admin')
    or public.auth_tiene_rol(empresa_id, rol_aprobador)
    or solicitado_por = auth.uid()
  );

-- 6a. ¿Alcanza para hacerlo sin el admin? (lo usan las RPC de envío)
--   · admin → siempre.
--   · sin regla activa del tipo → no (falla cerrado).
--   · monto < mínimo → sí.
--   · quien actúa tiene el rol aprobador → sí.
--   · hay un visto bueno APROBADO de este objeto por al menos este monto → sí.
create or replace function public._aprobacion_suficiente(
  p_empresa uuid, p_tipo text, p_objeto uuid, p_monto numeric
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_regla public.regla_aprobacion%rowtype;
begin
  if public.auth_tiene_rol(p_empresa, 'admin') then
    return true;
  end if;
  select * into v_regla from public.regla_aprobacion
   where empresa_id = p_empresa and tipo = p_tipo and activa and deleted_at is null
   limit 1;
  if not found then
    return false;
  end if;
  if p_monto < v_regla.monto_minimo::numeric then
    return true;
  end if;
  if public.auth_tiene_rol(p_empresa, v_regla.rol_aprobador) then
    return true;
  end if;
  return exists (
    select 1 from public.aprobacion a
     where a.empresa_id = p_empresa and a.tipo = p_tipo and a.objeto_id = p_objeto
       and a.estado = 'APROBADA' and a.deleted_at is null
       and a.monto::numeric >= p_monto - 0.005
  );
end $$;
revoke all on function public._aprobacion_suficiente(uuid, text, uuid, numeric) from public, anon, authenticated;

-- Monto de un extra en borrador (misma cuenta que la foto de 0036).
create or replace function public._extra_total(p_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(round(sum(r.cantidad * r.precio_unitario)::numeric, 2), 0)
    from public.orden_cambio_renglon r
   where r.orden_cambio_id = p_id and r.deleted_at is null;
$$;
revoke all on function public._extra_total(uuid) from public, anon, authenticated;

create or replace function public._nombre_usuario_actual()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif(trim(coalesce(u.raw_user_meta_data->>'nombre', '')), ''),
    u.email::text, '')
    from auth.users u where u.id = auth.uid();
$$;
revoke all on function public._nombre_usuario_actual() from public, anon, authenticated;

-- 6b. Pedir el visto bueno. Calcula monto, obra y empresa en el servidor (no
-- se confía en el navegador). Si no hace falta, lo dice y no crea nada.
create or replace function public.solicitar_aprobacion(p_tipo text, p_objeto uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa uuid;
  v_obra    uuid;
  v_estado  text;
  v_monto   numeric;
  v_puede   boolean;
  v_regla   public.regla_aprobacion%rowtype;
  v_id      uuid;
  v_iva     double precision;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'No autenticado');
  end if;

  if p_tipo = 'EXTRA' then
    select empresa_id, obra_id, estado into v_empresa, v_obra, v_estado
      from public.orden_cambio where id = p_objeto and deleted_at is null;
    if v_empresa is null then
      return jsonb_build_object('ok', false, 'error', 'Extra no encontrado');
    end if;
    v_puede := public.auth_tiene_rol(v_empresa, 'admin', 'supervisor')
               or public.auth_residente_obra(v_empresa, v_obra);
    if v_estado <> 'BORRADOR' then
      return jsonb_build_object('ok', false, 'error', 'Este extra ya se envió.');
    end if;
    v_monto := public._extra_total(p_objeto);
  elsif p_tipo = 'COMPRA' then
    select empresa_id, obra_id, estado, iva_pct into v_empresa, v_obra, v_estado, v_iva
      from public.ordenes_compra where id = p_objeto and deleted_at is null;
    if v_empresa is null then
      return jsonb_build_object('ok', false, 'error', 'Orden de compra no encontrada');
    end if;
    v_puede := public.auth_tiene_rol(v_empresa, 'admin', 'compras');
    if v_estado <> 'BORRADOR' then
      return jsonb_build_object('ok', false, 'error', 'Esta orden ya se emitió.');
    end if;
    select t.total into v_monto from public._orden_compra_totales(p_objeto, v_iva) t;
  else
    return jsonb_build_object('ok', false, 'error', 'Ese tipo de visto bueno todavía no se usa.');
  end if;

  if not v_puede then
    return jsonb_build_object('ok', false, 'error', 'No puedes pedir el visto bueno de esto.');
  end if;

  select * into v_regla from public.regla_aprobacion
   where empresa_id = v_empresa and tipo = p_tipo and activa and deleted_at is null
   limit 1;

  -- Sin regla: no hay a quién delegar; lo manda el admin.
  if not found then
    return jsonb_build_object('ok', true, 'necesaria', true, 'sin_regla', true, 'monto', v_monto);
  end if;
  if v_monto < v_regla.monto_minimo::numeric then
    return jsonb_build_object('ok', true, 'necesaria', false, 'monto', v_monto);
  end if;

  -- Ya hay una pendiente: se actualiza el monto (el borrador pudo cambiar).
  update public.aprobacion
     set monto = v_monto, updated_at = (extract(epoch from now()) * 1000)::bigint
   where tipo = p_tipo and objeto_id = p_objeto and estado = 'PENDIENTE' and deleted_at is null
  returning id into v_id;

  if v_id is null then
    insert into public.aprobacion
      (empresa_id, tipo, objeto_id, obra_id, monto, rol_aprobador,
       solicitado_por, solicitado_nombre)
    values
      (v_empresa, p_tipo, p_objeto, v_obra, v_monto, v_regla.rol_aprobador,
       auth.uid(), coalesce(public._nombre_usuario_actual(), ''))
    returning id into v_id;
  end if;

  return jsonb_build_object('ok', true, 'necesaria', true, 'id', v_id, 'estado', 'PENDIENTE', 'monto', v_monto);
end $$;

revoke all on function public.solicitar_aprobacion(text, uuid) from public, anon;
grant execute on function public.solicitar_aprobacion(text, uuid) to authenticated;

-- 6c. Decidir. El rol aprobador (o el admin); nunca quien la pidió (cuatro ojos).
create or replace function public.decidir_aprobacion(p_id uuid, p_aprobar boolean, p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_a   public.aprobacion%rowtype;
  v_now bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'No autenticado');
  end if;
  select * into v_a from public.aprobacion where id = p_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Solicitud no encontrada');
  end if;
  if not (public.auth_tiene_rol(v_a.empresa_id, 'admin')
          or public.auth_tiene_rol(v_a.empresa_id, v_a.rol_aprobador)) then
    return jsonb_build_object('ok', false, 'error', 'Solo quien aprueba puede decidir esta solicitud.');
  end if;
  if v_a.solicitado_por = auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'No puedes dar el visto bueno a lo que tú pediste.');
  end if;
  if v_a.estado <> 'PENDIENTE' then
    return jsonb_build_object('ok', false, 'error', 'Esta solicitud ya se decidió.');
  end if;
  if not coalesce(p_aprobar, false) and coalesce(btrim(p_motivo), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Escribe por qué no se aprueba.');
  end if;

  update public.aprobacion
     set estado          = case when p_aprobar then 'APROBADA' else 'RECHAZADA' end,
         decidido_por    = auth.uid(),
         decidido_nombre = coalesce(public._nombre_usuario_actual(), ''),
         decidido_en     = v_now,
         motivo          = nullif(btrim(coalesce(p_motivo, '')), ''),
         updated_at      = v_now
   where id = p_id;

  return jsonb_build_object('ok', true, 'estado', case when p_aprobar then 'APROBADA' else 'RECHAZADA' end);
end $$;

revoke all on function public.decidir_aprobacion(uuid, boolean, text) from public, anon;
grant execute on function public.decidir_aprobacion(uuid, boolean, text) to authenticated;

-- 6d. Enviar un extra (reescrita desde 0036). Para el ADMIN no cambia nada.
-- Supervisor y residente (de esa obra) pueden enviarlo si el visto bueno
-- alcanza (6a). La foto, el congelado y los mensajes son los de 0036.
create or replace function public.enviar_orden_cambio(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_oc    public.orden_cambio%rowtype;
  v_snap  jsonb;
  v_now   bigint := (extract(epoch from now()) * 1000)::bigint;
  v_campo boolean;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'No autenticado');
  end if;

  select * into v_oc from public.orden_cambio
   where id = p_id and deleted_at is null
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Extra no encontrado');
  end if;

  if not public.auth_tiene_rol(v_oc.empresa_id, 'admin') then
    v_campo := public.auth_tiene_rol(v_oc.empresa_id, 'supervisor')
               or public.auth_residente_obra(v_oc.empresa_id, v_oc.obra_id);
    if not v_campo then
      return jsonb_build_object('ok', false, 'error', 'Solo un administrador puede enviar extras al cliente.');
    end if;
    if not public._aprobacion_suficiente(v_oc.empresa_id, 'EXTRA', p_id, public._extra_total(p_id)) then
      return jsonb_build_object('ok', false, 'necesita_aprobacion', true,
        'error', 'Este extra necesita el visto bueno del administrador antes de mandarlo al cliente.');
    end if;
  end if;

  if v_oc.estado <> 'BORRADOR' then
    return jsonb_build_object('ok', false, 'error', 'Este extra ya se había enviado.');
  end if;

  if not exists (
    select 1 from public.orden_cambio_renglon
     where orden_cambio_id = p_id and deleted_at is null and btrim(concepto) <> ''
  ) then
    return jsonb_build_object('ok', false, 'error', 'Agrega al menos un concepto antes de enviarlo.');
  end if;

  v_snap := public._orden_cambio_snapshot(p_id);

  update public.orden_cambio
     set estado        = 'ENVIADA',
         snapshot_json = v_snap,
         total_enviado = (v_snap ->> 'total')::double precision,
         enviado_at    = v_now,
         enviado_por   = auth.uid(),
         updated_at    = v_now
   where id = p_id;

  return jsonb_build_object('ok', true, 'estado', 'ENVIADA', 'total', v_snap -> 'total');
end $$;

revoke all on function public.enviar_orden_cambio(uuid) from public, anon;
grant execute on function public.enviar_orden_cambio(uuid) to authenticated;

-- 6e. Emitir una orden de compra (reescrita desde 0038). Para el ADMIN no
-- cambia nada; el rol COMPRAS emite si el visto bueno alcanza (6a).
create or replace function public.emitir_orden_compra(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_oc    public.ordenes_compra%rowtype;
  v_total numeric;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'No autenticado');
  end if;
  select * into v_oc from public.ordenes_compra
   where id = p_id and deleted_at is null
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Orden de compra no encontrada');
  end if;
  if not public.auth_tiene_rol(v_oc.empresa_id, 'admin') then
    if not public.auth_tiene_rol(v_oc.empresa_id, 'compras') then
      return jsonb_build_object('ok', false, 'error', 'Solo un administrador puede emitir órdenes de compra.');
    end if;
    select t.total into v_total from public._orden_compra_totales(p_id, v_oc.iva_pct) t;
    if not public._aprobacion_suficiente(v_oc.empresa_id, 'COMPRA', p_id, v_total) then
      return jsonb_build_object('ok', false, 'necesita_aprobacion', true,
        'error', 'Esta orden necesita el visto bueno del administrador antes de mandarla al proveedor.');
    end if;
  end if;
  if v_oc.estado <> 'BORRADOR' then
    return jsonb_build_object('ok', false, 'error', 'Esta orden ya se había emitido.');
  end if;
  if not exists (
    select 1 from public.orden_compra_renglon where orden_compra_id = p_id and deleted_at is null
  ) then
    return jsonb_build_object('ok', false, 'error', 'Agrega al menos un renglón antes de emitirla.');
  end if;

  update public.ordenes_compra
     set estado = 'EMITIDA', updated_at = public.compras_ahora_ms()
   where id = p_id
  returning * into v_oc;

  update public.materiales m
     set ultimo_precio = x.precio,
         proveedor_id  = coalesce(m.proveedor_id, v_oc.proveedor_id),
         updated_at    = public.compras_ahora_ms()
    from (
      select r.material_id, max(r.precio_unitario) as precio
        from public.orden_compra_renglon r
       where r.orden_compra_id = p_id and r.deleted_at is null and r.material_id is not null
       group by r.material_id
    ) x
   where m.id = x.material_id and m.empresa_id = v_oc.empresa_id;

  return jsonb_build_object('ok', true, 'estado', v_oc.estado, 'total', v_oc.total, 'folio', v_oc.folio);
end $$;

revoke all on function public.emitir_orden_compra(uuid) from public, anon;
grant execute on function public.emitir_orden_compra(uuid) to authenticated;

-- 6f. Cancelar una orden de compra (reescrita desde 0038): también el rol
-- compras (es su documento). Las mismas condiciones: sin entregas ni pagos.
create or replace function public.cancelar_orden_compra(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_oc public.ordenes_compra%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'No autenticado');
  end if;
  select * into v_oc from public.ordenes_compra
   where id = p_id and deleted_at is null
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Orden de compra no encontrada');
  end if;
  if not public.auth_tiene_rol(v_oc.empresa_id, 'admin', 'compras') then
    return jsonb_build_object('ok', false, 'error', 'Solo un administrador o compras pueden cancelar órdenes de compra.');
  end if;
  if v_oc.estado = 'CANCELADA' then
    return jsonb_build_object('ok', true, 'estado', 'CANCELADA');
  end if;
  if exists (select 1 from public.recepciones r where r.orden_compra_id = p_id and r.deleted_at is null) then
    return jsonb_build_object('ok', false, 'error', 'Ya se recibió material de esta orden: no se puede cancelar.');
  end if;
  if exists (select 1 from public.pagos_proveedor p where p.orden_compra_id = p_id and p.deleted_at is null) then
    return jsonb_build_object('ok', false, 'error', 'Esta orden tiene pagos: anúlalos antes de cancelarla.');
  end if;
  update public.ordenes_compra
     set estado = 'CANCELADA', updated_at = public.compras_ahora_ms()
   where id = p_id;
  return jsonb_build_object('ok', true, 'estado', 'CANCELADA');
end $$;

revoke all on function public.cancelar_orden_compra(uuid) from public, anon;
grant execute on function public.cancelar_orden_compra(uuid) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 7. Registro de actividad (RF6.4)
-- ════════════════════════════════════════════════════════════════════════════
-- Quién cambió qué, en las tablas de DINERO y de PERMISOS. Solo columnas clave
-- (no la fila completa): basta para saber qué pasó y no duplica datos
-- personales. Lo llena un trigger genérico AFTER; no toca los triggers BEFORE
-- de sincronización (`server_updated_at`) y un UPDATE que solo movió
-- `updated_at`/`server_updated_at` (un reenvío del móvil) no se registra.
create table if not exists public.actividad (
  id              bigint generated always as identity primary key,
  empresa_id      uuid not null references public.empresas(id) on delete cascade,
  user_id         uuid,                 -- null = sistema / llave de servicio
  usuario_nombre  text not null default '',
  usuario_rol     text,
  tabla           text not null,
  registro_id     text,
  obra_id         uuid,                 -- sin FK: el registro sobrevive a la obra
  accion          text not null check (accion in ('CREAR', 'EDITAR', 'BORRAR', 'RESTAURAR', 'ELIMINAR')),
  cambios         text[],               -- columnas que cambiaron (EDITAR)
  resumen         text check (resumen is null or char_length(resumen) <= 1000),
  created_at      bigint not null default (extract(epoch from now()) * 1000)::bigint
);

create index if not exists idx_actividad_empresa on public.actividad (empresa_id, created_at desc);
create index if not exists idx_actividad_usuario on public.actividad (empresa_id, user_id, created_at desc);
create index if not exists idx_actividad_tabla   on public.actividad (empresa_id, tabla, created_at desc);

alter table public.actividad enable row level security;

drop policy if exists actividad_admin_read on public.actividad;
create policy actividad_admin_read on public.actividad
  for select using (public.auth_tiene_rol(empresa_id, 'admin'));

-- Nadie escribe directo: ni policies de escritura ni permisos de tabla.
revoke insert, update, delete, truncate on public.actividad from public, anon, authenticated;

-- Y nadie la reescribe ni la borra, ni siquiera el admin ni la llave de
-- servicio: el único borrado permitido es el de la cascada cuando se elimina
-- la empresa completa (la fila de `empresas` ya no existe en ese momento).
create or replace function public.actividad_inmutable()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE'
     and not exists (select 1 from public.empresas e where e.id = old.empresa_id) then
    return old;
  end if;
  raise exception 'El registro de actividad no se puede cambiar ni borrar.'
    using errcode = 'P0001';
end $$;

drop trigger if exists trg_actividad_inmutable on public.actividad;
create trigger trg_actividad_inmutable
  before update or delete on public.actividad
  for each row execute function public.actividad_inmutable();

create or replace function public.actividad_sin_truncate()
returns trigger
language plpgsql
as $$
begin
  raise exception 'El registro de actividad no se puede vaciar.' using errcode = 'P0001';
end $$;

drop trigger if exists trg_actividad_sin_truncate on public.actividad;
create trigger trg_actividad_sin_truncate
  before truncate on public.actividad
  for each statement execute function public.actividad_sin_truncate();

-- El trigger genérico. Los argumentos son las columnas clave que van al
-- resumen (p. ej. 'tipo', 'monto', 'concepto'). NUNCA lanza: un error aquí
-- atoraría la sincronización del móvil (lección del 23514); si algo falla,
-- deja un WARNING en el log de Postgres y sigue.
create or replace function public.registrar_actividad()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new     jsonb;
  v_old     jsonb;
  v_fila    jsonb;
  v_empresa uuid;
  v_accion  text;
  v_cambios text[];
  v_resumen text;
  v_nombre  text;
  v_rol     text;
  k         text;
  i         int;
begin
  begin
    if tg_op <> 'DELETE' then v_new := to_jsonb(new); end if;
    if tg_op <> 'INSERT' then v_old := to_jsonb(old); end if;
    v_fila := coalesce(v_new, v_old);
    v_empresa := (v_fila ->> 'empresa_id')::uuid;
    if v_empresa is null then
      return null;
    end if;

    if tg_op = 'INSERT' then
      v_accion := 'CREAR';
    elsif tg_op = 'DELETE' then
      v_accion := 'ELIMINAR';
    else
      select array_agg(n.key order by n.key) into v_cambios
        from jsonb_each(v_new) n
       where n.key not in ('updated_at', 'server_updated_at')
         and n.value is distinct from (v_old -> n.key);
      if v_cambios is null then
        return null;          -- reenvío sin cambios reales
      end if;
      if (v_old ->> 'deleted_at') is null and (v_new ->> 'deleted_at') is not null then
        v_accion := 'BORRAR';
      elsif (v_old ->> 'deleted_at') is not null and (v_new ->> 'deleted_at') is null then
        v_accion := 'RESTAURAR';
      else
        v_accion := 'EDITAR';
      end if;
    end if;

    -- En la cascada de "eliminar la empresa" no queda a quién registrarle.
    if not exists (select 1 from public.empresas e where e.id = v_empresa) then
      return null;
    end if;

    for i in 0 .. tg_nargs - 1 loop
      k := tg_argv[i];
      if v_fila ? k then
        v_resumen := concat_ws(' · ', v_resumen,
          k || ': ' || left(coalesce(v_fila ->> k, '—'), 120));
      end if;
    end loop;

    if auth.uid() is not null then
      v_nombre := public._nombre_usuario_actual();
      select ue.rol into v_rol from public.usuarios_empresa ue
       where ue.user_id = auth.uid() and ue.empresa_id = v_empresa;
    end if;

    insert into public.actividad
      (empresa_id, user_id, usuario_nombre, usuario_rol, tabla, registro_id,
       obra_id, accion, cambios, resumen)
    values
      (v_empresa, auth.uid(), coalesce(v_nombre, ''), v_rol, tg_table_name,
       coalesce(v_fila ->> 'id', v_fila ->> 'user_id', v_fila ->> 'empresa_id'),
       public.compras_uuid(v_fila ->> 'obra_id'),
       v_accion, v_cambios, left(v_resumen, 1000));
  exception when others then
    raise warning 'registrar_actividad(%): %', tg_table_name, sqlerrm;
  end;
  return null;
end $$;

revoke all on function public.registrar_actividad() from public, anon, authenticated;

-- Tablas de dinero y de permisos, con sus columnas clave.
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('movimientos',       array['tipo', 'monto', 'concepto', 'categoria']),
      ('pagos',             array['monto', 'concepto', 'cotizacion_id']),
      ('cotizaciones',      array['nombre_proyecto', 'cliente', 'estado']),
      ('orden_cambio',      array['folio', 'titulo', 'estado', 'total_enviado']),
      ('estimaciones',      array['folio', 'estado', 'neto']),
      ('subcontrato_pago',  array['monto', 'retencion', 'subcontrato_id']),
      ('usuarios_empresa',  array['user_id', 'rol']),
      ('usuario_obra',      array['user_id', 'obra_id', 'hasta']),
      ('regla_aprobacion',  array['tipo', 'monto_minimo', 'rol_aprobador', 'activa']),
      ('aprobacion',        array['tipo', 'estado', 'monto', 'objeto_id']),
      ('ordenes_compra',    array['folio', 'estado', 'total', 'proveedor_id']),
      ('pagos_proveedor',   array['monto', 'orden_compra_id', 'metodo_pago'])
    ) as x(tabla, cols)
  loop
    execute format('drop trigger if exists trg_actividad on public.%I;', r.tabla);
    execute format(
      'create trigger trg_actividad after insert or update or delete on public.%I '
      'for each row execute function public.registrar_actividad(%s);',
      r.tabla,
      (select string_agg(quote_literal(c), ', ') from unnest(r.cols) c));
  end loop;
end $$;

-- Configuración de la empresa: solo cuando cambian los MÓDULOS (lo demás son
-- gustos del PDF y del orden, que no son dinero ni permisos).
drop trigger if exists trg_actividad on public.empresa_config;
create trigger trg_actividad
  after update of modulos on public.empresa_config
  for each row
  when (old.modulos is distinct from new.modulos)
  execute function public.registrar_actividad('modulos');
