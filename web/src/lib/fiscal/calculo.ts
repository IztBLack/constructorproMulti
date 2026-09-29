/**
 * Cuentas de la hoja para facturar: desglose de IVA y retenciones, método de
 * pago sugerido y parcialidades. Lógica PURA (sin Supabase) con pruebas.
 *
 * Nada de esto decide por el usuario: son SUGERENCIAS que la hoja muestra y que
 * quien factura puede cambiar. La app no timbra.
 */

import type { TipoPersona } from './catalogos';
import type { Cobro, IvaModo } from './tipos';

/** Redondeo a centavos (el CFDI en pesos usa 2 decimales). */
export function centavos(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface OpcionesDesglose {
  ivaModo: IvaModo;
  /** Tasa de IVA en % (16 o 8 en la franja fronteriza). */
  ivaPct: number;
  retIsrPct: number;
  retIvaPct: number;
}

export interface Desglose {
  subtotal: number;
  iva: number;
  retIsr: number;
  retIva: number;
  /** Total de la factura: subtotal + IVA − retenciones. */
  total: number;
  /** Lo que el cliente te tiene que depositar por esta factura (= total). */
  aRecibir: number;
  /** Diferencia de centavos contra el monto cobrado (0 si cuadra). */
  diferencia: number;
  ivaPct: number;
  retIsrPct: number;
  retIvaPct: number;
}

function armar(subtotal: number, o: OpcionesDesglose, cobrado: number): Desglose {
  const tasaIva = o.ivaModo === 'sin_iva' ? 0 : o.ivaPct;
  const retIva = o.ivaModo === 'sin_iva' ? 0 : o.retIvaPct;
  const iva = centavos((subtotal * tasaIva) / 100);
  const rIsr = centavos((subtotal * o.retIsrPct) / 100);
  const rIva = centavos((subtotal * retIva) / 100);
  const total = centavos(subtotal + iva - rIsr - rIva);
  return {
    subtotal,
    iva,
    retIsr: rIsr,
    retIva: rIva,
    total,
    aRecibir: total,
    diferencia: o.ivaModo === 'aparte' ? 0 : centavos(total - cobrado),
    ivaPct: tasaIva,
    retIsrPct: o.retIsrPct,
    retIvaPct: retIva,
  };
}

/**
 * Desglosa un monto COBRADO.
 *
 * · `incluido` / `sin_iva`: el monto es lo que llegó a tu cuenta, así que es el
 *   TOTAL de la factura (ya con IVA y ya descontadas las retenciones). Se busca
 *   el subtotal que, con impuestos redondeados a centavos, da exactamente ese
 *   total; si ninguno cuadra al centavo, `diferencia` lo dice.
 * · `aparte`: el monto es el SUBTOTAL y el IVA va encima (la cotización se hizo
 *   sin IVA y ahora se factura).
 */
export function desglosar(monto: number, o: OpcionesDesglose): Desglose {
  const cobrado = centavos(Math.max(0, monto));
  if (o.ivaModo === 'aparte') return armar(cobrado, o, cobrado);

  const tasaIva = o.ivaModo === 'sin_iva' ? 0 : o.ivaPct;
  const retIva = o.ivaModo === 'sin_iva' ? 0 : o.retIvaPct;
  const factor = 1 + (tasaIva - o.retIsrPct - retIva) / 100;
  if (factor <= 0) return armar(cobrado, o, cobrado);

  const base = centavos(cobrado / factor);
  let mejor = armar(base, o, cobrado);
  for (const delta of [-0.02, -0.01, 0.01, 0.02]) {
    const intento = armar(centavos(base + delta), o, cobrado);
    if (Math.abs(intento.diferencia) < Math.abs(mejor.diferencia)) mejor = intento;
  }
  return mejor;
}

export interface SugerenciaRetencion {
  isrPct: number;
  ivaPct: number;
  motivo: string;
}

/**
 * Retenciones sugeridas. Solo se sugiere lo que es casi seguro:
 *   · RESICO persona física (626) que le cobra a una EMPRESA (persona moral):
 *     la empresa retiene 1.25% de ISR.
 * Lo demás (honorarios, IVA de servicios de personal) depende del contrato, y la
 * hoja solo lo menciona para que lo decida el contador.
 */
export function sugerirRetenciones(
  emisor: { regimen: string | null; tipo: TipoPersona | null },
  receptor: { tipo: TipoPersona | null; generico: boolean },
): SugerenciaRetencion {
  if (emisor.regimen === '626' && emisor.tipo === 'fisica' && receptor.tipo === 'moral' && !receptor.generico) {
    return {
      isrPct: 1.25,
      ivaPct: 0,
      motivo: 'Estás en RESICO y tu cliente es empresa: ella te retiene 1.25% de ISR.',
    };
  }
  return {
    isrPct: 0,
    ivaPct: 0,
    motivo:
      'Sin retenciones. Si tu cliente es empresa y te pide retener, anota el porcentaje que te indique tu contador.',
  };
}

export interface SugerenciaMetodo {
  metodo: 'PUE' | 'PPD';
  /** Forma de pago: con PPD siempre es 99 "Por definir". */
  forma: string;
  motivo: string;
}

/**
 * Método de pago sugerido.
 *   · Si al facturar ya te pagaron TODO lo que dice la factura → PUE (una sola
 *     exhibición) con la forma en que te pagaron.
 *   · Si te falta dinero por recibir (pago en partes o después) → PPD con forma
 *     99, y cada pago lleva su complemento.
 */
export function sugerirMetodo(p: {
  totalFactura: number;
  pagadoAlFacturar: number;
  formaDelCobro: string;
}): SugerenciaMetodo {
  if (p.pagadoAlFacturar + 0.01 >= p.totalFactura) {
    return {
      metodo: 'PUE',
      forma: p.formaDelCobro === '99' ? '03' : p.formaDelCobro,
      motivo: 'Ya te pagaron todo lo que ampara esta factura: va en una sola exhibición (PUE).',
    };
  }
  return {
    metodo: 'PPD',
    forma: '99',
    motivo: 'Todavía te falta cobrar parte de esta factura: va en parcialidades o diferido (PPD).',
  };
}

export interface Parcialidad {
  numero: number;
  saldoAnterior: number;
  pagado: number;
  saldoInsoluto: number;
}

/**
 * Número de parcialidad y saldos de un abono a una factura PPD: se ordenan por
 * fecha todos los cobros que comparten el folio, y se va restando al total.
 */
export function calcularParcialidad(
  cobroId: string,
  cobrosDeLaFactura: Pick<Cobro, 'id' | 'fecha' | 'monto'>[],
  totalFactura: number,
): Parcialidad | null {
  const orden = [...cobrosDeLaFactura].sort((a, b) => a.fecha - b.fecha || a.id.localeCompare(b.id));
  let saldo = centavos(totalFactura);
  for (let i = 0; i < orden.length; i++) {
    const c = orden[i];
    const pagado = centavos(Math.min(c.monto, Math.max(saldo, 0)));
    const siguiente = centavos(saldo - pagado);
    if (c.id === cobroId) {
      return { numero: i + 1, saldoAnterior: saldo, pagado, saldoInsoluto: siguiente };
    }
    saldo = siguiente;
  }
  return null;
}

/** ¿El concepto del cobro dice que es anticipo? */
export function pareceAnticipo(concepto: string): boolean {
  return /anticipo/i.test(concepto);
}

/**
 * Fecha límite del complemento de pago: el día 5 del mes siguiente al pago
 * (regla de la Resolución Miscelánea). Devuelve 'AAAA-MM-DD'.
 */
export function limiteComplemento(fechaPagoMs: number): string {
  // Fecha del pago en el centro de México (UTC−6 fijo).
  const d = new Date(fechaPagoMs - 6 * 3600_000);
  const anio = d.getUTCFullYear() + (d.getUTCMonth() === 11 ? 1 : 0);
  const mes = (d.getUTCMonth() + 1) % 12;
  return `${anio}-${String(mes + 1).padStart(2, '0')}-05`;
}
