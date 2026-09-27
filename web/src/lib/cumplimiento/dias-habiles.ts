/**
 * DÍAS HÁBILES de México para los avisos de cumplimiento (SIROC, ICSOE/SISUB).
 *
 * Módulo PURO (sin Supabase, sin `server-only`): lo usan el tablero, la
 * tarjeta de la obra y las pruebas.
 *
 * QUÉ CUENTA COMO INHÁBIL (decisión F5-3 en docs/PROGRESO_ALCANCE.md)
 * ──────────────────────────────────────────────────────────────────
 * · Sábados y domingos. Los plazos del IMSS son fiscales: la Ley del Seguro
 *   Social (art. 9) remite al Código Fiscal de la Federación, y el CFF art. 12
 *   dice que en los plazos en días "no se contarán los sábados, los domingos"
 *   ni los días de descanso que enumera.
 * · Los días de descanso obligatorio de la Ley Federal del Trabajo, art. 74:
 *   1 de enero, primer lunes de febrero, tercer lunes de marzo, 1 de mayo,
 *   16 de septiembre, tercer lunes de noviembre, 25 de diciembre y el 1 de
 *   octubre de cada seis años por la transmisión del Poder Ejecutivo (reforma
 *   DOF 30-sep-2024: 2024, 2030, 2036…; antes era el 1 de diciembre).
 *
 * LO QUE NO SE CUENTA COMO INHÁBIL, A PROPÓSITO
 * · El 5 de mayo (el CFF sí lo incluye), los días que el IMSS o el Infonavit
 *   declaran inhábiles cada año por acuerdo (p. ej. jueves y viernes santos) y
 *   la jornada electoral. Todos ellos dan MÁS plazo, nunca menos: si la app
 *   los ignora, avisa un poco ANTES de lo estrictamente necesario, que es el
 *   lado seguro para una alarma. Lo contrario (contar un día inhábil que no lo
 *   es) avisaría tarde. La leyenda "confírmalo con tu contador" acompaña cada
 *   fecha en la interfaz.
 *
 * Todas las fechas son de CALENDARIO en México (`{y, m0, d}` o epoch ms de la
 * medianoche de México), igual que el resto de la app (`lib/data/tz.ts`).
 */

import { medianocheMx, partesTz, sumarDiasCalendario } from '@/lib/data/tz';

export interface FechaCal {
  y: number;
  /** Mes 0-based (enero = 0). */
  m0: number;
  d: number;
}

function clave(f: FechaCal): string {
  return `${f.y}-${String(f.m0 + 1).padStart(2, '0')}-${String(f.d).padStart(2, '0')}`;
}

/** Día de la semana de una fecha de calendario: 1 = lunes … 7 = domingo. */
export function diaSemana(f: FechaCal): number {
  const js = new Date(Date.UTC(f.y, f.m0, f.d)).getUTCDay(); // 0 = domingo
  return js === 0 ? 7 : js;
}

/** El n-ésimo lunes (1 = primero) de un mes. */
function enesimoLunes(y: number, m0: number, n: number): FechaCal {
  const primero = diaSemana({ y, m0, d: 1 });
  const primerLunes = 1 + ((8 - primero) % 7);
  return { y, m0, d: primerLunes + (n - 1) * 7 };
}

const cacheFestivos = new Map<number, Set<string>>();

/** Días de descanso obligatorio (LFT art. 74) de un año, como 'YYYY-MM-DD'. */
export function festivosMx(y: number): Set<string> {
  const guardado = cacheFestivos.get(y);
  if (guardado) return guardado;
  const dias: FechaCal[] = [
    { y, m0: 0, d: 1 },
    enesimoLunes(y, 1, 1), // 5 de febrero
    enesimoLunes(y, 2, 3), // 21 de marzo
    { y, m0: 4, d: 1 },
    { y, m0: 8, d: 16 },
    enesimoLunes(y, 10, 3), // 20 de noviembre
    { y, m0: 11, d: 25 },
  ];
  // Transmisión del Poder Ejecutivo Federal, cada seis años.
  if (y >= 2024 && (y - 2024) % 6 === 0) dias.push({ y, m0: 9, d: 1 });
  if (y < 2024 && (2018 - y) % 6 === 0) dias.push({ y, m0: 11, d: 1 });
  const set = new Set(dias.map(clave));
  cacheFestivos.set(y, set);
  return set;
}

export function esFestivo(f: FechaCal): boolean {
  return festivosMx(f.y).has(clave(f));
}

export function esDiaHabil(f: FechaCal): boolean {
  const ds = diaSemana(f);
  return ds <= 5 && !esFestivo(f);
}

export function fechaDeMs(ms: number): FechaCal {
  const p = partesTz(ms);
  return { y: p.year, m0: p.month, d: p.day };
}

export function msDeFecha(f: FechaCal): number {
  return medianocheMx(f.y, f.m0, f.d);
}

function siguiente(f: FechaCal, n = 1): FechaCal {
  return sumarDiasCalendario(f.y, f.m0, f.d, n);
}

function comparar(a: FechaCal, b: FechaCal): number {
  return a.y - b.y || a.m0 - b.m0 || a.d - b.d;
}

/**
 * El día hábil número `n` DESPUÉS de `desde` (sin contar `desde`). Es la regla
 * "dentro de los cinco días hábiles siguientes a la fecha de inicio": con una
 * obra que arranca el lunes 5, el plazo vence el lunes 12 (5 hábiles: mar–lun).
 */
export function sumarDiasHabiles(desde: FechaCal, n: number): FechaCal {
  let f = desde;
  let cuenta = 0;
  while (cuenta < n) {
    f = siguiente(f);
    if (esDiaHabil(f)) cuenta++;
  }
  return f;
}

/** Si `f` es inhábil, el siguiente día hábil; si no, `f` mismo. */
export function recorrerAHabil(f: FechaCal): FechaCal {
  let x = f;
  while (!esDiaHabil(x)) x = siguiente(x);
  return x;
}

/**
 * Cuántos días hábiles le quedan a un plazo que vence en `limite`, contando
 * desde `hoy`:
 *   · positivo → días hábiles de `hoy` a `limite`, AMBOS incluidos si son
 *                hábiles ("hoy es el último día" = 1);
 *   · 0        → hoy es inhábil y no queda ningún hábil antes del límite
 *                (no pasa con límites hábiles; se deja por completitud);
 *   · negativo → ya venció: −(días hábiles transcurridos después del límite
 *                hasta hoy, incluido hoy si es hábil). Mañana hábil = −1.
 */
export function diasHabilesRestantes(hoy: FechaCal, limite: FechaCal): number {
  if (comparar(hoy, limite) <= 0) {
    let n = 0;
    for (let f = hoy; comparar(f, limite) <= 0; f = siguiente(f)) if (esDiaHabil(f)) n++;
    return n;
  }
  let n = 0;
  for (let f = siguiente(limite); comparar(f, hoy) <= 0; f = siguiente(f)) if (esDiaHabil(f)) n++;
  return -Math.max(n, 1);
}

/** Días de CALENDARIO de `hoy` a `limite` (negativo si ya pasó). */
export function diasNaturalesEntre(hoy: FechaCal, limite: FechaCal): number {
  return Math.round((Date.UTC(limite.y, limite.m0, limite.d) - Date.UTC(hoy.y, hoy.m0, hoy.d)) / 86_400_000);
}
