-- 0047_herramienta_permanente.sql — HERRAMIENTA: asignación permanente ("de planta")
-- Depende de: 0043 (herramienta_asignacion y su trigger `herramienta_asignacion_reglas`,
--             con el candado SEG-M2), 0044 (policies del residente; no se tocan).
-- Aditiva e idempotente: se puede correr dos veces.
--
-- EL PROBLEMA (visto con datos reales)
-- ────────────────────────────────────
-- En /admin/herramienta una camioneta asignada de planta al cabo salía "Revisar ·
-- Lleva 182 días fuera: confirma dónde está"; lo mismo las escaleras y
-- esmeriladoras que una cuadrilla trae toda la obra. El semáforo de F7-17 (rojo
-- si pasó la fecha de regreso, amarillo hoy/mañana, sin fecha amarillo a los 30
-- días) no distinguía un PRÉSTAMO (va a regresar) de una ASIGNACIÓN DE PLANTA
-- (se queda a cargo de alguien o de la obra, sin fecha).
--
-- QUÉ AGREGA
-- ──────────
-- · `herramienta_asignacion.permanente boolean not null default false`. Todo lo
--   que ya existe queda como préstamo (false): no cambia nada de lo de hoy.
-- · CHECK `herramienta_permanente_sin_regreso`: una asignación permanente NO
--   lleva `devolver_antes` (permanente ⇒ devolver_antes is null). Se agrega
--   solo si no existe. Las filas viejas son false, así que la validación pasa.
-- · Una permanente se CIERRA igual que un préstamo ("Registrar regreso": `hasta`
--   + `estado_regreso`); el índice "un préstamo abierto a la vez" la cuenta
--   igual (sigue siendo "dónde está cada cosa").
-- · Mientras esté ABIERTA se puede convertir préstamo ↔ permanente (un UPDATE
--   normal; la web quita la fecha de regreso al volverla permanente).
--
-- CANDADO SEG-M2 (préstamo cerrado = historial)
-- ─────────────────────────────────────────────
-- `permanente` se INCLUYE a propósito en las columnas de contenido que compara
-- `herramienta_asignacion_reglas()`: de un préstamo ya devuelto no se puede
-- cambiar si fue préstamo o asignación de planta (es parte de lo que pasó).
-- También entra en la tupla "sin cambios" de la excepción de la FK `on delete
-- set null` (pg_trigger_depth() > 1). Por eso aquí se REESCRIBE la función con
-- el mismo cuerpo de 0043 + la columna nueva. Aviso (misma clase que SEG-B1):
-- si alguien vuelve a correr 0043 SOLA después de esta, la función regresa a la
-- versión sin `permanente` (el candado seguiría cubriendo todo lo demás); basta
-- con volver a correr 0047.
--
-- RLS: SIN CAMBIOS. Quien hoy puede editar un préstamo abierto (admin y
-- supervisor; el residente, el de SU obra, 0044) puede convertirlo; eso ya le
-- dejaba cambiar la fecha de regreso, que es lo mismo en alcance. La web solo
-- ofrece convertir a admin y supervisor (prestar/asignar es de oficina, F6-5).
-- El contador sigue solo leyendo.
--
-- MÓVIL: no sincroniza herramienta (D6); la columna tiene default y no rompe
-- nada que lea con `select *`.
--
-- REVERSA (manual):
--   alter table public.herramienta_asignacion
--     drop constraint if exists herramienta_permanente_sin_regreso,
--     drop column if exists permanente;
--   y volver a correr la sección "herramienta_asignacion_reglas" de 0043.

alter table public.herramienta_asignacion
  add column if not exists permanente boolean not null default false;

comment on column public.herramienta_asignacion.permanente is
  'true = asignación de planta (queda a cargo de alguien o de la obra, sin fecha de regreso ni alerta). '
  'false = préstamo (con o sin fecha de regreso). 0047.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'herramienta_permanente_sin_regreso'
       and conrelid = 'public.herramienta_asignacion'::regclass
  ) then
    alter table public.herramienta_asignacion
      add constraint herramienta_permanente_sin_regreso
      check (not permanente or devolver_antes is null);
  end if;
end $$;

-- Mismo cuerpo que 0043 (SEG-M2) + `permanente` en las dos comparaciones.
create or replace function public.herramienta_asignacion_reglas()
returns trigger
language plpgsql
set search_path = public
as $$
declare v_estado text;
begin
  if tg_op = 'INSERT' then
    if new.obra_id is null and new.colaborador_id is null then
      raise exception 'HERRAMIENTA_SIN_DESTINO: di a qué obra va o quién se la lleva.' using errcode = 'P0001';
    end if;
    select h.estado into v_estado from public.herramienta h
     where h.id = new.herramienta_id and h.deleted_at is null;
    if v_estado = 'BAJA' then
      raise exception 'HERRAMIENTA_BAJA: esta herramienta está dada de baja.' using errcode = 'P0001';
    end if;
    return new;
  end if;

  new.empresa_id     := old.empresa_id;
  new.herramienta_id := old.herramienta_id;
  -- Un préstamo ya cerrado es historial: no se reescribe (solo se puede ocultar).
  -- SEG-M2: el contenido se compara SIEMPRE, cambie o no `deleted_at`, y
  -- `deleted_at` solo pasa de vacío a una fecha. Única excepción: la FK `on
  -- delete set null` de obra o colaborador (pg_trigger_depth() > 1).
  -- 0047: `permanente` es contenido (si fue préstamo o asignación de planta).
  if old.hasta is not null then
    if (new.obra_id, new.colaborador_id, new.desde, new.devolver_antes, new.hasta,
        new.entrego_nombre, new.recibio_nombre, new.estado_regreso, new.notas, new.permanente)
       is distinct from
       (old.obra_id, old.colaborador_id, old.desde, old.devolver_antes, old.hasta,
        old.entrego_nombre, old.recibio_nombre, old.estado_regreso, old.notas, old.permanente)
       and not (
         pg_trigger_depth() > 1
         and (new.obra_id is null or new.obra_id = old.obra_id)
         and (new.colaborador_id is null or new.colaborador_id = old.colaborador_id)
         and (new.desde, new.devolver_antes, new.hasta, new.entrego_nombre,
              new.recibio_nombre, new.estado_regreso, new.notas, new.permanente)
             is not distinct from
             (old.desde, old.devolver_antes, old.hasta, old.entrego_nombre,
              old.recibio_nombre, old.estado_regreso, old.notas, old.permanente)
       )
    then
      raise exception 'HERRAMIENTA_HISTORIAL: un préstamo ya devuelto no se cambia.' using errcode = 'P0001';
    end if;
    if old.deleted_at is not null and new.deleted_at is distinct from old.deleted_at then
      raise exception 'HERRAMIENTA_HISTORIAL: un préstamo ya devuelto y borrado no se restaura ni se cambia.'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
-- El trigger `trg_herramienta_asignacion_reglas` (0043) ya apunta a esta
-- función: no hace falta recrearlo.
