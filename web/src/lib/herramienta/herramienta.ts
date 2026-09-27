/**
 * Herramienta y maquinaria (módulo `herramienta`, 0043) — reglas PURAS.
 *
 * La base pone lo que no se negocia (un préstamo abierto a la vez, historial
 * que no se reescribe, no se presta lo dado de baja); aquí van las etiquetas y
 * el SEMÁFORO de lo que no ha regresado.
 */

import { diasEntreMx } from '@/lib/fechas/dias-mx';

export const TIPOS_HERRAMIENTA = [
  'HERRAMIENTA', 'ELECTRICA', 'MAQUINARIA', 'ANDAMIO_CIMBRA', 'MEDICION', 'SEGURIDAD', 'VEHICULO', 'OTRO',
] as const;
export type TipoHerramienta = (typeof TIPOS_HERRAMIENTA)[number];
export const ETIQUETA_TIPO_HERRAMIENTA: Record<TipoHerramienta, string> = {
  HERRAMIENTA: 'Herramienta de mano',
  ELECTRICA: 'Herramienta eléctrica',
  MAQUINARIA: 'Maquinaria',
  ANDAMIO_CIMBRA: 'Andamio o cimbra',
  MEDICION: 'Medición (nivel, estación)',
  SEGURIDAD: 'Equipo de seguridad',
  VEHICULO: 'Vehículo',
  OTRO: 'Otro',
};

export const ESTADOS_HERRAMIENTA = ['BUENO', 'REPARACION', 'BAJA'] as const;
export type EstadoHerramienta = (typeof ESTADOS_HERRAMIENTA)[number];
export const ETIQUETA_ESTADO_HERRAMIENTA: Record<EstadoHerramienta, string> = {
  BUENO: 'Buena',
  REPARACION: 'En reparación',
  BAJA: 'De baja',
};

export function esTipoHerramienta(x: unknown): x is TipoHerramienta {
  return typeof x === 'string' && (TIPOS_HERRAMIENTA as readonly string[]).includes(x);
}
export function esEstadoHerramienta(x: unknown): x is EstadoHerramienta {
  return typeof x === 'string' && (ESTADOS_HERRAMIENTA as readonly string[]).includes(x);
}

/** Sin fecha de regreso, después de estos días se pide confirmar dónde está. */
export const DIAS_SIN_FECHA_AVISO = 30;

export type Semaforo = 'DEVUELTA' | 'VERDE' | 'AMARILLO' | 'ROJO';

export interface EstadoPrestamo {
  semaforo: Semaforo;
  /** Días que lleva fuera (hasta hoy o hasta que regresó). */
  diasFuera: number;
  /** Días de retraso (> 0 solo en ROJO). */
  diasVencida: number;
  texto: string;
}

/**
 * Semáforo de un préstamo:
 *   · devuelta → DEVUELTA;
 *   · con fecha de regreso: ROJO si ya pasó, AMARILLO si vence hoy o mañana,
 *     VERDE si falta más;
 *   · sin fecha: AMARILLO si lleva más de 30 días fuera (nadie ha confirmado
 *     dónde está), VERDE si no.
 * Por día de calendario en México.
 */
export function estadoPrestamo(
  p: { desde: number; hasta: number | null; devolver_antes: number | null },
  hoy: number,
): EstadoPrestamo {
  if (p.hasta !== null) {
    const diasFuera = Math.max(0, diasEntreMx(p.desde, p.hasta));
    return { semaforo: 'DEVUELTA', diasFuera, diasVencida: 0, texto: 'Ya regresó' };
  }
  const diasFuera = Math.max(0, diasEntreMx(p.desde, hoy));
  if (p.devolver_antes !== null) {
    const faltan = diasEntreMx(hoy, p.devolver_antes);
    if (faltan < 0) {
      const d = -faltan;
      return { semaforo: 'ROJO', diasFuera, diasVencida: d, texto: `Debió regresar hace ${d} ${d === 1 ? 'día' : 'días'}` };
    }
    if (faltan <= 1) {
      return { semaforo: 'AMARILLO', diasFuera, diasVencida: 0, texto: faltan === 0 ? 'Regresa hoy' : 'Regresa mañana' };
    }
    return { semaforo: 'VERDE', diasFuera, diasVencida: 0, texto: `Regresa en ${faltan} días` };
  }
  if (diasFuera > DIAS_SIN_FECHA_AVISO) {
    return {
      semaforo: 'AMARILLO',
      diasFuera,
      diasVencida: 0,
      texto: `Lleva ${diasFuera} días fuera: confirma dónde está`,
    };
  }
  return {
    semaforo: 'VERDE',
    diasFuera,
    diasVencida: 0,
    texto: diasFuera === 0 ? 'Salió hoy' : `Lleva ${diasFuera} ${diasFuera === 1 ? 'día' : 'días'} fuera`,
  };
}

const PESO: Record<Semaforo, number> = { ROJO: 0, AMARILLO: 1, VERDE: 2, DEVUELTA: 3 };

/** Para ordenar: lo vencido primero. */
export function pesoSemaforo(s: Semaforo): number {
  return PESO[s];
}

/** Mensaje de obra para los errores de la base (triggers de 0043). */
export function mensajeErrorHerramienta(msg: string): string {
  if (msg.includes('HERRAMIENTA_BAJA')) return 'Esta herramienta está dada de baja: no se puede prestar.';
  if (msg.includes('HERRAMIENTA_SIN_DESTINO')) return 'Di a qué obra va o quién se la lleva.';
  if (msg.includes('HERRAMIENTA_HISTORIAL')) return 'Un préstamo ya devuelto no se cambia.';
  if (msg.includes('uq_herramienta_asignacion_abierta')) {
    return 'Esta herramienta ya está prestada. Regístrala como devuelta antes de prestarla otra vez.';
  }
  if (msg.includes('uq_herramienta_clave')) return 'Ya hay otra herramienta con ese número de inventario.';
  if (/row-level security/i.test(msg)) return 'No tienes permiso para hacer esto.';
  return msg;
}
