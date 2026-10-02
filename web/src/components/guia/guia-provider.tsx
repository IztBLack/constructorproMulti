'use client';

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { ClaveModulo } from '@/lib/modulos';
import { TEMAS, VERSION_RECORRIDO } from '@/lib/guia/recorrido/temas';
import {
  ALCANCES,
  anterior,
  avanceDe,
  leerCorrida,
  leerProgreso,
  marcarTema,
  minutosDe,
  primerPendiente,
  siguiente,
  temasPara,
  totalPasos,
  type Avance,
  type Corrida,
  type ProgresoRecorrido,
} from '@/lib/guia/recorrido/motor';
import type { Alcance, Tema } from '@/lib/guia/recorrido/tipos';
import { LanzadorRecorrido } from './recorrido/lanzador';
import { CapaRecorrido } from './recorrido/capa-recorrido';
import { InvitacionRecorrido } from './recorrido/invitacion';

/** `?guia=bienvenida`: con eso el registro manda al panel (cuenta nueva). */
const PARAM_BIENVENIDA = 'bienvenida';

const IDS_TEMAS: ReadonlySet<string> = new Set(TEMAS.map((t) => t.id));

// ---------------------------------------------------------------------------
// Almacén. Lo que importa vive FUERA de React (localStorage, sessionStorage, la
// URL): se modela como store externo y se lee con `useSyncExternalStore`, igual
// que `components/pwa/aviso-instalar.tsx`. En el servidor todo está cerrado.
//
// NUNCA escribe en Supabase. Mientras corre el recorrido, además, el candado
// (`recorrido/candado.ts`) impide que la app escriba.
// ---------------------------------------------------------------------------

interface EstadoGuia {
  progresoCrudo: string | null;
  corrida: Corrida | null;
  lanzador: boolean;
  invitacion: boolean;
  /** Alcance recién terminado: se muestra el cierre. */
  terminado: Alcance | null;
}

const CERRADO: EstadoGuia = { progresoCrudo: null, corrida: null, lanzador: false, invitacion: false, terminado: null };

let userActual = '';
let estado: EstadoGuia = CERRADO;
let urlRevisadaPara = '';
const suscriptores = new Set<() => void>();

const claveProgreso = (u: string) => `cp.guia.recorrido.v${VERSION_RECORRIDO}.${u}`;
const claveCorrida = (u: string) => `cp.guia.corrida.${u}`;

function leer(almacen: 'local' | 'sesion', clave: string): string | null {
  try {
    return (almacen === 'local' ? window.localStorage : window.sessionStorage).getItem(clave);
  } catch {
    return null; // navegación privada o datos bloqueados: funciona igual, sin memoria
  }
}

function escribir(almacen: 'local' | 'sesion', clave: string, valor: string | null) {
  try {
    const s = almacen === 'local' ? window.localStorage : window.sessionStorage;
    if (valor === null) s.removeItem(clave);
    else s.setItem(clave, valor);
  } catch {
    /* ver arriba */
  }
}

function cargar(userId: string) {
  if (userActual === userId) return;
  userActual = userId;
  const corrida = leerCorrida(leer('sesion', claveCorrida(userId)));
  estado = {
    ...CERRADO,
    progresoCrudo: leer('local', claveProgreso(userId)),
    // Tras recargar se retoma el tema desde su primer paso (su pantalla de inicio).
    corrida: corrida ? { ...corrida, paso: 0 } : null,
  };
}

function actualizar(cambio: Partial<EstadoGuia>) {
  estado = { ...estado, ...cambio };
  if ('corrida' in cambio) {
    escribir('sesion', claveCorrida(userActual), cambio.corrida ? JSON.stringify(cambio.corrida) : null);
  }
  for (const avisar of suscriptores) avisar();
}

/** Cambia el avance partiendo de lo GUARDADO ahora: dos pestañas no se pisan. */
function cambiarProgreso(f: (p: ProgresoRecorrido) => ProgresoRecorrido) {
  const clave = claveProgreso(userActual);
  const actual = leerProgreso(leer('local', clave) ?? estado.progresoCrudo, IDS_TEMAS);
  const crudo = JSON.stringify(f(actual));
  escribir('local', clave, crudo);
  actualizar({ progresoCrudo: crudo });
}

/**
 * Cuenta nueva: el registro manda a `/admin?guia=bienvenida`. Solo se muestra
 * una INVITACIÓN discreta (nunca se abre nada encima del trabajo) y se limpia
 * la URL para que recargar no la repita.
 */
function revisarBienvenida(userId: string) {
  if (urlRevisadaPara === userId) return;
  urlRevisadaPara = userId;
  const params = new URLSearchParams(window.location.search);
  if (params.get('guia') !== PARAM_BIENVENIDA) return;
  params.delete('guia');
  const q = params.toString();
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${q ? `?${q}` : ''}`);
  const p = leerProgreso(estado.progresoCrudo, IDS_TEMAS);
  if (!p.invitacionCerrada && !estado.corrida) actualizar({ invitacion: true });
}

function suscribir(userId: string, avisar: () => void): () => void {
  cargar(userId); // primero lo guardado, DESPUÉS la URL
  suscriptores.add(avisar);
  revisarBienvenida(userId);
  const alCambiarAlmacen = (e: StorageEvent) => {
    if (e.key === claveProgreso(userId)) actualizar({ progresoCrudo: e.newValue });
  };
  window.addEventListener('storage', alCambiarAlmacen);
  return () => {
    suscriptores.delete(avisar);
    window.removeEventListener('storage', alCambiarAlmacen);
  };
}

const snapshotServidor = () => CERRADO;

/** Al cerrar algo, si el foco se quedó sin dueño, vuelve al "?" de la barra. */
export function devolverFoco() {
  requestAnimationFrame(() => {
    if (document.activeElement && document.activeElement !== document.body) return;
    for (const el of document.querySelectorAll<HTMLElement>('[data-guia="ayuda"]')) {
      if (el.getClientRects().length > 0) return el.focus();
    }
  });
}

// ---------------------------------------------------------------------------

export interface ResumenAlcance {
  clave: Alcance;
  titulo: string;
  descripcion: string;
  temas: Tema[];
  minutos: number;
  avance: Avance;
}

interface GuiaContexto {
  alcances: ResumenAlcance[];
  progreso: ProgresoRecorrido;
  lanzador: boolean;
  invitacion: boolean;
  terminado: Alcance | null;
  /** Recorrido en curso con su tema resuelto (o null). */
  enCurso: { corrida: Corrida; temas: Tema[]; tema: Tema } | null;
  abrirLanzador: () => void;
  cerrarLanzador: () => void;
  cerrarInvitacion: () => void;
  iniciar: (alcance: Alcance) => void;
  avanzar: () => void;
  retroceder: () => void;
  omitirTema: () => void;
  salir: () => void;
  cerrarCierre: () => void;
  reiniciarAvance: () => void;
}

const Contexto = createContext<GuiaContexto | null>(null);

export function useGuia(): GuiaContexto {
  const c = useContext(Contexto);
  if (!c) throw new Error('useGuia fuera de <GuiaProvider>');
  return c;
}

interface Props {
  userId: string;
  activos: readonly ClaveModulo[];
  rol: string | undefined;
  children: ReactNode;
}

/** Ayuda de la app: recorrido guiado (lanzador, capa e invitación). */
export function GuiaProvider({ userId, activos, rol, children }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const suscribirse = useCallback((avisar: () => void) => suscribir(userId, avisar), [userId]);
  const leerSnapshot = useCallback(() => {
    cargar(userId);
    return estado;
  }, [userId]);
  const e = useSyncExternalStore(suscribirse, leerSnapshot, snapshotServidor);

  const progreso = useMemo(() => leerProgreso(e.progresoCrudo, IDS_TEMAS), [e.progresoCrudo]);

  const alcances = useMemo<ResumenAlcance[]>(
    () =>
      ALCANCES.map((a) => {
        const temas = temasPara(TEMAS, a.clave, activos, rol);
        return { ...a, temas, minutos: minutosDe(totalPasos(temas)), avance: avanceDe(temas, progreso) };
      }),
    [activos, rol, progreso],
  );

  const enCurso = useMemo(() => {
    const c = e.corrida;
    if (!c) return null;
    const temas = alcances.find((a) => a.clave === c.alcance)?.temas ?? [];
    const tema = temas[c.tema];
    if (!tema) return null;
    return { corrida: { ...c, paso: Math.min(c.paso, tema.pasos.length - 1) }, temas, tema };
  }, [e.corrida, alcances]);

  const irA = useCallback(
    (ruta: string) => {
      if (pathname !== ruta) router.push(ruta);
    },
    [pathname, router],
  );

  const valor = useMemo<GuiaContexto>(() => {
    const temasDe = (a: Alcance) => alcances.find((x) => x.clave === a)?.temas ?? [];
    return {
      alcances,
      progreso,
      lanzador: e.lanzador,
      invitacion: e.invitacion,
      terminado: e.terminado,
      enCurso,
      abrirLanzador: () => actualizar({ lanzador: true, invitacion: false }),
      cerrarLanzador: () => {
        actualizar({ lanzador: false });
        devolverFoco();
      },
      cerrarInvitacion: () => {
        cambiarProgreso((p) => ({ ...p, invitacionCerrada: true }));
        actualizar({ invitacion: false });
      },
      iniciar: (alcance) => {
        const temas = temasDe(alcance);
        if (temas.length === 0) return;
        const tema = primerPendiente(temas, progreso);
        cambiarProgreso((p) => ({ ...p, invitacionCerrada: true }));
        actualizar({ corrida: { alcance, tema, paso: 0 }, lanzador: false, invitacion: false, terminado: null });
        irA(temas[tema].inicio);
      },
      avanzar: () => {
        if (!enCurso) return;
        const s = siguiente(enCurso.temas, enCurso.corrida);
        if (s.tipo === 'paso') return actualizar({ corrida: s.corrida });
        cambiarProgreso((p) => marcarTema(p, s.terminado));
        if (s.tipo === 'tema') {
          actualizar({ corrida: s.corrida });
          irA(enCurso.temas[s.corrida.tema].inicio);
        } else {
          actualizar({ corrida: null, terminado: enCurso.corrida.alcance });
        }
      },
      retroceder: () => {
        const a = enCurso && anterior(enCurso.corrida);
        if (a) actualizar({ corrida: a });
      },
      omitirTema: () => {
        if (!enCurso) return;
        const { corrida, temas } = enCurso;
        if (corrida.tema + 1 >= temas.length) {
          actualizar({ corrida: null });
          return devolverFoco();
        }
        const sig = { ...corrida, tema: corrida.tema + 1, paso: 0 };
        actualizar({ corrida: sig });
        irA(temas[sig.tema].inicio);
      },
      salir: () => {
        actualizar({ corrida: null });
        devolverFoco();
      },
      cerrarCierre: () => {
        actualizar({ terminado: null });
        devolverFoco();
      },
      reiniciarAvance: () => cambiarProgreso((p) => ({ ...p, temasHechos: [] })),
    };
  }, [alcances, progreso, e.lanzador, e.invitacion, e.terminado, enCurso, irA]);

  return (
    <Contexto.Provider value={valor}>
      {children}
      <LanzadorRecorrido />
      <InvitacionRecorrido />
      <CapaRecorrido />
    </Contexto.Provider>
  );
}
