-- 0024_comprobantes_movimiento.sql — Comprobante (imagen) por movimiento de caja
-- Depende de: 0007 (patrón de bucket privado), 0020 (movimientos), 0022 (contador)
--
-- Permite pegar la imagen del comprobante de transferencia a cada movimiento,
-- no solo el folio en texto (columna `referencia`). Sigue el mismo patrón del
-- bucket `cotizaciones` (0007): bucket privado, la ruta empieza con
-- `<empresa_id>/` y la policy valida el rol para esa empresa con
-- `auth_tiene_rol((storage.foldername(name))[1]::uuid, ...)`.
--
-- ALCANCE (decidido por el dueño): solo personal de OFICINA —admin, supervisor y
-- contador— ve y sube comprobantes. El colaborador de campo y el CLIENTE NO: un
-- comprobante puede traer datos bancarios que no se quieren exponer.

-- ── 1. Bucket privado ────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'comprobantes', 'comprobantes', false,
  10485760,  -- 10 MB
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ── 2. Columna en movimientos ────────────────────────────────────────────────
-- La RUTA del objeto en el bucket. Nullable → la mayoría de los movimientos no
-- traen comprobante. Segura para el móvil: al ser nueva y nullable, el pull la
-- ignora (filtra por columnas conocidas) y el push no la manda; el upsert de
-- sincronización la conserva porque no viaja en el payload.
alter table public.movimientos
  add column if not exists comprobante_uri text;

-- ── 3. Policies del bucket — solo oficina ────────────────────────────────────
-- SELECT (ver / URL firmada), INSERT (subir) y DELETE (quitar) para
-- admin/supervisor/contador de la empresa dueña de la ruta.
drop policy if exists comprobante_oficina_select on storage.objects;
create policy comprobante_oficina_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'comprobantes'
    and public.auth_tiene_rol((storage.foldername(name))[1]::uuid, 'admin', 'supervisor', 'contador')
  );

drop policy if exists comprobante_oficina_insert on storage.objects;
create policy comprobante_oficina_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'comprobantes'
    and public.auth_tiene_rol((storage.foldername(name))[1]::uuid, 'admin', 'supervisor', 'contador')
  );

drop policy if exists comprobante_oficina_delete on storage.objects;
create policy comprobante_oficina_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'comprobantes'
    and public.auth_tiene_rol((storage.foldername(name))[1]::uuid, 'admin', 'supervisor', 'contador')
  );
