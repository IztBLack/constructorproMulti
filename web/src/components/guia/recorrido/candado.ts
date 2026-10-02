/**
 * El CANDADO del recorrido guiado: mientras corre, la app no puede escribir.
 *
 * El recorrido deja abrir formularios reales y escribir datos de ejemplo. La
 * capa oscura ya impide tocar "Guardar", pero eso no basta: Enter dentro de un
 * campo envía el formulario, y hay componentes que escriben directo a Supabase.
 * Por eso, además, aquí se cortan en el navegador:
 *
 *  1. Todo envío de formulario (`submit` en fase de captura, antes que React).
 *  2. Toda petición que no sea GET/HEAD: Server Actions, escrituras a Supabase
 *     (tablas, archivos, funciones, datos de la cuenta) y POST a rutas propias.
 *     Solo pasan refrescar y cerrar la sesión (`/auth/v1/token`, `/logout`),
 *     para no tumbarla a medio recorrido.
 *
 * supabase-js y el cliente de Server Actions llaman al `fetch` global en el
 * momento de cada petición (no lo guardan al crearse), así que basta con
 * envolverlo mientras el candado está puesto.
 *
 * El rechazo IMITA un corte de red (`TypeError: Failed to fetch`) a propósito:
 * la cola sin conexión del pase de lista (`lib/offline/cola-asistencia.ts`)
 * clasifica eso como "transitorio" y reintenta después. Con cualquier otro
 * error lo contaría como permanente y, a la tercera, dejaría BLOQUEADAS las
 * asistencias reales que el usuario tenía pendientes de subir.
 *
 * Lo que no pasa por `fetch` (la cola en IndexedDB) no se corta aquí: por eso
 * el recorrido solo EXPLICA la asistencia, nunca deja marcarla.
 */

/** Única escritura permitida: mantener o cerrar la sesión. */
const PERMITIDAS = ['/auth/v1/token', '/auth/v1/logout'];

/** Evento que se dispara cada vez que el candado frena algo (para avisar en pantalla). */
export const EVENTO_BLOQUEO = 'cp-guia-bloqueo';

/** ¿Esta petición escribiría? Exportada para probarla. */
export function esEscritura(input: RequestInfo | URL, init?: RequestInit): boolean {
  const req = typeof Request !== 'undefined' && input instanceof Request ? input : null;
  const metodo = (init?.method ?? req?.method ?? 'GET').toUpperCase();
  if (metodo === 'GET' || metodo === 'HEAD' || metodo === 'OPTIONS') return false;
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  return !PERMITIDAS.some((r) => url.includes(r));
}

let puesto = false;
let fetchOriginal: typeof window.fetch | null = null;
let envoltura: typeof window.fetch | null = null;

function alEnviar(e: Event) {
  e.preventDefault();
  e.stopImmediatePropagation();
  window.dispatchEvent(new Event(EVENTO_BLOQUEO));
}

export function candadoPuesto(): boolean {
  return puesto;
}

/** Pone el candado. Idempotente; se llama de forma SÍNCRONA al iniciar o retomar. */
export function ponerCandado() {
  if (puesto || typeof window === 'undefined') return;
  puesto = true;
  const original = window.fetch;
  fetchOriginal = original;
  envoltura = (input: RequestInfo | URL, init?: RequestInit) => {
    if (esEscritura(input, init)) {
      window.dispatchEvent(new Event(EVENTO_BLOQUEO));
      return Promise.reject(new TypeError('Failed to fetch'));
    }
    return original(input, init);
  };
  window.fetch = envoltura;
  window.addEventListener('submit', alEnviar, true);
}

export function quitarCandado() {
  if (!puesto || typeof window === 'undefined') return;
  puesto = false;
  // Solo se restaura si nadie más envolvió `fetch` mientras tanto (Sentry, Next):
  // pisar su envoltura rompería su instrumentación.
  if (fetchOriginal && window.fetch === envoltura) window.fetch = fetchOriginal;
  fetchOriginal = null;
  envoltura = null;
  window.removeEventListener('submit', alEnviar, true);
}

/**
 * Cierra los formularios de la app que el recorrido abrió con datos de ejemplo.
 * Se llama ANTES de quitar el candado: si no, quedarían abiertos, con el
 * ejemplo escrito, a un "Guardar" de distancia.
 */
export function cerrarDialogos() {
  if (typeof document === 'undefined') return;
  for (const d of document.querySelectorAll<HTMLElement>('[role="dialog"]')) {
    if (d.getClientRects().length === 0 || d.closest('[data-recorrido]')) continue;
    d.querySelector<HTMLButtonElement>('button[aria-label="Cerrar"]')?.click();
  }
}
