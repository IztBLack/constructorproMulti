-- 0036_rls_initplan.sql — Que las policies se evalúen UNA VEZ por consulta,
--                          no una vez por FILA.
-- Depende de: 0001 (auth_empresa_ids, auth_tiene_rol), y de todas las que crean
--             policies: 0003, 0006, 0010, 0014, 0015, 0017, 0018, 0019, 0020,
--             0022, 0023, 0024, 0027, 0031.
--
-- ⚠️ ESTA MIGRACIÓN TOCA SEGURIDAD. Léela entera antes de aplicarla, y aplícala
--    SOLA, sin nada más en el mismo despliegue. Ver § "Cómo verificar" al final.
--
-- ════════════════════════════════════════════════════════════════════════════
-- EL PROBLEMA
-- ════════════════════════════════════════════════════════════════════════════
-- 107 de las 119 policies del esquema tienen esta forma:
--
--     using (auth_tiene_rol(empresa_id, VARIADIC ARRAY['admin','supervisor']))
--
-- `auth_tiene_rol` recibe `empresa_id` **de la fila que se está evaluando**. Eso
-- significa que Postgres NO puede sacar la llamada del bucle: por cada fila
-- candidata ejecuta una subconsulta contra `usuarios_empresa`. Leer 50 000
-- movimientos son 50 000 ejecuciones de la misma pregunta, cuya respuesta no
-- cambió ni una vez.
--
-- Es el antipatrón de RLS que Supabase documenta, y el que más caro sale cuando
-- las tablas crecen: el coste no está en el índice, está en el filtro.
--
-- ════════════════════════════════════════════════════════════════════════════
-- LA SOLUCIÓN
-- ════════════════════════════════════════════════════════════════════════════
-- Invertir la dirección de la pregunta. En vez de
--
--     "¿tengo rol R en la empresa DE ESTA FILA?"        (depende de la fila)
--
-- preguntar
--
--     "¿la empresa de esta fila está entre aquellas donde tengo rol R?"
--      empresa_id in (select public.auth_empresas_con_rol('admin','supervisor'))
--
-- La subconsulta ya NO depende de la fila, así que el planificador la resuelve
-- como *InitPlan*: la ejecuta una vez, guarda el conjunto de uuids y luego cada
-- fila es una comparación en memoria.
--
-- LAS DOS FORMAS SON LÓGICAMENTE IDÉNTICAS:
--     auth_tiene_rol(E, R)  ⇔  ∃ fila (user=yo, empresa=E, rol∈R)
--     E in (empresas donde yo tengo rol∈R)  ⇔  ∃ fila (user=yo, empresa=E, rol∈R)
-- El conjunto de filas permitidas no cambia. Esta migración no da ni quita
-- permisos a nadie: sólo cambia CUÁNTAS VECES se hace la comprobación.
--
-- ════════════════════════════════════════════════════════════════════════════
-- POR QUÉ SE REESCRIBEN EN BLOQUE Y NO A MANO
-- ════════════════════════════════════════════════════════════════════════════
-- Son 107 policies repartidas en 14 migraciones distintas. Reescribirlas a mano
-- significa 107 oportunidades de escribir mal una lista de roles, y el error no
-- daría ningún síntoma visible: daría acceso de más o de menos, en silencio.
--
-- Reescribirlas por sustitución mecánica sobre lo que la base REALMENTE tiene
-- (`pg_policies`) elimina esa clase de error: lo que entra es lo que ya estaba
-- aplicado, no lo que yo creo que estaba aplicado.
--
-- Todo va dentro de UN SOLO bloque `do`, que es una sola sentencia y por tanto
-- atómica: si cualquier comprobación falla, se lanza una excepción y NADA de lo
-- anterior queda aplicado. No existe el estado a medias.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. La función que sí se puede sacar del bucle
-- ════════════════════════════════════════════════════════════════════════════
-- Hermana de `auth_empresa_ids()` (0001), pero filtrando por rol. Igual que
-- aquella es SECURITY DEFINER, para poder consultarse DENTRO de una policy sin
-- provocar recursión de RLS sobre `usuarios_empresa`.
--
-- `stable` (no `volatile`) es lo que le permite al planificador ejecutarla una
-- sola vez por consulta. `set search_path = public` evita el secuestro por
-- search_path, que en una función SECURITY DEFINER sería una escalada.
create or replace function public.auth_empresas_con_rol(variadic p_roles text[])
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select empresa_id
    from public.usuarios_empresa
   where user_id = auth.uid()
     and rol = any(p_roles);
$$;

comment on function public.auth_empresas_con_rol(text[]) is
  'Empresas donde el usuario actual tiene alguno de los roles dados. Forma '
  'cacheable (InitPlan) de auth_tiene_rol(empresa_id, ...): equivalente '
  'lógicamente, pero se evalúa una vez por consulta en vez de una vez por fila.';

-- Un índice que soporte el filtro exacto de esa función. `idx_usuarios_empresa_user`
-- (0001) sólo cubre `user_id`; con el rol dentro, el InitPlan se resuelve sin
-- tocar la tabla.
create index if not exists idx_usuarios_empresa_user_rol
  on public.usuarios_empresa (user_id, rol);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Reescritura mecánica de las policies
-- ════════════════════════════════════════════════════════════════════════════
do $reescritura$
declare
  -- Patrón exacto de lo que se sustituye. Deliberadamente ESTRICTO: exige que
  -- el primer argumento sea literalmente `empresa_id` (la columna de la fila) y
  -- que el resto sea un ARRAY de literales. Cualquier uso más complejo de
  -- `auth_tiene_rol` —por ejemplo el de 0019, que valida la empresa del PADRE—
  -- no encaja y se queda tal cual estaba, que es justo lo que se quiere.
  patron  constant text := 'auth_tiene_rol\(empresa_id, VARIADIC (ARRAY\[[^]]*\])\)';
  reemplazo constant text := '(empresa_id IN (SELECT public.auth_empresas_con_rol(VARIADIC \1)))';

  p              record;
  nuevo_qual     text;
  nuevo_check    text;
  sql_crear      text;
  clausula_roles text;
  tipo           text;

  reescritas int := 0;
  antes      int;
  despues    int;
  restantes  int;
begin
  select count(*) into antes from pg_policies where schemaname = 'public';

  -- El listado se MATERIALIZA antes de tocar nada. Recorrer `pg_policies`
  -- mientras se hacen `drop policy` / `create policy` dentro del propio bucle
  -- es leer un catálogo que está cambiando debajo: podría saltarse filas o
  -- repetirlas. La copia es la lista de trabajo, y es inmune a eso.
  create temp table _policies_a_reescribir on commit drop as
    select tablename, policyname, permissive, roles, cmd, qual, with_check
      from pg_policies
     where schemaname = 'public'
       and (coalesce(qual, '') ~ patron or coalesce(with_check, '') ~ patron);

  for p in
    select * from _policies_a_reescribir order by tablename, policyname
  loop
    nuevo_qual  := regexp_replace(p.qual,       patron, reemplazo, 'g');
    nuevo_check := regexp_replace(p.with_check, patron, reemplazo, 'g');

    -- `roles` viene como name[]; se reconstruye tal cual estaba. Si es
    -- {public} el `to public` explícito es equivalente al implícito.
    clausula_roles := array_to_string(p.roles, ', ');
    tipo := case when p.permissive = 'PERMISSIVE' then 'permissive' else 'restrictive' end;

    sql_crear := format(
      'create policy %I on public.%I as %s for %s to %s',
      p.policyname, p.tablename, tipo, p.cmd, clausula_roles);

    if nuevo_qual is not null then
      sql_crear := sql_crear || format(' using (%s)', nuevo_qual);
    end if;
    if nuevo_check is not null then
      sql_crear := sql_crear || format(' with check (%s)', nuevo_check);
    end if;

    execute format('drop policy %I on public.%I;', p.policyname, p.tablename);
    execute sql_crear;

    reescritas := reescritas + 1;
  end loop;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 3. Auto-comprobaciones. Si alguna falla, se aborta TODO.
  -- ══════════════════════════════════════════════════════════════════════════

  -- (a) No se perdió ni se duplicó ninguna policy por el camino.
  select count(*) into despues from pg_policies where schemaname = 'public';
  if despues <> antes then
    raise exception
      'ABORTADO: había % policies y quedaron %. Ninguna reescritura se aplica.',
      antes, despues;
  end if;

  -- (b) Ya no queda ninguna del patrón por reescribir. Si quedara alguna, la
  --     sustitución falló a medias y es mejor no dejar el esquema mezclado.
  select count(*) into restantes
    from pg_policies
   where schemaname = 'public'
     and (coalesce(qual, '') ~ patron or coalesce(with_check, '') ~ patron);
  if restantes > 0 then
    raise exception
      'ABORTADO: % policies siguen con el patrón viejo tras la reescritura.',
      restantes;
  end if;

  -- (c) Prueba de equivalencia sobre los datos REALES: para cada combinación
  --     (usuario, empresa, conjunto de roles usado en el esquema), la forma
  --     vieja y la nueva tienen que dar el mismo booleano. Es la comprobación
  --     que de verdad dice "nadie ganó ni perdió acceso".
  declare
    discrepancias int;
  begin
    with usuarios as (
      select distinct user_id from public.usuarios_empresa
    ), empresas_todas as (
      select id from public.empresas
    ), conjuntos as (
      select array['admin']::text[]                                   as roles
      union all select array['admin','supervisor']
      union all select array['admin','supervisor','colaborador']
      union all select array['admin','supervisor','contador']
      union all select array['contador']
      union all select array['colaborador']
      union all select array['cliente']
    )
    select count(*) into discrepancias
      from usuarios u
     cross join empresas_todas e
     cross join conjuntos c
     where (
             exists (
               select 1 from public.usuarios_empresa x
                where x.user_id = u.user_id
                  and x.empresa_id = e.id
                  and x.rol = any(c.roles)
             )
           ) is distinct from (
             e.id in (
               select y.empresa_id from public.usuarios_empresa y
                where y.user_id = u.user_id
                  and y.rol = any(c.roles)
             )
           );

    if discrepancias > 0 then
      raise exception
        'ABORTADO: % combinaciones (usuario, empresa, roles) dan distinto '
        'resultado con la forma vieja y la nueva.', discrepancias;
    end if;
  end;

  raise notice 'OK: % policies reescritas de % totales.', reescritas, antes;
end
$reescritura$;

-- ════════════════════════════════════════════════════════════════════════════
-- CÓMO VERIFICAR DESPUÉS DE APLICARLA
-- ════════════════════════════════════════════════════════════════════════════
-- 1. Que no quede ninguna del patrón viejo (debe dar 0):
--
--      select count(*) from pg_policies
--       where schemaname='public'
--         and (coalesce(qual,'')||coalesce(with_check,''))
--             like '%auth_tiene_rol(empresa_id, VARIADIC%';
--
-- 2. Que el número total de policies siga siendo 119:
--
--      select count(*) from pg_policies where schemaname='public';
--
-- 3. Que el plan ya no repita el filtro por fila. Con una sesión de un usuario
--    real (no service_role, que salta RLS):
--
--      explain (analyze, buffers) select * from movimientos;
--
--    Antes: un `Filter: auth_tiene_rol(...)` con tantas ejecuciones como filas.
--    Después: un `InitPlan` y un `Hashed SubPlan` evaluados una sola vez.
--
-- 4. La prueba que de verdad importa: entrar con una cuenta de cada rol
--    (admin, supervisor, colaborador, contador, cliente) y comprobar que ve
--    exactamente lo mismo que antes. La comprobación (c) de arriba prueba la
--    equivalencia lógica, pero no sustituye a mirar la aplicación.
