-- 0027_sueldo_tabla_aparte.sql
-- SEGURIDAD: sacar el SUELDO de `colaboradores` a su propia tabla, para que la
-- RLS pueda protegerlo.
--
-- El hallazgo (auditoría del 2026-08-17): la ruta del PDF de nómina solo pedía
-- sesión, mientras la de proyección devolvía 403 por rol. Un `colaborador` de
-- campo podía bajarse la raya completa de sus compañeros. Los gates de la app
-- ya están puestos (web y móvil), pero eso es presentación: el colaborador tiene
-- la anon key y su propia sesión, así que puede consultar la tabla directo. Y en
-- el móvil es peor, porque el sync le baja el sueldo de todos a su teléfono.
--
-- POR QUÉ UNA TABLA Y NO UN `REVOKE` POR COLUMNA
-- La RLS de Postgres filtra FILAS, no columnas, y en Supabase `authenticated` es
-- un solo rol de base de datos para todos los usuarios de la app: un
-- `grant select (col)` no distingue entre un admin y un colaborador. Se evaluó
-- revocar las columnas y exponerlas por una vista, pero PostgREST expande
-- `select('*')` a todas las columnas: el revoke rompía las 4 llamadas de la web
-- y el pull genérico del móvil para TODOS los roles, no solo para el colaborador.
-- Con una tabla aparte, `select('*')` sobre `colaboradores` sigue funcionando
-- igual y el sueldo simplemente no está ahí.
--
-- ══ ESTA MIGRACIÓN ES ADITIVA Y SE PUEDE APLICAR YA ══════════════════════════
-- Crea la tabla, copia los datos y pone las policies. NO quita nada de
-- `colaboradores`, así que la app móvil que ya está en los teléfonos (v1.0.7)
-- sigue sincronizando sin enterarse.
--
-- El `drop` de las columnas viejas va en **0029**, y solo se corre cuando TODOS
-- los teléfonos tengan la versión nueva. Si se corriera antes, el push de un
-- teléfono viejo mandaría `salario_periodo` y Postgres lo rechazaría (PGRST204),
-- dejando su sync atorado. Es el patrón expand/contract, y aquí importa de
-- verdad porque los clientes viejos no se pueden actualizar a la fuerza.
--
-- Depende de: 0001 (auth_tiene_rol), 0002 (colaboradores), 0022 (rol contador).
-- Correr en el SQL Editor de Supabase (vmkkkrlctakzzqebtyci).

-- ── 1. La tabla ──────────────────────────────────────────────────────────────
-- 1-a-1 con `colaboradores`: la PK es el propio colaborador_id. Sin fila = sin
-- sueldo capturado, que es lo mismo que tener los cuatro campos en su default.
create table if not exists public.colaborador_sueldo (
  colaborador_id  uuid primary key references public.colaboradores(id) on delete cascade,
  empresa_id      uuid not null references public.empresas(id) on delete cascade,

  -- Salario diario (MXN/día) que consume la nómina. DERIVADO de los tres campos
  -- de abajo; no se edita a mano. Null → se usa el salario del puesto.
  salario_personalizado  double precision,
  -- Esquema de captura del sueldo base.
  periodo_pago    text not null default 'MENSUAL'
                  check (periodo_pago in ('SEMANAL','QUINCENAL','MENSUAL')),
  -- Monto tal cual lo captura el usuario, para el periodo elegido.
  salario_periodo double precision,
  -- Días trabajados por semana; el divisor para pasar a diario.
  dias_semana     integer not null default 6 check (dias_semana between 1 and 7),

  -- Bloque de sync, igual que el resto de tablas (0002). `server_updated_at` lo
  -- sella el trigger de abajo; el cliente nunca lo escribe.
  created_at        bigint not null default 0,
  updated_at        bigint not null default 0,
  server_updated_at bigint not null default 0,
  deleted_at        bigint
);

-- Trigger de sellado + índice del cursor de pull, igual que las 13 tablas de
-- 0002 y que `obra_caja_nota` en 0023. Sin esto el pull del móvil nunca vería
-- la tabla: su cursor es (empresa_id, server_updated_at).
drop trigger if exists trg_srv_upd on public.colaborador_sueldo;
create trigger trg_srv_upd
  before insert or update on public.colaborador_sueldo
  for each row execute function public.set_server_updated_at();

create index if not exists idx_colaborador_sueldo_pull
  on public.colaborador_sueldo (empresa_id, server_updated_at);

-- ── 2. Copiar lo que ya existe ───────────────────────────────────────────────
-- Solo los colaboradores que de verdad tienen sueldo capturado: crear filas
-- vacías para el resto no aporta nada y ensucia el pull del móvil.
insert into public.colaborador_sueldo (
  colaborador_id, empresa_id,
  salario_personalizado, periodo_pago, salario_periodo, dias_semana,
  created_at, updated_at
)
select c.id, c.empresa_id,
       c.salario_personalizado,
       coalesce(c.periodo_pago, 'MENSUAL'),
       c.salario_periodo,
       coalesce(c.dias_semana, 6),
       coalesce(c.created_at, 0),
       coalesce(c.updated_at, 0)
  from public.colaboradores c
 where c.salario_personalizado is not null
    or c.salario_periodo is not null
on conflict (colaborador_id) do nothing;

-- ── 3. RLS ───────────────────────────────────────────────────────────────────
-- Esta es la mitad que de verdad protege. Espeja `ROLES_SUELDOS` de
-- `web/src/lib/auth/sueldos.ts` y `_rolesSueldos` de
-- `lib/core/sync/rol_provider.dart`: si se agrega un rol a la lista de la app,
-- va también aquí, o la pantalla se abrirá para enseñar filas vacías.
alter table public.colaborador_sueldo enable row level security;

-- LECTURA: oficina. El `colaborador` de campo NO entra — es el punto de todo
-- esto. El `cliente` tampoco, nunca.
drop policy if exists colaborador_sueldo_read on public.colaborador_sueldo;
create policy colaborador_sueldo_read on public.colaborador_sueldo
  for select to authenticated
  using (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor', 'contador'));

-- ESCRITURA: solo admin/supervisor. El `contador` LEE los montos a pagar (0022),
-- no los fija: eso es decisión de quien contrata.
drop policy if exists colaborador_sueldo_insert on public.colaborador_sueldo;
create policy colaborador_sueldo_insert on public.colaborador_sueldo
  for insert to authenticated
  with check (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor'));

drop policy if exists colaborador_sueldo_update on public.colaborador_sueldo;
create policy colaborador_sueldo_update on public.colaborador_sueldo
  for update to authenticated
  using      (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor'))
  with check (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor'));

drop policy if exists colaborador_sueldo_delete on public.colaborador_sueldo;
create policy colaborador_sueldo_delete on public.colaborador_sueldo
  for delete to authenticated
  using (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor'));

-- ── 4. Comprobación ──────────────────────────────────────────────────────────
-- Con sesión de admin debe devolver tantas filas como colaboradores con sueldo;
-- con sesión de colaborador, CERO.
--   select count(*) from public.colaborador_sueldo;
--
-- Y que no se haya perdido a nadie en la copia:
--   select count(*) from public.colaboradores
--    where salario_personalizado is not null or salario_periodo is not null;
