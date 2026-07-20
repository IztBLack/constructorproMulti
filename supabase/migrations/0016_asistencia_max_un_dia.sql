-- 0016_asistencia_max_un_dia.sql — Impide que una persona acumule más de UN día
-- de asistencia en una misma fecha, sumando TODAS las obras.
--
-- Por qué hace falta: `uq_asist` es unique (colaborador_id, obra_id, fecha) — el
-- `obra_id` forma parte de la llave, así que la base ACEPTA por diseño que la
-- misma persona tenga 1 día en la obra A y 1 día en la obra B el mismo martes.
-- Eso son dos jornadas cobradas por un solo día natural.
--
-- Caso real detectado el 2026-07-19: Daniel Ruiz y Eloy Cruz, martes 30-jun-2026,
-- 1 día completo en Boticaria y 1 en Costa Verde cada uno. Las cuatro filas se
-- escribieron en el mismo segundo y con `created_at = 0`, es decir por una carga
-- masiva (restauración/puente de datos), no por el pase de lista. La obra
-- Boticaria ya tenía precedente de duplicados por importación (ver commit
-- cb32494, que arregló la deduplicación de movimientos pero no tocó asistencias).
--
-- La regla NO es "una sola obra por día": medio día en cada una (0.5 + 0.5) es
-- legítimo y debe permitirse. Lo que se prohíbe es que el TOTAL pase de 1.
--
-- Cubre las tres vías de escritura a la vez —web, app móvil y cargas masivas—,
-- que es justamente lo que una validación en la aplicación no puede hacer.
--
-- Aditivo e idempotente. NO modifica ni borra filas existentes.
-- Depende de: 0002 (tabla asistencias).
-- Correr en el SQL Editor de Supabase (vmkkkrlctakzzqebtyci).

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Función de validación
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.asistencia_max_un_dia()
returns trigger
language plpgsql
-- SECURITY DEFINER a propósito: la comprobación tiene que ver TODAS las filas de
-- esa persona en esa fecha. Bajo las RLS del invocante podría no verlas todas y
-- dejaría pasar el duplicado justo en el caso que queremos bloquear.
-- No filtra datos entre empresas: solo lee filas del mismo `colaborador_id`, que
-- por definición pertenecen a la misma empresa que la fila entrante.
security definer
set search_path = public, pg_temp
as $$
declare
  -- `fraccion` es double precision; se compara con holgura para que 0.5 + 0.5 o
  -- 0.75 + 0.25 no se rechacen por un error de representación binaria.
  eps      constant double precision := 1e-6;
  otras    double precision;
  detalle  text;
begin
  -- Borrar en suave siempre se permite: es la vía de corrección.
  if new.deleted_at is not null then
    return new;
  end if;

  -- Un UPDATE que no aumenta la fracción tampoco se bloquea. Sin esta salida, el
  -- dato malo que YA existe quedaría imposible de re-sincronizar desde el móvil
  -- (su push haría UPDATE de una fila que de por sí viola la regla) y el sync
  -- empezaría a fallar en bucle. Así se puede corregir a la baja y convivir con
  -- lo heredado, pero no crear violaciones nuevas ni empeorar las existentes.
  if tg_op = 'UPDATE' and new.fraccion <= old.fraccion then
    return new;
  end if;

  select coalesce(sum(a.fraccion), 0)
    into otras
    from public.asistencias a
   where a.colaborador_id = new.colaborador_id
     and a.fecha          = new.fecha
     and a.deleted_at is null
     and a.id <> new.id;          -- la propia fila no se cuenta dos veces

  if otras + new.fraccion > 1 + eps then
    select string_agg(o.nombre || ' (' || a.fraccion || ')', ', ' order by o.nombre)
      into detalle
      from public.asistencias a
      join public.obras o on o.id = a.obra_id
     where a.colaborador_id = new.colaborador_id
       and a.fecha          = new.fecha
       and a.deleted_at is null
       and a.id <> new.id;

    raise exception
      'La asistencia de esa persona ese día sumaría % jornadas (máximo 1). Ya tiene: %. Corrige o borra el registro anterior antes de agregar este.',
      round((otras + new.fraccion)::numeric, 2),
      coalesce(detalle, 'sin detalle')
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.asistencia_max_un_dia() is
  'Impide que la suma de fracciones de asistencia de un colaborador en una fecha supere 1 jornada, contando todas las obras. Ver 0016.';

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Trigger
-- ════════════════════════════════════════════════════════════════════════════
drop trigger if exists trg_asistencia_max_un_dia on public.asistencias;

create trigger trg_asistencia_max_un_dia
  before insert or update on public.asistencias
  for each row
  execute function public.asistencia_max_un_dia();

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Verificación — filas que YA violan la regla (el trigger no las toca)
-- ════════════════════════════════════════════════════════════════════════════
-- Corre esto después de aplicar la migración. Lo que salga aquí es dato heredado
-- que hay que corregir a mano; el trigger solo evita que aparezcan nuevos.
--
--   select colaborador_id, fecha, sum(fraccion) as total, count(*) as registros
--     from public.asistencias
--    where deleted_at is null
--    group by colaborador_id, fecha
--   having sum(fraccion) > 1
--    order by total desc;
