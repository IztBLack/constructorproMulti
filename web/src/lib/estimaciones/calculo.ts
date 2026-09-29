/**
 * ESTIMACIONES (RF3.2–RF3.4): cuentas PURAS, en centavos enteros (`dinero.ts`).
 *
 *   importe bruto  = Σ round(cantidad del periodo × precio del contrato, 2)
 *   amortización   = % pactado del bruto, SIN PASAR de lo que queda del anticipo;
 *                    en el FINIQUITO, todo lo que quede (hasta donde alcance)
 *   subtotal       = bruto − amortización
 *   IVA            = subtotal × IVA %
 *   total          = subtotal + IVA
 *   fondo garantía = bruto × % (se regresa al cerrar la obra)
 *   retenciones    = cada una sobre el bruto (%) o monto fijo
 *   neto           = total − fondo − retenciones   ← lo que el cliente paga
 *
 * Fondo y retenciones van sobre el importe SIN IVA y sin amortizar, que es como
 * se retienen en la práctica (el 5 al millar de obra pública también).
 *
 * Tope de la amortización: tampoco puede dejar el neto negativo. Si las
 * retenciones son grandes, se amortiza menos y lo que falte queda pendiente
 * para la siguiente estimación (el anticipo nunca "se pierde").
 *
 * La base vuelve a revisar al ENVIAR (0039): identidades del dinero, importe
 * por renglón, contratado por partida y anticipo pendiente. Estas funciones
 * producen justo lo que la base acepta.
 */

import { cantidad4, deCentavos, importeCentavos, porcentajeCentavos, restarCantidades, sumarCantidades } from './dinero';
import {
  cuenta,
  type ConceptoContrato,
  type ContratoObra,
  type EstadoEstimacion,
  type Importes,
  type RetencionAplicada,
  type RetencionObra,
} from './tipos';
import { esEstimable } from './avance';

export interface RenglonParaCalcular {
  cantidad: number;
  precioUnitario: number;
}

/** Importes de una estimación. `amortizadoPrevio` = Σ amortización de las que cuentan. */
export function calcularImportes(p: {
  renglones: readonly RenglonParaCalcular[];
  contrato: ContratoObra;
  retenciones: readonly RetencionObra[];
  amortizadoPrevio: number;
  esFiniquito: boolean;
}): Importes {
  const brutoC = p.renglones.reduce((s, r) => s + importeCentavos(r.cantidad, r.precioUnitario), 0);

  const fondoC = porcentajeCentavos(brutoC, p.contrato.fondoGarantiaPct);
  const retenciones: RetencionAplicada[] = p.retenciones.map((r) => {
    const importeC =
      r.tipo === 'PORCENTAJE' ? porcentajeCentavos(brutoC, r.valor) : Math.round(Math.max(0, r.valor) * 100);
    return { concepto: r.concepto, tipo: r.tipo, valor: r.valor, importe: deCentavos(importeC) };
  });
  let retC = retenciones.reduce((s, r) => s + Math.round(r.importe * 100), 0);

  // Retenciones de monto fijo que pasan del bruto: se recortan para no cobrar
  // de más al contratista (la última de la lista absorbe el recorte).
  const maxRet = Math.max(0, brutoC - fondoC);
  if (retC > maxRet) {
    let exceso = retC - maxRet;
    for (let i = retenciones.length - 1; i >= 0 && exceso > 0; i--) {
      const c = Math.round(retenciones[i].importe * 100);
      const quita = Math.min(c, exceso);
      retenciones[i] = { ...retenciones[i], importe: deCentavos(c - quita) };
      exceso -= quita;
    }
    retC = maxRet;
  }

  const anticipoC = Math.round(Math.max(0, p.contrato.anticipo) * 100);
  const pendienteC = Math.max(0, anticipoC - Math.round(Math.max(0, p.amortizadoPrevio) * 100));
  const propuestaC = p.esFiniquito ? pendienteC : porcentajeCentavos(brutoC, p.contrato.amortizacionPct);
  // neto = (bruto − a)(1 + iva) − fondo − ret ≥ 0  ⇐  a ≤ bruto − fondo − ret
  // (el IVA solo suma, así que basta con este tope sin IVA).
  const topeNetoC = Math.max(0, brutoC - fondoC - retC);
  const amortC = Math.max(0, Math.min(propuestaC, pendienteC, brutoC, topeNetoC));

  const subtotalC = brutoC - amortC;
  const ivaC = porcentajeCentavos(subtotalC, p.contrato.ivaPct);
  const totalC = subtotalC + ivaC;
  const netoC = totalC - fondoC - retC;

  return {
    importeBruto: deCentavos(brutoC),
    amortizacion: deCentavos(amortC),
    subtotal: deCentavos(subtotalC),
    ivaPct: p.contrato.ivaPct,
    iva: deCentavos(ivaC),
    total: deCentavos(totalC),
    fondoGarantiaPct: p.contrato.fondoGarantiaPct,
    fondoGarantia: deCentavos(fondoC),
    retenciones,
    retencionesTotal: deCentavos(retC),
    neto: deCentavos(netoC),
  };
}

// ── Acumulados de la obra ────────────────────────────────────────────────────

export interface EstimacionResumen {
  id: string;
  estado: EstadoEstimacion;
  importe_bruto: number;
  amortizacion: number;
  fondo_garantia: number;
  neto: number;
  renglones: { clave: string | null; cantidad: number }[];
}

/** Cantidad ya estimada por partida en las estimaciones que cuentan (sin `excepto`). */
export function estimadoPorConcepto(
  estimaciones: readonly EstimacionResumen[],
  excepto?: string,
): Map<string, number> {
  const grupos = new Map<string, number[]>();
  for (const e of estimaciones) {
    if (e.id === excepto || !cuenta(e.estado)) continue;
    for (const r of e.renglones) {
      if (!r.clave) continue;
      const l = grupos.get(r.clave);
      if (l) l.push(r.cantidad);
      else grupos.set(r.clave, [r.cantidad]);
    }
  }
  const m = new Map<string, number>();
  for (const [k, v] of grupos) m.set(k, sumarCantidades(v));
  return m;
}

export interface Acumulados {
  /** Σ importe bruto estimado (enviadas, autorizadas, cobradas). */
  estimado: number;
  /** Σ amortización aplicada. */
  amortizado: number;
  /** Anticipo que falta amortizar. */
  anticipoPendiente: number;
  /** Σ fondo de garantía retenido (se regresa al cierre). */
  fondoRetenido: number;
  /** Σ neto de las AUTORIZADAS que no se han cobrado. */
  porCobrar: number;
  /** Σ neto de las COBRADAS. */
  cobrado: number;
}

export function acumulados(
  estimaciones: readonly EstimacionResumen[],
  anticipo: number,
  excepto?: string,
): Acumulados {
  let estimadoC = 0;
  let amortC = 0;
  let fondoC = 0;
  let porCobrarC = 0;
  let cobradoC = 0;
  for (const e of estimaciones) {
    if (e.id === excepto || !cuenta(e.estado)) continue;
    estimadoC += Math.round(e.importe_bruto * 100);
    amortC += Math.round(e.amortizacion * 100);
    fondoC += Math.round(e.fondo_garantia * 100);
    if (e.estado === 'AUTORIZADA') porCobrarC += Math.round(e.neto * 100);
    if (e.estado === 'COBRADA') cobradoC += Math.round(e.neto * 100);
  }
  return {
    estimado: deCentavos(estimadoC),
    amortizado: deCentavos(amortC),
    anticipoPendiente: deCentavos(Math.max(0, Math.round(Math.max(0, anticipo) * 100) - amortC)),
    fondoRetenido: deCentavos(fondoC),
    porCobrar: deCentavos(porCobrarC),
    cobrado: deCentavos(cobradoC),
  };
}

// ── Propuesta desde el avance ────────────────────────────────────────────────

export interface Propuesta {
  clave: string;
  concepto: ConceptoContrato;
  /** Lo que se propone estimar en este periodo. */
  cantidad: number;
  ejecutado: number;
  estimadoPrevio: number;
  /** Hecho de más que ya no cabe en lo contratado (cobrarlo con un extra). */
  excedente: number;
}

/**
 * Lo hecho que no se ha estimado: ejecutado (hasta el fin del periodo) − ya
 * estimado, sin pasar de lo que queda por estimar del contrato. Solo partidas
 * con algo que proponer.
 */
export function proponerCantidades(
  conceptos: readonly ConceptoContrato[],
  ejecutado: ReadonlyMap<string, number>,
  estimado: ReadonlyMap<string, number>,
): Propuesta[] {
  const out: Propuesta[] = [];
  for (const c of conceptos) {
    if (!esEstimable(c)) continue;
    const ej = Math.max(0, ejecutado.get(c.clave) ?? 0);
    const prev = Math.max(0, estimado.get(c.clave) ?? 0);
    const sinEstimar = Math.max(0, restarCantidades(ej, prev));
    const cabe = Math.max(0, restarCantidades(c.cantidad, prev));
    const cantidad = cantidad4(Math.min(sinEstimar, cabe));
    const excedente = ej > c.cantidad ? restarCantidades(ej, Math.max(c.cantidad, prev)) : 0;
    if (cantidad <= 0 && excedente <= 0) continue;
    out.push({ clave: c.clave, concepto: c, cantidad, ejecutado: ej, estimadoPrevio: prev, excedente: Math.max(0, excedente) });
  }
  return out;
}

// ── Validación antes de guardar o enviar ─────────────────────────────────────

export interface ProblemaRenglon {
  clave: string;
  mensaje: string;
}

/**
 * Lo que la base rechazaría al enviar, dicho antes y en lenguaje de obra:
 * partida que ya no existe, cantidad no positiva, o más de lo contratado.
 */
export function validarRenglones(
  renglones: readonly { clave: string | null; concepto: string; cantidad: number }[],
  conceptos: readonly ConceptoContrato[],
  estimadoPrevio: ReadonlyMap<string, number>,
): ProblemaRenglon[] {
  const porClave = new Map(conceptos.map((c) => [c.clave, c]));
  const problemas: ProblemaRenglon[] = [];
  const vistos = new Set<string>();
  for (const r of renglones) {
    const c = r.clave ? porClave.get(r.clave) : undefined;
    if (!r.clave || !c) {
      problemas.push({ clave: r.clave ?? '', mensaje: `«${r.concepto}» ya no está en el contrato de la obra.` });
      continue;
    }
    if (vistos.has(r.clave)) {
      problemas.push({ clave: r.clave, mensaje: `«${r.concepto}» está dos veces.` });
      continue;
    }
    vistos.add(r.clave);
    if (!(r.cantidad > 0)) {
      problemas.push({ clave: r.clave, mensaje: `«${r.concepto}»: la cantidad debe ser mayor que cero.` });
      continue;
    }
    const prev = estimadoPrevio.get(r.clave) ?? 0;
    const queda = restarCantidades(c.cantidad, prev);
    if (cantidad4(r.cantidad) > cantidad4(queda)) {
      problemas.push({
        clave: r.clave,
        mensaje: `«${r.concepto}»: solo quedan ${Math.max(0, queda).toLocaleString('es-MX')} ${c.unidad} por estimar de lo contratado. Lo que se hizo de más se cobra con un extra aprobado.`,
      });
    }
  }
  return problemas;
}
