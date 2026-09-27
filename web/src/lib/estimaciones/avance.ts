/**
 * AVANCE FÍSICO (RF3.1, RF3.7): cuentas PURAS sobre las capturas de
 * `avance_partida` (0039). Las usan la pestaña Avance, el detalle de la obra,
 * el portal del cliente, la Utilidad (proyección a término) y el Programa (real
 * vs programado). Una sola función para todos: si cada pantalla sacara su %,
 * tarde o temprano el cliente y la oficina verían números distintos.
 *
 *   ejecutado de una partida  = Σ capturas (incrementales; ver 0039)
 *   % de una partida          = ejecutado / contratado (tope 100)
 *   % físico de la obra       = Σ (min(ejecutado, contratado) × precio)
 *                               / Σ (contratado × precio)
 *
 * Se pondera por DINERO (el valor de lo hecho), no por número de partidas: 10 m²
 * de pintura no pesan lo mismo que la cimentación. Lo hecho de más en una
 * partida no sube el % (ya está al 100): se avisa como EXCEDENTE, que se cobra
 * con un extra.
 */

import { cantidad4, importeCentavos, restarCantidades, sumarCantidades } from './dinero';
import type { CapturaAvance, ConceptoContrato } from './tipos';

/** ¿Se puede avanzar/estimar? Cantidad positiva y precio no negativo. */
export function esEstimable(c: Pick<ConceptoContrato, 'cantidad' | 'precioUnitario'>): boolean {
  return c.cantidad > 0 && c.precioUnitario >= 0;
}

/** Ejecutado acumulado por partida (clave), opcionalmente hasta un día (incluido). */
export function ejecutadoPorConcepto(
  capturas: readonly Pick<CapturaAvance, 'clave' | 'fecha' | 'cantidad'>[],
  hasta?: number,
): Map<string, number> {
  const grupos = new Map<string, number[]>();
  for (const c of capturas) {
    if (hasta !== undefined && c.fecha > hasta) continue;
    const l = grupos.get(c.clave);
    if (l) l.push(c.cantidad);
    else grupos.set(c.clave, [c.cantidad]);
  }
  const r = new Map<string, number>();
  for (const [k, v] of grupos) r.set(k, sumarCantidades(v));
  return r;
}

export interface AvanceConcepto {
  clave: string;
  contratado: number;
  ejecutado: number;
  /** 0–100, un decimal. */
  pct: number;
  /** Lo hecho de más sobre lo contratado (0 si no hay). */
  excedente: number;
}

export interface AvanceFisico {
  /** 0–100 con un decimal; null si no hay nada contratado con valor. */
  pct: number | null;
  valorContratado: number;
  valorEjecutado: number;
  porConcepto: Map<string, AvanceConcepto>;
  /** ¿Hay al menos una captura? (para distinguir "0 %" de "no se ha capturado"). */
  hayCapturas: boolean;
}

const unDecimal = (n: number) => Math.round(n * 10) / 10;

function pctDe(parte: number, todo: number): number {
  if (todo <= 0) return 0;
  return Math.min(100, Math.max(0, unDecimal((parte / todo) * 100)));
}

export function avanceFisico(
  conceptos: readonly ConceptoContrato[],
  ejecutado: ReadonlyMap<string, number>,
): AvanceFisico {
  let contratadoC = 0;
  let ejecutadoC = 0;
  let hayCapturas = false;
  const porConcepto = new Map<string, AvanceConcepto>();
  for (const c of conceptos) {
    if (!esEstimable(c)) continue;
    const ej = Math.max(0, ejecutado.get(c.clave) ?? 0);
    if (ejecutado.has(c.clave)) hayCapturas = true;
    const hecho = Math.min(ej, c.cantidad);
    contratadoC += importeCentavos(c.cantidad, c.precioUnitario);
    ejecutadoC += importeCentavos(hecho, c.precioUnitario);
    porConcepto.set(c.clave, {
      clave: c.clave,
      contratado: cantidad4(c.cantidad),
      ejecutado: cantidad4(ej),
      pct: pctDe(ej, c.cantidad),
      excedente: ej > c.cantidad ? restarCantidades(ej, c.cantidad) : 0,
    });
  }
  return {
    pct: contratadoC > 0 ? pctDe(ejecutadoC, contratadoC) : null,
    valorContratado: contratadoC / 100,
    valorEjecutado: ejecutadoC / 100,
    porConcepto,
    hayCapturas,
  };
}

/**
 * % físico de un GRUPO de partidas (una sección del presupuesto, para el
 * Programa). Mismo ponderado por dinero. null si el grupo no tiene valor.
 */
export function avanceDeGrupo(
  conceptos: readonly ConceptoContrato[],
  ejecutado: ReadonlyMap<string, number>,
  incluir: (c: ConceptoContrato) => boolean,
): number | null {
  return avanceFisico(conceptos.filter(incluir), ejecutado).pct;
}

/**
 * Avance FINANCIERO: lo cobrado contra lo contratado (0–100, un decimal). Es
 * el "avance de pago" que ya ve el cliente; junto al físico dice si el cliente
 * va adelantado (pagó más de lo hecho) o atrasado.
 */
export function avanceFinanciero(cobrado: number, contratado: number): number | null {
  if (!(contratado > 0)) return null;
  return pctDe(Math.max(0, cobrado), contratado);
}

/**
 * "Llevamos en total X": la captura que hay que guardar es la DIFERENCIA con lo
 * que ya estaba (puede ser negativa si se había contado de más). 0 = nada que
 * guardar.
 */
export function incrementoDesdeTotal(acumuladoActual: number, totalNuevo: number): number {
  return restarCantidades(totalNuevo, acumuladoActual);
}

/** Cantidad que representa un % de lo contratado (para capturar "vamos al 40 %"). */
export function cantidadDesdePct(contratado: number, pct: number): number {
  return cantidad4((contratado * pct) / 100);
}
