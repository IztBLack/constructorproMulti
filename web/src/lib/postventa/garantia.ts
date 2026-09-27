/**
 * Garantías y postventa (módulo `postventa`, 0043) — reglas PURAS.
 *
 * El periodo de garantía lo pone el dueño por obra (fecha de entrega + meses);
 * la app no presume un plazo legal: lo que diga el contrato.
 */

import { diasEntreMx, sumarMesesMx } from '@/lib/fechas/dias-mx';

export const ESTADOS_REPORTE = ['ABIERTO', 'EN_REVISION', 'PROGRAMADO', 'RESUELTO', 'NO_PROCEDE'] as const;
export type EstadoReporte = (typeof ESTADOS_REPORTE)[number];

/** Cómo lo lee el cliente y la oficina. */
export const ETIQUETA_ESTADO_REPORTE: Record<EstadoReporte, string> = {
  ABIERTO: 'Recibido',
  EN_REVISION: 'En revisión',
  PROGRAMADO: 'Visita programada',
  RESUELTO: 'Resuelto',
  NO_PROCEDE: 'No procede',
};

export const TONO_ESTADO_REPORTE: Record<EstadoReporte, 'amber' | 'blue' | 'green' | 'neutral' | 'red'> = {
  ABIERTO: 'amber',
  EN_REVISION: 'blue',
  PROGRAMADO: 'blue',
  RESUELTO: 'green',
  NO_PROCEDE: 'neutral',
};

export function esEstadoReporte(x: unknown): x is EstadoReporte {
  return typeof x === 'string' && (ESTADOS_REPORTE as readonly string[]).includes(x);
}

/** ¿El reporte sigue pendiente para la oficina? */
export function reporteAbierto(estado: string): boolean {
  return estado === 'ABIERTO' || estado === 'EN_REVISION' || estado === 'PROGRAMADO';
}

/** ¿El cliente todavía puede agregar fotos? (igual que la policy del bucket). */
export function clienteAgregaFotos(estado: string): boolean {
  return estado === 'ABIERTO' || estado === 'EN_REVISION';
}

export const MAX_FOTOS_REPORTE = 8;
export const MAX_DESCRIPCION = 2000;
export const MIN_DESCRIPCION = 5;
export const MAX_UBICACION = 200;
export const MAX_RESPUESTA = 2000;
/** "Por vencer" = faltan estos días o menos. */
export const DIAS_POR_VENCER = 30;

export type EstadoGarantia = 'SIN_DATOS' | 'VIGENTE' | 'POR_VENCER' | 'VENCIDA';

export interface Garantia {
  estado: EstadoGarantia;
  /** Último día cubierto (medianoche de México) o null sin datos. */
  vence: number | null;
  /** Días que faltan (negativo si ya venció); null sin datos. */
  diasRestantes: number | null;
}

/**
 * Estado de la garantía de una obra: vence el mismo día `meses` después de la
 * entrega (31-ene + 1 mes → 28/29-feb). Ese día todavía está cubierto. Sin
 * fecha de entrega no se puede decir nada: SIN_DATOS.
 */
export function estadoGarantia(
  g: { entrega_fecha: number | null; meses: number } | null | undefined,
  hoy: number,
): Garantia {
  if (!g || g.entrega_fecha === null || g.entrega_fecha === undefined) {
    return { estado: 'SIN_DATOS', vence: null, diasRestantes: null };
  }
  const vence = sumarMesesMx(g.entrega_fecha, Math.max(0, Math.trunc(g.meses)));
  const diasRestantes = diasEntreMx(hoy, vence);
  const estado: EstadoGarantia =
    diasRestantes < 0 ? 'VENCIDA' : diasRestantes <= DIAS_POR_VENCER ? 'POR_VENCER' : 'VIGENTE';
  return { estado, vence, diasRestantes };
}

export const TEXTO_GARANTIA: Record<EstadoGarantia, string> = {
  SIN_DATOS: 'Sin fecha de entrega',
  VIGENTE: 'Vigente',
  POR_VENCER: 'Por vencer',
  VENCIDA: 'Vencida',
};

/** Mensaje de obra para los errores de la base (0043). */
export function mensajeErrorPostventa(msg: string): string {
  if (msg.includes('GARANTIA_MAX_FOTOS')) return `Un reporte lleva máximo ${MAX_FOTOS_REPORTE} fotos.`;
  if (msg.includes('garantia_no_procede_con_respuesta')) {
    return 'Para marcarlo "no procede" escribe la respuesta al cliente (por qué).';
  }
  if (msg.includes('garantia_programado_con_fecha')) return 'Para programar la visita, pon la fecha.';
  if (/row-level security/i.test(msg)) return 'No tienes permiso para hacer esto.';
  return msg;
}
