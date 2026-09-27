-- 0044_residente_seguridad_postventa.sql â€” RESIDENTE en seguridad, garantÃ­as y herramienta (F6)
-- Depende de: 0042 (auth_residente_obra, usuario_obra), 0043 (tablas y buckets
--             `seguridad` y `postventa`), 0038 (compras_uuid).
--
-- Por quÃ© va aparte: 0042 es el nÃºmero reservado de F6, pero las tablas de F7
-- (0043) se crean DESPUÃ‰S en una base nueva (orden alfabÃ©tico). Estas policies
-- son la continuaciÃ³n de la secciÃ³n 3 de 0042, con las mismas reglas: lo que
-- el supervisor hace en seguridad, garantÃ­as y herramienta, el residente lo
-- hace SOLO en sus obras. Aditivo e idempotente; no toca policies existentes.
-- NUNCA `incidente_salud` (D8: solo el admin) ni la carpeta `incidentes/` del
-- bucket `seguridad` (F7-2).
--
-- REVERSA: borrar las policies con sufijo `_residente` de este archivo.

-- GarantÃ­a de la obra (fecha de entrega y meses): solo lectura, como el supervisor.
drop policy if exists obra_garantia_residente_read on public.obra_garantia;
create policy obra_garantia_residente_read on public.obra_garantia
  for select using (public.auth_residente_obra(empresa_id, obra_id));

-- 3k. GarantÃ­as (0043) de su obra.
drop policy if exists garantia_reporte_residente_read on public.garantia_reporte;
create policy garantia_reporte_residente_read on public.garantia_reporte
  for select using (public.auth_residente_obra(empresa_id, obra_id));

drop policy if exists garantia_reporte_residente_insert on public.garantia_reporte;
create policy garantia_reporte_residente_insert on public.garantia_reporte
  for insert with check (public.auth_residente_obra(empresa_id, obra_id) and origen = 'OFICINA');

drop policy if exists garantia_reporte_residente_update on public.garantia_reporte;
create policy garantia_reporte_residente_update on public.garantia_reporte
  for update
  using (public.auth_residente_obra(empresa_id, obra_id))
  with check (public.auth_residente_obra(empresa_id, obra_id));

drop policy if exists garantia_foto_residente_read on public.garantia_foto;
create policy garantia_foto_residente_read on public.garantia_foto
  for select using (exists (
    select 1 from public.garantia_reporte r
     where r.id = garantia_foto.reporte_id and r.empresa_id = garantia_foto.empresa_id
       and public.auth_residente_obra(r.empresa_id, r.obra_id)));

drop policy if exists garantia_foto_residente_insert on public.garantia_foto;
create policy garantia_foto_residente_insert on public.garantia_foto
  for insert with check (
    not subida_por_cliente
    and exists (
      select 1 from public.garantia_reporte r
       where r.id = garantia_foto.reporte_id and r.empresa_id = garantia_foto.empresa_id
         and r.deleted_at is null
         and garantia_foto.path like r.empresa_id::text || '/' || r.obra_id::text || '/' || r.id::text || '/%'
         and public.auth_residente_obra(r.empresa_id, r.obra_id))
  );

drop policy if exists garantia_foto_residente_update on public.garantia_foto;
create policy garantia_foto_residente_update on public.garantia_foto
  for update
  using (exists (
    select 1 from public.garantia_reporte r
     where r.id = garantia_foto.reporte_id and r.empresa_id = garantia_foto.empresa_id
       and public.auth_residente_obra(r.empresa_id, r.obra_id)))
  with check (exists (
    select 1 from public.garantia_reporte r
     where r.id = garantia_foto.reporte_id and r.empresa_id = garantia_foto.empresa_id
       and public.auth_residente_obra(r.empresa_id, r.obra_id)));

-- 3l. Seguridad (0043) de su obra. NUNCA `incidente_salud` (D8: solo admin).
drop policy if exists seguridad_checklist_residente_read on public.seguridad_checklist;
create policy seguridad_checklist_residente_read on public.seguridad_checklist
  for select using (public.auth_residente_obra(empresa_id, obra_id));

drop policy if exists seguridad_checklist_residente_insert on public.seguridad_checklist;
create policy seguridad_checklist_residente_insert on public.seguridad_checklist
  for insert with check (public.auth_residente_obra(empresa_id, obra_id));

drop policy if exists seguridad_checklist_residente_update on public.seguridad_checklist;
create policy seguridad_checklist_residente_update on public.seguridad_checklist
  for update
  using (public.auth_residente_obra(empresa_id, obra_id))
  with check (public.auth_residente_obra(empresa_id, obra_id));

drop policy if exists incidente_residente_read on public.incidente;
create policy incidente_residente_read on public.incidente
  for select using (public.auth_residente_obra(empresa_id, obra_id));

drop policy if exists incidente_residente_insert on public.incidente;
create policy incidente_residente_insert on public.incidente
  for insert with check (
    public.auth_residente_obra(empresa_id, obra_id)
    and (colaborador_id is null or exists (
      select 1 from public.colaboradores c
       where c.id = incidente.colaborador_id and c.empresa_id = incidente.empresa_id))
    and comprobante_path is null
  );

drop policy if exists incidente_residente_update on public.incidente;
create policy incidente_residente_update on public.incidente
  for update
  using (public.auth_residente_obra(empresa_id, obra_id))
  with check (
    public.auth_residente_obra(empresa_id, obra_id)
    and (colaborador_id is null or exists (
      select 1 from public.colaboradores c
       where c.id = incidente.colaborador_id and c.empresa_id = incidente.empresa_id))
  );

-- EPP: solo las entregas ligadas a una obra suya (las que no tienen obra son
-- de oficina y no son suyas).
drop policy if exists epp_entrega_residente_read on public.epp_entrega;
create policy epp_entrega_residente_read on public.epp_entrega
  for select using (obra_id is not null and public.auth_residente_obra(empresa_id, obra_id));

drop policy if exists epp_entrega_residente_insert on public.epp_entrega;
create policy epp_entrega_residente_insert on public.epp_entrega
  for insert with check (
    obra_id is not null and public.auth_residente_obra(empresa_id, obra_id)
    and exists (select 1 from public.colaboradores c
                 where c.id = epp_entrega.colaborador_id and c.empresa_id = epp_entrega.empresa_id)
    and (evidencia_path is null or evidencia_path like empresa_id::text || '/epp/' || id::text || '/%')
  );

drop policy if exists epp_entrega_residente_update on public.epp_entrega;
create policy epp_entrega_residente_update on public.epp_entrega
  for update
  using (obra_id is not null and public.auth_residente_obra(empresa_id, obra_id))
  with check (
    obra_id is not null and public.auth_residente_obra(empresa_id, obra_id)
    and exists (select 1 from public.colaboradores c
                 where c.id = epp_entrega.colaborador_id and c.empresa_id = epp_entrega.empresa_id)
    and (evidencia_path is null or evidencia_path like empresa_id::text || '/epp/' || id::text || '/%')
  );

-- 3m. Herramienta (0043): ve lo que estÃ¡ prestado a SU obra y puede registrar
-- que regresÃ³ (cerrar el prÃ©stamo). Prestar, dar de alta o de baja es de la
-- oficina (F6-5).
drop policy if exists herramienta_asignacion_residente_read on public.herramienta_asignacion;
create policy herramienta_asignacion_residente_read on public.herramienta_asignacion
  for select using (obra_id is not null and public.auth_residente_obra(empresa_id, obra_id));

drop policy if exists herramienta_asignacion_residente_update on public.herramienta_asignacion;
create policy herramienta_asignacion_residente_update on public.herramienta_asignacion
  for update
  using (obra_id is not null and public.auth_residente_obra(empresa_id, obra_id))
  with check (obra_id is not null and public.auth_residente_obra(empresa_id, obra_id));

drop policy if exists herramienta_residente_read on public.herramienta;
create policy herramienta_residente_read on public.herramienta
  for select using (exists (
    select 1 from public.herramienta_asignacion a
     where a.herramienta_id = herramienta.id and a.empresa_id = herramienta.empresa_id
       and a.deleted_at is null and a.hasta is null and a.obra_id is not null
       and public.auth_residente_obra(a.empresa_id, a.obra_id)));


-- Storage del residente en los buckets de F7.
-- GarantÃ­as (0043): <empresa>/<obra>/<reporte>/<archivo>
drop policy if exists postventa_obj_residente_select on storage.objects;
create policy postventa_obj_residente_select on storage.objects
  for select to authenticated
  using (bucket_id = 'postventa'
    and public.auth_residente_obra(public.compras_uuid((storage.foldername(name))[1]),
                                   public.compras_uuid((storage.foldername(name))[2])));

drop policy if exists postventa_obj_residente_insert on storage.objects;
create policy postventa_obj_residente_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'postventa'
    and exists (
      select 1 from public.garantia_reporte r
       where r.id::text         = (storage.foldername(name))[3]
         and r.obra_id::text    = (storage.foldername(name))[2]
         and r.empresa_id::text = (storage.foldername(name))[1]
         and r.deleted_at is null
         and public.auth_residente_obra(r.empresa_id, r.obra_id))
  );

drop policy if exists postventa_obj_residente_delete on storage.objects;
create policy postventa_obj_residente_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'postventa'
    and public.auth_residente_obra(public.compras_uuid((storage.foldername(name))[1]),
                                   public.compras_uuid((storage.foldername(name))[2])));

-- EPP (0043): <empresa>/epp/<entrega>/<archivo>; la obra sale de la entrega.
-- La carpeta `incidentes/` sigue siendo SOLO del admin (F7-2).
drop policy if exists seguridad_obj_residente_select on storage.objects;
create policy seguridad_obj_residente_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'seguridad' and (storage.foldername(name))[2] = 'epp'
    and exists (
      select 1 from public.epp_entrega e
       where e.id::text = (storage.foldername(name))[3]
         and e.empresa_id::text = (storage.foldername(name))[1]
         and e.obra_id is not null
         and public.auth_residente_obra(e.empresa_id, e.obra_id))
  );

drop policy if exists seguridad_obj_residente_insert on storage.objects;
create policy seguridad_obj_residente_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'seguridad' and (storage.foldername(name))[2] = 'epp'
    and exists (
      select 1 from public.epp_entrega e
       where e.id::text = (storage.foldername(name))[3]
         and e.empresa_id::text = (storage.foldername(name))[1]
         and e.deleted_at is null and e.obra_id is not null
         and public.auth_residente_obra(e.empresa_id, e.obra_id))
  );

drop policy if exists seguridad_obj_residente_delete on storage.objects;
create policy seguridad_obj_residente_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'seguridad' and (storage.foldername(name))[2] = 'epp'
    and exists (
      select 1 from public.epp_entrega e
       where e.id::text = (storage.foldername(name))[3]
         and e.empresa_id::text = (storage.foldername(name))[1]
         and e.obra_id is not null
         and public.auth_residente_obra(e.empresa_id, e.obra_id))
  );

