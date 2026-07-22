-- 0017_ajustes_empresa.sql — Configuración de empresa y operación (Fase 3 de Ajustes)
-- Depende de: 0001 (empresas, auth_tiene_rol), 0002 (cotizaciones), 0003 (RLS staff)
--
-- Trae tres cosas:
--   1. Poder RENOMBRAR la empresa (hoy es literalmente imposible).
--   2. Una tabla de configuración por empresa (IVA por defecto y datos del PDF).
--   3. Congelar la tasa de IVA de cada cotización, para que hacerla configurable
--      no reescriba el pasado.
--
-- Es aditiva: no borra ni transforma datos existentes.

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. Renombrar la empresa — solo admin
-- ══════════════════════════════════════════════════════════════════════════════
-- 0001 creó `empresas_select` y 0005 `empresas_insert_auth`, pero NUNCA se creó
-- una policy de UPDATE. Sin ella, RLS niega por omisión: si alguien escribió mal
-- el nombre en el onboarding, queda mal para siempre en la barra de todos los
-- usuarios y en el portal de sus clientes.
--
-- Se limita a admin a propósito: el nombre de la empresa es la marca que ven los
-- clientes, no un dato operativo que deba poder tocar un supervisor.
drop policy if exists empresas_update_admin on public.empresas;
create policy empresas_update_admin on public.empresas
  for update
  using      (public.auth_tiene_rol(id, 'admin'))
  with check (public.auth_tiene_rol(id, 'admin'));

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. Configuración por empresa
-- ══════════════════════════════════════════════════════════════════════════════
-- Hoy el IVA por defecto y la personalización del PDF viven en las
-- SharedPreferences del celular de quien los configuró (ver
-- lib/core/pdf/pdf_config.dart). Eso hace imposible la paridad: cotizas desde la
-- web y sale sin tu logo; cambia de teléfono y pierde su configuración.
--
-- Una fila por empresa (empresa_id es la llave primaria, no hay id aparte: no
-- tiene sentido tener dos configuraciones de la misma empresa).
create table if not exists public.empresa_config (
  empresa_id         uuid primary key references public.empresas(id) on delete cascade,

  -- Tasa de IVA por defecto para cotizaciones NUEVAS. No afecta a las ya
  -- creadas (ver punto 3). 16 en el país, 8 en la franja fronteriza.
  iva_porcentaje     double precision not null default 16,

  -- Personalización del PDF: nombre y contacto de la empresa, color, pie de
  -- página, marca de agua, textos de firma. Se guarda como jsonb con las MISMAS
  -- claves que usa `PdfConfig` en el móvil, para que la paridad sea copiar y
  -- pegar y no una traducción de nombres.
  -- El logo y la firma son imágenes y NO van aquí: irán al bucket de Storage
  -- (0007) cuando se implemente su carga.
  pdf_config         jsonb,

  -- Mismas columnas de sincronización que el resto del esquema, para que el día
  -- que el móvil sincronice esta tabla no haya que inventarle un caso especial.
  created_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  server_updated_at  bigint not null default 0,
  deleted_at         bigint,

  -- Un IVA negativo o superior a 100 no es un error de captura recuperable:
  -- es basura que rompería todos los totales. Se rechaza en la base.
  constraint empresa_config_iva_valido check (iva_porcentaje >= 0 and iva_porcentaje <= 100)
);

alter table public.empresa_config enable row level security;

-- LECTURA: todo el personal. La app necesita el IVA por defecto y los datos del
-- PDF para generar documentos, sin importar quién los genere.
drop policy if exists empresa_config_select_staff on public.empresa_config;
create policy empresa_config_select_staff on public.empresa_config
  for select
  using (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor', 'colaborador'));

-- ESCRITURA: admin y supervisor. Es configuración de operación del negocio.
-- Se separa de la lectura a propósito: si fuera una sola policy `for all`, como
-- en el resto del esquema (0003), un colaborador podría cambiar el IVA de toda
-- la empresa.
drop policy if exists empresa_config_insert_gestion on public.empresa_config;
create policy empresa_config_insert_gestion on public.empresa_config
  for insert
  with check (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor'));

drop policy if exists empresa_config_update_gestion on public.empresa_config;
create policy empresa_config_update_gestion on public.empresa_config
  for update
  using      (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor'))
  with check (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor'));

-- Sella `server_updated_at` igual que el resto de tablas sincronizables.
-- Mismo nombre que en el resto del esquema (0002/0006): los triggers son por
-- tabla, así que no colisionan y se reconocen de un vistazo.
drop trigger if exists trg_srv_upd on public.empresa_config;
create trigger trg_srv_upd
  before insert or update on public.empresa_config
  for each row execute function public.set_server_updated_at();

-- Una fila por empresa existente, con los valores por omisión. Así la app nunca
-- tiene que manejar el caso "esta empresa todavía no tiene configuración".
insert into public.empresa_config (empresa_id)
select e.id from public.empresas e
where not exists (
  select 1 from public.empresa_config c where c.empresa_id = e.id
);

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. Congelar la tasa de IVA de cada cotización
-- ══════════════════════════════════════════════════════════════════════════════
-- ESTE ES EL PUNTO DELICADO DE LA MIGRACIÓN.
--
-- `cotizaciones` solo guarda `iva_enabled` (sí/no), nunca la tasa: el 16% está
-- escrito a mano en el código (`lib/data/cotizaciones.ts`). Si el IVA por
-- defecto se vuelve configurable sin más, el total de TODAS las cotizaciones
-- pasadas se recalcularía con la tasa nueva — una cotización aceptada y firmada
-- por un cliente al 16% aparecería de pronto con otro total, y el estado de
-- cuenta dejaría de cuadrar con lo que el cliente aprobó.
--
-- Solución: cada cotización guarda la tasa con la que se hizo. La configuración
-- de la empresa pasa a ser solo el valor por DEFECTO de las nuevas.
--
-- El default 16 rellena las filas existentes con exactamente la tasa que ya
-- tenían quemada en el código, así que ningún total cambia con esta migración.
alter table public.cotizaciones
  add column if not exists iva_porcentaje double precision not null default 16;

alter table public.cotizaciones
  drop constraint if exists cotizaciones_iva_valido;
alter table public.cotizaciones
  add constraint cotizaciones_iva_valido
  check (iva_porcentaje >= 0 and iva_porcentaje <= 100);
