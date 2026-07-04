/// Helpers de zona horaria fija (America/Mexico_City), independientes de la zona
/// del servidor. En producción (Vercel) el server corre en UTC; sin esto, la
/// "medianoche local" para agrupar asistencia se calcularía en UTC y se
/// desfasaría respecto a lo que guarda la app móvil (que usa hora de México).
///
/// Nota: Vercel reserva el nombre de variable `TZ`, así que la zona se fija aquí
/// en código en lugar de por variable de entorno.

export const TZ_MX = 'America/Mexico_City';

const DIA_MS = 86_400_000;

const _fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ_MX,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  weekday: 'short',
});

const _wd: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export interface PartesTz {
  year: number;
  month: number; // 0-based
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 1=lunes … 7=domingo
}

/** Partes de fecha/hora de un instante (epoch ms) interpretado en zona México. */
export function partesTz(ms: number): PartesTz {
  const m: Record<string, string> = {};
  for (const p of _fmt.formatToParts(new Date(ms))) m[p.type] = p.value;
  return {
    year: +m.year,
    month: +m.month - 1,
    day: +m.day,
    hour: m.hour === '24' ? 0 : +m.hour,
    minute: +m.minute,
    second: +m.second,
    weekday: _wd[m.weekday] ?? 1,
  };
}

/**
 * Epoch ms de la medianoche (00:00:00.000) de la fecha calendario `y-m0-d`
 * en zona México, sin importar la zona del servidor. Robusto ante DST
 * (aunque México ya no lo usa) mediante corrección de offset en dos pasos.
 */
export function medianocheMx(y: number, m0: number, d: number): number {
  let ts = Date.UTC(y, m0, d, 0, 0, 0);
  for (let i = 0; i < 2; i++) {
    const p = partesTz(ts);
    const wall = Date.UTC(p.year, p.month, p.day, p.hour, p.minute, p.second);
    const offset = wall - ts; // offset de la zona en ese instante
    ts = Date.UTC(y, m0, d, 0, 0, 0) - offset;
  }
  return ts;
}

const _fechaFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ_MX,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** epoch ms → 'YYYY-MM-DD' en zona México (para `defaultValue` de inputs date). */
export function msAFechaInput(ms: number): string {
  return _fechaFmt.format(new Date(ms)); // en-CA da YYYY-MM-DD
}

/** 'YYYY-MM-DD' (de un input date) → epoch ms de esa medianoche en México. */
export function fechaInputAMs(s: string | null | undefined): number {
  if (!s) return Date.now();
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return Date.now();
  return medianocheMx(y, m - 1, d);
}

/** Suma `n` días de calendario a la fecha calendario dada; devuelve {y,m0,d}. */
export function sumarDiasCalendario(y: number, m0: number, d: number, n: number) {
  const t = new Date(Date.UTC(y, m0, d) + n * DIA_MS);
  return { y: t.getUTCFullYear(), m0: t.getUTCMonth(), d: t.getUTCDate() };
}

export { DIA_MS };
