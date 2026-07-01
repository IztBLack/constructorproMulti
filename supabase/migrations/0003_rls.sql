-- 0003_rls.sql — Row Level Security.
-- Baseline SEGURO: cada fila solo es visible/escribible por personal
-- (admin|supervisor|colaborador) de SU empresa. Nadie cruza de empresa.
-- El rol `cliente` NO entra aquí (sin acceso general) → su portal es el TODO final.

do $$
declare t text;
begin
  foreach t in array array[
    'puestos','colaboradores','obras','cotizaciones','secciones','partidas',
    'pagos','obra_colaborador','asistencias','destajos','movimientos',
    'catalogo_conceptos','archivos_cotizacion'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I on public.%I;', t || '_staff', t);
    -- Una sola política for all: lectura y escritura para personal de la empresa.
    execute format(
      'create policy %I on public.%I for all '
      'using (public.auth_tiene_rol(empresa_id, ''admin'',''supervisor'',''colaborador'')) '
      'with check (public.auth_tiene_rol(empresa_id, ''admin'',''supervisor'',''colaborador''));',
      t || '_staff', t);
  end loop;
end $$;

-- ──────────────────────────────────────────────────────────────────────────
-- TODO PORTAL /cliente (pendiente de decisión — ver supabase/README.md):
--
-- Propuesta por defecto: concesión explícita.
--   create table public.cliente_acceso (
--     user_id       uuid not null references auth.users(id) on delete cascade,
--     cotizacion_id uuid not null references public.cotizaciones(id) on delete cascade,
--     primary key (user_id, cotizacion_id)
--   );
-- Luego políticas SELECT de solo-lectura para rol 'cliente' sobre cotizaciones
-- (y sus secciones/partidas/pagos/archivos vía join al cotizacion_id concedido).
-- No se implementa aún para no exponer datos con un modelo a medio decidir.
-- ──────────────────────────────────────────────────────────────────────────
