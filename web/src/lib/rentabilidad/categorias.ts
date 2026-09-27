/**
 * Categorías de COSTO de un movimiento de caja (columna `movimientos.categoria_costo`,
 * migración 0036). Lista cerrada: la misma que el CHECK de la base.
 *
 * No confundir con `movimientos.categoria`, que es texto libre de siempre
 * ("NOMINA", "Anticipo", lo que escriba cada quien) y la sigue usando el móvil.
 *
 * Módulo puro: lo usan el formulario de caja (cliente) y el cálculo de utilidad.
 */

export const CATEGORIAS_COSTO = ['MANO_OBRA', 'MATERIAL', 'SUBCONTRATO', 'INDIRECTO', 'OTRO'] as const;

export type CategoriaCosto = (typeof CATEGORIAS_COSTO)[number];

/** Lo que no se clasificó. No es una categoría de la base: es su ausencia. */
export const SIN_CLASIFICAR = 'SIN_CLASIFICAR' as const;
export type RenglonCosto = CategoriaCosto | typeof SIN_CLASIFICAR;

export const ETIQUETA_CATEGORIA: Record<RenglonCosto, string> = {
  MANO_OBRA: 'Mano de obra',
  MATERIAL: 'Material',
  SUBCONTRATO: 'Subcontratos y maestros',
  INDIRECTO: 'Indirectos (fletes, renta, trámites)',
  OTRO: 'Otro',
  SIN_CLASIFICAR: 'Sin clasificar',
};

/** Para el selector: la etiqueta corta, sin la explicación entre paréntesis. */
export const ETIQUETA_CORTA_CATEGORIA: Record<RenglonCosto, string> = {
  MANO_OBRA: 'Mano de obra',
  MATERIAL: 'Material',
  SUBCONTRATO: 'Subcontratos',
  INDIRECTO: 'Indirectos',
  OTRO: 'Otro',
  SIN_CLASIFICAR: 'Sin clasificar',
};

export function esCategoriaCosto(x: unknown): x is CategoriaCosto {
  return typeof x === 'string' && (CATEGORIAS_COSTO as readonly string[]).includes(x);
}

/**
 * Lee lo que venga de un formulario o de la base. Vacío o desconocido = `null`
 * (sin clasificar): nunca se inventa una categoría.
 */
export function leerCategoriaCosto(crudo: unknown): CategoriaCosto | null {
  const v = typeof crudo === 'string' ? crudo.trim().toUpperCase() : crudo;
  return esCategoriaCosto(v) ? v : null;
}

/**
 * En qué renglón de costo cae una SALIDA.
 *
 * La raya que se pasa a caja desde la pestaña Nómina llega con la categoría de
 * sistema `NOMINA` (web y móvil). Aunque nadie la haya clasificado, es mano de
 * obra sin lugar a dudas, así que se cuenta ahí en vez de engordar
 * "Sin clasificar". Lo que el usuario haya clasificado a mano siempre manda.
 */
export function renglonDeCosto(m: { categoria_costo?: string | null; categoria?: string | null }): RenglonCosto {
  const c = leerCategoriaCosto(m.categoria_costo);
  if (c) return c;
  if ((m.categoria ?? '').trim().toUpperCase() === 'NOMINA') return 'MANO_OBRA';
  return SIN_CLASIFICAR;
}
