/**
 * Lógica PURA del recorrido guiado: qué temas tocan, cuánto duran, en qué
 * paso va y qué sigue. Sin React ni navegador: se prueba en Node.
 */

import { modulo, type ClaveModulo } from '@/lib/modulos';
import type { Alcance, PasoRecorrido, Tema } from './tipos';

// ── Alcances ─────────────────────────────────────────────────────────────────

export interface InfoAlcance {
  clave: Alcance;
  titulo: string;
  /** Qué cubre, una frase. */
  descripcion: string;
}

/** En orden: cada alcance incluye todo lo del anterior. */
export const ALCANCES: readonly InfoAlcance[] = [
  {
    clave: 'esencial',
    titulo: 'Esencial',
    descripcion: 'Lo indispensable para empezar: el panel, tus obras, clientes, cotizaciones y tu gente.',
  },
  {
    clave: 'diaria',
    titulo: 'Operación diaria',
    descripcion: 'Lo esencial más el trabajo de cada semana: caja, asistencia, raya, cuadrillas y tratos.',
  },
  {
    clave: 'completo',
    titulo: 'Completo',
    descripcion: 'Todas las funciones que tienes activas, incluidas compras, estimaciones, papeles y ajustes.',
  },
];

const ORDEN: Record<Alcance, number> = { esencial: 0, diaria: 1, completo: 2 };

export function esAlcance(x: unknown): x is Alcance {
  return x === 'esencial' || x === 'diaria' || x === 'completo';
}

export function infoAlcance(a: Alcance): InfoAlcance {
  return ALCANCES[ORDEN[a]];
}

/** Segundos que se estiman por paso: leer, ubicar y tocar. */
export const SEGUNDOS_POR_PASO = 25;

// ── Qué temas tocan ─────────────────────────────────────────────────────────

function pasoAplica(p: PasoRecorrido, alcance: Alcance): boolean {
  return !p.soloEn || p.soloEn.includes(alcance);
}

/**
 * Los temas de un alcance para esta empresa y este rol, con solo los pasos de
 * ese alcance. Un módulo apagado no se enseña; un tema sin pasos desaparece.
 */
export function temasPara(
  temas: readonly Tema[],
  alcance: Alcance,
  activos: readonly ClaveModulo[],
  rol: string | undefined,
): Tema[] {
  return temas
    .filter((t) => ORDEN[t.desde] <= ORDEN[alcance])
    .filter((t) => !t.modulo || (activos.includes(t.modulo) && modulo(t.modulo).disponible))
    .filter((t) => !t.roles || (!!rol && t.roles.includes(rol)))
    .map((t) => ({ ...t, pasos: t.pasos.filter((p) => pasoAplica(p, alcance)) }))
    .filter((t) => t.pasos.length > 0);
}

/** Minutos aproximados, hacia arriba y nunca menos de 1. */
export function minutosDe(pasos: number): number {
  return pasos <= 0 ? 0 : Math.max(1, Math.ceil((pasos * SEGUNDOS_POR_PASO) / 60));
}

export function totalPasos(temas: readonly Tema[]): number {
  return temas.reduce((s, t) => s + t.pasos.length, 0);
}

// ── Rutas ────────────────────────────────────────────────────────────────────

/** `/admin/obras/*` coincide con `/admin/obras/123`, no con `/admin/obras` ni con `/admin/obras/123/caja`. */
export function rutaCoincide(pathname: string, patron: string): boolean {
  const a = pathname.split(/[?#]/)[0].split('/').filter(Boolean);
  const b = patron.split('/').filter(Boolean);
  return a.length === b.length && b.every((s, i) => s === '*' || s === a[i]);
}

// ── Recomendación ("Personaliza tu recorrido") ──────────────────────────────

export interface Respuestas {
  /** ¿Cómo llevas hoy tus obras? 0 libreta/memoria · 1 Excel/WhatsApp · 2 otro programa. */
  experiencia: 0 | 1 | 2;
  /** ¿Qué necesitas resolver primero? 0 cotizar y registrar · 1 gente y raya · 2 todo. */
  necesidad: 0 | 1 | 2;
}

export function recomendarAlcance(r: Respuestas): Alcance {
  const s = r.experiencia + r.necesidad;
  if (s <= 1) return 'esencial';
  if (s <= 3) return 'diaria';
  return 'completo';
}

// ── Avance guardado (localStorage) ──────────────────────────────────────────

export interface ProgresoRecorrido {
  /** Temas terminados (ids), de cualquier alcance: un tema es el mismo en todos. */
  temasHechos: string[];
  /** Ya respondió a la invitación de cuenta nueva (empezó o dijo "Ahora no"). */
  invitacionCerrada: boolean;
}

export const PROGRESO_VACIO: ProgresoRecorrido = { temasHechos: [], invitacionCerrada: false };

/** Lee sin confiar: vacío, corrupto u obsoleto da progreso vacío. Nunca lanza. */
export function leerProgreso(crudo: string | null, idsValidos?: ReadonlySet<string>): ProgresoRecorrido {
  if (!crudo) return PROGRESO_VACIO;
  try {
    const d = JSON.parse(crudo) as Record<string, unknown> | null;
    if (!d || typeof d !== 'object') return PROGRESO_VACIO;
    const hechos = Array.isArray(d.temasHechos)
      ? [...new Set(d.temasHechos.filter((x): x is string => typeof x === 'string'))]
      : [];
    return {
      temasHechos: idsValidos ? hechos.filter((id) => idsValidos.has(id)) : hechos,
      invitacionCerrada: d.invitacionCerrada === true,
    };
  } catch {
    return PROGRESO_VACIO;
  }
}

export function marcarTema(p: ProgresoRecorrido, id: string): ProgresoRecorrido {
  return p.temasHechos.includes(id) ? p : { ...p, temasHechos: [...p.temasHechos, id] };
}

export interface Avance {
  temas: number;
  hechos: number;
  /** Minutos que faltan con los temas pendientes. */
  minutosRestantes: number;
}

export function avanceDe(temas: readonly Tema[], p: ProgresoRecorrido): Avance {
  const hechos = new Set(p.temasHechos);
  const pendientes = temas.filter((t) => !hechos.has(t.id));
  return {
    temas: temas.length,
    hechos: temas.length - pendientes.length,
    minutosRestantes: minutosDe(totalPasos(pendientes)),
  };
}

// ── Recorrido en curso (sessionStorage) ─────────────────────────────────────

export interface Corrida {
  alcance: Alcance;
  /** Índice del tema actual dentro de `temasPara(alcance)`. */
  tema: number;
  /** Índice del paso dentro del tema. */
  paso: number;
}

export function leerCorrida(crudo: string | null): Corrida | null {
  if (!crudo) return null;
  try {
    const d = JSON.parse(crudo) as Record<string, unknown> | null;
    if (!d || !esAlcance(d.alcance) || !Number.isInteger(d.tema) || !Number.isInteger(d.paso)) return null;
    return { alcance: d.alcance, tema: Math.max(0, d.tema as number), paso: Math.max(0, d.paso as number) };
  } catch {
    return null;
  }
}

/**
 * Primer tema pendiente del alcance (para "Continuar"), o el primero si ya
 * terminó todos (para repasar).
 */
export function primerPendiente(temas: readonly Tema[], p: ProgresoRecorrido): number {
  const i = temas.findIndex((t) => !p.temasHechos.includes(t.id));
  return i < 0 ? 0 : i;
}

export type Siguiente =
  | { tipo: 'paso'; corrida: Corrida }
  /** Terminó el tema `terminado`; sigue `corrida` (inicio del siguiente tema). */
  | { tipo: 'tema'; terminado: string; corrida: Corrida }
  /** Terminó el último tema. */
  | { tipo: 'fin'; terminado: string };

/** Qué viene después del paso actual. */
export function siguiente(temas: readonly Tema[], c: Corrida): Siguiente {
  const tema = temas[c.tema];
  if (!tema) return { tipo: 'fin', terminado: '' };
  if (c.paso + 1 < tema.pasos.length) return { tipo: 'paso', corrida: { ...c, paso: c.paso + 1 } };
  if (c.tema + 1 < temas.length) return { tipo: 'tema', terminado: tema.id, corrida: { ...c, tema: c.tema + 1, paso: 0 } };
  return { tipo: 'fin', terminado: tema.id };
}

/** El paso anterior dentro del mismo tema (no se regresa entre temas: cada uno arranca en su pantalla). */
export function anterior(c: Corrida): Corrida | null {
  return c.paso > 0 ? { ...c, paso: c.paso - 1 } : null;
}
