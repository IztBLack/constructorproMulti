-- 0030_revertir_0029_sueldo_columnas.sql
-- ESCOTILLA DE SALIDA de la 0029. NO se corre en condiciones normales.
--
-- Cuándo sirve: si la 0029 se aplicó y resulta que algún teléfono seguía con
-- una versión anterior al esquema Drift v10 (la que sincroniza
-- `colaborador_sueldo` en vez de las columnas de `colaboradores`). Esto revierte
-- el drop y deja el sistema en el estado intermedio del expand/contract, donde
-- clientes viejos y nuevos conviven.
--
-- Verificado el 2026-08-18: en prod están aplicadas 0027 y 0028, la 0029 NO.
-- Mientras siga así, este archivo no tiene nada que hacer.
--
-- Qué le pasa a un teléfono con app anterior a v10 si la 0029 está aplicada:
--
--   1. PUSH de `colaboradores` — el sync manda la fila local COMPLETA
--      (`sync_service.dart`: `data = Map.from(r.data)`), así que incluye las
--      cuatro columnas. PostgREST responde PGRST204 y esas filas se quedan en
--      `sync_status='error'`, reintentando cada ciclo. El resto de las tablas
--      NO se ven afectadas: el error se atrapa por fila y el bucle sigue, así
--      que las asistencias del día sí suben.
--
--   2. PULL de `colaboradores` — este es el grave. El pull hace
--      `INSERT OR REPLACE` con solo las columnas que el servidor devolvió. Como
--      las cuatro ya no vienen, la fila local se reescribe con los DEFAULTS y
--      el sueldo capturado se borra del teléfono. La nómina del equipo entonces
--      cae al salario del puesto y calcula de menos, en silencio, sin marcar
--      error. Ese es el daño real: números de raya equivocados en campo.
--
-- Esta migración devuelve el esquema al estado previo (0002 + 0009) y rellena
--
-- (Contexto de por qué existe este archivo: el código v10 está sin commitear en
-- la rama de auditoría y nunca se publicó APK, así que los equipos en campo
-- siguen en `main`/schemaVersion 9. Hasta que eso cambie, correr la 0029
-- provocaría exactamente los dos efectos de arriba.)
--
-- desde `colaborador_sueldo`, que la 0027 ya dejó como copia buena. NO toca
-- `colaborador_sueldo` ni sus policies: la 0027 se queda, y con ella la tabla y
-- la RLS que de verdad protegen el sueldo.
--
-- COSTO: mientras esto esté aplicado, el hallazgo A3 vuelve a estar mitigado
-- solo por los gates de la aplicación — un `colaborador` con su propia sesión
-- puede volver a consultar `colaboradores` y ver el sueldo de todos. Es el
-- estado intermedio del patrón expand/contract, el mismo que describía la 0027.
-- Se cierra volviendo a correr la 0029, esta vez DESPUÉS de que todos los
-- equipos tengan el APK v10 instalado.
--
-- Depende de: 0027 (de ahí sale el relleno). Correr en el SQL Editor de
-- Supabase (vmkkkrlctakzzqebtyci).

-- ── 1. Devolver las columnas, con la definición original de 0002 + 0009 ──────
alter table public.colaboradores
  add column if not exists salario_personalizado double precision,
  add column if not exists periodo_pago    text     not null default 'MENSUAL',
  add column if not exists salario_periodo double precision,
  add column if not exists dias_semana     smallint not null default 6;

alter table public.colaboradores
  drop constraint if exists colaboradores_periodo_pago_chk;
alter table public.colaboradores
  add constraint colaboradores_periodo_pago_chk
  check (periodo_pago in ('SEMANAL', 'QUINCENAL', 'MENSUAL'));

alter table public.colaboradores
  drop constraint if exists colaboradores_dias_semana_chk;
alter table public.colaboradores
  add constraint colaboradores_dias_semana_chk
  check (dias_semana between 1 and 7);

-- ── 2. Rellenar desde la copia buena ─────────────────────────────────────────
-- Sin esto las columnas quedan en NULL/default y el pull seguiría borrando el
-- sueldo local: volver a crearlas vacías NO arregla el punto 2 de arriba.
--
-- Ojo con `server_updated_at`: se toca a propósito, vía el trigger de 0002, al
-- hacer el UPDATE. Eso mete estas filas en el siguiente pull de cada teléfono,
-- que es justo lo que queremos — así recuperan el sueldo que la 0029 les borró.
update public.colaboradores c
   set salario_personalizado = s.salario_personalizado,
       periodo_pago          = coalesce(s.periodo_pago, 'MENSUAL'),
       salario_periodo       = s.salario_periodo,
       dias_semana           = coalesce(s.dias_semana, 6)
  from public.colaborador_sueldo s
 where s.colaborador_id = c.id
   and s.deleted_at is null;

-- ── 3. Comprobación ──────────────────────────────────────────────────────────
-- Los dos conteos deben coincidir:
--   select count(*) from public.colaborador_sueldo where deleted_at is null;
--   select count(*) from public.colaboradores
--    where salario_personalizado is not null or salario_periodo is not null;
--
-- Y que las cuatro columnas estén de vuelta:
--   select column_name from information_schema.columns
--    where table_name = 'colaboradores'
--      and column_name in ('salario_personalizado','periodo_pago',
--                          'salario_periodo','dias_semana');
