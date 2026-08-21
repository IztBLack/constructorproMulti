'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui';

const CLAVE_DESCARTE = 'constructorpro:aviso-instalar-descartado';

/**
 * Evento `beforeinstallprompt` (Chromium en Android/escritorio). No existe en
 * WebKit, así que lo tipamos a mano en vez de depender de lib.dom.
 */
type EventoInstalacion = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

type Escenario =
  | 'oculto' // ya instalada, ya descartado, o nada que ofrecer
  | 'ios-safari' // puede instalar: Compartir → Añadir a inicio
  | 'ios-otro-navegador' // Chrome/Edge/Firefox en iOS: no pueden instalar
  | 'prompt-nativo'; // Android/escritorio con beforeinstallprompt

// ---------------------------------------------------------------------------
// Detección de plataforma
// ---------------------------------------------------------------------------

/** iPadOS 13+ se anuncia como Mac; se distingue por soportar multitáctil. */
function esIOS(): boolean {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

/**
 * En iOS *todos* los navegadores usan WebKit por obligación, pero solo Safari
 * ofrece "Añadir a inicio". Chrome/Edge/Firefox/Opera se delatan en el UA.
 */
function esSafariIOS(): boolean {
  const ua = navigator.userAgent;
  const otros = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|YaBrowser|DuckDuckGo|GSA\//;
  return !otros.test(ua) && /Safari/.test(ua);
}

function estaInstalada(): boolean {
  const navegadorLegacy = navigator as Navigator & { standalone?: boolean };
  return (
    navegadorLegacy.standalone === true || window.matchMedia('(display-mode: standalone)').matches
  );
}

// ---------------------------------------------------------------------------
// Store externo
//
// El escenario depende de APIs del navegador y de un evento global
// (`beforeinstallprompt`) que puede dispararse antes de que monte el
// componente. Lo modelamos como store externo y lo leemos con
// `useSyncExternalStore` en lugar de sincronizarlo con estado en un efecto.
// ---------------------------------------------------------------------------

let eventoInstalacion: EventoInstalacion | null = null;
let descartadoCache: boolean | null = null;
let escuchando = false;
const suscriptores = new Set<() => void>();

function notificar() {
  for (const avisar of suscriptores) avisar();
}

function estaDescartado(): boolean {
  if (descartadoCache === null) {
    try {
      descartadoCache = window.localStorage.getItem(CLAVE_DESCARTE) === '1';
    } catch {
      // localStorage puede fallar en modo privado; no es motivo para romper nada.
      descartadoCache = false;
    }
  }
  return descartadoCache;
}

function marcarDescartado() {
  try {
    window.localStorage.setItem(CLAVE_DESCARTE, '1');
  } catch {
    // Sin persistencia el aviso reaparecerá en la próxima carga; aceptable.
  }
  descartadoCache = true;
  notificar();
}

function suscribir(alCambiar: () => void): () => void {
  if (!escuchando) {
    escuchando = true;
    window.addEventListener('beforeinstallprompt', (evento) => {
      // Cancelamos el prompt automático para ofrecerlo desde nuestro botón.
      evento.preventDefault();
      eventoInstalacion = evento as EventoInstalacion;
      notificar();
    });
    window.addEventListener('appinstalled', () => {
      eventoInstalacion = null;
      notificar();
    });
  }
  suscriptores.add(alCambiar);
  return () => {
    suscriptores.delete(alCambiar);
  };
}

/** Devuelve un primitivo, así que sirve como snapshot estable. */
function leerEscenario(): Escenario {
  if (estaInstalada()) return 'oculto';
  if (estaDescartado()) return 'oculto';
  if (esIOS()) return esSafariIOS() ? 'ios-safari' : 'ios-otro-navegador';
  return eventoInstalacion ? 'prompt-nativo' : 'oculto';
}

/** En el servidor no hay navegador que detectar: no se pinta nada. */
function leerEscenarioServidor(): Escenario {
  return 'oculto';
}

// ---------------------------------------------------------------------------

/**
 * Aviso de instalación de la PWA.
 *
 * Instalar no es cosmético en iOS: Safari purga el almacenamiento de sitios sin
 * usar a los 7 días, y una app añadida a la pantalla de inicio queda exenta.
 * Además el almacenamiento está particionado por navegador, así que lo
 * capturado en Chrome iOS no existe en Safari ni en la app instalada.
 */
export function AvisoInstalar() {
  const escenario = useSyncExternalStore(suscribir, leerEscenario, leerEscenarioServidor);

  const instalar = useCallback(async () => {
    const evento = eventoInstalacion;
    if (!evento) return;
    await evento.prompt();
    await evento.userChoice;
    // El evento solo puede usarse una vez, se ofrezca o no la instalación.
    eventoInstalacion = null;
    notificar();
  }, []);

  if (escenario === 'oculto') return null;

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          {escenario === 'ios-safari' && (
            <>
              <p className="font-medium">Instala Cimnova en tu iPhone</p>
              <p className="text-blue-800">
                Toca <strong>Compartir</strong> (el cuadro con la flecha hacia arriba) y luego{' '}
                <strong>Añadir a inicio</strong>.
              </p>
              <p className="text-blue-700">
                Instalada, la app conserva lo que captures sin señal; si solo la usas desde el
                navegador, iOS puede borrar esos datos tras 7 días sin abrirla.
              </p>
            </>
          )}

          {escenario === 'ios-otro-navegador' && (
            <>
              <p className="font-medium">Para instalar la app, abre este sitio en Safari</p>
              <p className="text-blue-800">
                En iPhone y iPad solo Safari puede añadir la app a la pantalla de inicio.
              </p>
              <p className="text-blue-700">
                Ojo: lo que captures en este navegador no se comparte con la app instalada — cada
                navegador guarda sus datos por separado.
              </p>
            </>
          )}

          {escenario === 'prompt-nativo' && (
            <>
              <p className="font-medium">Instala Cimnova</p>
              <p className="text-blue-800">
                Ábrela como app: arranca más rápido y conserva lo capturado sin señal.
              </p>
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {escenario === 'prompt-nativo' && (
            <Button size="sm" onClick={instalar}>
              Instalar
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={marcarDescartado}>
            Ahora no
          </Button>
        </div>
      </div>
    </div>
  );
}
