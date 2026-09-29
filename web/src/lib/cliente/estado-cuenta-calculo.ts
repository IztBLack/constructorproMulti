/**
 * Números del ESTADO DE CUENTA de una obra frente al cliente. Puro: lo usan la
 * vía del cliente (`portal-cliente.ts`), la de oficina
 * (`estado-cuenta-obra-admin.ts`), el detalle de la obra, los PDF y el Excel,
 * que antes sumaban cada uno por su cuenta.
 *
 *   COSTO TOTAL = presupuesto (Σ partidas) + extras APROBADOS (RF1.4), SIN IVA
 *   RECIBIDO    = Σ ENTRADAS de caja, tal como llegaron (CON el IVA, si lo hay)
 *               = cobrado sin IVA + IVA cobrado
 *   PENDIENTE   = costo total − cobrado SIN IVA
 *   % cobrado   = cobrado sin IVA / costo total
 *
 * EL IVA COBRADO (decisión de Mario, prefijo IVA- en PROGRESO_ALCANCE.md)
 * ─────────────────────────────────────────────────────────────────────────
 * El costo total no lleva IVA, pero en una obra que cobra con IVA cada entrada
 * sí lo trae (un anticipo "30 % más IVA" entra como base × 1.16). Comparar una
 * cosa con la otra inflaba lo cobrado y achicaba el pendiente. Con la tasa de
 * la obra (`iva_obras`, 0047) cada ENTRADA se parte en base + IVA:
 *   · base = round(monto / (1 + t)) al centavo, IVA = monto − base, POR
 *     ENTRADA (cada entrada es un pago con su factura, y así base + IVA da el
 *     recibido exacto, sin centavos que se pierdan al sumar);
 *   · la entrada con la que se cobró una ESTIMACIÓN (F3) no se adivina: su IVA
 *     es el que dice la estimación (proporcional si la entrada no fue por el
 *     neto completo). Su neto ya trae descontados fondo de garantía y
 *     retenciones, que se calculan sobre la base, así que dividir entre 1 + t
 *     le quitaría de menos al IVA.
 * Sin tasa (obra sin IVA) y sin estimaciones con IVA, todo queda igual que
 * antes: cobrado sin IVA = recibido.
 *
 * Los extras van como LÍNEA APARTE, no mezclados con las partidas: el cliente
 * tiene que poder ver qué era el trato original y qué se agregó después.
 *
 * ESTIMACIONES (F3, 0039): no cambian el costo total (valúan partes de ese mismo
 * contrato) ni lo recibido (el dinero llega como entrada de caja). Agregan dos
 * datos al lado:
 *   · POR COBRAR DE ESTIMACIONES = Σ neto de las AUTORIZADAS sin cobrar: lo que
 *     el cliente ya reconoció y debe pagar ahora (con su IVA: es lo que paga);
 *   · FONDO DE GARANTÍA RETENIDO = Σ fondo de las enviadas/autorizadas/cobradas:
 *     parte del contrato que el cliente se queda hasta el cierre. Por eso el
 *     pendiente no llega a cero mientras no se libere.
 */

import { aCentavos, baseSinIvaCentavos, proporcionCentavos } from '@/lib/estimaciones/dinero';

export interface TotalesEstadoCuenta {
  presupuesto: number;
  totalExtras: number;
  costoTotal: number;
  /** Σ ENTRADAS tal como llegaron (con IVA si la obra lo cobra). */
  recibido: number;
  /** Lo recibido SIN el IVA: lo que de verdad abona al costo total. */
  recibidoSinIva: number;
  /** IVA que venía en lo recibido. No es de la constructora: se entera al SAT. */
  ivaCobrado: number;
  /** % de IVA con que cobra la obra (0 = sin IVA). */
  tasaIva: number;
  /** costo total − recibido sin IVA. */
  pendiente: number;
  /** 0–100, redondeado, sobre lo recibido SIN IVA. 0 si no hay costo. */
  pagadoPct: number;
  /** Σ neto de estimaciones AUTORIZADAS que no se han cobrado. */
  estimacionesPorCobrar: number;
  /** Σ fondo de garantía retenido en estimaciones (se libera al cierre). */
  fondoGarantiaRetenido: number;
}

export interface EstimacionEstadoCuenta {
  estado: string;
  neto: number;
  fondo_garantia: number;
}

/** Una estimación COBRADA con una entrada de caja (0039 `estimaciones.movimiento_id`). */
export interface EstimacionCobradaIva {
  movimientoId: string;
  /** IVA de la estimación (columna `iva`). */
  iva: number;
  /** Neto de la estimación (lo que el cliente paga por ella). */
  neto: number;
}

/** Tasa de la obra y, si las hay, las estimaciones cobradas con una entrada. */
export interface IvaEstadoCuenta {
  tasaPct: number;
  estimacionesCobradas?: readonly EstimacionCobradaIva[];
}

export interface EntradaConIva {
  id?: string;
  monto: number;
}

export interface IvaSeparado {
  /** Σ montos, tal como llegaron. */
  conIva: number;
  /** Lo cobrado sin IVA. */
  base: number;
  /** IVA cobrado. base + iva = conIva, al centavo. */
  iva: number;
}

function centavos(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** % de IVA válido (0–100); lo demás cuenta como 0 (sin IVA). */
export function tasaIvaValida(t: unknown): number {
  const v = typeof t === 'number' ? t : Number(t);
  return Number.isFinite(v) && v > 0 && v <= 100 ? v : 0;
}

/** IVA que trae UNA entrada, en centavos (ver el encabezado). */
function ivaDeEntradaCentavos(
  montoC: number,
  tasaPct: number,
  estimacion: EstimacionCobradaIva | undefined,
): number {
  if (estimacion) {
    const ivaEstC = aCentavos(Math.max(0, Number(estimacion.iva) || 0));
    const netoC = aCentavos(Number(estimacion.neto) || 0);
    if (netoC > 0) {
      if (montoC === netoC) return ivaEstC;
      // Entrada por otra cantidad que el neto: el IVA en la misma proporción,
      // nunca más que la entrada.
      const iva = proporcionCentavos(ivaEstC, montoC, netoC);
      return montoC >= 0 ? Math.min(Math.max(iva, 0), montoC) : Math.max(Math.min(iva, 0), montoC);
    }
  }
  if (tasaPct <= 0) return 0;
  return montoC - baseSinIvaCentavos(montoC, tasaPct);
}

/**
 * Parte lo recibido en base + IVA, entrada por entrada. Todo en centavos
 * enteros: base + IVA = recibido exacto.
 */
export function separarIvaCobrado(
  entradas: readonly EntradaConIva[],
  iva: IvaEstadoCuenta | null | undefined,
): IvaSeparado {
  const tasa = tasaIvaValida(iva?.tasaPct);
  const porMovimiento = new Map((iva?.estimacionesCobradas ?? []).map((e) => [e.movimientoId, e]));
  let totalC = 0;
  let ivaC = 0;
  for (const e of entradas) {
    const montoC = aCentavos(Number(e.monto) || 0);
    totalC += montoC;
    ivaC += ivaDeEntradaCentavos(montoC, tasa, e.id ? porMovimiento.get(e.id) : undefined);
  }
  return { conIva: totalC / 100, base: (totalC - ivaC) / 100, iva: ivaC / 100 };
}

export function totalesEstadoCuenta(p: {
  partidas: { cantidad: number; precio_unitario: number }[];
  entradas: EntradaConIva[];
  extras: { total: number }[];
  estimaciones?: EstimacionEstadoCuenta[];
  /** Sin esto (o con tasa 0 y sin estimaciones cobradas) no se separa IVA: como antes. */
  iva?: IvaEstadoCuenta | null;
}): TotalesEstadoCuenta {
  const presupuesto = centavos(
    p.partidas.reduce((acc, x) => acc + Number(x.cantidad) * Number(x.precio_unitario), 0),
  );
  const totalExtras = centavos(p.extras.reduce((acc, e) => acc + Number(e.total), 0));
  const costoTotal = centavos(presupuesto + totalExtras);
  const sep = separarIvaCobrado(p.entradas, p.iva);
  const pendiente = centavos(costoTotal - sep.base);
  const pagadoPct =
    costoTotal > 0 ? Math.max(0, Math.min(100, Math.round((sep.base / costoTotal) * 100))) : 0;
  const ests = p.estimaciones ?? [];
  const estimacionesPorCobrar = centavos(
    ests.filter((e) => e.estado === 'AUTORIZADA').reduce((acc, e) => acc + Number(e.neto), 0),
  );
  const fondoGarantiaRetenido = centavos(
    ests
      .filter((e) => ['ENVIADA', 'AUTORIZADA', 'COBRADA'].includes(e.estado))
      .reduce((acc, e) => acc + Number(e.fondo_garantia), 0),
  );
  return {
    presupuesto,
    totalExtras,
    costoTotal,
    recibido: sep.conIva,
    recibidoSinIva: sep.base,
    ivaCobrado: sep.iva,
    tasaIva: tasaIvaValida(p.iva?.tasaPct),
    pendiente,
    pagadoPct,
    estimacionesPorCobrar,
    fondoGarantiaRetenido,
  };
}

/** ¿Hay IVA que mostrar aparte? (la obra cobra con IVA o alguna entrada lo trajo). */
export function muestraIva(t: Pick<TotalesEstadoCuenta, 'tasaIva' | 'ivaCobrado'>): boolean {
  return t.tasaIva > 0 || t.ivaCobrado !== 0;
}

/** "16 %" / "8 %" / "10.5 %" para las etiquetas. */
export function textoTasaIva(t: number): string {
  return `${t.toLocaleString('es-MX', { maximumFractionDigits: 4 })} %`;
}
