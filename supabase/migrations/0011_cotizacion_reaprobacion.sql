-- 0011_cotizacion_reaprobacion.sql
-- Re-aprobación de cambios por el cliente.
--
-- Idea: cuando el cliente ACEPTA una cotización, guardamos una "foto" (snapshot)
-- de lo que aceptó en `cotizaciones.aprobado_snapshot_json`. Si el contratista
-- después edita secciones/partidas, el portal detecta que la versión actual
-- difiere de la foto y le muestra un diff + botón "Aprobar cambios", que vuelve
-- a tomar la foto (RPC `cliente_aprobar_cambios`).
--
-- El diff y el "¿hay cambios?" se calculan al vuelo en la app comparando la foto
-- contra el estado actual: aquí solo persistimos la foto.
--
-- Nota móvil: la app Flutter NO conoce esta columna (su tabla SQLite no la tiene),
-- así que su sync la ignora en el pull y nunca la manda en el push → nunca
-- sobrescribe el snapshot del servidor. Es un campo autoritativo del servidor.
--
-- Depende de: 0001-0007 (usa `cotizaciones`, `clientes`, y reemplaza el RPC de
-- 0007). Correr en el SQL Editor de Supabase (vmkkkrlctakzzqebtyci).

-- ══ 1. Columna del snapshot aprobado ═════════════════════════════════════════
alter table public.cotizaciones
  add column if not exists aprobado_snapshot_json text;

-- ══ 2. Helper: construye la foto (secciones + partidas + descuento/iva) ═══════
-- SECURITY DEFINER para poder leer secciones/partidas al armar la foto; los RPC
-- que lo invocan validan antes que la cotización pertenezca al cliente.
create or replace function public._cotizacion_snapshot(p_cotizacion_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'descuento', c.descuento,
    'iva_enabled', c.iva_enabled,
    'secciones', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'nombre', s.nombre,
          'orden', s.orden,
          'partidas', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', p.id,
                'descripcion', p.descripcion,
                'unidad', p.unidad,
                'cantidad', p.cantidad,
                'precio_unitario', p.precio_unitario,
                'orden', p.orden
              ) order by p.orden
            )
            from public.partidas p
            where p.seccion_id = s.id and p.deleted_at is null
          ), '[]'::jsonb)
        ) order by s.orden
      )
      from public.secciones s
      where s.cotizacion_id = c.id and s.deleted_at is null
    ), '[]'::jsonb)
  )
  from public.cotizaciones c
  where c.id = p_cotizacion_id;
$$;

-- ══ 3. RPC responder: al ACEPTAR, guarda la foto de la versión aceptada ══════
-- Reemplaza la versión de 0007: misma validación, pero al aceptar persiste el
-- snapshot para habilitar la re-aprobación de cambios posteriores.
create or replace function public.cliente_responder_cotizacion(
  p_cotizacion_id uuid,
  p_aceptar boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid;
  v_cli     uuid;
  v_estado  text;
  v_now     bigint;
  v_nuevo   text;
begin
  v_user := auth.uid();
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'No autenticado');
  end if;

  select c.cliente_id, c.estado into v_cli, v_estado
  from public.cotizaciones c
  where c.id = p_cotizacion_id and c.deleted_at is null;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Cotización no encontrada');
  end if;

  if v_cli is null or not exists (
    select 1 from public.clientes where id = v_cli and user_id = v_user
  ) then
    return jsonb_build_object('ok', false, 'error', 'No autorizado');
  end if;

  if v_estado <> 'ENVIADA' then
    return jsonb_build_object('ok', false, 'error', 'La cotización no está pendiente de respuesta');
  end if;

  v_nuevo := case when p_aceptar then 'ACEPTADA' else 'RECHAZADA' end;
  v_now := (extract(epoch from now()) * 1000)::bigint;

  update public.cotizaciones
    set estado = v_nuevo,
        updated_at = v_now,
        -- Al aceptar, congela la foto de lo aceptado; al rechazar, no aplica.
        aprobado_snapshot_json = case
          when p_aceptar then public._cotizacion_snapshot(p_cotizacion_id)::text
          else aprobado_snapshot_json
        end
    where id = p_cotizacion_id;

  return jsonb_build_object('ok', true, 'estado', v_nuevo);
end;
$$;

-- ══ 4. RPC aprobar cambios: el cliente confirma la versión editada ═══════════
-- Solo válido sobre una cotización ACEPTADA suya. Vuelve a tomar la foto = la
-- versión actual, de modo que el aviso de "cambios sin aprobar" desaparece.
create or replace function public.cliente_aprobar_cambios(
  p_cotizacion_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid;
  v_cli     uuid;
  v_estado  text;
  v_now     bigint;
begin
  v_user := auth.uid();
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'No autenticado');
  end if;

  select c.cliente_id, c.estado into v_cli, v_estado
  from public.cotizaciones c
  where c.id = p_cotizacion_id and c.deleted_at is null;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Cotización no encontrada');
  end if;

  if v_cli is null or not exists (
    select 1 from public.clientes where id = v_cli and user_id = v_user
  ) then
    return jsonb_build_object('ok', false, 'error', 'No autorizado');
  end if;

  if v_estado <> 'ACEPTADA' then
    return jsonb_build_object('ok', false, 'error', 'Solo se aprueban cambios de una cotización aceptada');
  end if;

  v_now := (extract(epoch from now()) * 1000)::bigint;

  update public.cotizaciones
    set aprobado_snapshot_json = public._cotizacion_snapshot(p_cotizacion_id)::text,
        updated_at = v_now
    where id = p_cotizacion_id;

  return jsonb_build_object('ok', true);
end;
$$;
