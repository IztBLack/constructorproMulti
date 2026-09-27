/**
 * Avisos de CUMPLIMIENTO: semáforo de vencimientos, plazo del SIROC, vigencia
 * del REPSE y calendario cuatrimestral de ICSOE/SISUB.
 *
 * Módulo PURO. La app RECUERDA y AVISA; no calcula cuotas, no presenta nada y
 * no se conecta a ningún sistema de gobierno (plan §3 F5, "Principio").
 */

import {
  diasHabilesRestantes,
  diasNaturalesEntre,
  fechaDeMs,
  msDeFecha,
  recorrerAHabil,
  sumarDiasHabiles,
  type FechaCal,
} from './dias-habiles';

// ── Semáforo de vencimientos (30 / 15 / 0 días) ─────────────────────────────

export type NivelSemaforo = 'VIGENTE' | 'PRONTO' | 'URGENTE' | 'VENCIDO' | 'SIN_FECHA';

export interface Semaforo {
  nivel: NivelSemaforo;
  /** Días naturales que faltan (negativo = hace cuántos venció). null sin fecha. */
  dias: number | null;
  texto: string;
}

/** Umbrales del semáforo, en días naturales. */
export const UMBRAL_PRONTO = 30;
export const UMBRAL_URGENTE = 15;

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

/**
 * Semáforo de un documento con vigencia:
 *   > 30 días → VIGENTE · ≤ 30 → PRONTO · ≤ 15 → URGENTE · pasó → VENCIDO.
 * El día del vencimiento todavía es válido (0 días = "vence hoy", URGENTE).
 */
export function semaforoVencimiento(vigenciaHastaMs: number | null | undefined, hoyMs: number): Semaforo {
  if (vigenciaHastaMs === null || vigenciaHastaMs === undefined || !Number.isFinite(vigenciaHastaMs)) {
    return { nivel: 'SIN_FECHA', dias: null, texto: 'Sin fecha de vencimiento' };
  }
  const dias = diasNaturalesEntre(fechaDeMs(hoyMs), fechaDeMs(vigenciaHastaMs));
  if (dias < 0) {
    return { nivel: 'VENCIDO', dias, texto: `Venció hace ${plural(-dias, 'día', 'días')}` };
  }
  if (dias === 0) return { nivel: 'URGENTE', dias, texto: 'Vence hoy' };
  const texto = `Vence en ${plural(dias, 'día', 'días')}`;
  if (dias <= UMBRAL_URGENTE) return { nivel: 'URGENTE', dias, texto };
  if (dias <= UMBRAL_PRONTO) return { nivel: 'PRONTO', dias, texto };
  return { nivel: 'VIGENTE', dias, texto };
}

/** El peor de varios semáforos (para resumir un expediente en una sola luz). */
export function peorSemaforo(niveles: NivelSemaforo[]): NivelSemaforo {
  const orden: NivelSemaforo[] = ['VENCIDO', 'URGENTE', 'SIN_FECHA', 'PRONTO', 'VIGENTE'];
  for (const n of orden) if (niveles.includes(n)) return n;
  return 'SIN_FECHA';
}

// ── SIROC ────────────────────────────────────────────────────────────────────

/** Días hábiles para registrar la obra ante el IMSS (RSSOTCOTD art. 12). */
export const PLAZO_SIROC_DIAS_HABILES = 5;
/** Días hábiles para el aviso de terminación, contados desde el fin. */
export const PLAZO_TERMINACION_DIAS_HABILES = 5;

export type EstadoSiroc = 'PENDIENTE' | 'REGISTRADA' | 'SUSPENDIDA' | 'TERMINADA' | 'NO_APLICA';

export interface DatosSiroc {
  estado: EstadoSiroc;
  fecha_inicio_obra: number;
  numero_registro: string;
  fecha_terminacion: number | null;
  aviso_terminacion_at: number | null;
}

export interface AvisoSiroc {
  nivel: NivelSemaforo;
  titulo: string;
  detalle: string;
  /** Fecha límite del trámite pendiente (medianoche de México), si hay uno. */
  fechaLimite: number | null;
  /** Días hábiles restantes del trámite pendiente (negativo = vencido). */
  diasHabiles: number | null;
}

/** Fecha límite del registro: el 5.º día hábil después del inicio. */
export function limiteRegistroSiroc(fechaInicioMs: number): number {
  return msDeFecha(sumarDiasHabiles(fechaDeMs(fechaInicioMs), PLAZO_SIROC_DIAS_HABILES));
}

export function limiteAvisoTerminacion(fechaTerminacionMs: number): number {
  return msDeFecha(sumarDiasHabiles(fechaDeMs(fechaTerminacionMs), PLAZO_TERMINACION_DIAS_HABILES));
}

function nivelPorHabiles(n: number): NivelSemaforo {
  if (n <= 0) return 'VENCIDO';
  if (n <= 2) return 'URGENTE';
  return 'PRONTO';
}

function textoHabiles(n: number, venceHoy: boolean): string {
  if (n === 1) return venceHoy ? 'Hoy es el último día hábil' : 'Te queda 1 día hábil';
  if (n > 0) return `Te quedan ${n} días hábiles`;
  return `Se pasó por ${plural(-n || 1, 'día hábil', 'días hábiles')}`;
}

/**
 * Qué decirle al dueño sobre el SIROC de una obra.
 *
 * `siroc = null` es una obra sin anotar: se trata como PENDIENTE desde la
 * fecha de inicio de la obra (si la hay).
 */
export function avisoSiroc(
  siroc: DatosSiroc | null,
  obraFechaInicio: number | null,
  hoyMs: number,
): AvisoSiroc {
  const hoy = fechaDeMs(hoyMs);

  if (siroc?.estado === 'NO_APLICA') {
    return {
      nivel: 'VIGENTE',
      titulo: 'No requiere registro',
      detalle: 'Marcaste que esta obra no se registra en el SIROC.',
      fechaLimite: null,
      diasHabiles: null,
    };
  }

  if (!siroc || siroc.estado === 'PENDIENTE') {
    const inicio = siroc?.fecha_inicio_obra ?? obraFechaInicio;
    if (inicio === null || inicio === undefined) {
      return {
        nivel: 'SIN_FECHA',
        titulo: 'Falta la fecha de inicio',
        detalle: 'Anota cuándo empezaron los trabajos para calcular el plazo del registro.',
        fechaLimite: null,
        diasHabiles: null,
      };
    }
    const limite = limiteRegistroSiroc(inicio);
    const n = diasHabilesRestantes(hoy, fechaDeMs(limite));
    return {
      nivel: nivelPorHabiles(n),
      titulo: n > 0 ? 'Registra la obra en el SIROC' : 'Registro SIROC vencido',
      detalle: `${textoHabiles(n, msDeFecha(hoy) === limite)} para registrarla ante el IMSS (5 días hábiles desde el inicio).`,
      fechaLimite: limite,
      diasHabiles: n,
    };
  }

  if (siroc.estado === 'TERMINADA') {
    return {
      nivel: 'VIGENTE',
      titulo: 'Obra cerrada en el SIROC',
      detalle: siroc.numero_registro
        ? `Registro ${siroc.numero_registro}, con aviso de terminación.`
        : 'Con aviso de terminación.',
      fechaLimite: null,
      diasHabiles: null,
    };
  }

  // REGISTRADA o SUSPENDIDA: lo único pendiente es el aviso de terminación,
  // cuando ya hay fecha de fin y todavía no se presentó.
  if (siroc.fecha_terminacion !== null && siroc.aviso_terminacion_at === null) {
    const limite = limiteAvisoTerminacion(siroc.fecha_terminacion);
    const n = diasHabilesRestantes(hoy, fechaDeMs(limite));
    return {
      nivel: nivelPorHabiles(n),
      titulo: n > 0 ? 'Presenta el aviso de terminación' : 'Aviso de terminación vencido',
      detalle: `${textoHabiles(n, msDeFecha(hoy) === limite)} para avisar al IMSS que la obra terminó.`,
      fechaLimite: limite,
      diasHabiles: n,
    };
  }

  return {
    nivel: 'VIGENTE',
    titulo: siroc.estado === 'SUSPENDIDA' ? 'Obra suspendida en el SIROC' : 'Obra registrada',
    detalle: siroc.numero_registro ? `Registro ${siroc.numero_registro}.` : 'Falta anotar el número de registro.',
    fechaLimite: null,
    diasHabiles: null,
  };
}

// ── REPSE ────────────────────────────────────────────────────────────────────

/** Vigencia del registro: 3 años. */
export const VIGENCIA_REPSE_ANIOS = 3;
/** La renovación se pide en los 3 meses previos al vencimiento. */
export const VENTANA_RENOVACION_MESES = 3;

function sumarMeses(ms: number, meses: number): number {
  const f = fechaDeMs(ms);
  const total = f.m0 + meses;
  const y = f.y + Math.floor(total / 12);
  const m0 = ((total % 12) + 12) % 12;
  // Día fuera de rango (31 de un mes de 30) → último día del mes.
  const ultimo = new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
  return msDeFecha({ y, m0, d: Math.min(f.d, ultimo) });
}

/** Vigencia sugerida a partir de la fecha de registro (el usuario la puede cambiar). */
export function vigenciaRepseSugerida(fechaRegistroMs: number): number {
  return sumarMeses(fechaRegistroMs, VIGENCIA_REPSE_ANIOS * 12);
}

/** Desde cuándo se puede pedir la renovación. */
export function inicioVentanaRenovacion(vigenciaHastaMs: number): number {
  return sumarMeses(vigenciaHastaMs, -VENTANA_RENOVACION_MESES);
}

export interface AvisoRepse extends Semaforo {
  /** true si hoy ya está abierta la ventana de renovación (y no ha vencido). */
  renovarYa: boolean;
}

export function avisoRepse(vigenciaHastaMs: number | null, hoyMs: number): AvisoRepse {
  const s = semaforoVencimiento(vigenciaHastaMs, hoyMs);
  if (vigenciaHastaMs === null || s.nivel === 'VENCIDO') return { ...s, renovarYa: false };
  const renovarYa = hoyMs >= inicioVentanaRenovacion(vigenciaHastaMs);
  // Dentro de la ventana, aunque falten más de 30 días, ya es "pronto".
  return { ...s, nivel: renovarYa && s.nivel === 'VIGENTE' ? 'PRONTO' : s.nivel, renovarYa };
}

// ── ICSOE / SISUB (cuatrimestrales) ─────────────────────────────────────────

export type TipoObligacion = 'ICSOE' | 'SISUB' | 'OTRA';

export interface PeriodoCuatrimestral {
  /** '2026-C2'. Es la llave que se guarda en `obligacion_periodica.periodo`. */
  clave: string;
  anio: number;
  /** 1 = ene–abr, 2 = may–ago, 3 = sep–dic. */
  numero: 1 | 2 | 3;
  etiqueta: string;
  /** Día 17 del mes siguiente al cuatrimestre, recorrido al siguiente hábil. */
  fechaLimite: number;
}

const NOMBRES_CUATRI: Record<1 | 2 | 3, string> = {
  1: 'enero–abril',
  2: 'mayo–agosto',
  3: 'septiembre–diciembre',
};

/**
 * Periodo cuatrimestral y su fecha límite. ICSOE (IMSS) y SISUB (Infonavit)
 * comparten calendario: se presentan a más tardar el 17 de mayo, 17 de
 * septiembre y 17 de enero (del año siguiente); si el 17 es inhábil, el plazo
 * se recorre al siguiente día hábil.
 */
export function periodoCuatrimestral(anio: number, numero: 1 | 2 | 3): PeriodoCuatrimestral {
  const limite: FechaCal =
    numero === 1 ? { y: anio, m0: 4, d: 17 } : numero === 2 ? { y: anio, m0: 8, d: 17 } : { y: anio + 1, m0: 0, d: 17 };
  return {
    clave: `${anio}-C${numero}`,
    anio,
    numero,
    etiqueta: `${NOMBRES_CUATRI[numero]} ${anio}`,
    fechaLimite: msDeFecha(recorrerAHabil(limite)),
  };
}

/** El periodo anterior (C1 de 2026 → C3 de 2025). */
export function periodoAnterior(p: Pick<PeriodoCuatrimestral, 'anio' | 'numero'>): PeriodoCuatrimestral {
  return p.numero === 1 ? periodoCuatrimestral(p.anio - 1, 3) : periodoCuatrimestral(p.anio, (p.numero - 1) as 1 | 2);
}

/** Lee '2026-C2'. null si no tiene esa forma. */
export function leerClavePeriodo(clave: string): PeriodoCuatrimestral | null {
  const m = /^(\d{4})-C([123])$/.exec(clave);
  if (!m) return null;
  return periodoCuatrimestral(Number(m[1]), Number(m[2]) as 1 | 2 | 3);
}

/**
 * Los dos periodos que importan hoy: el que se está por presentar (el primero
 * cuya fecha límite no ha pasado) y el anterior (por si quedó sin entregar).
 */
export function periodosRelevantes(hoyMs: number): { anterior: PeriodoCuatrimestral; proximo: PeriodoCuatrimestral } {
  const hoy = fechaDeMs(hoyMs);
  // Candidatos: el C3 del año pasado (vence en enero) y los tres de este año.
  const candidatos = [
    periodoCuatrimestral(hoy.y - 1, 3),
    periodoCuatrimestral(hoy.y, 1),
    periodoCuatrimestral(hoy.y, 2),
    periodoCuatrimestral(hoy.y, 3),
  ];
  const hoyInicio = msDeFecha(hoy);
  const proximo = candidatos.find((p) => p.fechaLimite >= hoyInicio) ?? periodoCuatrimestral(hoy.y, 3);
  return { anterior: periodoAnterior(proximo), proximo };
}

export interface EstadoObligacion {
  nivel: NivelSemaforo;
  texto: string;
}

/** Estado de una entrega: si ya se entregó, verde; si no, semáforo por fecha. */
export function estadoObligacion(
  fechaLimiteMs: number,
  entregadoAt: number | null | undefined,
  hoyMs: number,
): EstadoObligacion {
  if (entregadoAt) return { nivel: 'VIGENTE', texto: 'Entregada' };
  const s = semaforoVencimiento(fechaLimiteMs, hoyMs);
  if (s.nivel === 'VENCIDO') return { nivel: 'VENCIDO', texto: `Sin entregar · ${s.texto.toLowerCase()}` };
  return { nivel: s.nivel === 'VIGENTE' ? 'VIGENTE' : s.nivel, texto: s.texto.replace('Vence', 'Se presenta') };
}
