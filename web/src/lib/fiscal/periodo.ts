/**
 * Periodo del paquete para el contador: un mes calendario en hora de México.
 * El contador trabaja por mes (declaraciones mensuales), así que es la unidad.
 */

import { medianocheMx, partesTz } from '@/lib/data/tz';

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export interface Periodo {
  /** 'AAAA-MM' */
  clave: string;
  desde: number;
  /** Exclusivo: la medianoche del día 1 del mes siguiente. */
  hasta: number;
  /** "septiembre de 2026" */
  nombre: string;
}

/** Periodo de un 'AAAA-MM'. Si no se entiende, el mes de `hoyMs`. */
export function periodoDeMes(clave: string | null | undefined, hoyMs: number): Periodo {
  const m = /^(\d{4})-(\d{2})$/.exec(clave ?? '');
  let anio: number;
  let mes0: number;
  if (m && +m[2] >= 1 && +m[2] <= 12 && +m[1] >= 2000 && +m[1] <= 2100) {
    anio = +m[1];
    mes0 = +m[2] - 1;
  } else {
    const p = partesTz(hoyMs);
    anio = p.year;
    mes0 = p.month;
  }
  const sigAnio = mes0 === 11 ? anio + 1 : anio;
  const sigMes0 = (mes0 + 1) % 12;
  return {
    clave: `${anio}-${String(mes0 + 1).padStart(2, '0')}`,
    desde: medianocheMx(anio, mes0, 1),
    hasta: medianocheMx(sigAnio, sigMes0, 1),
    nombre: `${MESES[mes0]} de ${anio}`,
  };
}
