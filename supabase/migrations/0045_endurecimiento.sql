-- 0045_endurecimiento.sql — ENDURECIMIENTO tras la revisión de seguridad
-- Decisiones con su porqué: docs/PROGRESO_ALCANCE.md, sección "Endurecimiento
-- tras revisión de seguridad" (SEG-*).
-- Depende de: 0014 (policies `<t>_staff_delete`), 0020 (movimientos_staff_*),
--             0038 (pagos_proveedor), 0039 (estimaciones, obra_contrato),
--             0037 (cobro_fiscal), 0040 (subcontrato_pago), 0042 (residente).
-- Corre DESPUÉS de todas: aquí va lo que cambia policies de migraciones que YA
-- están en producción (0001–0034). Lo que corrige 0035–0044 (sin aplicar en
-- ningún Supabase todavía) se corrigió en su propia migración.
-- Idempotente. No borra datos.
--
-- QUÉ HACE
-- ────────
-- 1. SEG-A1b: el borrado FÍSICO de `obras`, `obra_presupuesto` y
--    `colaboradores` queda solo para el admin. Antes (0014) también lo tenía el
--    supervisor, y con `on delete cascade` borrar una obra se llevaba extras
--    aprobados, estimaciones, bitácora cerrada, garantías, incidentes y avance.
--    Los triggers de evidencia (0036–0043) ya lo impiden para lo que es
--    evidencia; esto cierra la puerta también para lo demás. La app borra con
--    `deleted_at` (UPDATE): ni la web (`web/src`) ni el móvil (`lib/`, el sync
--    manda tombstones, nunca DELETE; ver `lib/core/sync/sync_service.dart`)
--    hacen DELETE físico sobre esas tablas, así que nada se rompe.
-- 2. SEG-M3: un rol de campo (colaborador o residente) ya no puede cambiar ni
--    borrar un movimiento de caja que está LIGADO a dinero de la oficina: el
--    pago a un proveedor (0038, el espejo "la caja manda" lo propagaba al pago),
--    el cobro de una estimación (0039), el anticipo del contrato (0039), el pago
--    de un subcontrato (0040) o un cobro ya facturado (0037).

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Borrado físico de obras, presupuesto y colaboradores: solo admin (SEG-A1b)
-- ════════════════════════════════════════════════════════════════════════════
do $$
declare t text;
begin
  foreach t in array array['obras', 'obra_presupuesto', 'colaboradores'] loop
    execute format('drop policy if exists %I on public.%I;', t || '_staff_delete', t);
    execute format(
      'create policy %I on public.%I for delete '
      'using (public.auth_tiene_rol(empresa_id, ''admin''));',
      t || '_staff_delete', t);
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Movimientos ligados: los roles de campo no los tocan (SEG-M3)
-- ════════════════════════════════════════════════════════════════════════════
-- ¿El movimiento está ligado a algo que la oficina controla? Se miran TODAS las
-- filas, también las borradas: "des-borrar" la salida de un pago anulado lo
-- resucitaría por el espejo de 0038. SECURITY DEFINER: el colaborador no puede
-- leer pagos a proveedor ni estimaciones, y la respuesta no debe depender de eso.
create or replace function public.movimiento_ligado(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.pagos_proveedor p where p.movimiento_id = p_id)
      or exists (select 1 from public.estimaciones e where e.movimiento_id = p_id)
      or exists (select 1 from public.obra_contrato c where c.anticipo_movimiento_id = p_id)
      or exists (select 1 from public.subcontrato_pago s where s.movimiento_id = p_id)
      or exists (select 1 from public.cobro_fiscal f
                  where f.movimiento_id = p_id and f.estado = 'facturado' and f.deleted_at is null)
$$;
revoke all on function public.movimiento_ligado(uuid) from public, anon;
grant execute on function public.movimiento_ligado(uuid) to authenticated;

-- 2a. UPDATE: se NEUTRALIZA, no se rechaza.
--
-- Lo que se pidió en la revisión fue excluirlos en el USING de
-- `movimientos_staff_update` (0020). No sirve para el teléfono: el push del
-- móvil es un UPSERT (`insert … on conflict do update`), y cuando el USING de
-- UPDATE no deja pasar la fila existente, Postgres NO la salta en silencio:
-- lanza "new row violates row-level security policy (USING expression)"
-- (42501). Esa fila quedaría en `error` y se reintentaría en cada sync para
-- siempre: la misma lección del error 23514 (docs/). Probado en PGlite.
--
-- Por eso un trigger BEFORE UPDATE devuelve la fila COMO ESTABA. Se llama
-- `trg_movimiento_ligado_campo` para correr ANTES de `trg_srv_upd` (los BEFORE
-- corren en orden alfabético): así `server_updated_at` sí sube, y el siguiente
-- pull del teléfono baja la versión buena y corrige lo que el colaborador
-- había cambiado en su copia. El espejo de 0038 no ve cambio y no toca el pago.
-- Sin sesión (llave de servicio) y para admin, supervisor y contador, nada
-- cambia: son la oficina que corrige la caja ("la caja manda", F2).
create or replace function public._movimiento_ligado_campo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
     or not public.auth_tiene_rol(old.empresa_id, 'colaborador', 'residente')
     or not public.movimiento_ligado(old.id) then
    return new;
  end if;
  return old;
end $$;
revoke all on function public._movimiento_ligado_campo() from public, anon, authenticated;

drop trigger if exists trg_movimiento_ligado_campo on public.movimientos;
create trigger trg_movimiento_ligado_campo
  before update on public.movimientos
  for each row execute function public._movimiento_ligado_campo();

-- 2b. DELETE físico: el colaborador no lo tiene (0020). El residente sí (0042,
-- como el supervisor): se le quita sobre los ligados. Un DELETE que el USING no
-- deja pasar afecta 0 filas sin error, y el móvil nunca borra físico.
drop policy if exists movimientos_residente_delete on public.movimientos;
create policy movimientos_residente_delete on public.movimientos
  for delete using (
    public.auth_residente_obra(empresa_id, obra_id)
    and not public.movimiento_ligado(id)
  );

-- Correr en el SQL Editor de Supabase DESPUÉS de 0044. No se aplica a
-- producción sin el visto bueno de Mario (docs/PROGRESO_ALCANCE.md, regla de oro).
