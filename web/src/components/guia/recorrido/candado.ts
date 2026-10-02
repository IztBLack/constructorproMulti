/**
 * El CANDADO del recorrido guiado: mientras corre, la app no puede escribir.
 *
 * El recorrido deja abrir formularios reales y escribir datos de ejemplo. La
 * capa oscura ya impide tocar "Guardar", pero eso no basta: Enter dentro de un
 * campo envía el formulario, y hay componentes que escriben directo a Supabase.
 * Por eso, además, aquí se cortan en el navegador:
 *
 *  1. Todo envío de formulario (`submit` en fase de captura, antes que React).
 *  2. Toda Server Action (`fetch` con el encabezado `next-action`).
 *  3. Toda escritura a Supabase: métodos que no son GET/HEAD contra
 *     `/rest/v1/`, `/storage/v1/` y `/functions/v1/`. La sesión (`/auth/v1/`)
 *     se deja pasar para no cerrarla a medio recorrido.
 *
 * supabase-js y el cliente de Server Actions llaman al `fetch` global en el
 * momento de cada petición (no lo guardan al crearse), así que basta con
 * envolverlo mientras el candado está puesto.
 *
 * Lo que NO cubre: la cola sin conexión del pase de lista (IndexedDB). Por eso
 * el recorrido solo EXPLICA la asistencia, nunca deja marcarla (ver las reglas
 * en `lib/guia/recorrido/tipos.ts`).
 */

const RUTAS_SUPABASE = ['/rest/v1/', '/storage/v1/', '/functions/v1/'];

/** Evento que se dispara cada vez que el candado frena algo (para avisar en pantalla). */
export const EVENTO_BLOQUEO = 'cp-guia-bloqueo';

function avisar() {
  window.dispatchEvent(new Event(EVENTO_BLOQUEO));
}

/** ¿Esta petición escribiría? Exportada para probarla. */
export function esEscritura(input: RequestInfo | URL, init?: RequestInit): boolean {
  const req = typeof Request !== 'undefined' && input instanceof Request ? input : null;
  const metodo = (init?.method ?? req?.method ?? 'GET').toUpperCase();
  if (metodo === 'GET' || metodo === 'HEAD') return false;
  const headers = new Headers(init?.headers ?? req?.headers);
  if (headers.has('next-action')) return true;
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  return RUTAS_SUPABASE.some((r) => url.includes(r));
}

let puesto = false;
let fetchOriginal: typeof window.fetch | null = null;

function alEnviar(e: Event) {
  e.preventDefault();
  e.stopImmediatePropagation();
  avisar();
}

/** Pone el candado. Idempotente. */
export function ponerCandado() {
  if (puesto) return;
  puesto = true;
  const original = window.fetch;
  fetchOriginal = original;
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (esEscritura(input, init)) {
      avisar();
      return Promise.reject(new Error('Recorrido guiado: la app no guarda nada mientras dura el recorrido.'));
    }
    return original(input, init);
  };
  window.addEventListener('submit', alEnviar, true);
}

export function quitarCandado() {
  if (!puesto) return;
  puesto = false;
  if (fetchOriginal) window.fetch = fetchOriginal;
  fetchOriginal = null;
  window.removeEventListener('submit', alEnviar, true);
}
