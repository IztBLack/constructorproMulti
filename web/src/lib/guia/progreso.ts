/**
 * Lógica PURA de la Guía: qué tarjetas ve cada quien y cuánto lleva.
 *
 * El progreso vive en el navegador (localStorage), NUNCA en Supabase: la guía
 * no escribe nada en la cuenta. Es el mismo trato que el tema claro/oscuro
 * ("Solo este dispositivo" en Ajustes → Preferencias). Si se borra, lo peor que
 * pasa es que la guía vuelve a empezar.
 */

import { MODULOS, modulo, type ClaveModulo } from '@/lib/modulos';
import { rutaBloqueadaPara, rutaNavPermitida } from '@/lib/auth/roles';
import type { ClaveMazo, Mazo, Tarjeta } from './tipos';

export interface ProgresoGuia {
  /** Versión del contenido con la que se guardó. */
  version: number;
  /** Ids de las tarjetas que ya volteó y marcó como aprendidas. */
  aprendidas: string[];
  /** Ya se le mostró (o descartó) la bienvenida. */
  bienvenidaVista: boolean;
}

export function progresoVacio(version: number): ProgresoGuia {
  return { version, aprendidas: [], bienvenidaVista: false };
}

/** Clave de localStorage. Por usuario: en la compu de la oficina entran varios. */
export function claveProgreso(userId: string): string {
  return `cp.guia.v1.${userId}`;
}

/**
 * Lee lo guardado sin confiar en ello: puede venir vacío, corrupto o de otra
 * versión del contenido. Ante la duda, progreso vacío (nunca lanza). Con
 * `idsValidos` se descartan las tarjetas que ya no existen.
 */
export function leerProgreso(
  crudo: string | null,
  version: number,
  idsValidos?: ReadonlySet<string>,
): ProgresoGuia {
  if (!crudo) return progresoVacio(version);
  let dato: unknown;
  try {
    dato = JSON.parse(crudo);
  } catch {
    return progresoVacio(version);
  }
  if (typeof dato !== 'object' || dato === null) return progresoVacio(version);
  const d = dato as Record<string, unknown>;
  const aprendidas = Array.isArray(d.aprendidas)
    ? [...new Set(d.aprendidas.filter((x): x is string => typeof x === 'string'))]
    : [];
  return {
    version,
    aprendidas: idsValidos ? aprendidas.filter((id) => idsValidos.has(id)) : aprendidas,
    bienvenidaVista: d.bienvenidaVista === true,
  };
}

export function marcarAprendida(p: ProgresoGuia, id: string): ProgresoGuia {
  if (p.aprendidas.includes(id)) return p;
  return { ...p, aprendidas: [...p.aprendidas, id] };
}

/** "Empezar de nuevo": borra lo aprendido; la bienvenida no se vuelve a imponer. */
export function reiniciarProgreso(p: ProgresoGuia): ProgresoGuia {
  return { ...p, aprendidas: [] };
}

// ── Qué ve cada quien ────────────────────────────────────────────────────────

const HREFS_NAV = new Set(MODULOS.flatMap((m) => (m.nav ?? []).map((n) => n.href)));

/**
 * ¿Puede este rol abrir la pantalla destino? Las pantallas de la barra siguen
 * la lista por rol de la barra; las demás, solo el bloqueo del middleware.
 */
function destinoPermitido(href: string, rol: string | undefined): boolean {
  if (rutaBloqueadaPara(rol, href)) return false;
  if (HREFS_NAV.has(href)) return rutaNavPermitida(rol, href);
  return true;
}

function tarjetaVisible(t: Tarjeta, activos: readonly ClaveModulo[], rol: string | undefined): boolean {
  if (t.modulo && !(activos.includes(t.modulo) && modulo(t.modulo).disponible)) return false;
  if (t.roles && !(rol && t.roles.includes(rol))) return false;
  if (t.destino && !destinoPermitido(t.destino.href, rol)) return false;
  return true;
}

/**
 * Los mazos con solo las tarjetas que aplican a esta empresa y este rol: un
 * módulo apagado no se enseña. Un mazo que se queda sin tarjetas desaparece.
 */
export function mazosPara(
  mazos: readonly Mazo[],
  activos: readonly ClaveModulo[],
  rol: string | undefined,
): Mazo[] {
  return mazos
    .map((m) => ({ ...m, tarjetas: m.tarjetas.filter((t) => tarjetaVisible(t, activos, rol)) }))
    .filter((m) => m.tarjetas.length > 0);
}

// ── Avance, sellos y rango ───────────────────────────────────────────────────

/** Escalafón de la obra: de ayudante a residente. El umbral es % de tarjetas. */
export const RANGOS: readonly { desde: number; nombre: string }[] = [
  { desde: 0, nombre: 'Ayudante' },
  { desde: 25, nombre: 'Media cuchara' },
  { desde: 50, nombre: 'Oficial' },
  { desde: 75, nombre: 'Maestro de obra' },
  { desde: 100, nombre: 'Residente de obra' },
];

export interface AvanceMazo {
  clave: ClaveMazo;
  total: number;
  hechas: number;
  completo: boolean;
}

export interface AvanceGuia {
  total: number;
  hechas: number;
  /** 0–100, entero hacia abajo: el 100 solo sale con todo hecho. */
  porcentaje: number;
  porMazo: AvanceMazo[];
  rango: string;
  /** El siguiente rango y cuántas tarjetas faltan para él; null en el tope. */
  siguiente: { nombre: string; faltan: number } | null;
  /** Sellos ganados (mazos completos), en orden. */
  sellos: string[];
}

export function avanceGuia(mazos: readonly Mazo[], p: ProgresoGuia): AvanceGuia {
  const hechasSet = new Set(p.aprendidas);
  const porMazo = mazos.map((m) => {
    const hechas = m.tarjetas.filter((t) => hechasSet.has(t.id)).length;
    return { clave: m.clave, total: m.tarjetas.length, hechas, completo: hechas === m.tarjetas.length };
  });
  const total = porMazo.reduce((s, m) => s + m.total, 0);
  const hechas = porMazo.reduce((s, m) => s + m.hechas, 0);
  const porcentaje = total === 0 ? 0 : Math.floor((hechas / total) * 100);

  let indice = 0;
  RANGOS.forEach((r, i) => {
    if (porcentaje >= r.desde) indice = i;
  });
  const prox = RANGOS[indice + 1];
  const siguiente = prox
    ? { nombre: prox.nombre, faltan: Math.max(1, Math.ceil((prox.desde / 100) * total) - hechas) }
    : null;

  return {
    total,
    hechas,
    porcentaje,
    porMazo,
    rango: RANGOS[indice].nombre,
    siguiente,
    sellos: mazos.filter((_, i) => porMazo[i].completo).map((m) => m.sello),
  };
}

/** La primera tarjeta sin aprender (para "Continuar"), o null si ya terminó. */
export function siguienteTarjeta(
  mazos: readonly Mazo[],
  p: ProgresoGuia,
): { mazo: ClaveMazo; indice: number } | null {
  const hechas = new Set(p.aprendidas);
  for (const m of mazos) {
    const i = m.tarjetas.findIndex((t) => !hechas.has(t.id));
    if (i >= 0) return { mazo: m.clave, indice: i };
  }
  return null;
}

/** Busca una tarjeta por id en los mazos visibles. */
export function buscarTarjeta(mazos: readonly Mazo[], id: string): Tarjeta | null {
  for (const m of mazos) {
    const t = m.tarjetas.find((x) => x.id === id);
    if (t) return t;
  }
  return null;
}
