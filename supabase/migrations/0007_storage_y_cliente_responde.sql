-- 0007_storage_y_cliente_responde.sql
-- 1) Storage bucket para archivos de cotización (uso interno del staff).
-- 2) RPC para que el cliente acepte/rechace su cotización (es solo-lectura por RLS).
-- Depende de: 0001-0006. Correr en el SQL Editor de Supabase (vmkkkrlctakzzqebtyci).

-- ══ 1. Bucket de Storage (privado) ═══════════════════════════════════════════
insert into storage.buckets (id, name, public)
values ('cotizaciones', 'cotizaciones', false)
on conflict (id) do nothing;

-- Convención de ruta: {empresa_id}/{cotizacion_id}/{archivo}. La primera carpeta
-- es el empresa_id, que se usa para aislar por empresa en las policies.

-- Solo el personal (admin/supervisor/colaborador) de la empresa dueña puede
-- leer/subir/borrar archivos de su empresa. Los clientes NO acceden a este
-- bucket (los archivos de cotización son de uso interno).
drop policy if exists cotz_staff_select on storage.objects;
create policy cotz_staff_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'cotizaciones'
    and public.auth_tiene_rol((storage.foldername(name))[1]::uuid, 'admin', 'supervisor', 'colaborador')
  );

drop policy if exists cotz_staff_insert on storage.objects;
create policy cotz_staff_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'cotizaciones'
    and public.auth_tiene_rol((storage.foldername(name))[1]::uuid, 'admin', 'supervisor', 'colaborador')
  );

drop policy if exists cotz_staff_delete on storage.objects;
create policy cotz_staff_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'cotizaciones'
    and public.auth_tiene_rol((storage.foldername(name))[1]::uuid, 'admin', 'supervisor', 'colaborador')
  );

-- ══ 2. RPC: el cliente acepta o rechaza su cotización ════════════════════════
-- El rol cliente es solo-lectura (RLS). Esta función SECURITY DEFINER permite el
-- único cambio que puede hacer: responder una cotización que le pertenece y que
-- esté en estado ENVIADA.
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

  -- La cotización debe pertenecer a un cliente ligado a este usuario.
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
    set estado = v_nuevo, updated_at = v_now
    where id = p_cotizacion_id;

  return jsonb_build_object('ok', true, 'estado', v_nuevo);
end;
$$;
