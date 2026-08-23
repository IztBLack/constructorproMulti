-- 0031_notas_obra.sql — NOTAS DE OBRA (tratos con socios externos)
-- Depende de: 0001 (empresas, auth_tiene_rol), 0002 (obras, colaboradores),
--             0019 (aislamiento entre empresas), 0022 (rol contador)
-- Aditivo e idempotente. No toca tablas ni policies existentes.
--
-- QUÉ ES
-- ──────
-- El dueño lleva tratos de palabra con "socios" que NO están en el sistema
-- (maestros, subcontratistas). Hoy los anota en una tabla de Word por obra y por
-- persona, y manda la captura por WhatsApp. Una nota real se ve así:
--
--   ORLANDO RAMOZ · CASAS BIENESTAR – MZ 2 LT 1
--   BASE DE TINACOS ................ 123 000
--   PRETIL .......................... 25 000
--   RECORTE DE PUERTAS (26) .......... 8 400
--   TOTAL .......................... 156 400
--   PROYECCIÓN 11/AGOST/26 ......... 62,000 - 4%(RETENCIÓN) = 60 000
--   156 400 - 60 000 ................ 90 400
--   LIQUIDADO ...................... BASES DE TINACOS, PRETIL Y RECORTE DE PUERTAS
--
-- POR QUÉ UNA TABLA NUEVA Y NO COTIZACIONES NI MOVIMIENTOS
-- ────────────────────────────────────────────────────────
-- No es una cotización: esas son el documento FORMAL para el cliente, con IVA,
-- estado y flujo de re-aprobación (0011). Tampoco es caja: `movimientos` es
-- dinero que YA se movió, y aquí hay proyecciones y acuerdos que todavía no.
-- Es un tercer objeto: el estado de cuenta de un acuerdo. Meterlo en cualquiera
-- de los dos ensuciaría totales que hoy significan otra cosa.
--
-- Y tampoco cabe en `obra_caja_nota` (0023): esa es UNA sola nota de texto por
-- obra, de la contadora. Aquí van VARIAS por obra, una por socio, con renglones.
--
-- POR QUÉ TODO ES SOBRESCRIBIBLE
-- ──────────────────────────────
-- Los números se los asigna la constructora con la que se trabaja, y no siempre
-- cuadran con la aritmética: en la nota de arriba, 62,000 menos 4% son 59,520,
-- pero lo que se acordó fueron 60,000. La app SUGIERE el cálculo y el dueño
-- puede pisarlo. Si la base impusiera la fórmula, la nota dejaría de reflejar el
-- trato — que es justo lo único que esta tabla tiene que hacer bien.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. La nota: una por socio dentro de una obra
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.nota_obra (
  id                 uuid primary key,
  empresa_id         uuid not null references public.empresas(id) on delete cascade,
  obra_id            uuid not null references public.obras(id)    on delete cascade,

  -- Nombre libre del destinatario: el socio normalmente NO existe en el sistema.
  -- `colaborador_id` es el puente opcional para cuando sí está dado de alta, sin
  -- obligar a darlo de alta para poder escribirle su nota.
  destinatario       text not null default '',
  colaborador_id     uuid references public.colaboradores(id) on delete set null,

  titulo             text not null default '',
  fecha              bigint not null default (extract(epoch from now()) * 1000)::bigint,
  estado             text not null default 'ABIERTA'
                       check (estado in ('ABIERTA', 'LIQUIDADA')),

  -- NULL = usar el valor calculado a partir de los renglones. Un número = el
  -- dueño lo fijó a mano porque así se lo asignaron.
  total_override     double precision,
  saldo_override     double precision,

  notas              text not null default '',
  orden              bigint not null default 0,

  created_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  server_updated_at  bigint not null default 0,
  deleted_at         bigint
);

create index if not exists idx_nota_obra_obra  on public.nota_obra (obra_id);
create index if not exists idx_nota_obra_orden on public.nota_obra (empresa_id, orden);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Los renglones de la nota
-- ════════════════════════════════════════════════════════════════════════════
-- `tipo` define el signo, y es lo único que la app necesita para sumar:
--   CONCEPTO  (+) trabajo acordado            → suma al subtotal
--   DEDUCCION (−) retención, material, multa  → resta del subtotal → TOTAL
--   PAGO      (−) anticipo o proyección       → resta del total    → SALDO
--   TEXTO     ( ) apunte sin monto, como la fila "LIQUIDADO: bases, pretil…"
--
-- `monto_base` + `porcentaje` documentan la cuenta que se enseña ("62,000 − 4%"),
-- y `monto` es el valor que REALMENTE entra en los totales. La app propone
-- monto = base − base×porcentaje/100, pero quien manda es `monto`.
create table if not exists public.nota_obra_renglon (
  id                 uuid primary key,
  empresa_id         uuid not null references public.empresas(id)  on delete cascade,
  nota_id            uuid not null references public.nota_obra(id) on delete cascade,

  tipo               text not null default 'CONCEPTO'
                       check (tipo in ('CONCEPTO', 'DEDUCCION', 'PAGO', 'TEXTO')),
  etiqueta           text not null default '',

  monto              double precision,   -- null en los TEXTO
  monto_base         double precision,   -- opcional: el bruto antes del porcentaje
  porcentaje         double precision,   -- opcional: retención en % sobre monto_base

  texto              text not null default '',  -- valor libre / aclaración
  fecha              bigint,                    -- opcional ("PROYECCIÓN 11/AGOST/26")
  orden              bigint not null default 0,

  created_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at         bigint not null default (extract(epoch from now()) * 1000)::bigint,
  server_updated_at  bigint not null default 0,
  deleted_at         bigint
);

create index if not exists idx_nota_renglon_nota  on public.nota_obra_renglon (nota_id, orden);
create index if not exists idx_nota_renglon_orden on public.nota_obra_renglon (empresa_id, orden);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. RLS
-- ════════════════════════════════════════════════════════════════════════════
-- Estas notas son tratos de dinero del dueño con terceros. Las ve el personal de
-- oficina y nadie más:
--   admin, supervisor  → leen y escriben
--   contador           → lee (necesita el panorama, no negocia los tratos)
--   colaborador        → NADA (es personal de campo; aquí van costos de otros)
--   cliente            → NADA. No se le crea ninguna policy: sin policy, no ve
--                        filas. Es la misma línea que "el cliente nunca ve
--                        SALIDAS" (0019); una nota es puro costo interno.
--
-- Las de ESCRITURA comprueban además que el PADRE sea de la misma empresa, que
-- es el hallazgo de 0019: validar solo `empresa_id` de la fila que se escribe
-- deja colgar filas de una empresa bajo la obra de otra.
alter table public.nota_obra         enable row level security;
alter table public.nota_obra_renglon enable row level security;

drop policy if exists nota_obra_read on public.nota_obra;
create policy nota_obra_read on public.nota_obra
  for select using (
    public.auth_tiene_rol(empresa_id, 'admin', 'supervisor', 'contador')
  );

drop policy if exists nota_obra_insert on public.nota_obra;
create policy nota_obra_insert on public.nota_obra
  for insert with check (
    public.auth_tiene_rol(empresa_id, 'admin', 'supervisor')
    and exists (
      select 1 from public.obras o
       where o.id = obra_id and o.empresa_id = nota_obra.empresa_id
    )
    and (
      colaborador_id is null
      or exists (
        select 1 from public.colaboradores c
         where c.id = colaborador_id and c.empresa_id = nota_obra.empresa_id
      )
    )
  );

-- El borrado es lógico (`deleted_at`), así que pasa por este mismo update.
drop policy if exists nota_obra_update on public.nota_obra;
create policy nota_obra_update on public.nota_obra
  for update
  using (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor'))
  with check (
    public.auth_tiene_rol(empresa_id, 'admin', 'supervisor')
    and exists (
      select 1 from public.obras o
       where o.id = obra_id and o.empresa_id = nota_obra.empresa_id
    )
    and (
      colaborador_id is null
      or exists (
        select 1 from public.colaboradores c
         where c.id = colaborador_id and c.empresa_id = nota_obra.empresa_id
      )
    )
  );

drop policy if exists nota_obra_renglon_read on public.nota_obra_renglon;
create policy nota_obra_renglon_read on public.nota_obra_renglon
  for select using (
    public.auth_tiene_rol(empresa_id, 'admin', 'supervisor', 'contador')
  );

drop policy if exists nota_obra_renglon_insert on public.nota_obra_renglon;
create policy nota_obra_renglon_insert on public.nota_obra_renglon
  for insert with check (
    public.auth_tiene_rol(empresa_id, 'admin', 'supervisor')
    and exists (
      select 1 from public.nota_obra n
       where n.id = nota_id and n.empresa_id = nota_obra_renglon.empresa_id
    )
  );

drop policy if exists nota_obra_renglon_update on public.nota_obra_renglon;
create policy nota_obra_renglon_update on public.nota_obra_renglon
  for update
  using (public.auth_tiene_rol(empresa_id, 'admin', 'supervisor'))
  with check (
    public.auth_tiene_rol(empresa_id, 'admin', 'supervisor')
    and exists (
      select 1 from public.nota_obra n
       where n.id = nota_id and n.empresa_id = nota_obra_renglon.empresa_id
    )
  );

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Sincronización
-- ════════════════════════════════════════════════════════════════════════════
-- Las dos tablas ya traen el juego completo de columnas de sync
-- (created_at / updated_at / server_updated_at / deleted_at). Con el trigger y
-- el índice de cursor quedan listas para que el móvil las jale cuando le toque
-- su fase, sin necesidad de otra migración.
do $$
declare t text;
begin
  foreach t in array array['nota_obra', 'nota_obra_renglon'] loop
    execute format('drop trigger if exists trg_srv_upd on public.%I;', t);
    execute format(
      'create trigger trg_srv_upd before insert or update on public.%I '
      'for each row execute function public.set_server_updated_at();', t);
    execute format(
      'create index if not exists idx_%1$s_pull on public.%1$s (empresa_id, server_updated_at);', t);
  end loop;
end $$;
