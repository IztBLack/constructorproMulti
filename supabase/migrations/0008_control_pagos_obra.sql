-- 0008_control_pagos_obra.sql
-- Control financiero por obra estilo "Excel ADALBERTO TEJEDA":
--   (1) NOMBRE (beneficiario/pagador) en cada movimiento de caja.
--   (2) Presupuesto por partidas en la obra (encabezado: COSTO TOTAL).
-- Depende de: 0001-0007. Correr en el SQL Editor de Supabase (vmkkkrlctakzzqebtyci).

-- ══ 1. movimientos.nombre (a quién se le pagó / de quién se recibió) ══════════
alter table public.movimientos
  add column if not exists nombre text not null default '';

-- ══ 2. Presupuesto de obra (partidas del contrato) ═══════════════════════════
-- Ej.: Construcción 344 m² × 14500 ; Barda 35 m² × 7000 ; Alberca 450000 ; ...
-- El total de cada partida = cantidad * precio_unitario. COSTO TOTAL = Σ partidas.
create table if not exists public.obra_presupuesto (
  id                 uuid primary key,
  obra_id            uuid not null,
  concepto           text not null default '',    -- Construcción / Barda / Alberca / Demolición…
  unidad             text not null default '',    -- m2, lote, pieza… ('' si es monto directo)
  cantidad           double precision not null default 1,
  precio_unitario    double precision not null default 0,
  orden              integer not null default 0,
  empresa_id         uuid not null references public.empresas(id) on delete cascade,
  created_at         bigint not null default 0,
  updated_at         bigint not null default 0,
  server_updated_at  bigint not null default 0,
  deleted_at         bigint,
  constraint fk_presup_obra foreign key (obra_id)
    references public.obras(id) deferrable initially deferred
);
create index if not exists idx_obra_presupuesto_obra on public.obra_presupuesto (obra_id);

-- Trigger de server_updated_at (consistencia; no se sincroniza al móvil por ahora).
drop trigger if exists trg_srv_upd on public.obra_presupuesto;
create trigger trg_srv_upd before insert or update on public.obra_presupuesto
  for each row execute function public.set_server_updated_at();

-- ══ 3. RLS ═══════════════════════════════════════════════════════════════════
-- Solo el personal de la empresa administra el presupuesto (uso interno; el
-- cliente NO ve el desglose de partidas ni las salidas de caja).
alter table public.obra_presupuesto enable row level security;
drop policy if exists obra_presupuesto_staff on public.obra_presupuesto;
create policy obra_presupuesto_staff on public.obra_presupuesto
  for all
  using (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor', 'colaborador'))
  with check (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor', 'colaborador'));
