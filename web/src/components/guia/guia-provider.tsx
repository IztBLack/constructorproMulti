'use client';

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { ClaveModulo } from '@/lib/modulos';
import { MAZOS, VERSION_GUIA } from '@/lib/guia/contenido';
import {
  avanceGuia,
  buscarTarjeta,
  claveProgreso,
  leerProgreso,
  marcarAprendida,
  mazosPara,
  reiniciarProgreso,
  type AvanceGuia,
  type ProgresoGuia,
} from '@/lib/guia/progreso';
import type { Mazo, Tarjeta } from '@/lib/guia/tipos';
import { GuiaModal } from './guia-modal';
import { CoachGuia } from './coach-guia';

/** `?guia=bienvenida`: con eso el registro manda al panel para ofrecer la guía una vez. */
const PARAM_BIENVENIDA = 'bienvenida';

/**
 * Un "Llévame ahí" sin llegar a su pantalla en este tiempo se da por perdido
 * (la navegación falló, el middleware redirigió…). Así no aparece el panel por
 * sorpresa la próxima vez que se visite esa pantalla.
 */
const VIGENCIA_COACH_MS = 60_000;

const IDS_VALIDOS: ReadonlySet<string> = new Set(MAZOS.flatMap((m) => m.tarjetas.map((t) => t.id)));

// ---------------------------------------------------------------------------
// Almacén de la guía. Lo que importa vive FUERA de React (localStorage,
// sessionStorage, la URL), así que se modela como store externo y se lee con
// `useSyncExternalStore`, igual que `components/pwa/aviso-instalar.tsx`: nada de
// copiarlo a estado en un efecto. En el servidor (y al hidratar) la guía está
// cerrada y vacía; el navegador toma el control después.
//
// NUNCA escribe en Supabase: la guía no deja rastro en la cuenta.
// ---------------------------------------------------------------------------

/** "Llévame ahí" en curso: qué tarjeta, desde qué pantalla y cuándo. */
export interface CoachEnCurso {
  id: string;
  desde: string;
  /** Marca de tiempo: identifica ESTE "Llévame ahí" (no solo la tarjeta). */
  t: number;
}

interface EstadoGuia {
  /** Lo guardado en localStorage, tal cual (se valida al leer). */
  progresoCrudo: string | null;
  coach: CoachEnCurso | null;
  abierta: boolean;
  /** true = se abrió como bienvenida de cuenta nueva. */
  bienvenida: boolean;
}

const CERRADA: EstadoGuia = { progresoCrudo: null, coach: null, abierta: false, bienvenida: false };

let userActual = '';
let estado: EstadoGuia = CERRADA;
let urlRevisadaPara = '';
const suscriptores = new Set<() => void>();

const claveCoach = (userId: string) => `cp.guia.coach.${userId}`;

// Almacenamiento del navegador: puede no existir o lanzar (navegación privada,
// datos bloqueados). La guía funciona igual; solo no recuerda el avance.
function leer(almacen: 'local' | 'sesion', clave: string): string | null {
  try {
    return (almacen === 'local' ? window.localStorage : window.sessionStorage).getItem(clave);
  } catch {
    return null;
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

function leerCoach(userId: string): CoachEnCurso | null {
  try {
    const c = JSON.parse(leer('sesion', claveCoach(userId)) ?? 'null') as CoachEnCurso | null;
    if (!c || typeof c.id !== 'string' || typeof c.desde !== 'string' || typeof c.t !== 'number') return null;
    return Date.now() - c.t < VIGENCIA_COACH_MS ? c : null;
  } catch {
    return null;
  }
}

/** Carga del navegador la primera vez (o si cambió el usuario en esta pestaña). */
function cargar(userId: string) {
  if (userActual === userId) return;
  userActual = userId;
  estado = {
    progresoCrudo: leer('local', claveProgreso(userId)),
    coach: leerCoach(userId),
    abierta: false,
    bienvenida: false,
  };
}

function actualizar(cambio: Partial<EstadoGuia>) {
  estado = { ...estado, ...cambio };
  for (const avisar of suscriptores) avisar();
}

/**
 * Cambia el avance partiendo de lo que hay GUARDADO ahora (no de lo que tenía
 * esta pestaña al pintar): con la app abierta en dos pestañas, una no le borra
 * a la otra lo que ya aprendió.
 */
function cambiarProgreso(f: (p: ProgresoGuia) => ProgresoGuia) {
  const clave = claveProgreso(userActual);
  const actual = leerProgreso(leer('local', clave) ?? estado.progresoCrudo, VERSION_GUIA, IDS_VALIDOS);
  const crudo = JSON.stringify(f(actual));
  escribir('local', clave, crudo);
  actualizar({ progresoCrudo: crudo });
}

/**
 * Cuenta recién creada: el registro manda a `/admin?guia=bienvenida`. Se
 * ofrece UNA vez y se limpia la URL para que recargar no la vuelva a abrir.
 */
function revisarBienvenida(userId: string) {
  if (urlRevisadaPara === userId) return;
  urlRevisadaPara = userId;
  const params = new URLSearchParams(window.location.search);
  if (params.get('guia') !== PARAM_BIENVENIDA) return;
  params.delete('guia');
  const q = params.toString();
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${q ? `?${q}` : ''}`);
  const p = leerProgreso(estado.progresoCrudo, VERSION_GUIA, IDS_VALIDOS);
  if (!p.bienvenidaVista) actualizar({ abierta: true, bienvenida: true });
}

function suscribir(userId: string, avisar: () => void): () => void {
  // Primero se carga lo guardado y DESPUÉS se revisa la URL: al revés, la
  // primera lectura pisaría la bienvenida recién abierta.
  cargar(userId);
  suscriptores.add(avisar);
  revisarBienvenida(userId);
  // Otra pestaña cambió el avance: se refleja aquí también.
  const alCambiarAlmacen = (e: StorageEvent) => {
    if (e.key === claveProgreso(userId)) actualizar({ progresoCrudo: e.newValue });
  };
  window.addEventListener('storage', alCambiarAlmacen);
  return () => {
    suscriptores.delete(avisar);
    window.removeEventListener('storage', alCambiarAlmacen);
  };
}

const snapshotServidor = () => CERRADA;

// ── Acciones (no dependen de React: identidad estable) ──────────────────────

/** Al cerrar, si el foco se quedó sin dueño, vuelve al "?" de la barra. */
export function devolverFoco() {
  requestAnimationFrame(() => {
    if (document.activeElement && document.activeElement !== document.body) return;
    for (const el of document.querySelectorAll<HTMLElement>('[data-guia="ayuda"]')) {
      if (el.getClientRects().length > 0) return el.focus();
    }
  });
}

function abrir() {
  actualizar({ abierta: true, bienvenida: false });
}

function cerrar() {
  // Cerrar la bienvenida ("Ahora no", Esc, la X) cuenta como vista.
  cambiarProgreso((p) => (p.bienvenidaVista ? p : { ...p, bienvenidaVista: true }));
  actualizar({ abierta: false, bienvenida: false });
  devolverFoco();
}

function marcar(id: string) {
  cambiarProgreso((p) => marcarAprendida(p, id));
}

function reiniciar() {
  cambiarProgreso(reiniciarProgreso);
}

function terminarCoach() {
  escribir('sesion', claveCoach(userActual), null);
  actualizar({ coach: null });
}

// ---------------------------------------------------------------------------

interface GuiaContexto {
  mazos: Mazo[];
  progreso: ProgresoGuia;
  avance: AvanceGuia;
  abierta: boolean;
  bienvenida: boolean;
  abrir: () => void;
  cerrar: () => void;
  marcar: (id: string) => void;
  reiniciar: () => void;
  /** "Llévame ahí": cierra la guía, navega y deja los pasos sobre la pantalla real. */
  llevar: (tarjeta: Tarjeta) => void;
  /** El "Llévame ahí" en curso y su tarjeta (o null). */
  coach: (CoachEnCurso & { tarjeta: Tarjeta }) | null;
  terminarCoach: () => void;
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

/** Estado de la Guía para todo el panel (tarjetas, avance y "Llévame ahí"). */
export function GuiaProvider({ userId, activos, rol, children }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const suscribirse = useCallback((avisar: () => void) => suscribir(userId, avisar), [userId]);
  const leerSnapshot = useCallback(() => {
    cargar(userId);
    return estado;
  }, [userId]);
  const e = useSyncExternalStore(suscribirse, leerSnapshot, snapshotServidor);

  const mazos = useMemo(() => mazosPara(MAZOS, activos, rol), [activos, rol]);
  const progreso = useMemo(
    () => leerProgreso(e.progresoCrudo, VERSION_GUIA, IDS_VALIDOS),
    [e.progresoCrudo],
  );
  const avance = useMemo(() => avanceGuia(mazos, progreso), [mazos, progreso]);
  const coach = useMemo(() => {
    const tarjeta = e.coach ? buscarTarjeta(mazos, e.coach.id) : null;
    return e.coach && tarjeta ? { ...e.coach, tarjeta } : null;
  }, [e.coach, mazos]);

  const llevar = useCallback(
    (tarjeta: Tarjeta) => {
      const destino = tarjeta.destino;
      if (!destino) return;
      // Ir a ver la pantalla de verdad cuenta como aprendida: es lo que se busca.
      cambiarProgreso((p) => marcarAprendida({ ...p, bienvenidaVista: true }, tarjeta.id));
      // El panel de pasos vive en el layout de /admin. Pantallas fuera de él
      // (el pase de lista de /campo) solo se abren, sin panel.
      const enCurso = destino.href.startsWith('/admin') ? { id: tarjeta.id, desde: pathname, t: Date.now() } : null;
      escribir('sesion', claveCoach(userId), enCurso ? JSON.stringify(enCurso) : null);
      actualizar({ abierta: false, bienvenida: false, coach: enCurso });
      if (pathname !== destino.href) router.push(destino.href);
    },
    [pathname, router, userId],
  );

  const valor = useMemo<GuiaContexto>(
    () => ({
      mazos,
      progreso,
      avance,
      abierta: e.abierta,
      bienvenida: e.bienvenida,
      coach,
      abrir,
      cerrar,
      marcar,
      reiniciar,
      llevar,
      terminarCoach,
    }),
    [mazos, progreso, avance, e.abierta, e.bienvenida, coach, llevar],
  );

  return (
    <Contexto.Provider value={valor}>
      {children}
      <GuiaModal />
      <CoachGuia />
    </Contexto.Provider>
  );
}
