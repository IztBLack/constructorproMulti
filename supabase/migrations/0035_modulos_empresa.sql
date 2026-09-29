-- 0035_modulos_empresa.sql — MÓDULOS POR EMPRESA (Fase F0 del alcance ampliado)
-- Depende de: 0005 (crear_empresa), 0017 (empresa_config), 0018 (escritura de
--             empresa_config solo admin), 0022 (lectura del contador)
-- Aditivo e idempotente. No borra datos ni cambia ninguna policy existente.
--
-- QUÉ ES
-- ──────
-- La app deja de ser "la misma para todos". Cada empresa elige qué partes usa:
-- el maestro que trabaja solo no ve cuadrillas ni proyección; la constructora
-- con oficina prende todo. Ver docs/PLAN_ALCANCE_AMPLIADO.md §2.
--
-- REGLA QUE MANDA: apagar un módulo OCULTA, nunca BORRA. Los datos siguen en su
-- tabla; si el módulo se vuelve a prender, todo sigue ahí. Por eso esta
-- migración NO toca RLS: el módulo es una preferencia de producto, no una
-- frontera de seguridad (plan §2.3). Mezclar las dos cosas complicaría cada
-- policy y rompería la regla anterior.
--
-- POR QUÉ EN empresa_config Y NO EN UNA TABLA APARTE
-- ─────────────────────────────────────────────────
-- Esa fila ya existe por empresa, ya la lee todo el personal (0017, 0022) y ya
-- solo la escribe el admin (0018). Una tabla nueva abriría otra puerta con sus
-- propias policies para guardar un arreglo.
--
-- QUÉ TRAE
-- ────────
--   1. `modulos text[]` (default = los 8 módulos que existen hoy) y `perfil jsonb`
--      (las respuestas del cuestionario de registro).
--   2. Fila de empresa_config para TODA empresa. `crear_empresa` (0005) nunca la
--      creaba: las empresas nacidas después de 0017 no tienen fila, y los
--      `update` de la web (IVA, PDF, orden) no escribían nada sin avisar.
--   3. Catálogo y dependencias como funciones, y un CHECK que impide guardar un
--      arreglo inválido aunque alguien escriba la columna a mano.
--   4. RPC `activar_modulos(text[])`: solo admin, valida y resuelve dependencias.
--   5. `crear_empresa` v2 con `p_modulos` y `p_perfil` opcionales (la llamada de
--      un solo argumento sigue funcionando igual).
--
-- ESPEJO EN LA WEB: `web/src/lib/modulos.ts` es la fuente del catálogo en la
-- interfaz. El test `web/src/lib/modulos.test.ts` lee ESTE archivo y falla si el
-- catálogo o las dependencias de aquí y de allá dejan de coincidir.

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. Catálogo y dependencias
-- ══════════════════════════════════════════════════════════════════════════════
-- Van como funciones `immutable` porque el CHECK de la sección 3 las usa, y un
-- CHECK solo puede llamar funciones inmutables.
--
-- El catálogo trae también los módulos que todavía no existen (F1 a F7). Así cada
-- fase solo cambia la web (`disponible: true`) y no necesita otra migración para
-- que su clave sea válida. Agregar una clave nueva aquí es seguro: el CHECK solo
-- se vuelve más permisivo. QUITAR una clave dejaría filas inválidas: no se hace.
create or replace function public.modulos_catalogo()
returns text[]
language sql
immutable
parallel safe
as $$
  select array[
    -- Existentes
    'obras', 'cotizaciones', 'equipo', 'cuadrillas', 'caja',
    'proyeccion', 'notas', 'portal',
    -- Futuros (fases F1–F7)
    'cambios', 'rentabilidad', 'fiscal', 'compras', 'estimaciones',
    'bitacora', 'programa', 'cumplimiento', 'subcontratos',
    'seguridad', 'postventa', 'herramienta'
  ]::text[]
$$;

-- Qué necesita cada módulo para funcionar. Ej.: las cuadrillas son grupos de
-- colaboradores; sin `equipo` no hay a quién agrupar.
create or replace function public.modulos_dependencias()
returns jsonb
language sql
immutable
parallel safe
as $$
  select '{
    "cuadrillas":   ["equipo"],
    "proyeccion":   ["equipo"],
    "estimaciones": ["cotizaciones"],
    "rentabilidad": ["cotizaciones"],
    "cambios":      ["cotizaciones"],
    "subcontratos": ["notas"],
    "fiscal":       ["cotizaciones"]
  }'::jsonb
$$;

-- Devuelve el arreglo con `obras` (el núcleo, siempre prendido) y todas sus
-- dependencias, sin repetidos y en el orden del catálogo. Repite hasta que ya no
-- entra nada nuevo, así una cadena de dependencias (A→B→C) también se resuelve.
-- NO valida claves: eso lo hacen el CHECK y las RPC, que dan mejor mensaje.
create or replace function public.modulos_resolver(p_modulos text[])
returns text[]
language plpgsql
immutable
parallel safe
set search_path = public
as $$
declare
  v_deps   jsonb  := public.modulos_dependencias();
  v_cat    text[] := public.modulos_catalogo();
  v_actual text[];
  v_antes  int;
begin
  v_actual := array(
    select distinct m
      from unnest(coalesce(p_modulos, '{}'::text[]) || array['obras']::text[]) as m
     where m is not null
  );

  loop
    v_antes := cardinality(v_actual);
    v_actual := array(
      select distinct x from (
        select unnest(v_actual) as x
        union
        select jsonb_array_elements_text(coalesce(v_deps -> m, '[]'::jsonb))
          from unnest(v_actual) as m
      ) s
    );
    exit when cardinality(v_actual) = v_antes;
  end loop;

  -- Orden del catálogo: el arreglo guardado se lee igual en cualquier fila, y
  -- dos listas con los mismos módulos quedan idénticas (útil al comparar).
  return array(
    select x from unnest(v_actual) as x
     order by coalesce(array_position(v_cat, x), 2147483647), x
  );
end $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. Columnas nuevas
-- ══════════════════════════════════════════════════════════════════════════════
-- El default es EXACTAMENTE lo que existe hoy: las empresas actuales quedan con
-- todo prendido y nadie pierde una pantalla el día del despliegue. Con un default
-- constante, Postgres 11+ agrega la columna sin reescribir la tabla.
alter table public.empresa_config
  add column if not exists modulos text[] not null default array[
    'obras', 'cotizaciones', 'equipo', 'cuadrillas', 'caja',
    'proyeccion', 'notas', 'portal'
  ]::text[];

-- Respuestas del cuestionario de registro:
--   { "tipo": "independiente|contratista|empresa|constructora",
--     "factura": "si|algunos|no",
--     "necesidades": ["cotizar", "raya", ...],
--     "proximamente": ["compras", ...],   -- lo pedido que aún no existe
--     "saltado": true|false,
--     "siguiente_paso_descartado": true|false }
-- Es la lista real de demanda para priorizar fases (plan §4.2). Nullable: las
-- empresas que ya existían nunca contestaron nada.
alter table public.empresa_config
  add column if not exists perfil jsonb;

comment on column public.empresa_config.modulos is
  'Módulos prendidos (claves de public.modulos_catalogo()). Apagar oculta, no borra. Se escribe con la RPC activar_modulos.';
comment on column public.empresa_config.perfil is
  'Respuestas del cuestionario de registro (tipo de empresa, necesidades). Dato de producto, no de seguridad.';

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. Candados de integridad
-- ══════════════════════════════════════════════════════════════════════════════
-- El admin puede hacer UPDATE directo sobre empresa_config (policy de 0018), así
-- que la RPC sola no bastaría para impedir un arreglo inválido. El CHECK sí:
--   · solo claves del catálogo,
--   · `obras` siempre presente,
--   · cerrado bajo dependencias (no se puede tener cuadrillas sin equipo).
-- Todas las filas existentes pasan: tienen el default, que cumple las tres.
alter table public.empresa_config
  drop constraint if exists empresa_config_modulos_validos;
alter table public.empresa_config
  add constraint empresa_config_modulos_validos check (
    modulos <@ public.modulos_catalogo()
    and 'obras' = any (modulos)
    and public.modulos_resolver(modulos) <@ modulos
  );

-- El perfil lo escribe el cuestionario, pero nada impide mandarle basura por la
-- API. Se exige un objeto y un tamaño razonable (unas pocas respuestas caben en
-- menos de 1 KB; 16 KB es holgura, no una invitación).
alter table public.empresa_config
  drop constraint if exists empresa_config_perfil_valido;
alter table public.empresa_config
  add constraint empresa_config_perfil_valido check (
    perfil is null
    or (jsonb_typeof(perfil) = 'object' and pg_column_size(perfil) <= 16384)
  );

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. Una fila de configuración por empresa (reparación)
-- ══════════════════════════════════════════════════════════════════════════════
-- Misma sentencia que 0017, repetida porque `crear_empresa` nunca insertó la
-- fila: toda empresa creada después de 0017 se quedó sin configuración. Con los
-- defaults de arriba quedan con los 8 módulos de hoy, igual que las demás.
insert into public.empresa_config (empresa_id)
select e.id from public.empresas e
where not exists (
  select 1 from public.empresa_config c where c.empresa_id = e.id
);

-- ══════════════════════════════════════════════════════════════════════════════
-- 5. RPC activar_modulos — la ÚNICA forma prevista de cambiar módulos
-- ══════════════════════════════════════════════════════════════════════════════
-- Recibe la lista COMPLETA de lo que debe quedar prendido (no un "agrega este"):
-- el mismo llamado sirve para prender y para apagar, y no hay carreras entre
-- "agrega A" y "quita B" mandados a la vez desde dos pestañas.
--
-- Si mañana los módulos se cobran (decisión D2: por ahora son gratis), el control
-- va AQUÍ y en ningún otro lado.
--
-- Devuelve jsonb {ok, error?, modulos?} como el resto de RPC de la app (0005,
-- 0018), para que la web muestre el mensaje sin traducir excepciones.
create or replace function public.activar_modulos(p_modulos text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa    uuid;
  v_rol        text;
  v_invalidos  text[];
  v_final      text[];
  v_now        bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'No autenticado');
  end if;

  -- La empresa es la PRIMERA membresía (por antigüedad), la misma que usa la web
  -- en `getEmpresaUsuario`. Así la RPC actúa sobre la empresa que el usuario
  -- está viendo, y no sobre otra en la que también sea admin.
  select ue.empresa_id, ue.rol into v_empresa, v_rol
    from public.usuarios_empresa ue
   where ue.user_id = auth.uid()
   order by ue.created_at asc
   limit 1;

  if v_empresa is null or v_rol <> 'admin' then
    return jsonb_build_object('ok', false,
      'error', 'Solo un administrador puede prender o apagar módulos.');
  end if;

  if p_modulos is null then
    return jsonb_build_object('ok', false, 'error', 'Falta la lista de módulos.');
  end if;

  -- Tope anti-basura: el catálogo tiene 20 claves; nadie legítimo manda 100.
  if cardinality(p_modulos) > 64 then
    return jsonb_build_object('ok', false, 'error', 'Demasiados módulos en la lista.');
  end if;

  if array_position(p_modulos, null) is not null then
    return jsonb_build_object('ok', false, 'error', 'La lista trae un módulo vacío.');
  end if;

  select array_agg(distinct m) into v_invalidos
    from unnest(p_modulos) as m
   where not (m = any (public.modulos_catalogo()));

  if v_invalidos is not null then
    return jsonb_build_object('ok', false,
      'error', 'Módulo desconocido: ' || array_to_string(v_invalidos, ', '));
  end if;

  v_final := public.modulos_resolver(p_modulos);

  -- La fila debería existir (sección 4 y crear_empresa v2), pero si faltara se
  -- crea con sus defaults y LUEGO se actualiza solo `modulos`. No se hace un
  -- upsert que escriba varias columnas: pisaría configuración que no es suya
  -- (regla RT7 del plan).
  insert into public.empresa_config (empresa_id)
  values (v_empresa)
  on conflict (empresa_id) do nothing;

  -- `updated_at` como el resto de escrituras de empresa_config; el trigger
  -- `trg_srv_upd` (0017) sella `server_updated_at` para el móvil.
  update public.empresa_config
     set modulos    = v_final,
         updated_at = v_now
   where empresa_id = v_empresa;

  return jsonb_build_object('ok', true, 'modulos', to_jsonb(v_final));
end $$;

revoke all on function public.activar_modulos(text[]) from public, anon;
grant execute on function public.activar_modulos(text[]) to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- 6. crear_empresa v2 — con módulos y perfil opcionales
-- ══════════════════════════════════════════════════════════════════════════════
-- SOBRECARGAS, EL PUNTO DELICADO: si se creara `crear_empresa(text, text[],
-- jsonb)` dejando viva la de 0005, una llamada con solo `p_nombre` coincidiría
-- con las dos y PostgREST respondería "could not choose the best candidate
-- function". Por eso se BORRA la versión de un argumento y la nueva lleva
-- defaults: `crear_empresa(p_nombre => 'X')` sigue funcionando igual que antes
-- (la web vieja, o un despliegue a medias, no se rompen).
--
-- Verificado antes de escribir esto: la app Flutter NO llama `crear_empresa`
-- (solo lo menciona en un comentario); la única llamada es
-- `web/src/app/onboarding/actions.ts`.
--
-- El cuerpo es el de 0005 (empresa + admin + catálogo base) MÁS la fila de
-- empresa_config, que antes nunca se creaba.
drop function if exists public.crear_empresa(text);

create or replace function public.crear_empresa(
  p_nombre  text,
  p_modulos text[] default null,
  p_perfil  jsonb  default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id    uuid;
  v_empresa_id uuid;
  v_now        bigint;
  v_modulos    text[];
  v_invalidos  text[];
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

  -- 3b. Módulos: sin lista → el paquete de hoy (perfil "contratista con
  --     cuadrillas", plan RF0.8). Con lista → se valida igual que en
  --     activar_modulos y se resuelven dependencias.
  if p_modulos is null then
    v_modulos := array['obras', 'cotizaciones', 'equipo', 'cuadrillas', 'caja',
                       'proyeccion', 'notas', 'portal']::text[];
  else
    if cardinality(p_modulos) > 64 or array_position(p_modulos, null) is not null then
      return jsonb_build_object('ok', false, 'error', 'La lista de módulos no es válida.');
    end if;

    select array_agg(distinct m) into v_invalidos
      from unnest(p_modulos) as m
     where not (m = any (public.modulos_catalogo()));

    if v_invalidos is not null then
      return jsonb_build_object('ok', false,
        'error', 'Módulo desconocido: ' || array_to_string(v_invalidos, ', '));
    end if;

    v_modulos := public.modulos_resolver(p_modulos);
  end if;

  -- 3c. Perfil: objeto o nada. El CHECK de la tabla también lo exige; aquí se
  --     revisa antes para no dejar una empresa a medio crear con un error crudo.
  if p_perfil is not null
     and (jsonb_typeof(p_perfil) <> 'object' or pg_column_size(p_perfil) > 16384) then
    return jsonb_build_object('ok', false, 'error', 'Las respuestas del cuestionario no son válidas.');
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

  -- 6b. Configuración de la empresa, con sus módulos y su perfil. Lo que no se
  --     indica (IVA, PDF) toma los defaults de la tabla.
  insert into public.empresa_config (empresa_id, modulos, perfil, created_at, updated_at)
  values (v_empresa_id, v_modulos, p_perfil, v_now, v_now)
  on conflict (empresa_id) do nothing;

  -- 7. Sembrar catálogo base canónico (10 conceptos de construcción).
  --    Idéntico a 0005: es_personalizado = false → viene del catálogo base.
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
  return jsonb_build_object('ok', true, 'empresa_id', v_empresa_id::text,
                            'modulos', to_jsonb(v_modulos));
end;
$$;

-- 0005 dejaba el EXECUTE por omisión (PUBLIC, incluido anon). No era explotable
-- —sin sesión `auth.uid()` es null y la función sale—, pero no hay razón para
-- ofrecerla a quien no ha iniciado sesión.
revoke all on function public.crear_empresa(text, text[], jsonb) from public, anon;
grant execute on function public.crear_empresa(text, text[], jsonb) to authenticated;

-- Correr en el SQL Editor de Supabase DESPUÉS de 0034. No se aplica a producción
-- sin el visto bueno de Mario (docs/PROGRESO_ALCANCE.md, regla de oro).
