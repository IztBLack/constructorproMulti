-- seed_cuentas_demo.sql — Alta de 3 cuentas: contratista, contadora, cliente.
-- NO es una migración de esquema; es un script de datos de un solo uso.
--
-- PASO 1 (dashboard, manual): Supabase → Authentication → Users → "Add user".
--   Crea los 3 usuarios con email + password (marca "Auto Confirm User"):
--     - Orlando  (contratista)
--     - Estrella (contadora)
--     - Don Pepe (cliente)
--   Copia el UUID de cada uno (columna "UID" en la lista de usuarios).
--
-- PASO 2 (SQL Editor): obtén el id de tu empresa y pégalo abajo:
--     select id, nombre from public.empresas;
--
-- PASO 3 (SQL Editor): reemplaza los <PLACEHOLDERS> y corre este bloque.

-- ── Reemplaza estos valores ──────────────────────────────────────────────────
--   <EMPRESA_UUID>   id de public.empresas
--   <UID_ORLANDO>    UID de Auth de Orlando
--   <UID_ESTRELLA>   UID de Auth de Estrella
--   <UID_DONPEPE>    UID de Auth de Don Pepe
--   <EMAIL_DONPEPE>  email con el que creaste a Don Pepe

-- 1) Contratista Orlando → admin
insert into public.usuarios_empresa (user_id, empresa_id, rol)
values ('<UID_ORLANDO>', '<EMPRESA_UUID>', 'admin')
on conflict (user_id, empresa_id) do update set rol = excluded.rol;

-- 2) Contadora Estrella → admin  (cámbialo a 'supervisor' si prefieres acceso acotado)
insert into public.usuarios_empresa (user_id, empresa_id, rol)
values ('<UID_ESTRELLA>', '<EMPRESA_UUID>', 'admin')
on conflict (user_id, empresa_id) do update set rol = excluded.rol;

-- 3) Cliente Don Pepe → rol cliente + registro en clientes ligado a su cuenta
insert into public.usuarios_empresa (user_id, empresa_id, rol)
values ('<UID_DONPEPE>', '<EMPRESA_UUID>', 'cliente')
on conflict (user_id, empresa_id) do update set rol = excluded.rol;

insert into public.clientes (id, empresa_id, nombre, email, user_id, created_at, updated_at)
values (
  gen_random_uuid(),
  '<EMPRESA_UUID>',
  'Don Pepe',
  '<EMAIL_DONPEPE>',
  '<UID_DONPEPE>',
  (extract(epoch from now()) * 1000)::bigint,
  (extract(epoch from now()) * 1000)::bigint
);

-- Verificación:
--   select ue.rol, count(*) from public.usuarios_empresa ue group by ue.rol;
--   select nombre, email, user_id from public.clientes where nombre = 'Don Pepe';
--
-- Para probar el portal del cliente: inicia sesión como Don Pepe y asígnale una
-- obra/cotización desde /admin (campo Cliente) para que las vea en /cliente.
