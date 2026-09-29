import { fechaInputAMs, hoyMxMs, msAFechaInput, partesTz, medianocheMx, sumarDiasCalendario } from '@/lib/data/tz';

/**
 * Periodo de la bitácora a partir de `?desde=YYYY-MM-DD&hasta=YYYY-MM-DD`
 * (pantalla y PDF usan el mismo). Sin parámetros: los últimos 30 días. Si
 * vienen al revés se acomodan; si vienen mal, se ignoran.
 */
export interface PeriodoBitacora {
  desde: number;
  hasta: number;
  desdeInput: string;
  hastaInput: string;
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
export const DIAS_POR_DEFECTO = 30;

export function periodoBitacora(
  params: { desde?: string | string[]; hasta?: string | string[] },
  hoy: number = hoyMxMs(),
): PeriodoBitacora {
  const leer = (v: string | string[] | undefined) => {
    const s = Array.isArray(v) ? v[0] : v;
    return s && FECHA.test(s) ? fechaInputAMs(s) : null;
  };
  let hasta = leer(params.hasta) ?? hoy;
  let desde = leer(params.desde);
  if (desde === null) {
    const p = partesTz(hasta);
    const c = sumarDiasCalendario(p.year, p.month, p.day, -(DIAS_POR_DEFECTO - 1));
    desde = medianocheMx(c.y, c.m0, c.d);
  }
  if (desde > hasta) [desde, hasta] = [hasta, desde];
  return { desde, hasta, desdeInput: msAFechaInput(desde), hastaInput: msAFechaInput(hasta) };
}

/**
 * Reloj de la petición para los Server Components. Se pinta una vez por
 * petición (no se re-renderiza en el navegador) y se pasa como prop a los
 * componentes de cliente, para que el "se cierra en…" no cambie al hidratar.
 */
export function relojPeticion(): number {
  return Date.now();
}
