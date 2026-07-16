-- 0013_fix_codigos_vinculacion_insert.sql
-- SEGURIDAD — CRÍTICO: cerrar escalada de privilegios vía códigos de vinculación.
--
-- Antes (0004): la política INSERT de codigos_vinculacion era abierta:
--   with check (auth.uid() is not null)
-- => CUALQUIER usuario autenticado podía insertar un código con `empresa_id` y
--    `rol` arbitrarios (p.ej. rol='admin', empresa_id=<empresa víctima>) y luego
--    llamar canjear_codigo_vinculacion(code), que inserta
--    usuarios_empresa(self, empresa_víctima, 'admin') → se vuelve admin de esa
--    empresa. Un colaborador podía autoescalarse a admin de su propia empresa
--    (con una 2ª cuenta), y cualquiera que conociera el UUID de otra empresa
--    podía tomarla.
--
-- Fix: solo admin/supervisor de la MISMA empresa puede emitir códigos. Así:
--   - un colaborador/cliente ya no puede crear códigos (no puede autoescalarse);
--   - nadie puede emitir códigos para una empresa ajena (cross-tenant cerrado).
-- La generación legítima (admin/vincular, alta de clientes) la hace personal
-- admin/supervisor, así que el flujo normal no se rompe.
--
-- Depende de: 0001 (auth_tiene_rol), 0004 (codigos_vinculacion).
-- Correr en el SQL Editor de Supabase (vmkkkrlctakzzqebtyci).

drop policy if exists codigos_vinculacion_insert on public.codigos_vinculacion;
create policy codigos_vinculacion_insert on public.codigos_vinculacion
  for insert
  to authenticated
  with check (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor'));
