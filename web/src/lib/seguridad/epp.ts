/**
 * Equipo de protección personal (EPP) — catálogo y reglas PURAS.
 *
 * Artículos del "equipo de protección personal básico" de la NOM-031-STPS-2011
 * (Tabla 5) más los específicos más comunes en obra del Apéndice I de la
 * NOM-017-STPS-2024 (DOF 28-mar-2025, vigente desde el 28-sep-2025, sustituye a
 * la NOM-017-STPS-2008). La NOM-017 (num. 5.12) pide llevar el registro de la
 * entrega con el tipo de equipo, la fecha, el nombre y firma de quien lo recibe
 * y de quien lo entrega: eso es lo que guarda `epp_entrega`.
 *
 * El catálogo es una SUGERENCIA para capturar rápido; siempre se puede escribir
 * otro artículo.
 */

export const FUENTE_NOM_017 = {
  nombre: 'NOM-017-STPS-2024, Equipo de protección personal — Selección, uso y manejo en los centros de trabajo',
  url: 'https://dof.gob.mx/normasOficiales/9496/stps/stps.html',
} as const;

export interface ArticuloEpp {
  nombre: string;
  /** Parte del cuerpo que protege (como la agrupa la norma). */
  region: string;
  /** Básico de la NOM-031 (Tabla 5) o específico según la tarea. */
  basico: boolean;
}

export const ARTICULOS_EPP: readonly ArticuloEpp[] = [
  { nombre: 'Casco', region: 'Cabeza', basico: true },
  { nombre: 'Lentes de seguridad', region: 'Ojos y cara', basico: true },
  { nombre: 'Tapones o conchas para oídos', region: 'Oídos', basico: true },
  { nombre: 'Mascarilla o respirador contra polvo', region: 'Respiración', basico: true },
  { nombre: 'Guantes', region: 'Manos', basico: true },
  { nombre: 'Botas de seguridad', region: 'Pies', basico: true },
  { nombre: 'Chaleco reflejante', region: 'Cuerpo', basico: true },
  { nombre: 'Arnés con línea de vida', region: 'Caídas', basico: false },
  { nombre: 'Careta para soldar', region: 'Ojos y cara', basico: false },
  { nombre: 'Goggles', region: 'Ojos y cara', basico: false },
  { nombre: 'Guantes para químicos', region: 'Manos', basico: false },
  { nombre: 'Botas de hule', region: 'Pies', basico: false },
  { nombre: 'Impermeable', region: 'Cuerpo', basico: false },
];

export const MAX_ARTICULO = 120;

/** Limpia el nombre del artículo; `null` si queda vacío o es muy largo. */
export function limpiarArticulo(x: unknown): string | null {
  if (typeof x !== 'string') return null;
  const t = x.replace(/\s+/g, ' ').trim();
  if (!t || t.length > MAX_ARTICULO) return null;
  return t;
}

export interface EntregaParaResumen {
  articulo: string;
  cantidad: number;
  fecha: number;
}

/**
 * Lo último que se le entregó de cada artículo (para la ficha: "Casco:
 * 12-mar"), ordenado por artículo. Compara sin mayúsculas ni espacios extra.
 */
export function ultimaEntregaPorArticulo(
  entregas: readonly EntregaParaResumen[],
): { articulo: string; fecha: number; cantidad: number }[] {
  const m = new Map<string, { articulo: string; fecha: number; cantidad: number }>();
  for (const e of entregas) {
    const k = e.articulo.trim().toLowerCase();
    const prev = m.get(k);
    if (!prev || e.fecha > prev.fecha) m.set(k, { articulo: e.articulo.trim(), fecha: e.fecha, cantidad: e.cantidad });
  }
  return [...m.values()].sort((a, b) => a.articulo.localeCompare(b.articulo, 'es'));
}
