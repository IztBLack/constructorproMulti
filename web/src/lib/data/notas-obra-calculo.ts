/**
 * Aritmética de las NOTAS DE OBRA (migración 0031): los tratos de palabra con
 * socios que no están en el sistema.
 *
 * Vive aparte del acceso a datos para poder probarse sin base y para que la
 * usen igual el editor (cálculo en vivo) y el PDF (documento final) — si cada
 * uno sumara por su cuenta, tarde o temprano enseñarían números distintos.
 *
 * REGLA CENTRAL: la app SUGIERE, el dueño DECIDE. Los renglones proponen un
 * monto a partir de `monto_base` y `porcentaje`, y la nota propone total y
 * saldo a partir de los renglones; los tres se pueden fijar a mano. Es a
 * propósito: los números se los asigna la constructora con la que se trabaja y
 * no siempre cuadran con la aritmética (62,000 − 4% son 59,520, pero el trato
 * fueron 60,000).
 */

export type TipoRenglon = 'CONCEPTO' | 'DEDUCCION' | 'PAGO' | 'TEXTO';
export type EstadoNota = 'ABIERTA' | 'LIQUIDADA';

/**
 * Espaciado del `orden` (misma convención que 0026: 100, 200, 300…), para poder
 * insertar en medio sin renumerar toda la lista.
 *
 * Vive en este módulo y no en `notas-obra.ts` porque el editor lo necesita y es
 * un componente de cliente: importar allá arrastraría el acceso a datos —y con
 * él `next/headers`— al bundle del navegador.
 */
export const PASO_ORDEN = 100;

export interface RenglonNota {
  id: string;
  nota_id: string;
  tipo: TipoRenglon;
  etiqueta: string;
  /** Valor que entra en los totales. `null` = usar el sugerido. */
  monto: number | null;
  /** Bruto antes del porcentaje, cuando la nota enseña la cuenta completa. */
  monto_base: number | null;
  /** Retención en % sobre `monto_base`. */
  porcentaje: number | null;
  texto: string;
  fecha: number | null;
  orden: number;
}

export interface NotaObra {
  id: string;
  obra_id: string;
  destinatario: string;
  colaborador_id: string | null;
  titulo: string;
  fecha: number;
  estado: EstadoNota;
  total_override: number | null;
  saldo_override: number | null;
  notas: string;
  orden: number;
}

/** Nota con sus renglones ya cargados (lo que consumen editor y PDF). */
export interface NotaConRenglones extends NotaObra {
  renglones: RenglonNota[];
}

export interface TotalesNota {
  /** Σ de los renglones CONCEPTO. */
  subtotal: number;
  /** Σ de los renglones DEDUCCION. */
  deducciones: number;
  /** subtotal − deducciones. Lo que la nota diría sin intervención. */
  totalCalculado: number;
  /** El que manda: `total_override` si lo hay, si no el calculado. */
  total: number;
  /** Σ de los renglones PAGO (anticipos, proyecciones). */
  pagado: number;
  /** total − pagado. */
  saldoCalculado: number;
  /** El que manda: `saldo_override` si lo hay, si no el calculado. */
  saldo: number;
  /** true cuando el dueño fijó el valor a mano y no coincide con el cálculo. */
  totalFijado: boolean;
  saldoFijado: boolean;
}

/**
 * Monto que la app propone para un renglón a partir del bruto y la retención.
 * `null` cuando no hay bruto: entonces el monto se captura directo.
 *
 * El porcentaje se lee distinto según el tipo, porque el monto de un renglón
 * siempre es CUÁNTO MUEVE ESE RENGLÓN:
 *   DEDUCCION → el renglón ES la retención, así que vale la parte retenida
 *               ("Retención 4% sobre 100,000" descuenta 4,000).
 *   los demás → el renglón es lo que queda después de retener
 *               ("62,000 − 4% de retención" es un pago de 59,520).
 */
export function montoSugerido(
  tipo: TipoRenglon,
  montoBase: number | null | undefined,
  porcentaje: number | null | undefined,
): number | null {
  if (montoBase === null || montoBase === undefined || !Number.isFinite(montoBase)) return null;
  if (porcentaje === null || porcentaje === undefined || !Number.isFinite(porcentaje)) {
    return montoBase;
  }
  const parte = (montoBase * porcentaje) / 100;
  return tipo === 'DEDUCCION' ? parte : montoBase - parte;
}

/**
 * Valor con el que el renglón entra en los totales. Los TEXTO no suman: son
 * apuntes ("LIQUIDADO: bases de tinacos, pretil y recorte de puertas").
 */
export function montoEfectivo(r: Pick<RenglonNota, 'tipo' | 'monto' | 'monto_base' | 'porcentaje'>): number {
  if (r.tipo === 'TEXTO') return 0;
  if (r.monto !== null && r.monto !== undefined && Number.isFinite(r.monto)) return r.monto;
  return montoSugerido(r.tipo, r.monto_base, r.porcentaje) ?? 0;
}

/** Redondeo a centavos, para que los flotantes no dejen colas de 0.00000001. */
function centavos(n: number): number {
  return Math.round(n * 100) / 100;
}

export function calcularTotales(
  nota: Pick<NotaObra, 'total_override' | 'saldo_override'>,
  renglones: RenglonNota[],
): TotalesNota {
  let subtotal = 0;
  let deducciones = 0;
  let pagado = 0;

  for (const r of renglones) {
    const v = montoEfectivo(r);
    if (r.tipo === 'CONCEPTO') subtotal += v;
    else if (r.tipo === 'DEDUCCION') deducciones += v;
    else if (r.tipo === 'PAGO') pagado += v;
  }

  subtotal = centavos(subtotal);
  deducciones = centavos(deducciones);
  pagado = centavos(pagado);

  const totalCalculado = centavos(subtotal - deducciones);
  const total = nota.total_override ?? totalCalculado;

  // El saldo sale del total QUE MANDA, no del calculado: si el dueño fijó el
  // total porque así se lo asignaron, lo que resta de pagar se mide contra ese.
  const saldoCalculado = centavos(total - pagado);
  const saldo = nota.saldo_override ?? saldoCalculado;

  return {
    subtotal,
    deducciones,
    totalCalculado,
    total,
    pagado,
    saldoCalculado,
    saldo,
    totalFijado: nota.total_override !== null && nota.total_override !== totalCalculado,
    saldoFijado: nota.saldo_override !== null && nota.saldo_override !== saldoCalculado,
  };
}
