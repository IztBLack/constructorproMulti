'use client';

import { useCallback, useSyncExternalStore } from 'react';
import {
  CLASE_OSCURO,
  CLASE_TRANSICION,
  CLAVE_TEMA,
  esTemaValido,
  type Tema,
  type TemaEfectivo,
} from './tema';

const CONSULTA_SISTEMA = '(prefers-color-scheme: dark)';
const MS_TRANSICION = 200;

/*
 * El tema NO es estado de React: vive en `localStorage`, en la preferencia del
 * sistema operativo y en la clase del <html> — tres cosas de fuera. Por eso está
 * modelado como un "store externo" y se lee con `useSyncExternalStore`.
 *
 * El camino obvio (leer localStorage en un `useEffect` y guardarlo con
 * `setState`) provoca un render en cascada en cada montaje y lo rechaza la regla
 * `react-hooks/set-state-in-effect`. Con este modelo React se limita a
 * suscribirse y leer, que es justo para lo que existe esta API.
 */

const suscriptores = new Set<() => void>();

/** Caché del valor leído. `null` = todavía no se ha consultado localStorage. */
let temaEnMemoria: Tema | null = null;

function leerDeAlmacen(): Tema {
  try {
    const v = localStorage.getItem(CLAVE_TEMA);
    return esTemaValido(v) ? v : 'auto';
  } catch {
    // localStorage LANZA (no devuelve null) con cookies bloqueadas o en modo
    // privado de algunos navegadores. Ver la nota en tema.ts.
    return 'auto';
  }
}

function avisar() {
  for (const s of suscriptores) s();
}

function sistemaPrefiereOscuro(): boolean {
  return window.matchMedia(CONSULTA_SISTEMA).matches;
}

function resolver(tema: Tema, sistemaOscuro: boolean): TemaEfectivo {
  if (tema === 'auto') return sistemaOscuro ? 'oscuro' : 'claro';
  return tema;
}

/** Pinta el tema en el <html>. `animar` solo en cambios provocados por alguien. */
function aplicarAlDocumento(efectivo: TemaEfectivo, animar: boolean) {
  const html = document.documentElement;

  if (animar) {
    html.classList.add(CLASE_TRANSICION);
    window.setTimeout(() => html.classList.remove(CLASE_TRANSICION), MS_TRANSICION);
  }

  html.classList.toggle(CLASE_OSCURO, efectivo === 'oscuro');
}

// ── Store 1: la elección del usuario ──────────────────────────────────────

function suscribirTema(alCambiar: () => void): () => void {
  suscriptores.add(alCambiar);

  // Otra pestaña cambió el tema. `storage` solo dispara en las OTRAS pestañas,
  // nunca en la que escribió, así que no hay bucle.
  const alEscribirOtraPestana = (e: StorageEvent) => {
    if (e.key !== CLAVE_TEMA) return;
    temaEnMemoria = esTemaValido(e.newValue) ? e.newValue : 'auto';
    aplicarAlDocumento(resolver(temaEnMemoria, sistemaPrefiereOscuro()), true);
    avisar();
  };

  window.addEventListener('storage', alEscribirOtraPestana);
  return () => {
    suscriptores.delete(alCambiar);
    window.removeEventListener('storage', alEscribirOtraPestana);
  };
}

function leerTema(): Tema {
  if (temaEnMemoria === null) temaEnMemoria = leerDeAlmacen();
  return temaEnMemoria;
}

/** En el servidor no hay dispositivo del cual leer preferencia. */
function leerTemaEnServidor(): Tema {
  return 'auto';
}

// ── Store 2: la preferencia del sistema operativo ─────────────────────────

function suscribirSistema(alCambiar: () => void): () => void {
  const mq = window.matchMedia(CONSULTA_SISTEMA);

  // El sistema cambió (ej. Windows entra en modo oscuro de noche). Solo repinta
  // si la elección es `auto`: de eso se trata "automático", de reaccionar en
  // vivo y no solo al cargar la página.
  const alCambiarSistema = (e: MediaQueryListEvent) => {
    if (leerTema() === 'auto') {
      aplicarAlDocumento(e.matches ? 'oscuro' : 'claro', true);
    }
    alCambiar();
  };

  mq.addEventListener('change', alCambiarSistema);
  return () => mq.removeEventListener('change', alCambiarSistema);
}

function leerSistema(): boolean {
  return sistemaPrefiereOscuro();
}

function leerSistemaEnServidor(): boolean {
  return false;
}

// ── Hook ──────────────────────────────────────────────────────────────────

/**
 * Estado del tema con sus tres opciones.
 *
 * `tema` es lo que el usuario ELIGIÓ (puede ser `auto`); `efectivo` es lo que se
 * está PINTANDO. La distinción importa: la pantalla de Preferencias tiene que
 * mostrar "Automático" seleccionado aunque en ese momento se vea oscuro.
 *
 * Durante el render del servidor y la hidratación devuelve `auto`/claro, porque
 * ahí no existe ni `localStorage` ni sistema operativo; `useSyncExternalStore`
 * se encarga de volver a renderizar con el valor real en cuanto hidrata, sin
 * discrepancias. Eso NO produce parpadeo visual: el script de `tema.ts` ya pintó
 * el tema correcto antes de que React existiera. Por eso ningún componente debe
 * decidir su MARCADO según `efectivo` — para eso está la variante CSS `dark:`,
 * que no depende de JavaScript.
 *
 * Se llama `useTema` y no `usarTema` pese a que el resto del código está en
 * español: `react-hooks/rules-of-hooks` identifica los hooks por el prefijo
 * `use` y rechaza cualquier otro nombre. Mismo criterio que `useToast` en
 * `components/ui/Toast.tsx`.
 */
export function useTema() {
  const tema = useSyncExternalStore(suscribirTema, leerTema, leerTemaEnServidor);
  const sistemaOscuro = useSyncExternalStore(
    suscribirSistema,
    leerSistema,
    leerSistemaEnServidor,
  );

  const efectivo = resolver(tema, sistemaOscuro);

  const cambiarTema = useCallback((nuevo: Tema) => {
    temaEnMemoria = nuevo;
    aplicarAlDocumento(resolver(nuevo, sistemaPrefiereOscuro()), true);

    try {
      localStorage.setItem(CLAVE_TEMA, nuevo);
    } catch {
      // Sin persistencia (modo privado): el tema aplica en esta sesión y ya.
      // Preferible a que el botón no haga nada.
    }

    avisar();
  }, []);

  /**
   * Lo que hace el botón de la barra: alterna claro ↔ oscuro.
   *
   * Alternar SIEMPRE deja una elección explícita, o sea que saca de `auto`. Es a
   * propósito: si estás en automático-oscuro y pides claro, lo que quieres es
   * claro — no que el sistema te lo revierta en su siguiente cambio. Para volver
   * a automático está la pantalla de Preferencias.
   *
   * El tema actual se lee del store EN EL MOMENTO DEL CLIC, no de la variable
   * `efectivo` de este render. Con `efectivo` había un bug real: dos pulsaciones
   * seguidas, antes de que React alcanzara a re-renderizar, leían ambas el mismo
   * valor caduco y la segunda no revertía nada — el botón se quedaba trabado. El
   * store sí está actualizado de forma síncrona.
   */
  const alternar = useCallback(() => {
    const actual = resolver(leerTema(), sistemaPrefiereOscuro());
    cambiarTema(actual === 'oscuro' ? 'claro' : 'oscuro');
  }, [cambiarTema]);

  return { tema, efectivo, cambiarTema, alternar };
}
