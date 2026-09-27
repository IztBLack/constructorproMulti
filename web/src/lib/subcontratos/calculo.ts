/**
 * Aritmética de los SUBCONTRATOS (migración 0040): convertir una nota de obra
 * en contrato (RF5.7), la retención del fondo de garantía en cada pago y el
 * estado de cuenta del contrato (RF5.9).
 *
 * Módulo PURO: lo usan el editor, el PDF y las pruebas, para que no puedan
 * enseñar números distintos. Igual que las notas (0031), la app SUGIERE y el
 * dueño DECIDE: el monto del contrato y la retención de cada pago se pueden
 * fijar a mano.
 *
 * RT6 (paridad web↔móvil): cuando el móvil implemente subcontratos, esta
 * aritmética se porta literal y se prueba con los mismos casos de
 * `calculo.test.ts`.
 */

import {
  montoEfectivo,
  type NotaConRenglones,
  type RenglonNota,
} from '@/lib/data/notas-obra-calculo';

export type EstadoSubcontrato = 'BORRADOR' | 'FIRMADO' | 'TERMINADO' | 'CANCELADO';

export const ESTADOS_SUBCONTRATO: { valor: EstadoSubcontrato; texto: string }[] = [
  { valor: 'BORRADOR', texto: 'Borrador' },
  { valor: 'FIRMADO', texto: 'Firmado' },
  { valor: 'TERMINADO', texto: 'Terminado' },
  { valor: 'CANCELADO', texto: 'Cancelado' },
];

export function esEstadoSubcontrato(x: unknown): x is EstadoSubcontrato {
  return typeof x === 'string' && ESTADOS_SUBCONTRATO.some((e) => e.valor === x);
}

/**
 * Redondeo a centavos, medio centavo hacia arriba. `toPrecision(12)` quita la
 * cola binaria antes de redondear: 555.555 × 100 da 55555.49999… en flotante y
 * `Math.round` a secas lo bajaría a 555.55.
 */
export function centavos(n: number): number {
  return Math.round(Number((n * 100).toPrecision(12))) / 100;
}

// ── Nota → contrato ─────────────────────────────────────────────────────────

export interface RenglonContratoNuevo {
  concepto: string;
  unidad: string;
  cantidad: number | null;
  precio_unitario: number | null;
  importe: number;
}

export interface PagoPrevio {
  fecha: number | null;
  /** Bruto abonado al contrato. */
  monto: number;
  /** Lo retenido de ese pago (fondo de garantía). */
  retencion: number;
  referencia: string;
}

export interface ContratoDesdeNota {
  subcontratistaNombre: string;
  colaboradorId: string | null;
  alcance: string;
  renglones: RenglonContratoNuevo[];
  /** Σ de los CONCEPTO: lo que vale el trabajo antes de retener. */
  monto: number;
  retencionPct: number;
  pagosPrevios: PagoPrevio[];
  /** Cosas de la nota que NO pasan solas al contrato (para avisar). */
  avisos: string[];
}

function textoRenglon(r: RenglonNota): string {
  const partes = [r.etiqueta.trim(), r.texto.trim()].filter(Boolean);
  return partes.join(' — ') || 'Concepto';
}

/**
 * Convierte una nota de obra en el borrador de un contrato:
 *   · CONCEPTO  → renglón del alcance, con su importe (el que manda en la nota).
 *   · DEDUCCION con porcentaje → retención % del contrato (fondo de garantía).
 *     Si hay varias con porcentaje, se toma la primera y se avisa.
 *   · DEDUCCION sin porcentaje (material, multa…) → no es retención: se avisa.
 *   · PAGO → pago ya hecho, con su retención si la nota enseña la cuenta
 *     («62,000 − 4% = 59,520» es un pago bruto de 62,000 con 2,480 retenidos).
 *   · TEXTO → se agrega al alcance como nota.
 */
export function contratoDesdeNota(nota: NotaConRenglones, nombreObra: string): ContratoDesdeNota {
  const renglones: RenglonContratoNuevo[] = [];
  const pagosPrevios: PagoPrevio[] = [];
  const apuntes: string[] = [];
  const avisos: string[] = [];
  let retencionPct: number | null = null;

  for (const r of nota.renglones) {
    switch (r.tipo) {
      case 'CONCEPTO':
        renglones.push({
          concepto: textoRenglon(r),
          unidad: '',
          cantidad: null,
          precio_unitario: null,
          importe: centavos(montoEfectivo(r)),
        });
        break;
      case 'DEDUCCION':
        if (r.porcentaje !== null && Number.isFinite(r.porcentaje) && r.porcentaje > 0) {
          if (retencionPct === null) retencionPct = r.porcentaje;
          else if (r.porcentaje !== retencionPct) {
            avisos.push(
              `La nota trae otra retención de ${r.porcentaje}% («${r.etiqueta}»); el contrato usa ${retencionPct}%.`,
            );
          }
        } else {
          avisos.push(
            `«${r.etiqueta || 'Deducción'}» (${centavos(montoEfectivo(r))}) no es un porcentaje: no pasa como retención. Anótalo en las cláusulas si aplica.`,
          );
        }
        break;
      case 'PAGO': {
        const neto = centavos(montoEfectivo(r));
        const bruto =
          r.monto_base !== null && Number.isFinite(r.monto_base) && r.monto_base >= neto
            ? centavos(r.monto_base)
            : neto;
        if (bruto > 0) {
          pagosPrevios.push({
            fecha: r.fecha,
            monto: bruto,
            retencion: centavos(bruto - neto),
            referencia: r.etiqueta.trim(),
          });
        }
        break;
      }
      case 'TEXTO':
        if (r.etiqueta.trim() || r.texto.trim()) apuntes.push(textoRenglon(r));
        break;
    }
  }

  if (renglones.length === 0) avisos.push('La nota no tiene conceptos: el contrato empieza sin renglones.');
  if (nota.total_override !== null) {
    avisos.push('La nota tiene un total fijado a mano; revisa el monto del contrato.');
  }

  const base = nota.titulo.trim() || `Trabajos en ${nombreObra}`;
  const alcance = apuntes.length > 0 ? `${base}\n${apuntes.join('\n')}` : base;

  return {
    subcontratistaNombre: nota.destinatario.trim(),
    colaboradorId: nota.colaborador_id,
    alcance,
    renglones,
    monto: centavos(renglones.reduce((s, r) => s + r.importe, 0)),
    retencionPct: retencionPct ?? 0,
    pagosPrevios,
    avisos,
  };
}

// ── Pagos con retención ─────────────────────────────────────────────────────

export interface PagoCalculado {
  monto: number;
  retencion: number;
  /** Lo que sale de caja: monto − retención. */
  neto: number;
}

/**
 * Retención sugerida de un pago: `pct` % del bruto, a centavos. Nunca mayor
 * que el pago ni negativa (la base lo exige también: `retencion <= monto`).
 */
export function calcularPago(monto: number, retencionPct: number, retencionFijada?: number | null): PagoCalculado {
  const m = centavos(Math.max(0, monto));
  const sugerida = centavos((m * Math.min(100, Math.max(0, retencionPct))) / 100);
  const r =
    retencionFijada !== null && retencionFijada !== undefined && Number.isFinite(retencionFijada)
      ? centavos(Math.min(m, Math.max(0, retencionFijada)))
      : sugerida;
  return { monto: m, retencion: r, neto: centavos(m - r) };
}

// ── Estado de cuenta del contrato ───────────────────────────────────────────

export interface RenglonContrato {
  importe: number;
}

export interface PagoContrato {
  monto: number;
  retencion: number;
}

export interface ResumenSubcontrato {
  /** Suma de los renglones. */
  sumaRenglones: number;
  /** El que manda: `monto` si se fijó, si no la suma. */
  montoContratado: number;
  montoFijado: boolean;
  /** Σ bruto abonado. */
  pagadoBruto: number;
  /** Σ retenido (fondo de garantía por devolver al terminar). */
  retenido: number;
  /** Σ lo que salió de caja. */
  pagadoNeto: number;
  /** Lo que falta por abonar: contratado − pagadoBruto. */
  porPagar: number;
  /** % de avance financiero (pagadoBruto / contratado), 0–100+. */
  avancePct: number;
}

export function resumenSubcontrato(
  contrato: { monto: number | null },
  renglones: RenglonContrato[],
  pagos: PagoContrato[],
): ResumenSubcontrato {
  const sumaRenglones = centavos(renglones.reduce((s, r) => s + (Number.isFinite(r.importe) ? r.importe : 0), 0));
  const montoContratado = contrato.monto ?? sumaRenglones;
  const pagadoBruto = centavos(pagos.reduce((s, p) => s + p.monto, 0));
  const retenido = centavos(pagos.reduce((s, p) => s + p.retencion, 0));
  return {
    sumaRenglones,
    montoContratado,
    montoFijado: contrato.monto !== null && contrato.monto !== sumaRenglones,
    pagadoBruto,
    retenido,
    pagadoNeto: centavos(pagadoBruto - retenido),
    porPagar: centavos(montoContratado - pagadoBruto),
    avancePct: montoContratado > 0 ? Math.round((pagadoBruto / montoContratado) * 1000) / 10 : 0,
  };
}

/** Importe de un renglón a partir de cantidad × P.U., si vienen los dos. */
export function importeRenglon(cantidad: number | null, precioUnitario: number | null, importe: number): number {
  if (cantidad !== null && precioUnitario !== null && Number.isFinite(cantidad) && Number.isFinite(precioUnitario)) {
    return centavos(cantidad * precioUnitario);
  }
  return centavos(importe);
}
