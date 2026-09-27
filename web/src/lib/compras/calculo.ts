/**
 * COMPRAS Y MATERIAL: cuentas PURAS (con pruebas en `calculo.test.ts`).
 *
 * Las reglas que también hace la base (totales al emitir, estado de la
 * requisición y de la orden) están ESPEJADAS de `0038_compras_y_material.sql`, y
 * `web/src/db/compras.test.ts` compara las dos. La base es la que manda; aquí se
 * repiten para enseñar faltantes y lo pendiente sin ir a la red.
 */

import type {
  EstadoOrden,
  EstadoRequisicion,
  MovimientoMaterial,
  RenglonOrden,
  RenglonRequisicion,
} from './tipos';

/** Misma tolerancia que la base: 10 × 0.1 no da 1 exacto en double. */
export const TOLERANCIA = 1e-6;
const DIA_MS = 86_400_000;

/** Redondeo a centavos (mitad hacia arriba), como `round(numeric, 2)` para positivos. */
export function centavos(n: number): number {
  const v = Number.isFinite(n) ? n : 0;
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

// ── Totales de una orden de compra ───────────────────────────────────────────

export function importeRenglon(r: { cantidad: number; precio_unitario: number }): number {
  return centavos(Number(r.cantidad) * Number(r.precio_unitario));
}

export interface TotalesOrden {
  subtotal: number;
  iva: number;
  total: number;
}

/**
 * Precios SIN IVA; el IVA se desglosa sobre el subtotal. Igual que
 * `_orden_compra_totales`: importe por renglón a centavos, subtotal = Σ, IVA a
 * centavos, total = subtotal + IVA.
 */
export function totalesOrden(
  renglones: readonly { cantidad: number; precio_unitario: number }[],
  ivaPct: number,
): TotalesOrden {
  const subtotal = centavos(renglones.reduce((s, r) => s + importeRenglon(r), 0));
  const pct = Number.isFinite(ivaPct) ? Math.min(100, Math.max(0, ivaPct)) : 0;
  const iva = centavos((subtotal * pct) / 100);
  return { subtotal, iva, total: centavos(subtotal + iva) };
}

/** Los totales que valen: los congelados al emitir o, en borrador, los vivos. */
export function totalesDe(o: {
  estado: EstadoOrden;
  subtotal: number | null;
  iva: number | null;
  total: number | null;
  iva_pct: number;
  renglones: readonly { cantidad: number; precio_unitario: number }[];
}): TotalesOrden {
  if (o.estado !== 'BORRADOR' && o.total != null) {
    return { subtotal: Number(o.subtotal ?? 0), iva: Number(o.iva ?? 0), total: Number(o.total) };
  }
  return totalesOrden(o.renglones, o.iva_pct);
}

// ── Lo pedido contra lo comprado (requisiciones) ─────────────────────────────

/** Cuánto de cada renglón de requisición está en órdenes NO canceladas. */
export function ordenadoPorRenglon(
  renglonesOrden: readonly { requisicion_renglon_id: string | null; cantidad: number; deleted?: boolean }[],
): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of renglonesOrden) {
    if (!r.requisicion_renglon_id || r.deleted) continue;
    m.set(r.requisicion_renglon_id, (m.get(r.requisicion_renglon_id) ?? 0) + Number(r.cantidad));
  }
  return m;
}

/**
 * Estado de una requisición. PENDIENTE y RECHAZADA los decide el admin y se
 * respetan; lo demás sale de lo que ya está en órdenes de compra (espejo de
 * `_requisicion_estado_calculado`).
 */
export function estadoRequisicion(
  decidido: EstadoRequisicion,
  renglones: readonly Pick<RenglonRequisicion, 'id' | 'cantidad'>[],
  ordenado: ReadonlyMap<string, number>,
): EstadoRequisicion {
  if (decidido === 'PENDIENTE' || decidido === 'RECHAZADA') return decidido;
  if (renglones.length === 0) return 'APROBADA';
  const todo = renglones.every((r) => (ordenado.get(r.id) ?? 0) >= Number(r.cantidad) - TOLERANCIA);
  if (todo) return 'COMPRADA';
  const algo = renglones.some((r) => (ordenado.get(r.id) ?? 0) > TOLERANCIA);
  return algo ? 'PARCIAL' : 'APROBADA';
}

/** Lo que falta por poner en orden de compra de un renglón (nunca negativo). */
export function pendientePorComprar(cantidad: number, ordenado: number): number {
  const p = Number(cantidad) - Number(ordenado);
  return p > TOLERANCIA ? redondearCantidad(p) : 0;
}

/** Cantidades con hasta 4 decimales (bultos, m³, kg). */
export function redondearCantidad(n: number): number {
  return Math.round((n + Number.EPSILON) * 10_000) / 10_000;
}

// ── Lo pedido contra lo recibido (faltantes) ─────────────────────────────────

export interface FaltanteRenglon {
  renglonId: string;
  descripcion: string;
  unidad: string;
  pedido: number;
  recibido: number;
  /** Lo que todavía no llega (≥ 0). */
  faltante: number;
  /** Lo que llegó de más (≥ 0). */
  sobrante: number;
}

export function recibidoPorRenglon(
  recibidos: readonly { orden_compra_renglon_id: string; cantidad_recibida: number }[],
): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of recibidos) {
    m.set(r.orden_compra_renglon_id, (m.get(r.orden_compra_renglon_id) ?? 0) + Number(r.cantidad_recibida));
  }
  return m;
}

export function faltantes(
  renglones: readonly Pick<RenglonOrden, 'id' | 'descripcion' | 'unidad' | 'cantidad'>[],
  recibido: ReadonlyMap<string, number>,
): FaltanteRenglon[] {
  return renglones.map((r) => {
    const rec = recibido.get(r.id) ?? 0;
    const dif = Number(r.cantidad) - rec;
    return {
      renglonId: r.id,
      descripcion: r.descripcion,
      unidad: r.unidad,
      pedido: Number(r.cantidad),
      recibido: redondearCantidad(rec),
      faltante: dif > TOLERANCIA ? redondearCantidad(dif) : 0,
      sobrante: dif < -TOLERANCIA ? redondearCantidad(-dif) : 0,
    };
  });
}

/** Estado de una orden emitida según lo recibido (espejo de `_orden_compra_estado_calculado`). */
export function estadoOrdenRecibida(
  estado: EstadoOrden,
  renglones: readonly Pick<RenglonOrden, 'id' | 'cantidad'>[],
  recibido: ReadonlyMap<string, number>,
): EstadoOrden {
  if (estado === 'BORRADOR' || estado === 'CANCELADA') return estado;
  if (renglones.length === 0) return 'EMITIDA';
  if (renglones.every((r) => (recibido.get(r.id) ?? 0) >= Number(r.cantidad) - TOLERANCIA)) return 'RECIBIDA';
  if (renglones.some((r) => (recibido.get(r.id) ?? 0) > TOLERANCIA)) return 'PARCIAL';
  return 'EMITIDA';
}

// ── Saldo con el proveedor y vencimiento ─────────────────────────────────────

export function pagado(pagos: readonly { monto: number; deleted_at?: number | null }[]): number {
  return centavos(pagos.filter((p) => !p.deleted_at).reduce((s, p) => s + Number(p.monto), 0));
}

/** Lo que se le debe de una orden (nunca negativo: un sobrepago no es crédito). */
export function saldoOrden(total: number, pagos: readonly { monto: number; deleted_at?: number | null }[]): number {
  return Math.max(0, centavos(Number(total) - pagado(pagos)));
}

/**
 * Desde cuándo corre el crédito: la fecha de la factura si ya llegó; si no, la
 * primera entrega en obra; si no, el día que se emitió la orden. Así funciona
 * igual para quien pide factura y para quien no.
 */
export function fechaBaseCredito(o: {
  factura_fecha: number | null;
  emitida_at: number | null;
  fecha: number;
  primeraRecepcion: number | null;
}): number {
  return o.factura_fecha ?? o.primeraRecepcion ?? o.emitida_at ?? o.fecha;
}

export function fechaVencimiento(base: number, diasCredito: number): number {
  return base + Math.max(0, Math.trunc(diasCredito)) * DIA_MS;
}

export type SituacionPago = 'pagada' | 'vencida' | 'por_vencer' | 'al_corriente';

/** Días antes del vencimiento en que ya se avisa. */
export const DIAS_AVISO = 3;

/**
 * `hoy` y `vence` se comparan por DÍA (medianoche de México de cada uno), para
 * que una orden que vence hoy no salga "vencida" a las 10 de la mañana.
 */
export function situacionPago(p: {
  saldo: number;
  vence: number;
  hoy: number;
  /** Medianoche del día de `vence` (la calcula quien conoce la zona). */
  venceDia?: number;
}): { situacion: SituacionPago; dias: number } {
  if (p.saldo <= 0.01) return { situacion: 'pagada', dias: 0 };
  const venceDia = p.venceDia ?? p.vence;
  const dias = Math.round((venceDia - p.hoy) / DIA_MS);
  if (dias < 0) return { situacion: 'vencida', dias };
  if (dias <= DIAS_AVISO) return { situacion: 'por_vencer', dias };
  return { situacion: 'al_corriente', dias };
}

export const ETIQUETA_SITUACION: Record<SituacionPago, string> = {
  pagada: 'Pagada',
  vencida: 'Vencida',
  por_vencer: 'Por vencer',
  al_corriente: 'Al corriente',
};

export interface OrdenPorPagar {
  id: string;
  folio: number;
  proveedorId: string;
  obraId: string;
  total: number;
  pagado: number;
  saldo: number;
  vence: number;
  situacion: SituacionPago;
  dias: number;
}

export interface SaldoProveedor {
  proveedorId: string;
  ordenes: OrdenPorPagar[];
  saldo: number;
  vencido: number;
  /** Vencimiento más próximo de lo que todavía se debe. */
  proximoVence: number | null;
}

/**
 * Saldo por pagar agrupado por proveedor (RF2.6), con lo vencido primero. Solo
 * órdenes emitidas (las canceladas y los borradores no se deben).
 */
export function saldosPorProveedor(
  ordenes: readonly {
    id: string;
    folio: number;
    proveedor_id: string;
    obra_id: string;
    estado: EstadoOrden;
    total: number | null;
    dias_credito: number;
    factura_fecha: number | null;
    emitida_at: number | null;
    fecha: number;
  }[],
  pagos: readonly { orden_compra_id: string; monto: number; deleted_at?: number | null }[],
  primeraRecepcion: ReadonlyMap<string, number>,
  hoy: number,
  diaDe: (ms: number) => number = (ms) => ms,
): SaldoProveedor[] {
  const pagosPorOrden = new Map<string, { monto: number; deleted_at?: number | null }[]>();
  for (const p of pagos) {
    const l = pagosPorOrden.get(p.orden_compra_id);
    if (l) l.push(p);
    else pagosPorOrden.set(p.orden_compra_id, [p]);
  }

  const porProveedor = new Map<string, SaldoProveedor>();
  for (const o of ordenes) {
    if (o.estado === 'BORRADOR' || o.estado === 'CANCELADA' || o.total == null) continue;
    const ps = pagosPorOrden.get(o.id) ?? [];
    const saldo = saldoOrden(o.total, ps);
    if (saldo <= 0.01) continue;
    const vence = fechaVencimiento(
      fechaBaseCredito({ ...o, primeraRecepcion: primeraRecepcion.get(o.id) ?? null }),
      o.dias_credito,
    );
    const { situacion, dias } = situacionPago({ saldo, vence, hoy, venceDia: diaDe(vence) });
    const fila: OrdenPorPagar = {
      id: o.id,
      folio: o.folio,
      proveedorId: o.proveedor_id,
      obraId: o.obra_id,
      total: Number(o.total),
      pagado: pagado(ps),
      saldo,
      vence,
      situacion,
      dias,
    };
    const g = porProveedor.get(o.proveedor_id) ?? {
      proveedorId: o.proveedor_id,
      ordenes: [],
      saldo: 0,
      vencido: 0,
      proximoVence: null,
    };
    g.ordenes.push(fila);
    g.saldo = centavos(g.saldo + saldo);
    if (situacion === 'vencida') g.vencido = centavos(g.vencido + saldo);
    g.proximoVence = g.proximoVence == null ? vence : Math.min(g.proximoVence, vence);
    porProveedor.set(o.proveedor_id, g);
  }

  const lista = [...porProveedor.values()];
  for (const g of lista) g.ordenes.sort((a, b) => a.vence - b.vence || a.folio - b.folio);
  return lista.sort(
    (a, b) => b.vencido - a.vencido || (a.proximoVence ?? 0) - (b.proximoVence ?? 0) || b.saldo - a.saldo,
  );
}

// ── Convertir requisiciones aprobadas en órdenes ─────────────────────────────

export interface RenglonPorComprar {
  requisicionRenglonId: string;
  obraId: string;
  proveedorId: string;
  materialId: string | null;
  descripcion: string;
  unidad: string;
  cantidad: number;
  precioUnitario: number;
}

export interface OrdenPropuesta {
  obraId: string;
  proveedorId: string;
  renglones: RenglonPorComprar[];
  subtotal: number;
}

/**
 * Agrupa lo elegido por (obra, proveedor): una orden por cada par, porque el
 * pago cae en la caja de UNA obra y el PDF va a UN proveedor. Descarta lo que
 * no trae proveedor o cantidad.
 */
export function agruparEnOrdenes(items: readonly RenglonPorComprar[]): OrdenPropuesta[] {
  const grupos = new Map<string, OrdenPropuesta>();
  for (const it of items) {
    if (!it.proveedorId || !it.obraId || !(Number(it.cantidad) > 0)) continue;
    const k = `${it.obraId}|${it.proveedorId}`;
    const g = grupos.get(k) ?? { obraId: it.obraId, proveedorId: it.proveedorId, renglones: [], subtotal: 0 };
    g.renglones.push(it);
    g.subtotal = centavos(g.subtotal + importeRenglon({ cantidad: it.cantidad, precio_unitario: it.precioUnitario }));
    grupos.set(k, g);
  }
  return [...grupos.values()];
}

// ── Existencias por obra (RF2.7) ─────────────────────────────────────────────

export interface Existencia {
  obraId: string;
  materialId: string;
  recibido: number;
  consumido: number;
  traspasoEntrada: number;
  traspasoSalida: number;
  ajuste: number;
  existencia: number;
}

/**
 * recibido − consumido − traspasado a otra obra + traspasado desde otra obra ±
 * ajustes. Solo material del catálogo (espejo de la vista `existencias_obra`).
 */
export function calcularExistencias(
  recibidos: readonly { obraId: string; materialId: string | null; cantidad: number }[],
  movimientos: readonly Pick<
    MovimientoMaterial,
    'obra_id' | 'material_id' | 'tipo' | 'cantidad' | 'obra_destino_id' | 'deleted_at'
  >[],
): Existencia[] {
  const m = new Map<string, Existencia>();
  const fila = (obraId: string, materialId: string): Existencia => {
    const k = `${obraId}|${materialId}`;
    let e = m.get(k);
    if (!e) {
      e = { obraId, materialId, recibido: 0, consumido: 0, traspasoEntrada: 0, traspasoSalida: 0, ajuste: 0, existencia: 0 };
      m.set(k, e);
    }
    return e;
  };
  for (const r of recibidos) {
    if (!r.materialId) continue;
    fila(r.obraId, r.materialId).recibido += Number(r.cantidad);
  }
  for (const mv of movimientos) {
    if (mv.deleted_at) continue;
    const c = Number(mv.cantidad);
    if (mv.tipo === 'CONSUMO') fila(mv.obra_id, mv.material_id).consumido += c;
    else if (mv.tipo === 'AJUSTE') fila(mv.obra_id, mv.material_id).ajuste += c;
    else if (mv.tipo === 'TRASPASO' && mv.obra_destino_id) {
      fila(mv.obra_id, mv.material_id).traspasoSalida += c;
      fila(mv.obra_destino_id, mv.material_id).traspasoEntrada += c;
    }
  }
  const lista = [...m.values()];
  for (const e of lista) {
    e.recibido = redondearCantidad(e.recibido);
    e.consumido = redondearCantidad(e.consumido);
    e.traspasoEntrada = redondearCantidad(e.traspasoEntrada);
    e.traspasoSalida = redondearCantidad(e.traspasoSalida);
    e.ajuste = redondearCantidad(e.ajuste);
    e.existencia = redondearCantidad(e.recibido - e.consumido + e.traspasoEntrada - e.traspasoSalida + e.ajuste);
  }
  return lista;
}
