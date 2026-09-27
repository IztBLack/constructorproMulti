/**
 * Cuentas de DÍAS DE CALENDARIO en hora de México (F7: días sin accidente,
 * semáforo de herramienta, vencimiento de garantía).
 *
 * Se cuenta por fecha de calendario y no restando milisegundos: un accidente
 * de ayer a las 23:50 es "ayer" (1 día) aunque hayan pasado 10 minutos. Pura:
 * no depende de la zona del servidor (Vercel corre en UTC).
 */

import { DIA_MS, medianocheMx, partesTz } from '@/lib/data/tz';

/** Número de día absoluto (días desde 1970-01-01) de la fecha de México de `ms`. */
export function diaMx(ms: number): number {
  const p = partesTz(ms);
  return Math.round(Date.UTC(p.year, p.month, p.day) / DIA_MS);
}

/** Días de calendario de `desde` a `hasta` (negativo si `hasta` es antes). */
export function diasEntreMx(desde: number, hasta: number): number {
  return diaMx(hasta) - diaMx(desde);
}

/**
 * Medianoche de México del día que resulta de sumar `meses` a la fecha de
 * `ms`. Si el día no existe en el mes destino (31 de enero + 1 mes), se usa el
 * último día de ese mes, que es como se lee un contrato ("vence el 28 de feb").
 */
export function sumarMesesMx(ms: number, meses: number): number {
  const p = partesTz(ms);
  const total = p.year * 12 + p.month + meses;
  const y = Math.floor(total / 12);
  const m0 = total - y * 12;
  const ultimo = new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
  return medianocheMx(y, m0, Math.min(p.day, ultimo));
}
