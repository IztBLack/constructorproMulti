-- 0010_cliente_estado_cuenta.sql
-- Portal del cliente: estado de cuenta REAL por obra.
-- El cliente puede LEER, de SUS obras:
--   (1) obra_presupuesto  → COSTO TOTAL (partidas del contrato).
--   (2) movimientos SOLO tipo='ENTRADA' → RECIBIDO (pagos que ha hecho a la obra).
-- NUNCA ve movimientos tipo='SALIDA' (pagos internos a personas/proveedores): el
-- filtro tipo='ENTRADA' vive dentro del USING para que una SALIDA jamás sea
-- visible vía RLS. Las políticas son permisivas y se combinan con OR, así que
-- esta política solo puede AMPLIAR la visibilidad a ENTRADAS de sus obras.
-- Depende de: 0001-0009. Correr en el SQL Editor de Supabase (vmkkkrlctakzzqebtyci).

-- ── obra_presupuesto: el cliente lee las partidas de sus obras ────────────────
drop policy if exists obra_presupuesto_cliente_read on public.obra_presupuesto;
create policy obra_presupuesto_cliente_read on public.obra_presupuesto
  for select
  using (
    obra_id in (
      select o.id from public.obras o
      where o.cliente_id in (
        select id from public.clientes where user_id = auth.uid()
      )
    )
  );

-- ── movimientos: el cliente lee SOLO las ENTRADAS de sus obras ────────────────
-- (tipo='ENTRADA' dentro del USING = las SALIDAS nunca pasan el filtro).
drop policy if exists movimientos_cliente_read on public.movimientos;
create policy movimientos_cliente_read on public.movimientos
  for select
  using (
    tipo = 'ENTRADA'
    and obra_id in (
      select o.id from public.obras o
      where o.cliente_id in (
        select id from public.clientes where user_id = auth.uid()
      )
    )
  );
