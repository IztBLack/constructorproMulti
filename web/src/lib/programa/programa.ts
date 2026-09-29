/**
 * Programa de obra (migración 0041) — cálculos PUROS: estado de cada partida y
 * geometría de la vista de barras. Sin librería de Gantt (RF4.6, RF4.8): una
 * barra es un `left`/`width` en % dentro del rango de fechas del programa.
 *
 * PROGRAMADO VS REAL (RF4.7, con el avance físico de F3 / 0039): `estadoPartida`
 * recibe el % REAL de la partida (de `avance_partida`, ligado por
 * `presupuesto_id`, o el de su sección) y lo compara con el % PROGRAMADO a la
 * fecha (`avanceProgramado`). Si va más de `TOLERANCIA_ATRASO` puntos abajo,
 * sale "Va atrás" aunque todavía no venza: el aviso llega a tiempo de
 * corregir. Con 100 % real se da por terminada sola; la marca manual sigue
 * sirviendo para lo que no se mide por partida.
 */

import { DIA_MS, partesTz } from '@/lib/data/tz';
import { avanceDeGrupo } from '@/lib/estimaciones/avance';
import { claveConcepto, type ConceptoContrato } from '@/lib/estimaciones/tipos';

export interface PartidaPrograma {
  id: string;
  obra_id: string;
  presupuesto_id: string | null;
  seccion: string | null;
  concepto: string;
  fecha_inicio: number;
  fecha_fin: number;
  terminada: boolean;
  orden: number;
}

export type EstadoPartida = 'terminada' | 'vencida' | 'retrasada' | 'en_curso' | 'por_empezar';

export const ETIQUETA_ESTADO: Record<EstadoPartida, string> = {
  terminada: 'Terminada',
  vencida: 'Atrasada',
  retrasada: 'Va atrás',
  en_curso: 'En curso',
  por_empezar: 'Por empezar',
};

/**
 * Puntos de % que el avance real puede ir abajo del programado antes de avisar.
 * Con menos, cualquier día de lluvia pintaría media obra de rojo.
 */
export const TOLERANCIA_ATRASO = 10;

/** Clave comparable 'YYYYMMDD' del día en México. */
function diaNum(ms: number): number {
  const p = partesTz(ms);
  return p.year * 10_000 + (p.month + 1) * 100 + p.day;
}

/**
 * Estado a la fecha `hoy`. Se compara por DÍA de calendario en México: una
 * partida que termina hoy no está vencida hasta mañana.
 */
export function estadoPartida(
  p: Pick<PartidaPrograma, 'fecha_inicio' | 'fecha_fin' | 'terminada'>,
  hoy: number = Date.now(),
  /** % real medido (0–100) o null si la partida no se mide por avance. */
  avanceReal: number | null = null,
): EstadoPartida {
  if (p.terminada) return 'terminada';
  if (avanceReal !== null && avanceReal >= 100) return 'terminada';
  const d = diaNum(hoy);
  if (diaNum(p.fecha_fin) < d) return 'vencida';
  if (diaNum(p.fecha_inicio) <= d) {
    if (avanceReal !== null && avanceReal < avanceProgramado(p, hoy) - TOLERANCIA_ATRASO) return 'retrasada';
    return 'en_curso';
  }
  // Empezó antes de lo programado: ya va en curso.
  if (avanceReal !== null && avanceReal > 0) return 'en_curso';
  return 'por_empezar';
}

/**
 * % REAL de una partida del programa: la del presupuesto a la que apunta, o la
 * sección completa (ponderada por dinero). null = concepto libre o sin nada
 * contratado: no se compara (manda la marca manual y la fecha).
 * Sin capturas en la obra conviene pasar `ejecutado` vacío y `hayCapturas`
 * falso: entonces también se devuelve null, para no pintar "Va atrás" una obra
 * que simplemente no usa el avance por partida.
 */
export function avanceRealPartida(
  p: Pick<PartidaPrograma, 'presupuesto_id' | 'seccion'>,
  conceptos: readonly ConceptoContrato[],
  ejecutado: ReadonlyMap<string, number>,
  hayCapturas: boolean,
): number | null {
  if (!hayCapturas) return null;
  if (p.presupuesto_id) {
    const clave = claveConcepto('presupuesto', p.presupuesto_id);
    if (!conceptos.some((c) => c.clave === clave)) return null;
    return avanceDeGrupo(conceptos, ejecutado, (c) => c.clave === clave);
  }
  if (p.seccion) {
    return avanceDeGrupo(conceptos, ejecutado, (c) => c.origen === 'presupuesto' && c.seccion === p.seccion);
  }
  return null;
}

/** Días de atraso (0 si no está vencida). */
export function diasDeAtraso(
  p: Pick<PartidaPrograma, 'fecha_fin' | 'terminada'>,
  hoy: number = Date.now(),
): number {
  if (p.terminada) return 0;
  const atraso = Math.floor((hoy - p.fecha_fin) / DIA_MS);
  return diaNum(p.fecha_fin) < diaNum(hoy) ? Math.max(atraso, 1) : 0;
}

/** Duración en días naturales, contando el primero y el último. */
export function duracionDias(p: Pick<PartidaPrograma, 'fecha_inicio' | 'fecha_fin'>): number {
  return Math.max(1, Math.round((p.fecha_fin - p.fecha_inicio) / DIA_MS) + 1);
}

/**
 * Qué % de la partida DEBERÍA llevar a la fecha, si se reparte parejo entre su
 * inicio y su fin. Se compara con el real en `estadoPartida`.
 */
export function avanceProgramado(
  p: Pick<PartidaPrograma, 'fecha_inicio' | 'fecha_fin'>,
  hoy: number = Date.now(),
): number {
  if (hoy <= p.fecha_inicio) return 0;
  const fin = p.fecha_fin + DIA_MS; // el día de fin cuenta completo
  if (hoy >= fin) return 100;
  return Math.round(((hoy - p.fecha_inicio) / (fin - p.fecha_inicio)) * 100);
}

export interface RangoPrograma {
  inicio: number;
  /** Exclusivo: medianoche del día siguiente al último fin. */
  fin: number;
}

/** Rango que cubren todas las partidas (null si no hay). */
export function rangoPrograma(
  partidas: readonly Pick<PartidaPrograma, 'fecha_inicio' | 'fecha_fin'>[],
): RangoPrograma | null {
  if (partidas.length === 0) return null;
  let inicio = Infinity;
  let fin = -Infinity;
  for (const p of partidas) {
    inicio = Math.min(inicio, p.fecha_inicio);
    fin = Math.max(fin, p.fecha_fin);
  }
  return { inicio, fin: fin + DIA_MS };
}

/** Posición de una barra en % del rango (redondeada a 2 decimales). */
export function geometriaBarra(
  p: Pick<PartidaPrograma, 'fecha_inicio' | 'fecha_fin'>,
  rango: RangoPrograma,
): { left: number; width: number } {
  const total = Math.max(rango.fin - rango.inicio, DIA_MS);
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const left = ((p.fecha_inicio - rango.inicio) / total) * 100;
  const width = ((p.fecha_fin + DIA_MS - p.fecha_inicio) / total) * 100;
  const l = Math.min(Math.max(left, 0), 100);
  return { left: r2(l), width: r2(Math.min(Math.max(width, 0.5), 100 - l)) };
}

/** Posición de "hoy" en % del rango, o null si cae fuera. */
export function posicionHoy(rango: RangoPrograma, hoy: number = Date.now()): number | null {
  if (hoy < rango.inicio || hoy >= rango.fin) return null;
  return Math.round(((hoy - rango.inicio) / (rango.fin - rango.inicio)) * 10_000) / 100;
}

/** Validación del formulario (la base repite la de fechas con un CHECK). */
export function validarPartidaPrograma(input: {
  concepto: string;
  fecha_inicio: number;
  fecha_fin: number;
}): string | null {
  const c = input.concepto.trim();
  if (!c) return 'Escribe qué partida es.';
  if (c.length > 300) return 'El nombre de la partida es muy largo (máximo 300 letras).';
  if (!Number.isFinite(input.fecha_inicio) || !Number.isFinite(input.fecha_fin)) {
    return 'Pon las dos fechas.';
  }
  if (input.fecha_fin < input.fecha_inicio) return 'La fecha de fin no puede ser antes del inicio.';
  return null;
}

/** Orden de pantalla: por `orden`, luego por inicio. */
export function ordenarPrograma<T extends Pick<PartidaPrograma, 'orden' | 'fecha_inicio'>>(
  partidas: readonly T[],
): T[] {
  return [...partidas].sort((a, b) => a.orden - b.orden || a.fecha_inicio - b.fecha_inicio);
}
