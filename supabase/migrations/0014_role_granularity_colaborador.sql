-- 0014_role_granularity_colaborador.sql
-- SEGURIDAD (M-1): separar privilegios del rol `colaborador`.
--
-- Antes (0003): la política `<t>_staff` daba `for all` (SELECT+INSERT+UPDATE+
-- DELETE) a admin/supervisor/colaborador por igual → un colaborador podía
-- borrar/alterar obras, cotizaciones, pagos, presupuesto, etc.
--
-- Ahora — colaborador = STAFF DE CAMPO:
--   • ESCRIBE solo las tablas de captura: asistencias, destajos, movimientos,
--     obra_colaborador  → estas se dejan intactas (su `_staff for all` con los
--     3 roles sigue vigente).
--   • LEE el resto (tablas administrativas) pero NO puede crear/editar/borrar.
--   admin/supervisor conservan acceso total.
--   El rol `cliente` no se toca (sus políticas `*_cliente_read` son aparte).
--
-- NOTA: el "borrar" de la app es soft-delete (UPDATE deleted_at), por eso se
-- restringe también UPDATE, no solo DELETE.
--
-- Depende de: 0001 (auth_tiene_rol), 0003 (_staff), 0008 (obra_presupuesto).
-- Correr en el SQL Editor de Supabase (vmkkkrlctakzzqebtyci).

do $$
declare t text;
begin
  -- Tablas ADMINISTRATIVAS: colaborador solo lectura; escritura admin/supervisor.
  foreach t in array array[
    'obras','cotizaciones','secciones','partidas','pagos',
    'obra_presupuesto','catalogo_conceptos','puestos','colaboradores',
    'archivos_cotizacion'
  ] loop
    execute format('drop policy if exists %I on public.%I;', t || '_staff', t);

    -- Lectura: los 3 roles de staff.
    execute format(
      'create policy %I on public.%I for select '
      'using (public.auth_tiene_rol(empresa_id, ''admin'',''supervisor'',''colaborador''));',
      t || '_staff_read', t);

    -- Alta: solo admin/supervisor.
    execute format(
      'create policy %I on public.%I for insert '
      'with check (public.auth_tiene_rol(empresa_id, ''admin'',''supervisor''));',
      t || '_staff_insert', t);

    -- Edición (incluye soft-delete vía deleted_at): solo admin/supervisor.
    execute format(
      'create policy %I on public.%I for update '
      'using (public.auth_tiene_rol(empresa_id, ''admin'',''supervisor'')) '
      'with check (public.auth_tiene_rol(empresa_id, ''admin'',''supervisor''));',
      t || '_staff_update', t);

    -- Borrado físico: solo admin/supervisor.
    execute format(
      'create policy %I on public.%I for delete '
      'using (public.auth_tiene_rol(empresa_id, ''admin'',''supervisor''));',
      t || '_staff_delete', t);
  end loop;
end $$;

-- Tablas de captura (asistencias, destajos, movimientos, obra_colaborador) NO se
-- modifican: su `_staff` (for all, 3 roles) permanece, así el colaborador captura
-- en el móvil sin fricción.
