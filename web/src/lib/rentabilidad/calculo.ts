/**
 * UTILIDAD POR OBRA (RF1.6–RF1.8): cuentas PURAS, sin Supabase.
 *
 *   contratado  = presupuesto de la obra (Σ obra_presupuesto, sin IVA)
 *               + extras APROBADOS (total de su foto, 0036)
 *   costo real  = salidas de caja (por categoría de costo)
 *               + raya que todavía no se pasa a caja
 *               + pagos a socios (notas) que todavía no se ven en caja
 *   utilidad    = contratado − costo real
 *   margen %    = utilidad / contratado
 *
 * ── EL DOBLE CONTEO, que es la parte delicada ────────────────────────────────
 * Hay dinero que la app conoce por DOS caminos:
 *
 *  · RAYA. La pestaña Nómina calcula la raya (asistencia × sueldo + destajos) y
 *    tiene un botón "Registrar en caja" que crea UNA salida con categoría de
 *    sistema `NOMINA` (web y móvil). Sumar la raya calculada MÁS esas salidas la
 *    contaría dos veces; ignorar la calculada dejaría fuera las semanas que nadie
 *    pasó a caja. Regla: la raya pasada a caja es un pedazo de la calculada, así
 *    que solo se agrega lo que falta:
 *        raya sin caja = max(0, raya calculada − salidas NOMINA)
 *    No se empareja semana por semana a propósito: el móvil y la web escriben el
 *    concepto con formatos de fecha distintos, y un emparejado por texto se
 *    rompería en silencio.
 *
 *  · NOTAS DE OBRA (0031). Son tratos de palabra con socios; NO generan
 *    movimientos por sí solas y no hay liga entre una nota y la salida con la que
 *    se le pagó al socio. Mismo razonamiento: lo pagado según las notas
 *    (total de las LIQUIDADAS + lo abonado a las ABIERTAS) solo cuenta en lo que
 *    exceda a las salidas clasificadas como SUBCONTRATO:
 *        socios sin caja = max(0, pagado en notas − salidas SUBCONTRATO)
 *    Quien lleva la caja completa (y clasifica) no ve doble; quien solo lleva
 *    notas ve su costo igual.
 *    El SALDO de las notas abiertas es dinero comprometido que todavía no sale:
 *    no entra al costo real, pero sí a la proyección.
 *
 * ── LA PROYECCIÓN A TÉRMINO ─────────────────────────────────────────────────
 *   1. avance FÍSICO por partida (F3, `avance_partida` 0039, ponderado por
 *      dinero con `lib/estimaciones/avance.ts`) si ya hay capturas;
 *   2. si no, el avance capturado a mano en la obra (0–100) si es > 0;
 *   3. si no, el avance FINANCIERO = cobrado SIN IVA / contratado (lo
 *      contratado no lleva IVA; el IVA cobrado se separa igual que en el
 *      estado de cuenta, `separarIvaCobrado`).
 *   costo proyectado = costo real / avance, y nunca menos que
 *                      costo real + comprometido en notas.
 * Sin ningún avance no hay proyección (y el semáforo dice "sin datos"): al
 * arrancar una obra el margen "real" siempre sale altísimo porque aún no se
 * gasta, y pintarlo de verde sería mentir.
 *
 * ── EL SEMÁFORO (RF1.7) ─────────────────────────────────────────────────────
 *   verde    margen proyectado ≥ objetivo
 *   amarillo margen proyectado < objetivo, pero a menos de 5 puntos y ≥ 0
 *   rojo     más de 5 puntos abajo, o pérdida
 */

import { calcularNomina } from '@/lib/data/nomina-calculo';
import type { Asistencia, Colaborador, Destajo, Puesto } from '@/lib/data/types';
import {
  CATEGORIAS_COSTO,
  SIN_CLASIFICAR,
  renglonDeCosto,
  type RenglonCosto,
} from './categorias';
import { separarIvaCobrado, type IvaEstadoCuenta } from '@/lib/cliente/estado-cuenta-calculo';

/** Puntos de margen por debajo del objetivo que todavía se pintan en amarillo. */
export const TOLERANCIA_AMARILLO = 5;

/** Margen objetivo si la empresa no tiene uno (el ejemplo del plan). */
export const MARGEN_OBJETIVO_POR_DEFECTO = 15;

export type Semaforo = 'verde' | 'amarillo' | 'rojo' | 'sin_datos';

export interface MovimientoCosto {
  /** Para ligar la entrada con la estimación que cobró (su IVA). Opcional. */
  id?: string;
  tipo: 'ENTRADA' | 'SALIDA' | string;
  monto: number;
  categoria?: string | null;
  categoria_costo?: string | null;
}

export interface NotaCosto {
  estado: 'ABIERTA' | 'LIQUIDADA' | string;
  /** Total acordado (con lo fijado a mano, `calcularTotales` de notas). */
  total: number;
  /** Lo abonado según los renglones PAGO. */
  pagado: number;
  /** total − pagado (con lo fijado a mano). */
  saldo: number;
}

export interface DatosRentabilidad {
  /** Σ del presupuesto de la obra (cantidad × precio), sin IVA. */
  presupuesto: number;
  /** Σ de extras APROBADOS (ver `totalExtrasAprobados`). */
  extrasAprobados: number;
  /** Movimientos de caja de la obra (vivos). Entradas y salidas. */
  movimientos: MovimientoCosto[];
  /** Raya calculada de toda la obra (ver `rayaCalculada`). */
  rayaCalculada: number;
  /** Notas de obra (vivas), con sus totales ya resueltos. */
  notas: NotaCosto[];
  /** Avance capturado A MANO en la obra (`obras.avance`), 0–100. 0 o null = no se sabe. */
  avance: number | null;
  /**
   * Avance FÍSICO por partida (F3), 0–100. null = no hay capturas (o el módulo
   * está apagado): entonces se usa el manual. Cuando existe, MANDA: es lo medido
   * en campo, no una estimación a ojo.
   */
  avanceFisico?: number | null;
  /** Margen objetivo en %, ya resuelto (obra → empresa → 15). */
  margenObjetivo: number;
  /**
   * Lo que se les debe a proveedores por órdenes de compra emitidas de esta obra
   * (módulo `compras`, 0038): total − pagado. NO es costo real todavía (no ha
   * salido de caja); al pagarse, sale de aquí y entra a caja como MATERIAL. Por
   * eso nunca se cuenta dos veces. Opcional: sin compras, 0.
   */
  comprometidoCompras?: number;
  /**
   * IVA con que cobra la obra (0047) y estimaciones cobradas: para que lo
   * cobrado se compare SIN IVA contra lo contratado. Sin esto: sin IVA.
   */
  iva?: IvaEstadoCuenta | null;
}

export type FuenteAvance = 'partidas' | 'obra' | 'cobrado' | 'ninguna';

export interface ResultadoRentabilidad {
  presupuesto: number;
  extras: number;
  contratado: number;
  /** Lo cobrado SIN IVA (Σ entradas menos el IVA que traían). */
  cobrado: number;
  /** IVA que venía en las entradas (no es de la constructora). */
  ivaCobrado: number;

  /** Salidas de caja por renglón de costo (incluye "Sin clasificar"). */
  salidasPorCategoria: Record<RenglonCosto, number>;
  totalSalidas: number;
  /** Raya calculada que todavía no aparece en caja como NOMINA. */
  rayaSinCaja: number;
  /** Lo pagado a socios según las notas que no aparece en caja como SUBCONTRATO. */
  sociosSinCaja: number;
  /** Costo real por renglón, ya con raya y socios sin caja sumados. */
  costoPorCategoria: Record<RenglonCosto, number>;
  costoReal: number;

  utilidad: number;
  /** null si no hay nada contratado (no hay contra qué dividir). */
  margen: number | null;

  /** Saldo pendiente de las notas abiertas: dinero comprometido con socios. */
  comprometidoNotas: number;
  /** Saldo por pagar a proveedores de órdenes de compra emitidas. */
  comprometidoCompras: number;

  avanceUsado: number | null;
  fuenteAvance: FuenteAvance;
  costoProyectado: number | null;
  utilidadProyectada: number | null;
  margenProyectado: number | null;

  margenObjetivo: number;
  semaforo: Semaforo;
}

function redondear(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function finito(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n);
  return Number.isFinite(v) ? v : 0;
}

function cerosPorCategoria(): Record<RenglonCosto, number> {
  const r = {} as Record<RenglonCosto, number>;
  for (const c of CATEGORIAS_COSTO) r[c] = 0;
  r[SIN_CLASIFICAR] = 0;
  return r;
}

/**
 * Raya de TODA la obra con la misma fórmula que la pestaña Nómina
 * (`calcularNomina`, portada del móvil: DIA → Σ fracciones × salario; DESTAJO →
 * Σ destajos). La fórmula es aditiva por persona, así que calcularla de una vez
 * da lo mismo que sumar semana por semana.
 *
 * Diferencia consciente con la pestaña Nómina: allá solo aparece quien estaba
 * ASIGNADO a la obra esa semana; aquí entra todo el que tiene asistencia o
 * destajo en la obra (incluidos colaboradores ya dados de baja). Para costo es
 * lo correcto: si hay asistencia, ese día se trabajó ahí.
 */
export function rayaCalculada(p: {
  colaboradores: Colaborador[];
  asistencias: Asistencia[];
  destajos: Destajo[];
  puestos: Puesto[];
}): number {
  const presentes = new Set<string>([
    ...p.asistencias.map((a) => a.colaborador_id),
    ...p.destajos.map((d) => d.colaborador_id),
  ]);
  const colaboradores = p.colaboradores.filter((c) => presentes.has(c.id));
  return redondear(
    calcularNomina({
      colaboradores,
      asistencias: p.asistencias,
      destajos: p.destajos,
      puestos: p.puestos,
    }).totalNomina,
  );
}

export function semaforoDe(margenProyectado: number | null, objetivo: number): Semaforo {
  if (margenProyectado === null) return 'sin_datos';
  if (margenProyectado >= objetivo) return 'verde';
  if (margenProyectado >= 0 && margenProyectado >= objetivo - TOLERANCIA_AMARILLO) return 'amarillo';
  return 'rojo';
}

/** Objetivo que aplica: el de la obra si lo tiene, si no el de la empresa. */
export function margenObjetivoDe(obra: number | null | undefined, empresa: number | null | undefined): number {
  if (typeof obra === 'number' && Number.isFinite(obra)) return obra;
  if (typeof empresa === 'number' && Number.isFinite(empresa)) return empresa;
  return MARGEN_OBJETIVO_POR_DEFECTO;
}

export function calcularRentabilidad(d: DatosRentabilidad): ResultadoRentabilidad {
  const presupuesto = redondear(finito(d.presupuesto));
  const extras = redondear(finito(d.extrasAprobados));
  const contratado = redondear(presupuesto + extras);

  const salidasPorCategoria = cerosPorCategoria();
  const entradas: { id?: string; monto: number }[] = [];
  let nominaEnCaja = 0;
  for (const m of d.movimientos) {
    const monto = finito(m.monto);
    if (m.tipo === 'ENTRADA') {
      entradas.push({ id: m.id, monto });
      continue;
    }
    if (m.tipo !== 'SALIDA') continue;
    salidasPorCategoria[renglonDeCosto(m)] += monto;
    if ((m.categoria ?? '').trim().toUpperCase() === 'NOMINA') nominaEnCaja += monto;
  }
  const sepIva = separarIvaCobrado(entradas, d.iva);
  const cobrado = sepIva.base;
  for (const k of Object.keys(salidasPorCategoria) as RenglonCosto[]) {
    salidasPorCategoria[k] = redondear(salidasPorCategoria[k]);
  }
  const totalSalidas = redondear(
    Object.values(salidasPorCategoria).reduce((a, b) => a + b, 0),
  );

  // Raya: solo lo que no está ya en caja.
  const rayaSinCaja = redondear(Math.max(0, finito(d.rayaCalculada) - nominaEnCaja));

  // Socios: lo pagado según las notas, menos lo que ya se ve en caja como subcontrato.
  let pagadoNotas = 0;
  let comprometido = 0;
  for (const n of d.notas) {
    if (n.estado === 'LIQUIDADA') {
      pagadoNotas += Math.max(0, finito(n.total));
    } else {
      pagadoNotas += Math.max(0, finito(n.pagado));
      comprometido += Math.max(0, finito(n.saldo));
    }
  }
  const sociosSinCaja = redondear(Math.max(0, pagadoNotas - salidasPorCategoria.SUBCONTRATO));
  const comprometidoNotas = redondear(comprometido);
  const comprometidoCompras = redondear(Math.max(0, finito(d.comprometidoCompras)));

  const costoPorCategoria = { ...salidasPorCategoria };
  costoPorCategoria.MANO_OBRA = redondear(costoPorCategoria.MANO_OBRA + rayaSinCaja);
  costoPorCategoria.SUBCONTRATO = redondear(costoPorCategoria.SUBCONTRATO + sociosSinCaja);
  const costoReal = redondear(totalSalidas + rayaSinCaja + sociosSinCaja);

  const utilidad = redondear(contratado - costoReal);
  const margen = contratado > 0 ? redondear((utilidad / contratado) * 100) : null;

  // Avance: el físico por partida; si no hay, el de la obra; si no, lo cobrado
  // contra lo contratado.
  let avanceUsado: number | null = null;
  let fuenteAvance: FuenteAvance = 'ninguna';
  const avanceObra = finito(d.avance);
  const fisico = d.avanceFisico == null ? null : finito(d.avanceFisico);
  if (fisico !== null && fisico > 0) {
    avanceUsado = Math.min(100, fisico);
    fuenteAvance = 'partidas';
  } else if (avanceObra > 0) {
    avanceUsado = Math.min(100, avanceObra);
    fuenteAvance = 'obra';
  } else if (contratado > 0 && cobrado > 0) {
    avanceUsado = Math.min(100, redondear((cobrado / contratado) * 100));
    fuenteAvance = 'cobrado';
  }

  let costoProyectado: number | null = null;
  let utilidadProyectada: number | null = null;
  let margenProyectado: number | null = null;
  if (avanceUsado !== null && avanceUsado > 0 && contratado > 0) {
    costoProyectado = redondear(
      Math.max(costoReal / (avanceUsado / 100), costoReal + comprometidoNotas + comprometidoCompras),
    );
    utilidadProyectada = redondear(contratado - costoProyectado);
    margenProyectado = redondear((utilidadProyectada / contratado) * 100);
  }

  const margenObjetivo = finito(d.margenObjetivo);

  return {
    presupuesto,
    extras,
    contratado,
    cobrado: redondear(cobrado),
    ivaCobrado: sepIva.iva,
    salidasPorCategoria,
    totalSalidas,
    rayaSinCaja,
    sociosSinCaja,
    costoPorCategoria,
    costoReal,
    utilidad,
    margen,
    comprometidoNotas,
    comprometidoCompras,
    avanceUsado,
    fuenteAvance,
    costoProyectado,
    utilidadProyectada,
    margenProyectado,
    margenObjetivo,
    semaforo: semaforoDe(margenProyectado, margenObjetivo),
  };
}

// ── Comparativo entre obras (RF1.8) ──────────────────────────────────────────

export interface FilaComparativo {
  obraId: string;
  nombre: string;
  activa: boolean;
  r: ResultadoRentabilidad;
}

const PESO_SEMAFORO: Record<Semaforo, number> = { rojo: 0, amarillo: 1, verde: 2, sin_datos: 3 };

/**
 * Orden del comparativo: primero lo que necesita atención (rojo, luego
 * amarillo), y dentro de cada color, el peor margen proyectado arriba. Las
 * obras sin datos al final.
 */
export function ordenarComparativo(filas: FilaComparativo[]): FilaComparativo[] {
  return [...filas].sort((a, b) => {
    const s = PESO_SEMAFORO[a.r.semaforo] - PESO_SEMAFORO[b.r.semaforo];
    if (s !== 0) return s;
    const ma = a.r.margenProyectado ?? a.r.margen ?? Number.POSITIVE_INFINITY;
    const mb = b.r.margenProyectado ?? b.r.margen ?? Number.POSITIVE_INFINITY;
    if (ma !== mb) return ma - mb;
    return a.nombre.localeCompare(b.nombre, 'es');
  });
}

export interface TotalesComparativo {
  contratado: number;
  costoReal: number;
  utilidad: number;
  margen: number | null;
}

export function totalesComparativo(filas: FilaComparativo[]): TotalesComparativo {
  const contratado = redondear(filas.reduce((a, f) => a + f.r.contratado, 0));
  const costoReal = redondear(filas.reduce((a, f) => a + f.r.costoReal, 0));
  const utilidad = redondear(contratado - costoReal);
  return {
    contratado,
    costoReal,
    utilidad,
    margen: contratado > 0 ? redondear((utilidad / contratado) * 100) : null,
  };
}

export const ETIQUETA_SEMAFORO: Record<Semaforo, string> = {
  verde: 'Va bien',
  amarillo: 'Ojo: abajo del objetivo',
  rojo: 'En riesgo',
  sin_datos: 'Sin avance para proyectar',
};
