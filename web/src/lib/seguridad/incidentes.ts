/**
 * Incidentes de seguridad — reglas PURAS (sin Supabase).
 *
 * La app NO avisa al IMSS. El aviso del accidente de trabajo lo da el patrón
 * (Ley del Seguro Social, art. 51) con el formato ST-7, "Aviso de atención
 * médica inicial y calificación de probable accidente de trabajo", trámite
 * IMSS-03-008, que se hace en el servicio de Salud en el Trabajo de la Unidad de
 * Medicina Familiar del trabajador; el patrón firma el reverso del formato. Aquí
 * solo se recuerda y se guarda la prueba (misma regla que F1b/F5).
 *
 * Datos de salud (D8): las etiquetas de lesión/parte/atención son listas
 * cerradas a propósito. Solo el admin las ve (RLS de `incidente_salud`).
 */

import { diasEntreMx } from '@/lib/fechas/dias-mx';

/** Ficha oficial del trámite (verificada 2026-09-27). */
export const URL_TRAMITE_ST7 = 'https://www.imss.gob.mx/tramites/imss03008';

export const TIPOS_INCIDENTE = ['ACCIDENTE', 'CASI_ACCIDENTE', 'CONDICION_INSEGURA'] as const;
export type TipoIncidente = (typeof TIPOS_INCIDENTE)[number];

export const ETIQUETA_TIPO_INCIDENTE: Record<TipoIncidente, string> = {
  ACCIDENTE: 'Accidente (alguien se lastimó)',
  CASI_ACCIDENTE: 'Casi accidente (nadie se lastimó)',
  CONDICION_INSEGURA: 'Condición insegura',
};

export const ETIQUETA_CORTA_TIPO: Record<TipoIncidente, string> = {
  ACCIDENTE: 'Accidente',
  CASI_ACCIDENTE: 'Casi accidente',
  CONDICION_INSEGURA: 'Condición insegura',
};

export function esTipoIncidente(x: unknown): x is TipoIncidente {
  return typeof x === 'string' && (TIPOS_INCIDENTE as readonly string[]).includes(x);
}

// ── Datos de salud (solo admin) ─────────────────────────────────────────────

export const TIPOS_LESION = [
  'GOLPE', 'HERIDA', 'TORCEDURA', 'FRACTURA', 'QUEMADURA', 'OJOS', 'ELECTRICA', 'INTOXICACION', 'OTRA',
] as const;
export type TipoLesion = (typeof TIPOS_LESION)[number];
export const ETIQUETA_LESION: Record<TipoLesion, string> = {
  GOLPE: 'Golpe',
  HERIDA: 'Herida o cortada',
  TORCEDURA: 'Torcedura',
  FRACTURA: 'Fractura',
  QUEMADURA: 'Quemadura',
  OJOS: 'Algo en los ojos',
  ELECTRICA: 'Descarga eléctrica',
  INTOXICACION: 'Intoxicación',
  OTRA: 'Otra',
};

export const PARTES_CUERPO = [
  'CABEZA', 'OJOS_CARA', 'CUELLO', 'ESPALDA', 'TRONCO', 'BRAZO_MANO', 'PIERNA_PIE', 'VARIAS', 'OTRA',
] as const;
export type ParteCuerpo = (typeof PARTES_CUERPO)[number];
export const ETIQUETA_PARTE: Record<ParteCuerpo, string> = {
  CABEZA: 'Cabeza',
  OJOS_CARA: 'Ojos o cara',
  CUELLO: 'Cuello',
  ESPALDA: 'Espalda',
  TRONCO: 'Pecho o abdomen',
  BRAZO_MANO: 'Brazo o mano',
  PIERNA_PIE: 'Pierna o pie',
  VARIAS: 'Varias partes',
  OTRA: 'Otra',
};

export const ATENCIONES = ['NINGUNA', 'PRIMEROS_AUXILIOS', 'IMSS', 'PARTICULAR', 'HOSPITAL'] as const;
export type Atencion = (typeof ATENCIONES)[number];
export const ETIQUETA_ATENCION: Record<Atencion, string> = {
  NINGUNA: 'No necesitó',
  PRIMEROS_AUXILIOS: 'Primeros auxilios en la obra',
  IMSS: 'Clínica del IMSS',
  PARTICULAR: 'Médico particular',
  HOSPITAL: 'Hospital',
};

export const MAX_NOTA_SALUD = 280;

export function esTipoLesion(x: unknown): x is TipoLesion {
  return typeof x === 'string' && (TIPOS_LESION as readonly string[]).includes(x);
}
export function esParteCuerpo(x: unknown): x is ParteCuerpo {
  return typeof x === 'string' && (PARTES_CUERPO as readonly string[]).includes(x);
}
export function esAtencion(x: unknown): x is Atencion {
  return typeof x === 'string' && (ATENCIONES as readonly string[]).includes(x);
}

// ── Cuentas ─────────────────────────────────────────────────────────────────

export interface IncidenteParaCuenta {
  tipo: string;
  fecha: number;
}

export interface DiasSinAccidente {
  dias: number;
  /** Desde dónde se cuenta: el último accidente o, si no hubo, el inicio de la obra. */
  desde: 'ULTIMO_ACCIDENTE' | 'INICIO_OBRA';
  /** Fecha del último accidente (null si no hubo). */
  ultimo: number | null;
}

/**
 * Días de calendario (hora de México) desde el último ACCIDENTE de la obra; si
 * nunca hubo, desde que empezó la obra. Los casi accidentes y las condiciones
 * inseguras no reinician la cuenta (nadie se lastimó). Fechas futuras se
 * ignoran (un error de captura no debe dar un número negativo).
 */
export function diasSinAccidente(
  incidentes: readonly IncidenteParaCuenta[],
  inicioObra: number,
  hoy: number,
): DiasSinAccidente {
  let ultimo: number | null = null;
  for (const i of incidentes) {
    if (i.tipo !== 'ACCIDENTE') continue;
    if (diasEntreMx(i.fecha, hoy) < 0) continue;
    if (ultimo === null || i.fecha > ultimo) ultimo = i.fecha;
  }
  if (ultimo !== null) {
    return { dias: diasEntreMx(ultimo, hoy), desde: 'ULTIMO_ACCIDENTE', ultimo };
  }
  return { dias: Math.max(0, diasEntreMx(inicioObra, hoy)), desde: 'INICIO_OBRA', ultimo: null };
}

/** ¿Falta registrar el aviso al IMSS? Solo aplica a accidentes. */
export function avisoPendiente(i: { tipo: string; aviso_imss_hecho: boolean }): boolean {
  return i.tipo === 'ACCIDENTE' && !i.aviso_imss_hecho;
}
